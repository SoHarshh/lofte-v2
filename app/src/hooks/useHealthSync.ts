import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { API_BASE } from '../config';
import { useAuthFetch } from './useAuthFetch';
import {
  isHealthAvailable, isHealthConnected, getTodayMetrics, fetchDayMetrics,
  HealthMetrics,
} from '../utils/health';

type SyncState = {
  connected: boolean;
  loading: boolean;
  metrics: HealthMetrics | null;
  lastSyncedAt: number | null;
  refresh: () => Promise<void>;
};

export function useHealthSync(): SyncState {
  const authFetch = useAuthFetch();
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [metrics, setMetrics] = useState<HealthMetrics | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    if (!isHealthAvailable()) return;
    const linked = await isHealthConnected();
    setConnected(linked);
    if (!linked) return;

    setLoading(true);
    try {
      const m = await getTodayMetrics();
      setMetrics(m);

      // Sync the last 14 days to the backend so Nyx has a real recent history.
      // Non-blocking: if any fail, we just skip this cycle.
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

      await authFetch(`${API_BASE}/api/health/metrics`, {
        method: 'POST',
        body: JSON.stringify({ metrics: dayMetrics }),
      }).catch(() => { /* backend unreachable — try again later */ });

      setLastSyncedAt(Date.now());
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  return { connected, loading, metrics, lastSyncedAt, refresh };
}
