'use client';
/**
 * Auth session + user preferences for the whole app. The session lives in supabase-js
 * (browser storage); authorization is enforced by RLS on the server, not here.
 */
import type { WeightUnit } from '@vida/domain';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { vida } from './client';

type Status = 'loading' | 'signedOut' | 'signedIn';

export interface Prefs {
  weight_unit: WeightUnit;
  time_zone: string;
  display_name: string | null;
}

interface SessionValue {
  status: Status;
  /** True while the user arrived from a password-recovery link. */
  recovery: boolean;
  prefs: Prefs | null;
  setUnit: (u: WeightUnit) => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [recovery, setRecovery] = useState(false);
  const [prefs, setPrefs] = useState<Prefs | null>(null);

  const loadPrefs = useCallback(async () => {
    const c = vida();
    const [p, profile] = await Promise.all([c.profile.getPreferences(), c.profile.get()]);
    const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    // First visit: adopt the browser's time zone so "today" matches the user's day.
    if (p.time_zone === 'UTC' && browserTz && browserTz !== 'UTC') {
      await c.profile.updatePreferences({ time_zone: browserTz }).catch(() => undefined);
      p.time_zone = browserTz;
    }
    setPrefs({ weight_unit: p.weight_unit, time_zone: p.time_zone, display_name: profile.display_name });
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

  const value = useMemo(() => ({ status, recovery, prefs, setUnit }), [status, recovery, prefs, setUnit]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const v = useContext(SessionContext);
  if (!v) throw new Error('useSession must be used inside SessionProvider');
  return v;
}
