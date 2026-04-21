import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { API_BASE } from '../config';
import { useAuthFetch } from './useAuthFetch';
import {
  isHealthAvailable, isHealthConnected, getTodayMetrics, HealthMetrics,
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

      const today = new Date().toISOString().slice(0, 10);
      await authFetch(`${API_BASE}/api/health/metrics`, {
        method: 'POST',
        body: JSON.stringify({
          metrics: [{
            date: today,
            steps: m.steps,
            activeEnergyKcal: m.activeEnergyKcal,
            restingHeartRate: m.restingHeartRate,
            hrvMs: m.hrvMs,
            sleepHours: m.sleepHours,
            bodyWeightKg: m.bodyWeightKg,
          }],
        }),
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
