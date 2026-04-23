import { Platform, NativeModules } from 'react-native';
import { useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';

let AppleHealthKit: any = null;
let HealthConstants: any = null;
let loadError: string | null = null;

if (Platform.OS === 'ios') {
  try {
    // The `react-native-health` library does:
    //   const { AppleHealthKit } = require('react-native').NativeModules
    //   export default Object.assign({}, AppleHealthKit, { Constants })
    // RN's modern NativeModules is a Proxy and exposes native methods via
    // traps, not enumerable own properties. Object.assign can't see them, so
    // the library's default export ends up as { Constants } with no methods.
    // Workaround: grab the native module directly (Proxy direct-access works)
    // and pull constants from the library's source module.
    const native = NativeModules.AppleHealthKit;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const constants = require('react-native-health/src/constants');

    if (native && typeof native.initHealthKit === 'function') {
      AppleHealthKit = native;
      HealthConstants = {
        Activities: constants.Activities,
        Observers: constants.Observers,
        Permissions: constants.Permissions,
        Units: constants.Units,
      };
    } else {
      loadError = !native
        ? 'Native HealthKit bridge missing — NativeModules.AppleHealthKit is undefined.'
        : 'Native HealthKit bridge is a stub — initHealthKit method is not exposed. Rebuild the iOS app with `pod install`.';
      AppleHealthKit = null;
    }
  } catch (e: any) {
    loadError = e?.message || 'react-native-health load failed';
    AppleHealthKit = null;
  }
}

// Expose the exact reason isHealthAvailable may be false. Helps the UI show
// actionable errors instead of a silent no-op.
export function getHealthLoadError(): string | null { return loadError; }

const CONNECTED_KEY = 'health_connected';

export type HealthMetrics = {
  steps: number | null;
  activeEnergyKcal: number | null;
  restingHeartRate: number | null;
  hrvMs: number | null;
  sleepHours: number | null;
  bodyWeightKg: number | null;
};

export function isHealthAvailable(): boolean {
  return Platform.OS === 'ios' && !!AppleHealthKit;
}

export async function isHealthConnected(): Promise<boolean> {
  const v = await SecureStore.getItemAsync(CONNECTED_KEY);
  return v === 'true';
}

// Broadcast connection changes so any screen that cares (Biology overlay,
// Profile toggle) stays in sync without polling.
type ConnectionListener = (connected: boolean) => void;
const connectionListeners = new Set<ConnectionListener>();

function notifyConnectionChange(connected: boolean) {
  connectionListeners.forEach((fn) => {
    try { fn(connected); } catch {}
  });
}

export function subscribeHealthConnection(fn: ConnectionListener): () => void {
  connectionListeners.add(fn);
  return () => { connectionListeners.delete(fn); };
}

export async function setHealthConnected(connected: boolean): Promise<void> {
  await SecureStore.setItemAsync(CONNECTED_KEY, connected ? 'true' : 'false');
  notifyConnectionChange(connected);
}

// Live hook backed by SecureStore + pub/sub — reads once on mount, then
// listens for any `setHealthConnected` / permission-grant elsewhere in the app.
export function useHealthConnection(): {
  connected: boolean;
  ready: boolean;
  connect: () => Promise<PermissionResult>;
  disconnect: () => Promise<void>;
} {
  const [connected, setConnected] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    isHealthConnected().then((v) => {
      if (!mounted) return;
      setConnected(v);
      setReady(true);
    });
    const unsub = subscribeHealthConnection((v) => {
      if (mounted) setConnected(v);
    });
    return () => { mounted = false; unsub(); };
  }, []);

  const connect = async () => {
    return requestHealthPermissionsDetailed();
  };

  const disconnect = async () => {
    await setHealthConnected(false);
  };

  return { connected, ready, connect, disconnect };
}

function buildPermissions() {
  if (!HealthConstants) return null;
  const P = HealthConstants.Permissions;
  return {
    permissions: {
      read: [
        P.Steps,
        P.ActiveEnergyBurned,
        P.BasalEnergyBurned,
        P.HeartRate,
        P.RestingHeartRate,
        P.HeartRateVariability,
        P.SleepAnalysis,
        P.Weight,
        P.Workout,
      ],
      write: [
        P.Workout,
        P.ActiveEnergyBurned,
      ],
    },
  };
}

export type PermissionResult =
  | { ok: true }
  | { ok: false; reason: 'unavailable' | 'denied' | 'error'; message: string };

// Detailed version used by the UI. Flips the SecureStore flag to true only
// when HealthKit actually returned sharingAuthorized for a write type we need.
// Per Apple docs: read-type authorization is hidden for privacy; only write
// auth status is truthful. So the write-type check is the only reliable
// "did the user actually approve us?" signal.
export async function requestHealthPermissionsDetailed(): Promise<PermissionResult> {
  if (Platform.OS !== 'ios') {
    return { ok: false, reason: 'unavailable', message: 'Apple Health is only available on iOS.' };
  }
  if (!AppleHealthKit) {
    return {
      ok: false, reason: 'unavailable',
      message: loadError || 'HealthKit native module is not available. Install the TestFlight build (Expo Go cannot access HealthKit).',
    };
  }
  const perms = buildPermissions();
  if (!perms) {
    return { ok: false, reason: 'unavailable', message: 'HealthKit permission constants missing.' };
  }

  return new Promise<PermissionResult>((resolve) => {
    let settled = false;
    const done = (r: PermissionResult) => {
      if (settled) return;
      settled = true;
      resolve(r);
    };
    // Safety net: if the native callback never fires (known edge case with
    // react-native-health when the permission sheet is backgrounded), surface
    // an error instead of hanging the UI forever.
    const timer = setTimeout(() => {
      console.warn('[health] initHealthKit timed out after 60s');
      done({
        ok: false, reason: 'error',
        message: 'Health permission request timed out. Try closing the app and re-opening it.',
      });
    }, 60000);

    AppleHealthKit.initHealthKit(perms, (err: string) => {
      clearTimeout(timer);
      if (err) {
        console.warn('[health] initHealthKit error:', err);
        done({ ok: false, reason: 'error', message: err });
        return;
      }

      // HealthKit doesn't re-prompt on subsequent calls. If the user previously
      // tapped "Don't Allow" on writes, we'll land here with no sheet shown.
      // Check authorizationStatus for a write type to distinguish "approved"
      // from "previously denied".
      const P = HealthConstants.Permissions;
      const checkWrite = (permission: any) => new Promise<number>((res) => {
        if (typeof AppleHealthKit.getAuthStatus !== 'function') return res(2); // assume authorized on older package
        AppleHealthKit.getAuthStatus(
          { permissions: { write: [permission], read: [] } },
          (_e: any, r: any) => {
            // r.permissions.write is an array of ints: 0=notDetermined, 1=denied, 2=authorized
            const v = r?.permissions?.write?.[0];
            res(typeof v === 'number' ? v : 2);
          },
        );
      });

      Promise.all([checkWrite(P.Workout), checkWrite(P.ActiveEnergyBurned)]).then((statuses) => {
        if (statuses.some((s) => s === 1)) {
          done({
            ok: false, reason: 'denied',
            message: 'Open iOS Settings → Privacy & Security → Health → LOFTE and turn on the categories you want to share.',
          });
          return;
        }
        setHealthConnected(true).finally(() => done({ ok: true }));
      }).catch(() => {
        setHealthConnected(true).finally(() => done({ ok: true }));
      });
    });
  });
}

// Legacy boolean wrapper kept for existing callers (SessionScreen, etc).
export async function requestHealthPermissions(): Promise<boolean> {
  const r = await requestHealthPermissionsDetailed();
  return r.ok;
}

function todayRange() {
  const end = new Date();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return { startDate: start.toISOString(), endDate: end.toISOString() };
}

function call<T>(fn: (opts: any, cb: (err: any, res: T) => void) => void, opts: any): Promise<T | null> {
  return new Promise((resolve) => {
    try {
      fn(opts, (err: any, res: T) => resolve(err ? null : res));
    } catch {
      resolve(null);
    }
  });
}

export async function getTodayMetrics(): Promise<HealthMetrics> {
  const empty: HealthMetrics = {
    steps: null, activeEnergyKcal: null, restingHeartRate: null,
    hrvMs: null, sleepHours: null, bodyWeightKg: null,
  };
  if (!isHealthAvailable()) return empty;
  const range = todayRange();

  const [steps, active, resting, hrv, sleep, weight] = await Promise.all([
    call<{ value: number }>(AppleHealthKit.getStepCount, { date: range.endDate }),
    call<{ value: number }>(AppleHealthKit.getActiveEnergyBurned, range),
    call<Array<{ value: number }>>(AppleHealthKit.getRestingHeartRateSamples, { ...range, limit: 1, ascending: false }),
    call<Array<{ value: number }>>(AppleHealthKit.getHeartRateVariabilitySamples, { ...range, limit: 1, ascending: false }),
    call<Array<{ startDate: string; endDate: string; value: string }>>(AppleHealthKit.getSleepSamples, {
      ...(() => {
        // Sleep window: yesterday 6pm → today 11am (captures last night)
        const s = new Date(); s.setDate(s.getDate() - 1); s.setHours(18, 0, 0, 0);
        const e = new Date(); e.setHours(11, 0, 0, 0);
        return { startDate: s.toISOString(), endDate: e.toISOString() };
      })(),
      limit: 100,
    }),
    call<Array<{ value: number }>>(AppleHealthKit.getWeightSamples, { ...range, limit: 1, ascending: false, unit: 'gram' }),
  ]);

  const stepCount = typeof (steps as any)?.value === 'number' ? (steps as any).value : null;
  const activeSum = Array.isArray(active)
    ? (active as any[]).reduce((a, s) => a + (s.value || 0), 0)
    : typeof (active as any)?.value === 'number' ? (active as any).value : null;
  const restingBpm = Array.isArray(resting) && resting.length > 0 ? resting[0].value : null;
  const hrvValue = Array.isArray(hrv) && hrv.length > 0 ? hrv[0].value * 1000 : null; // SDNN seconds → ms

  // Sleep: sum in-bed or asleep segments (in minutes)
  let sleepMinutes = 0;
  if (Array.isArray(sleep)) {
    sleep.forEach((s) => {
      const v = (s.value || '').toUpperCase();
      if (v.includes('ASLEEP') || v === 'INBED') {
        const diff = (new Date(s.endDate).getTime() - new Date(s.startDate).getTime()) / 60000;
        if (diff > 0) sleepMinutes += diff;
      }
    });
  }
  const sleepHours = sleepMinutes > 0 ? +(sleepMinutes / 60).toFixed(2) : null;

  // Weight returned in grams when unit='gram'
  const weightKg = Array.isArray(weight) && weight.length > 0 ? +(weight[0].value / 1000).toFixed(2) : null;

  return {
    steps: stepCount,
    activeEnergyKcal: activeSum != null ? Math.round(activeSum) : null,
    restingHeartRate: restingBpm != null ? Math.round(restingBpm) : null,
    hrvMs: hrvValue != null ? +hrvValue.toFixed(1) : null,
    sleepHours,
    bodyWeightKg: weightKg,
  };
}

export async function getHeartRateForWindow(start: Date, end: Date): Promise<{ avg: number | null; max: number | null }> {
  if (!isHealthAvailable()) return { avg: null, max: null };
  const samples = await call<Array<{ value: number }>>(AppleHealthKit.getHeartRateSamples, {
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    limit: 1000,
  });
  if (!Array.isArray(samples) || samples.length === 0) return { avg: null, max: null };
  const values = samples.map((s) => s.value).filter((v) => v > 0);
  if (values.length === 0) return { avg: null, max: null };
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const max = Math.max(...values);
  return { avg: Math.round(avg), max: Math.round(max) };
}

export function saveWorkoutToHealth(input: {
  activityType?: string;
  start: Date;
  end: Date;
  caloriesKcal?: number;
  distanceMeters?: number;
}): Promise<boolean> {
  return new Promise((resolve) => {
    if (!isHealthAvailable() || !HealthConstants) return resolve(false);
    const Activities = HealthConstants.Activities || {};
    const fallback = Activities.TraditionalStrengthTraining ?? Activities.FunctionalStrengthTraining;
    const type = input.activityType && Activities[input.activityType] ? Activities[input.activityType] : fallback;
    const payload: any = {
      type,
      startDate: input.start.toISOString(),
      endDate: input.end.toISOString(),
    };
    if (input.caloriesKcal != null) payload.energyBurned = input.caloriesKcal;
    if (input.distanceMeters != null) payload.distance = input.distanceMeters;
    try {
      AppleHealthKit.saveWorkout(payload, (err: string) => resolve(!err));
    } catch {
      resolve(false);
    }
  });
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function dayBounds(d: Date): { startDate: string; endDate: string } {
  const start = new Date(d); start.setHours(0, 0, 0, 0);
  const end = new Date(d); end.setHours(23, 59, 59, 999);
  return { startDate: start.toISOString(), endDate: end.toISOString() };
}

// ─── Per-day summary for any date (today or historical) ─────────────────────

export async function fetchDayMetrics(d: Date): Promise<HealthMetrics> {
  const empty: HealthMetrics = {
    steps: null, activeEnergyKcal: null, restingHeartRate: null,
    hrvMs: null, sleepHours: null, bodyWeightKg: null,
  };
  if (!isHealthAvailable()) return empty;
  const { startDate, endDate } = dayBounds(d);

  const [daily, active, resting, hrv, sleep, weight] = await Promise.all([
    // getDailyStepCountSamples returns { nanos, value, startDate, endDate } for each day in range
    call<Array<{ value: number; startDate: string }>>(AppleHealthKit.getDailyStepCountSamples, { startDate, endDate }),
    call<Array<{ value: number }>>(AppleHealthKit.getActiveEnergyBurned, { startDate, endDate }),
    call<Array<{ value: number }>>(AppleHealthKit.getRestingHeartRateSamples, { startDate, endDate, limit: 5, ascending: false }),
    call<Array<{ value: number }>>(AppleHealthKit.getHeartRateVariabilitySamples, { startDate, endDate, limit: 100, ascending: false }),
    call<Array<{ startDate: string; endDate: string; value: string }>>(AppleHealthKit.getSleepSamples, {
      // Sleep window: previous day 6pm → end of day
      ...(() => {
        const s = new Date(d); s.setDate(s.getDate() - 1); s.setHours(18, 0, 0, 0);
        return { startDate: s.toISOString(), endDate };
      })(),
      limit: 100,
    }),
    call<Array<{ value: number }>>(AppleHealthKit.getWeightSamples, { startDate, endDate, limit: 1, ascending: false, unit: 'gram' }),
  ]);

  // Steps — sum samples for this day (usually one bucket)
  const stepCount = Array.isArray(daily) && daily.length > 0
    ? Math.round(daily.reduce((a, s: any) => a + (s.value || 0), 0))
    : null;
  // Active energy — sum samples across the day
  const activeSum = Array.isArray(active)
    ? Math.round(active.reduce((a: number, s: any) => a + (s.value || 0), 0))
    : null;
  const activeVal = activeSum != null && activeSum > 0 ? activeSum : null;
  // Resting HR — most recent sample
  const restingBpm = Array.isArray(resting) && resting.length > 0 ? Math.round(resting[0].value) : null;
  // HRV — average of all samples (seconds → ms)
  const hrvSamples = Array.isArray(hrv) ? hrv.map((s: any) => (s.value || 0) * 1000).filter((v) => v > 0) : [];
  const hrvValue = hrvSamples.length > 0
    ? +(hrvSamples.reduce((a, b) => a + b, 0) / hrvSamples.length).toFixed(1)
    : null;
  // Sleep — sum "asleep" or "in-bed" segments
  let sleepMinutes = 0;
  if (Array.isArray(sleep)) {
    sleep.forEach((s) => {
      const v = (s.value || '').toUpperCase();
      if (v.includes('ASLEEP') || v === 'INBED') {
        const diff = (new Date(s.endDate).getTime() - new Date(s.startDate).getTime()) / 60000;
        if (diff > 0) sleepMinutes += diff;
      }
    });
  }
  const sleepHours = sleepMinutes > 0 ? +(sleepMinutes / 60).toFixed(2) : null;
  const weightKg = Array.isArray(weight) && weight.length > 0 ? +(weight[0].value / 1000).toFixed(2) : null;

  return {
    steps: stepCount,
    activeEnergyKcal: activeVal,
    restingHeartRate: restingBpm,
    hrvMs: hrvValue,
    sleepHours,
    bodyWeightKg: weightKg,
  };
}

// ─── Hourly series (24 buckets) for a single day ────────────────────────────

function bucketHourly(samples: Array<{ value: number; startDate: string }>): number[] {
  const buckets: number[][] = Array.from({ length: 24 }, () => []);
  samples.forEach((s) => {
    const h = new Date(s.startDate).getHours();
    if (h >= 0 && h < 24 && typeof s.value === 'number') buckets[h].push(s.value);
  });
  return buckets.map((b) => (b.length > 0 ? b.reduce((a, x) => a + x, 0) / b.length : 0));
}

function bucketHourlySum(samples: Array<{ value: number; startDate: string }>): number[] {
  const buckets = new Array(24).fill(0);
  samples.forEach((s) => {
    const h = new Date(s.startDate).getHours();
    if (h >= 0 && h < 24 && typeof s.value === 'number') buckets[h] += s.value;
  });
  return buckets;
}

export async function fetchHourlyHRV(d: Date): Promise<number[]> {
  if (!isHealthAvailable()) return [];
  const { startDate, endDate } = dayBounds(d);
  const samples = await call<Array<{ value: number; startDate: string }>>(
    AppleHealthKit.getHeartRateVariabilitySamples,
    { startDate, endDate, ascending: true, limit: 2000 }
  );
  if (!Array.isArray(samples) || samples.length === 0) return [];
  // Convert seconds → ms
  const normalized = samples.map((s) => ({ value: (s.value || 0) * 1000, startDate: s.startDate }));
  const bucketed = bucketHourly(normalized);
  // If all buckets are zero, treat as no data
  if (bucketed.every((v) => v === 0)) return [];
  return bucketed;
}

export async function fetchHourlyHR(d: Date): Promise<number[]> {
  if (!isHealthAvailable()) return [];
  const { startDate, endDate } = dayBounds(d);
  const samples = await call<Array<{ value: number; startDate: string }>>(
    AppleHealthKit.getHeartRateSamples,
    { startDate, endDate, ascending: true, limit: 5000 }
  );
  if (!Array.isArray(samples) || samples.length === 0) return [];
  const bucketed = bucketHourly(samples);
  if (bucketed.every((v) => v === 0)) return [];
  return bucketed;
}

export async function fetchHourlySteps(d: Date): Promise<number[]> {
  if (!isHealthAvailable()) return [];
  const { startDate, endDate } = dayBounds(d);
  // Hourly step samples — HealthKit returns accumulated step samples
  const samples = await call<Array<{ value: number; startDate: string }>>(
    AppleHealthKit.getDailyStepCountSamples,
    { startDate, endDate, period: 60 } // period in minutes; 60 = hourly buckets
  );
  if (!Array.isArray(samples) || samples.length === 0) return [];
  const bucketed = bucketHourlySum(samples);
  if (bucketed.every((v) => v === 0)) return [];
  return bucketed;
}

export async function fetchHourlyActiveEnergy(d: Date): Promise<number[]> {
  if (!isHealthAvailable()) return [];
  const { startDate, endDate } = dayBounds(d);
  const samples = await call<Array<{ value: number; startDate: string }>>(
    AppleHealthKit.getActiveEnergyBurned,
    { startDate, endDate, includeManuallyAdded: true }
  );
  if (!Array.isArray(samples) || samples.length === 0) return [];
  const bucketed = bucketHourlySum(samples);
  if (bucketed.every((v) => v === 0)) return [];
  return bucketed;
}

// ─── Range aggregation for W / M / Y views ──────────────────────────────────

export type RangePoint = { label: string; value: number };
export type MetricName = 'hrv' | 'hr' | 'sleep' | 'steps' | 'cal';

// Returns daily aggregates for the given metric between start and end (inclusive).
// Missing days are represented as { value: 0 }.
export async function fetchDailyRange(
  metric: MetricName,
  start: Date,
  end: Date,
): Promise<Array<{ date: Date; value: number }>> {
  if (!isHealthAvailable()) return [];

  // Build the list of days
  const days: Date[] = [];
  const cursor = new Date(start); cursor.setHours(0, 0, 0, 0);
  const endDay = new Date(end); endDay.setHours(0, 0, 0, 0);
  while (cursor.getTime() <= endDay.getTime()) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  // Fetch all days in parallel (capped)
  const summaries = await Promise.all(days.map((d) => fetchDayMetrics(d)));
  return days.map((date, i) => {
    const s = summaries[i];
    let value = 0;
    switch (metric) {
      case 'hrv':    value = s.hrvMs ?? 0; break;
      case 'hr':     value = s.restingHeartRate ?? 0; break;
      case 'sleep':  value = s.sleepHours ?? 0; break;
      case 'steps':  value = s.steps ?? 0; break;
      case 'cal':    value = s.activeEnergyKcal ?? 0; break;
    }
    return { date, value };
  });
}

// ─── End of data-fetch helpers ─────────────────────────────────────────────

export function mapMuscleGroupToActivity(muscleGroup?: string, exerciseName?: string): string {
  const g = (muscleGroup || '').toLowerCase();
  const n = (exerciseName || '').toLowerCase();
  if (g === 'cardio' || /run|jog|tread/.test(n)) return 'Running';
  if (/cycl|bike/.test(n)) return 'Cycling';
  if (/row/.test(n)) return 'Rowing';
  if (/swim/.test(n)) return 'Swimming';
  if (/walk/.test(n)) return 'Walking';
  if (/stair|step/.test(n)) return 'StairClimbing';
  if (/elliptical/.test(n)) return 'Elliptical';
  if (/jump rope/.test(n)) return 'JumpRope';
  return 'TraditionalStrengthTraining';
}
