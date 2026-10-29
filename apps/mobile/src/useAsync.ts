import { KovaError } from '@kova/domain';
import { useCallback, useEffect, useRef, useState } from 'react';

/** Runs `fn` when deps change; errors become the safe Spanish KovaError message. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const ref = useRef(fn);
  ref.current = fn;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    ref.current()
      .then((d) => alive && (setData(d), setError(null)))
      .catch((e: unknown) => alive && setError(e instanceof KovaError ? e.message : 'Algo salió mal.'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload };
}
