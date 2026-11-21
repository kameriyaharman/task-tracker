import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { api } from './api';

/** Fetches on focus (so lists refresh when you come back to a screen). */
export function useApi<T = any>(path: string | null, query?: Record<string, any>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const key = `${path}${JSON.stringify(query ?? {})}`;

  const reload = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      setData(await api<T>(path, { query }));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  // `loading` drives the pull-to-refresh spinner, so it is only true on a *re*load: the first load
  // already shows the screen's own <Loading /> (two spinners at once looked broken)
  return { data, loading: loading && data !== null, error, reload, setData };
}
