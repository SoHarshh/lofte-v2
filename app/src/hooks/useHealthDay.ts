import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/expo';
import {
  HealthMetrics,
  fetchDayMetrics, fetchHourlyHRV, fetchHourlyHR, fetchDailyRange,
  isHealthAvailable, useHealthConnection,
} from '../utils/health';
import {
  getDayEntry, putDayEntry, peekDayEntry, clearHealthCache,
  dayKeyOf, isToday, HISTORICAL_BACKFILL_WINDOW_MS,
  HealthDayEntry,
} from '../utils/healthCache';

export type HealthDayState = {
  loading: boolean;
  connected: boolean;
  summary: HealthMetrics;
  hourlyHrv: number[];
  hourlyHr: number[];
  hrSpark: number[];
  sleepSpark: number[];
  hrvDelta: number | null;
  /** Epoch ms of the most recent successful HealthKit read for this day. */
  syncedAt: number | null;
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

// Track the connection state globally so we can drop the on-disk cache the
// moment the user revokes HealthKit. Apple's guidance: never trust a cached
// permission-gated read across a permissions change.
let lastConnKey = '';

function entryToState(e: HealthDayEntry, connected: boolean): HealthDayState {
  return {
    loading: false,
    connected,
    summary: e.summary,
    hourlyHrv: e.hourlyHrv,
    hourlyHr: e.hourlyHr,
    hrSpark: e.hrSpark,
    sleepSpark: e.sleepSpark,
    hrvDelta: e.hrvDelta,
    syncedAt: e.syncedAt,
  };
}

// Should we re-fetch this day even though we already have cached data?
// Rules:
//  - Today: always, but only once per focus session (handled via the ref)
//  - <7 days old: yes if cache is older than 1 hour (Watch backfill)
//  - >=7 days old: never (historical, effectively immutable)
function shouldRevalidate(date: Date, entry: HealthDayEntry | null): boolean {
  if (!entry) return true;
  if (isToday(date)) return true;
  const ageMs = Date.now() - date.getTime();
  if (ageMs < HISTORICAL_BACKFILL_WINDOW_MS) {
    return Date.now() - entry.syncedAt > 60 * 60 * 1000;
  }
  return false;
}

export function useHealthDay(date: Date): HealthDayState {
  const { userId } = useAuth();
  const { connected } = useHealthConnection();
  const key = dayKeyOf(date);
  const connKey = String(connected);

  // Hard invalidate the on-disk cache on connect/disconnect flip — stale
  // "no data" (or stale permissioned data) is worse than a one-time re-fetch.
  if (lastConnKey && lastConnKey !== connKey) {
    clearHealthCache(userId);
  }
  lastConnKey = connKey;

  const cached = peekDayEntry(userId, key);
  const [state, setState] = useState<HealthDayState>(
    cached ? entryToState(cached, connected)
           : {
               loading: true,
               connected: isHealthAvailable(),
               summary: EMPTY_SUMMARY,
               hourlyHrv: [],
               hourlyHr: [],
               hrSpark: [],
               sleepSpark: [],
               hrvDelta: null,
               syncedAt: null,
             },
  );
  const genRef = useRef(0);

  useEffect(() => {
    const gen = ++genRef.current;

    (async () => {
      // Serve persistent cache first if we have it — instant paint.
      const entry = await getDayEntry(userId, key);
      if (genRef.current !== gen) return;
      if (entry) setState(entryToState(entry, connected));
      else setState((s) => ({ ...s, loading: true }));

      if (!isHealthAvailable()) {
        const empty: HealthDayState = {
          loading: false, connected: false, summary: EMPTY_SUMMARY,
          hourlyHrv: [], hourlyHr: [], hrSpark: [], sleepSpark: [],
          hrvDelta: null, syncedAt: null,
        };
        setState(empty);
        return;
      }

      // Skip the revalidation for historical days that don't need one —
      // this is the main win: navigating back to last Tuesday never hits the
      // native bridge.
      if (!shouldRevalidate(date, entry)) return;

      const [summary, hourlyHrv, hourlyHr, hrvRange, hrRange, sleepRange] = await Promise.all([
        fetchDayMetrics(date),
        fetchHourlyHRV(date),
        fetchHourlyHR(date),
        fetchDailyRange('hrv', subDays(date, 1), date),
        fetchDailyRange('hr', subDays(date, 9), date),
        fetchDailyRange('sleep', subDays(date, 6), date),
      ]);
      if (genRef.current !== gen) return;

      const todayHrv = hrvRange[hrvRange.length - 1]?.value ?? 0;
      const prevHrv = hrvRange[hrvRange.length - 2]?.value ?? 0;
      const delta = todayHrv > 0 && prevHrv > 0
        ? +(((todayHrv - prevHrv) / prevHrv) * 100).toFixed(1)
        : null;

      const next: HealthDayEntry = {
        syncedAt: Date.now(),
        summary,
        hourlyHrv,
        hourlyHr,
        hrSpark: hrRange.map((p) => p.value),
        sleepSpark: sleepRange.map((p) => p.value),
        hrvDelta: delta,
      };
      putDayEntry(userId, key, next);
      setState(entryToState(next, true));
    })().catch(() => {
      if (genRef.current !== gen) return;
      setState((s) => ({ ...s, loading: false }));
    });
  }, [key, connKey, userId]);

  return state;
}
