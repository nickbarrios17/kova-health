/**
 * Health Connect (Android) → Kova Health. Reads the last days of everything Samsung Health and other apps
 * leave there (activity, workouts, heart, sleep, body, vitals, water) and sends them through the idempotent import RPCs: every row carries the Health Connect
 * record id as external_id and the source app, so re-syncing never duplicates data (docs/sync.md).
 * Values are copied as recorded; nothing is estimated or filled in.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { getGrantedPermissions, getSdkStatus, initialize, openHealthConnectSettings, readRecords, requestPermission, SdkAvailabilityStatus } from 'react-native-health-connect';
import { BodyMeasurementSchema, HealthObservationSchema, newId } from '@kova/domain';
import { kova } from './client';

export type HcStatus = 'unsupported' | 'not_installed' | 'needs_update' | 'available';

const PERMISSIONS = [
  { accessType: 'read', recordType: 'Steps' },
  { accessType: 'read', recordType: 'SleepSession' },
  { accessType: 'read', recordType: 'Weight' },
  { accessType: 'read', recordType: 'RestingHeartRate' },
  { accessType: 'read', recordType: 'HeartRateVariabilityRmssd' },
  // Body composition from the watch's bioimpedance (Samsung Health): improves resting energy.
  { accessType: 'read', recordType: 'BodyFat' },
  // Workouts recorded by the watch's own app, and the calories it measured.
  { accessType: 'read', recordType: 'ExerciseSession' },
  { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
  { accessType: 'read', recordType: 'TotalCaloriesBurned' },
  { accessType: 'read', recordType: 'Distance' },
  { accessType: 'read', recordType: 'FloorsClimbed' },
  { accessType: 'read', recordType: 'HeartRate' },
  { accessType: 'read', recordType: 'BloodPressure' },
  { accessType: 'read', recordType: 'BloodGlucose' },
  { accessType: 'read', recordType: 'OxygenSaturation' },
  { accessType: 'read', recordType: 'RespiratoryRate' },
  { accessType: 'read', recordType: 'Vo2Max' },
  { accessType: 'read', recordType: 'LeanBodyMass' },
  { accessType: 'read', recordType: 'BodyWaterMass' },
  { accessType: 'read', recordType: 'BoneMass' },
  { accessType: 'read', recordType: 'BasalMetabolicRate' },
  { accessType: 'read', recordType: 'Height' },
  { accessType: 'read', recordType: 'Hydration' },
  { accessType: 'read', recordType: 'SkinTemperature' },
  { accessType: 'read', recordType: 'BodyTemperature' },
] as const;

/** How many data types Kova Health asks for (shown as "n de N tipos de datos"). */
export const PERMISSION_COUNT = PERMISSIONS.length;

const WANTED = new Set<string>(PERMISSIONS.map((p) => p.recordType));

/**
 * How many of Kova Health's data types are granted. Health Connect can return other read grants
 * (e.g. background read) and repeats, so count distinct wanted record types only.
 */
const countWanted = (perms: ReadonlyArray<{ accessType: string; recordType: string }>) =>
  new Set(perms.filter((p) => p.accessType === 'read' && WANTED.has(p.recordType)).map((p) => p.recordType)).size;

const LAST_SYNC_KEY = 'kova:hc-last-sync';
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

/** Opens the system permission sheet. Returns how many of Kova Health's data types were granted. */
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

  // Each extra type on its own: an older Health Connect without one (skin temperature) must not stop the rest.
  const each = async (type: (typeof PERMISSIONS)[number]['recordType'], fn: () => Promise<void>) => {
    if (!granted.has(type)) return;
    try { await fn(); } catch { /* not supported here: skip it */ }
  };
  const r1 = (v: number) => Math.round(v * 10) / 10;

  // Calories burned, kept to price each workout (and the day's totals).
  const active: Array<{ start: number; end: number; kcal: number }> = [];
  const total: Array<{ start: number; end: number; kcal: number }> = [];
  await each('ActiveCaloriesBurned', async () => {
    for (const r of await readAll('ActiveCaloriesBurned', s, e)) {
      const kcal = r.energy.inKilocalories;
      if (!(kcal > 0) || !r.endTime) continue;
      active.push({ start: Date.parse(r.startTime), end: Date.parse(r.endTime), kcal });
      observations.push({ metric: 'active_energy_kcal', value: r1(kcal), start_at: r.startTime, end_at: r.endTime, ...base(r.metadata) });
    }
  });
  await each('TotalCaloriesBurned', async () => {
    for (const r of await readAll('TotalCaloriesBurned', s, e)) {
      const kcal = r.energy.inKilocalories;
      if (!(kcal > 0)) continue;
      total.push({ start: Date.parse(r.startTime), end: Date.parse(r.endTime), kcal });
      observations.push({ metric: 'total_energy_kcal', value: r1(kcal), start_at: r.startTime, end_at: r.endTime, ...base(r.metadata) });
    }
  });
  // The part of `rows` that falls inside [a, b], prorated by time.
  const within = (rows: typeof active, a: number, b: number) => rows.reduce((acc, x) => {
    const o = Math.min(b, x.end) - Math.max(a, x.start);
    return o > 0 && x.end > x.start ? acc + (x.kcal * o) / (x.end - x.start) : acc;
  }, 0);

  await each('ExerciseSession', async () => {
    for (const r of await readAll('ExerciseSession', s, e)) {
      const a = Date.parse(r.startTime), b = Date.parse(r.endTime);
      const min = (b - a) / 60_000;
      if (!(min >= 1) || min > 1440) continue;
      // Active calories the watch measured; else its total minus ~1.1 kcal/min of resting.
      let kcal = within(active, a, b);
      let fromTotal = false;
      if (!(kcal > 0)) { kcal = Math.max(0, within(total, a, b) - 1.1 * min); fromTotal = kcal > 0; }
      observations.push({
        metric: 'exercise_session', value: Math.round(min), start_at: r.startTime, end_at: r.endTime,
        details: {
          exercise_type: r.exerciseType, ...(r.title ? { title: r.title.slice(0, 80) } : {}),
          ...(kcal > 0 ? { kcal: Math.round(Math.min(kcal, 10_000)) } : {}), ...(fromTotal ? { kcal_from_total: true } : {}),
        },
        ...base(r.metadata),
      });
    }
  });
  await each('Distance', async () => {
    for (const r of await readAll('Distance', s, e)) {
      const m = r.distance.inMeters;
      if (m > 0) observations.push({ metric: 'distance_m', value: Math.round(m), start_at: r.startTime, end_at: r.endTime, ...base(r.metadata) });
    }
  });
  await each('FloorsClimbed', async () => {
    for (const r of await readAll('FloorsClimbed', s, e)) {
      if (r.floors > 0) observations.push({ metric: 'floors', value: r1(r.floors), start_at: r.startTime, end_at: r.endTime, ...base(r.metadata) });
    }
  });
  // Pulse: one row per Health Connect record (its average, min and max), not one per sample.
  await each('HeartRate', async () => {
    for (const r of await readAll('HeartRate', s, e)) {
      const bpm = (r.samples ?? []).map((x) => x.beatsPerMinute).filter((v) => v >= 20 && v <= 250);
      if (!bpm.length) continue;
      observations.push({
        metric: 'heart_rate_bpm', value: Math.round(bpm.reduce((x, y) => x + y, 0) / bpm.length), start_at: r.startTime,
        end_at: r.endTime > r.startTime ? r.endTime : new Date(Date.parse(r.startTime) + 1000).toISOString(),
        details: { min: Math.min(...bpm), max: Math.max(...bpm), samples: bpm.length }, ...base(r.metadata),
      });
    }
  });
  await each('BloodPressure', async () => {
    for (const r of await readAll('BloodPressure', s, e)) {
      observations.push({
        metric: 'blood_pressure_mmhg', value: Math.round(r.systolic.inMillimetersOfMercury), start_at: r.time,
        details: { diastolic: Math.round(r.diastolic.inMillimetersOfMercury) }, ...base(r.metadata),
      });
    }
  });
  await each('BloodGlucose', async () => {
    for (const r of await readAll('BloodGlucose', s, e)) {
      observations.push({ metric: 'blood_glucose_mgdl', value: Math.round(r.level.inMilligramsPerDeciliter), start_at: r.time, ...base(r.metadata) });
    }
  });
  await each('OxygenSaturation', async () => {
    for (const r of await readAll('OxygenSaturation', s, e)) {
      observations.push({ metric: 'spo2_pct', value: r1(r.percentage), start_at: r.time, ...base(r.metadata) });
    }
  });
  await each('RespiratoryRate', async () => {
    for (const r of await readAll('RespiratoryRate', s, e)) {
      observations.push({ metric: 'respiratory_rate', value: r1(r.rate), start_at: r.time, ...base(r.metadata) });
    }
  });
  await each('Vo2Max', async () => {
    for (const r of await readAll('Vo2Max', s, e)) {
      observations.push({ metric: 'vo2max', value: r1(r.vo2MillilitersPerMinuteKilogram), start_at: r.time, ...base(r.metadata) });
    }
  });
  await each('Hydration', async () => {
    for (const r of await readAll('Hydration', s, e)) {
      const ml = r.volume.inMilliliters;
      if (ml > 0) observations.push({ metric: 'hydration_ml', value: Math.round(ml), start_at: r.startTime, end_at: r.endTime, ...base(r.metadata) });
    }
  });
  await each('SkinTemperature', async () => {
    for (const r of await readAll('SkinTemperature', s, e)) {
      const d = (r.deltas ?? []).map((x) => x.delta.inCelsius);
      if (!d.length) continue;
      observations.push({ metric: 'skin_temp_delta_c', value: Math.round((d.reduce((x, y) => x + y, 0) / d.length) * 100) / 100, start_at: r.startTime, end_at: r.endTime, ...base(r.metadata) });
    }
  });
  await each('BodyTemperature', async () => {
    for (const r of await readAll('BodyTemperature', s, e)) {
      observations.push({ metric: 'body_temp_c', value: r1(r.temperature.inCelsius), start_at: r.time, ...base(r.metadata) });
    }
  });
  const mass = async (type: 'LeanBodyMass' | 'BodyWaterMass' | 'BoneMass', metric: string) => each(type, async () => {
    for (const r of await readAll(type, s, e)) {
      measurements.push({ metric, value: Math.round(r.mass.inKilograms * 100) / 100, measured_at: r.time, ...base(r.metadata) });
    }
  });
  await mass('LeanBodyMass', 'lean_mass_kg');
  await mass('BodyWaterMass', 'body_water_kg');
  await mass('BoneMass', 'bone_mass_kg');
  await each('BasalMetabolicRate', async () => {
    for (const r of await readAll('BasalMetabolicRate', s, e)) {
      measurements.push({ metric: 'bmr_kcal', value: Math.round(r.basalMetabolicRate.inKilocaloriesPerDay), measured_at: r.time, ...base(r.metadata) });
    }
  });
  await each('Height', async () => {
    for (const r of await readAll('Height', s, e)) {
      measurements.push({ metric: 'height_cm', value: r1(r.height.inMeters * 100), measured_at: r.time, ...base(r.metadata) });
    }
  });

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
  // 200 rows per call keeps each request far from the 20 s timeout on a slow connection.
  for (const c of chunks(obs, 200)) stored += await kova.health.record(c);
  for (const c of chunks(meas, 200)) stored += await kova.body.record(c);
  await AsyncStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
  return stored;
}
