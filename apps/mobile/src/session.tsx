/** Auth session, preferences and this device's id. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { newId, type WeightUnit } from '@vida/domain';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { outbox, vida } from './client';

type Status = 'loading' | 'signedOut' | 'signedIn';

export interface Prefs {
  weight_unit: WeightUnit;
  time_zone: string;
  display_name: string | null;
}

interface SessionValue {
  status: Status;
  prefs: Prefs | null;
  deviceId: string | null;
  setUnit: (u: WeightUnit) => Promise<void>;
  reloadPrefs: () => Promise<void>;
}

const Ctx = createContext<SessionValue | null>(null);
const DEVICE_KEY = 'vida:device-id';

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

  const reloadPrefs = useCallback(async () => {
    const [p, profile] = await Promise.all([vida.profile.getPreferences(), vida.profile.get()]);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (p.time_zone === 'UTC' && tz && tz !== 'UTC') {
      await vida.profile.updatePreferences({ time_zone: tz }).catch(() => undefined);
      p.time_zone = tz;
    }
    setPrefs({ weight_unit: p.weight_unit, time_zone: p.time_zone, display_name: profile.display_name });
  }, []);

  useEffect(() => {
    const sb = vida.supabase;
    sb.auth.getSession().then(({ data }) => setStatus(data.session ? 'signedIn' : 'signedOut'));
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => setStatus(session ? 'signedIn' : 'signedOut'));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (status !== 'signedIn') {
      setPrefs(null);
      return;
    }
    (async () => {
      const id = await deviceIdOnce();
      setDeviceId(id);
      await vida.devices.register({ id, kind: 'mobile', platform: Platform.OS, label: 'Teléfono' }).catch(() => undefined);
      await reloadPrefs().catch(() => setPrefs({ weight_unit: 'kg', time_zone: 'UTC', display_name: null }));
      outbox.flush().catch(() => undefined);
    })();
  }, [status, reloadPrefs]);

  const setUnit = useCallback(async (u: WeightUnit) => {
    setPrefs((p) => (p ? { ...p, weight_unit: u } : p));
    await vida.profile.updatePreferences({ weight_unit: u }).catch(() => undefined);
  }, []);

  const value = useMemo(() => ({ status, prefs, deviceId, setUnit, reloadPrefs }), [status, prefs, deviceId, setUnit, reloadPrefs]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession outside SessionProvider');
  return v;
}
