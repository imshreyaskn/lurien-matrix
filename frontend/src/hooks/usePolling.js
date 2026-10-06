import { useState, useEffect, useRef, useCallback } from 'react';

export function usePolling(fetchFn, intervalMs = 3000, enabled = true) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef(null);
  const fetchRef = useRef(fetchFn);
  const sequenceRef = useRef(0);

  fetchRef.current = fetchFn;

  const refresh = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true);
    const seq = ++sequenceRef.current;
    
    try {
      const result = await fetchRef.current();
      if (seq === sequenceRef.current) {
        setData(result);
        setError(null);
      }
    } catch (err) {
      if (seq === sequenceRef.current) {
        setError(err instanceof Error ? err : new Error(err?.message || 'Unknown error'));
      }
    } finally {
      if (seq === sequenceRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    refresh(true);
    intervalRef.current = setInterval(() => refresh(false), intervalMs);

    return () => {
      sequenceRef.current++; // Invalidate any inflight requests on unmount
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [intervalMs, enabled, refresh]);

  return { data, error, loading, refresh };
}
