import { useEffect, useState } from 'react';
import {
  HealthMetrics,
  fetchDayMetrics, fetchHourlyHRV, fetchHourlyHR, fetchDailyRange,
  isHealthAvailable,
} from '../utils/health';

export type HealthDayState = {
  loading: boolean;
  connected: boolean;
  summary: HealthMetrics;
  hourlyHrv: number[];   // 24 values, 0 where no samples
  hourlyHr: number[];    // 24 values
  hrSpark: number[];     // last 10 days of resting HR, for the tile sparkline
  sleepSpark: number[];  // last 7 days of sleep hours, for the tile sparkline
  hrvDelta: number | null; // % vs previous day (null if insufficient data)
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

// Fetches everything the Health home needs for a single day: today's summary
// numbers, hourly HRV + HR curves, and a day-over-day HRV delta computed from
// real HealthKit data.
export function useHealthDay(date: Date): HealthDayState {
  const [state, setState] = useState<HealthDayState>({
    loading: true,
    connected: isHealthAvailable(),
    summary: EMPTY_SUMMARY,
    hourlyHrv: [],
    hourlyHr: [],
    hrSpark: [],
    sleepSpark: [],
    hrvDelta: null,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setState((s) => ({ ...s, loading: true }));
      if (!isHealthAvailable()) {
        setState({
          loading: false, connected: false, summary: EMPTY_SUMMARY,
          hourlyHrv: [], hourlyHr: [], hrSpark: [], sleepSpark: [], hrvDelta: null,
        });
        return;
      }

      const [summary, hourlyHrv, hourlyHr, prevSummary, hrRange, sleepRange] = await Promise.all([
        fetchDayMetrics(date),
        fetchHourlyHRV(date),
        fetchHourlyHR(date),
        fetchDayMetrics(subDays(date, 1)),
        fetchDailyRange('hr', subDays(date, 9), date),
        fetchDailyRange('sleep', subDays(date, 6), date),
      ]);

      if (cancelled) return;

      const delta = summary.hrvMs != null && prevSummary.hrvMs != null && prevSummary.hrvMs > 0
        ? +(((summary.hrvMs - prevSummary.hrvMs) / prevSummary.hrvMs) * 100).toFixed(1)
        : null;

      setState({
        loading: false,
        connected: true,
        summary,
        hourlyHrv,
        hourlyHr,
        hrSpark: hrRange.map((p) => p.value),
        sleepSpark: sleepRange.map((p) => p.value),
        hrvDelta: delta,
      });
    })().catch(() => {
      if (!cancelled) {
        setState((s) => ({ ...s, loading: false }));
      }
    });
    return () => { cancelled = true; };
  }, [date.toDateString()]);

  return state;
}
