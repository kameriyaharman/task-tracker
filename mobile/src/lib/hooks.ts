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

  return { data, loading, error, reload, setData };
}
