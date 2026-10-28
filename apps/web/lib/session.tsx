'use client';
/**
 * Auth session + user preferences for the whole app. The session lives in supabase-js
 * (browser storage); authorization is enforced by RLS on the server, not here.
 */
import type { Tables, WeightUnit } from '@vida/domain';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { vida } from './client';

type Status = 'loading' | 'signedOut' | 'signedIn';

export interface Prefs {
  weight_unit: WeightUnit;
  time_zone: string;
  display_name: string | null;
  /** Onboarding is mandatory: the app shows it until this is true. */
  onboarded: boolean;
  profile: Pick<Tables<'profiles'>, 'birth_year' | 'height_cm' | 'sex' | 'activity_level' | 'weight_goal' | 'goal_pace'>;
  lastWeightKg: number | null;
}

interface SessionValue {
  status: Status;
  /** True while the user arrived from a password-recovery link. */
  recovery: boolean;
  prefs: Prefs | null;
  setUnit: (u: WeightUnit) => Promise<void>;
  /** Reloads preferences and profile (after onboarding). */
  reload: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [recovery, setRecovery] = useState(false);
  const [prefs, setPrefs] = useState<Prefs | null>(null);

  const loadPrefs = useCallback(async () => {
    const c = vida();
    const [p, profile, weights] = await Promise.all([
      c.profile.getPreferences(), c.profile.get(), c.body.history('weight_kg', 1).catch(() => []),
    ]);
    const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    // First visit: adopt the browser's time zone so "today" matches the user's day.
    if (p.time_zone === 'UTC' && browserTz && browserTz !== 'UTC') {
      await c.profile.updatePreferences({ time_zone: browserTz }).catch(() => undefined);
      p.time_zone = browserTz;
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
    const sb = vida().supabase;
    sb.auth.getSession().then(({ data }) => setStatus(data.session ? 'signedIn' : 'signedOut'));
    const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      setStatus(session ? 'signedIn' : 'signedOut');
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (status === 'signedIn') loadPrefs().catch(() => setPrefs(null));
    else setPrefs(null);
  }, [status, loadPrefs]);

  const setUnit = useCallback(async (u: WeightUnit) => {
    setPrefs((p) => (p ? { ...p, weight_unit: u } : p));
    await vida().profile.updatePreferences({ weight_unit: u });
  }, []);

  const value = useMemo(() => ({ status, recovery, prefs, setUnit, reload: loadPrefs }), [status, recovery, prefs, setUnit, loadPrefs]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const v = useContext(SessionContext);
  if (!v) throw new Error('useSession must be used inside SessionProvider');
  return v;
}
