/** Auth session, preferences and this device's id. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { newId, type Tables, type WeightUnit } from '@kova/domain';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { outbox, kova } from './client';

type Status = 'loading' | 'signedOut' | 'signedIn';

export interface Prefs {
  weight_unit: WeightUnit;
  time_zone: string;
  display_name: string | null;
  /** Onboarding is mandatory: the app shows it until this is 'done'. */
  onboarded: boolean;
  profile: Pick<Tables<'profiles'>, 'birth_year' | 'height_cm' | 'sex' | 'activity_level' | 'weight_goal' | 'goal_pace'>;
  lastWeightKg: number | null;
}

interface SessionValue {
  status: Status;
  prefs: Prefs | null;
  /** Set when loading the profile after sign-in failed or timed out (shown with Retry / Sign out). */
  bootError: string | null;
  retryBoot: () => void;
  deviceId: string | null;
  setUnit: (u: WeightUnit) => Promise<void>;
  reloadPrefs: () => Promise<void>;
}

const Ctx = createContext<SessionValue | null>(null);
const DEVICE_KEY = 'kova:device-id';

/** Rejects if `p` does not settle in `ms`, naming the step so the UI can say what failed. */
function withTimeout<T>(p: Promise<T>, ms: number, step: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(step + ': sin respuesta en ' + Math.round(ms / 1000) + ' s')), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(new Error(step + ': ' + (e instanceof Error ? e.message : String(e)))); });
  });
}

async function deviceIdOnce(): Promise<string> {
  const existing = await AsyncStorage.getItem(DEVICE_KEY);
  if (existing) return existing;
  const id = newId();
  await AsyncStorage.setItem(DEVICE_KEY, id);
  return id;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [bootTick, setBootTick] = useState(0);

  const reloadPrefs = useCallback(async () => {
    const [p, profile, weights] = await Promise.all([
      kova.profile.getPreferences(), kova.profile.get(), kova.body.history('weight_kg', 1).catch(() => []),
    ]);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (p.time_zone === 'UTC' && tz && tz !== 'UTC') {
      await kova.profile.updatePreferences({ time_zone: tz }).catch(() => undefined);
      p.time_zone = tz;
    }
    const last = (weights as Array<{ value: number | string }>)[0];
    setPrefs({
      weight_unit: p.weight_unit, time_zone: p.time_zone, display_name: profile.display_name,
      onboarded: profile.onboarding_state === 'done',
      profile: {
        birth_year: profile.birth_year, height_cm: profile.height_cm, sex: profile.sex,
        activity_level: profile.activity_level, weight_goal: profile.weight_goal, goal_pace: profile.goal_pace,
      },
      lastWeightKg: last ? Number(last.value) : null,
    });
  }, []);

  useEffect(() => {
    const sb = kova.supabase;
    withTimeout(sb.auth.getSession(), 10_000, 'Recuperar sesión')
      .then(({ data }) => setStatus(data.session ? 'signedIn' : 'signedOut'))
      .catch(() => setStatus('signedOut'));
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => setStatus(session ? 'signedIn' : 'signedOut'));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (status !== 'signedIn') {
      setPrefs(null);
      setBootError(null);
      return;
    }
    let alive = true;
    setBootError(null);
    (async () => {
      let id: string;
      try {
        id = await deviceIdOnce();
      } catch (e) {
        if (alive) setBootError('Preparar el dispositivo: ' + (e instanceof Error ? e.message : String(e)));
        return;
      }
      if (!alive) return;
      setDeviceId(id);
      // Non-blocking: registering the device must never keep the app from opening.
      withTimeout(kova.devices.register({ id, kind: 'mobile', platform: Platform.OS, label: 'Teléfono' }), 15_000, 'Registrar dispositivo')
        .catch(() => undefined);
      try {
        await withTimeout(reloadPrefs(), 20_000, 'Cargar tu perfil');
        outbox.flush().catch(() => undefined);
      } catch (e) {
        if (alive) setBootError((e as Error).message);
      }
    })();
    return () => {
      alive = false;
    };
  }, [status, reloadPrefs, bootTick]);

  const setUnit = useCallback(async (u: WeightUnit) => {
    setPrefs((p) => (p ? { ...p, weight_unit: u } : p));
    await kova.profile.updatePreferences({ weight_unit: u }).catch(() => undefined);
  }, []);

  const retryBoot = useCallback(() => setBootTick((t) => t + 1), []);
  const value = useMemo(
    () => ({ status, prefs, deviceId, setUnit, reloadPrefs, bootError, retryBoot }),
    [status, prefs, deviceId, setUnit, reloadPrefs, bootError, retryBoot],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession outside SessionProvider');
  return v;
}
