import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { API_BASE } from '../config';
import { useAuthFetch } from './useAuthFetch';
import {
  isHealthAvailable, isHealthConnected, getTodayMetrics, fetchDayMetrics,
  subscribeHealthConnection, HealthMetrics,
} from '../utils/health';

type SyncState = {
  connected: boolean;
  loading: boolean;
  metrics: HealthMetrics | null;
  lastSyncedAt: number | null;
  refresh: () => Promise<void>;
};

// Module-level dedupe so every mount of this hook shares one in-flight
// promise + one debounce window. Previously every Dashboard re-render
// recreated `refresh`, the useEffect tore down and re-fired, and a rapid
// Health→Nyx→Health navigation would queue 14×6 HealthKit calls on top of
// another 14×6 already in flight, wedging the native bridge.
let syncInFlight: Promise<void> | null = null;
let lastSyncMs = 0;
const SYNC_COOLDOWN_MS = 60_000; // one actual sync per minute is plenty

export function useHealthSync(): SyncState {
  const authFetch = useAuthFetch();
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [metrics, setMetrics] = useState<HealthMetrics | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const mountedRef = useRef(true);

  // authFetch identity is not stable across renders — stash latest in a ref
  // so refresh() can remain a stable callback.
  const authFetchRef = useRef(authFetch);
  authFetchRef.current = authFetch;

  const refresh = useCallback(async (force = false): Promise<void> => {
    if (!isHealthAvailable()) return;
    const linked = await isHealthConnected();
    if (mountedRef.current) setConnected(linked);
    if (!linked) return;

    // Dedupe concurrent refreshes + cooldown.
    if (syncInFlight) return syncInFlight;
    if (!force && Date.now() - lastSyncMs < SYNC_COOLDOWN_MS) return;

    if (mountedRef.current) setLoading(true);
    syncInFlight = (async () => {
      try {
        const m = await getTodayMetrics();
        if (mountedRef.current) setMetrics(m);

        // Backfill the last 14 days to the backend so Nyx has recent history.
        const days: Date[] = [];
        for (let i = 0; i < 14; i++) {
          const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
          days.push(d);
        }
        const dayMetrics = await Promise.all(days.map((d) =>
          fetchDayMetrics(d).then((r) => ({
            date: d.toISOString().slice(0, 10),
            steps: r.steps,
            activeEnergyKcal: r.activeEnergyKcal,
            restingHeartRate: r.restingHeartRate,
            hrvMs: r.hrvMs,
            sleepHours: r.sleepHours,
            bodyWeightKg: r.bodyWeightKg,
          }))
        ));

        await authFetchRef.current(`${API_BASE}/api/health/metrics`, {
          method: 'POST',
          body: JSON.stringify({ metrics: dayMetrics }),
        }).catch(() => { /* backend unreachable — next cycle will retry */ });

        lastSyncMs = Date.now();
        if (mountedRef.current) setLastSyncedAt(lastSyncMs);
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    })();

    const p = syncInFlight;
    p.finally(() => { if (syncInFlight === p) syncInFlight = null; });
    return p;
  }, []); // stable — reads via refs

  useEffect(() => {
    mountedRef.current = true;
    refresh();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    // Force a resync on connection flip even inside the cooldown, because
    // the whole connection state just changed and stale "not connected"
    // state is worse than slightly busier bridge.
    const unsubConn = subscribeHealthConnection(() => { refresh(true); });
    return () => {
      mountedRef.current = false;
      sub.remove();
      unsubConn();
    };
  }, [refresh]);

  return { connected, loading, metrics, lastSyncedAt, refresh };
}
