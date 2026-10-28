/**
 * Health Connect (Android) → VIDA. Reads the last days of steps, sleep, weight, resting heart rate
 * and HRV and sends them through the idempotent import RPCs: every row carries the Health Connect
 * record id as external_id and the source app, so re-syncing never duplicates data (docs/sync.md).
 * Values are copied as recorded; nothing is estimated or filled in.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { getGrantedPermissions, getSdkStatus, initialize, openHealthConnectSettings, readRecords, requestPermission, SdkAvailabilityStatus } from 'react-native-health-connect';
import { BodyMeasurementSchema, HealthObservationSchema, newId } from '@vida/domain';
import { vida } from './client';

export type HcStatus = 'unsupported' | 'not_installed' | 'needs_update' | 'available';

const PERMISSIONS = [
  { accessType: 'read', recordType: 'Steps' },
  { accessType: 'read', recordType: 'SleepSession' },
  { accessType: 'read', recordType: 'Weight' },
  { accessType: 'read', recordType: 'RestingHeartRate' },
  { accessType: 'read', recordType: 'HeartRateVariabilityRmssd' },
  // Body composition from the watch's bioimpedance (Samsung Health): improves resting energy.
  { accessType: 'read', recordType: 'BodyFat' },
] as const;

/** How many data types VIDA asks for (shown as "n de N tipos de datos"). */
export const PERMISSION_COUNT = PERMISSIONS.length;

const WANTED = new Set<string>(PERMISSIONS.map((p) => p.recordType));

/**
 * How many of VIDA's 5 data types are granted. Health Connect can return other read grants
 * (e.g. background read) and repeats, so count distinct wanted record types only.
 */
const countWanted = (perms: ReadonlyArray<{ accessType: string; recordType: string }>) =>
  new Set(perms.filter((p) => p.accessType === 'read' && WANTED.has(p.recordType)).map((p) => p.recordType)).size;

const LAST_SYNC_KEY = 'vida:hc-last-sync';
// Health Connect sleep stage codes counted as asleep: SLEEPING, LIGHT, DEEP, REM.
const ASLEEP = new Set([2, 4, 5, 6]);
const STAGE_NAME: Record<number, string> = { 1: 'awake', 2: 'sleeping', 3: 'out_of_bed', 4: 'light', 5: 'deep', 6: 'rem', 7: 'awake' };

export async function status(): Promise<HcStatus> {
  if (Platform.OS !== 'android') return 'unsupported';
  try {
    const s = await getSdkStatus();
    if (s === SdkAvailabilityStatus.SDK_AVAILABLE) return 'available';
    if (s === SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) return 'needs_update';
    return 'not_installed';
  } catch {
    return 'unsupported';
  }
}

/** Opens the system permission sheet. Returns how many of VIDA's data types were granted. */
export async function connect(): Promise<number> {
  await initialize();
  return countWanted(await requestPermission([...PERMISSIONS]));
}

export async function grantedCount(): Promise<number> {
  try {
    await initialize();
    return countWanted(await getGrantedPermissions());
  } catch {
    return 0;
  }
}

export const openSettings = () => openHealthConnectSettings();

export async function lastSync(): Promise<string | null> {
  return AsyncStorage.getItem(LAST_SYNC_KEY);
}

async function readAll<T extends Parameters<typeof readRecords>[0]>(type: T, startTime: string, endTime: string) {
  const out: Array<Awaited<ReturnType<typeof readRecords<T>>>['records'][number]> = [];
  let pageToken: string | undefined;
  do {
    const res = await readRecords(type, { timeRangeFilter: { operator: 'between', startTime, endTime }, pageToken });
    out.push(...res.records);
    pageToken = res.pageToken || undefined;
  } while (pageToken);
  return out;
}

const chunks = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/** Imports the last `days` days. Returns how many new rows the server stored. */
export async function sync(timeZone: string, deviceId: string | null, days = 7): Promise<number> {
  await initialize();
  const granted = new Set((await getGrantedPermissions()).filter((p) => p.accessType === 'read').map((p) => p.recordType));
  const end = new Date();
  const start = new Date(end.getTime() - days * 86_400_000);
  const s = start.toISOString(), e = end.toISOString();
  const base = (meta: { id?: string; dataOrigin?: string } | undefined) => ({
    source: 'health_connect' as const, source_app: meta?.dataOrigin ?? null, external_id: meta?.id ?? null, time_zone: timeZone, device_id: deviceId,
  });

  const observations: Array<Record<string, unknown>> = [];
  if (granted.has('Steps')) {
    for (const r of await readAll('Steps', s, e)) {
      if (r.count > 0) observations.push({ metric: 'steps', value: r.count, start_at: r.startTime, end_at: r.endTime, ...base(r.metadata) });
    }
  }
  if (granted.has('SleepSession')) {
    for (const r of await readAll('SleepSession', s, e)) {
      const totalMin = (Date.parse(r.endTime) - Date.parse(r.startTime)) / 60_000;
      const stages = r.stages ?? [];
      const stageMin: Record<string, number> = {};
      for (const st of stages) {
        const name = STAGE_NAME[st.stage] ?? 'unknown';
        stageMin[name] = (stageMin[name] ?? 0) + (Date.parse(st.endTime) - Date.parse(st.startTime)) / 60_000;
      }
      const asleep = stages.length
        ? stages.filter((st) => ASLEEP.has(st.stage)).reduce((a, st) => a + (Date.parse(st.endTime) - Date.parse(st.startTime)) / 60_000, 0)
        : totalMin;
      if (totalMin <= 0 || totalMin > 1440) continue;
      observations.push({
        metric: 'sleep_session', value: Math.round(Math.min(asleep, totalMin)), start_at: r.startTime, end_at: r.endTime,
        details: stages.length ? { stages_min: Object.fromEntries(Object.entries(stageMin).map(([k, v]) => [k, Math.round(v)])) } : {},
        ...base(r.metadata),
      });
    }
  }
  if (granted.has('RestingHeartRate')) {
    for (const r of await readAll('RestingHeartRate', s, e)) {
      observations.push({ metric: 'resting_hr_bpm', value: Math.round(r.beatsPerMinute), start_at: r.time, ...base(r.metadata) });
    }
  }
  if (granted.has('HeartRateVariabilityRmssd')) {
    for (const r of await readAll('HeartRateVariabilityRmssd', s, e)) {
      observations.push({ metric: 'hrv_rmssd_ms', value: Math.round(r.heartRateVariabilityMillis * 10) / 10, start_at: r.time, ...base(r.metadata) });
    }
  }
  const measurements: Array<Record<string, unknown>> = [];
  if (granted.has('Weight')) {
    for (const r of await readAll('Weight', s, e)) {
      measurements.push({ metric: 'weight_kg', value: Math.round(r.weight.inKilograms * 100) / 100, measured_at: r.time, ...base(r.metadata) });
    }
  }
  if (granted.has('BodyFat')) {
    for (const r of await readAll('BodyFat', s, e)) {
      measurements.push({ metric: 'body_fat_pct', value: Math.round(r.percentage * 10) / 10, measured_at: r.time, ...base(r.metadata) });
    }
  }

  // Validate with the same Zod schemas as the API; skip rows without a source id (could duplicate)
  // or out of range, instead of failing the whole batch.
  const obs = observations
    .filter((r) => r.external_id)
    .map((r) => HealthObservationSchema.safeParse({ id: newId(), ...r }))
    .flatMap((r) => (r.success ? [r.data] : []));
  const meas = measurements
    .filter((r) => r.external_id)
    .map((r) => BodyMeasurementSchema.safeParse({ id: newId(), ...r }))
    .flatMap((r) => (r.success ? [r.data] : []));

  let stored = 0;
  for (const c of chunks(obs, 500)) stored += await vida.health.record(c);
  for (const c of chunks(meas, 500)) stored += await vida.body.record(c);
  await AsyncStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
  return stored;
}
