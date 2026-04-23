import { useEffect, useRef, useState } from 'react';
import {
  HealthMetrics,
  fetchDayMetrics, fetchHourlyHRV, fetchHourlyHR, fetchDailyRange,
  isHealthAvailable, useHealthConnection,
} from '../utils/health';

export type HealthDayState = {
  loading: boolean;
  connected: boolean;
  summary: HealthMetrics;
  hourlyHrv: number[];
  hourlyHr: number[];
  hrSpark: number[];
  sleepSpark: number[];
  hrvDelta: number | null;
};

const EMPTY_SUMMARY: HealthMetrics = {
  steps: null, activeEnergyKcal: null, restingHeartRate: null,
  hrvMs: null, sleepHours: null, bodyWeightKg: null,
};

function subDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() - n);
  return x;
}
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

// Module-level per-day cache so rapid back/forward navigation doesn't
// re-fire HealthKit storms for days we just fetched. Keyed by local-day;
// invalidates when the connection state flips.
const dayCache = new Map<string, HealthDayState>();
let dayCacheConnectionKey = '';

export function useHealthDay(date: Date): HealthDayState {
  const { connected } = useHealthConnection();
  const key = dayKey(date);
  const connKey = String(connected);

  // Throw the cache away on connect/disconnect so stale "no data" doesn't
  // stick after the user grants permissions (or vice-versa).
  if (dayCacheConnectionKey !== connKey) {
    dayCache.clear();
    dayCacheConnectionKey = connKey;
  }

  const cached = dayCache.get(key);
  const [state, setState] = useState<HealthDayState>(cached ?? {
    loading: true,
    connected: isHealthAvailable(),
    summary: EMPTY_SUMMARY,
    hourlyHrv: [],
    hourlyHr: [],
    hrSpark: [],
    sleepSpark: [],
    hrvDelta: null,
  });

  // Generation ID — a stale fetch that resolves after the user has already
  // navigated to another day won't overwrite the newer day's data.
  const genRef = useRef(0);

  useEffect(() => {
    // Serve cached data immediately if we have it; still revalidate in the
    // background so a day opened twice still picks up new samples logged
    // since last view.
    const hit = dayCache.get(key);
    if (hit) setState(hit);
    else setState((s) => ({ ...s, loading: true }));

    const gen = ++genRef.current;

    (async () => {
      if (!isHealthAvailable()) {
        if (genRef.current !== gen) return;
        const next: HealthDayState = {
          loading: false, connected: false, summary: EMPTY_SUMMARY,
          hourlyHrv: [], hourlyHr: [], hrSpark: [], sleepSpark: [], hrvDelta: null,
        };
        dayCache.set(key, next);
        setState(next);
        return;
      }

      const [summary, hourlyHrv, hourlyHr, hrvRange, hrRange, sleepRange] = await Promise.all([
        fetchDayMetrics(date),
        fetchHourlyHRV(date),
        fetchHourlyHR(date),
        fetchDailyRange('hrv', subDays(date, 1), date),
        fetchDailyRange('hr', subDays(date, 9), date),
        fetchDailyRange('sleep', subDays(date, 6), date),
      ]);

      if (genRef.current !== gen) return; // superseded — drop

      const todayHrv = hrvRange[hrvRange.length - 1]?.value ?? 0;
      const prevHrv = hrvRange[hrvRange.length - 2]?.value ?? 0;
      const delta = todayHrv > 0 && prevHrv > 0
        ? +(((todayHrv - prevHrv) / prevHrv) * 100).toFixed(1)
        : null;

      const next: HealthDayState = {
        loading: false,
        connected: true,
        summary,
        hourlyHrv,
        hourlyHr,
        hrSpark: hrRange.map((p) => p.value),
        sleepSpark: sleepRange.map((p) => p.value),
        hrvDelta: delta,
      };
      dayCache.set(key, next);
      setState(next);
    })().catch(() => {
      if (genRef.current !== gen) return;
      setState((s) => ({ ...s, loading: false }));
    });
    // Only key + connKey. date/connected are captured in the closure; the
    // key strings change iff they're semantically different, so this is
    // stable across re-renders with the same calendar day.
  }, [key, connKey]);

  return state;
}
