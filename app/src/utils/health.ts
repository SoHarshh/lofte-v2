import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

let AppleHealthKit: any = null;
let HealthConstants: any = null;

if (Platform.OS === 'ios') {
  try {
    const mod = require('react-native-health');
    AppleHealthKit = mod.default ?? mod;
    HealthConstants = AppleHealthKit?.Constants ?? null;
  } catch {
    AppleHealthKit = null;
  }
}

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

export async function setHealthConnected(connected: boolean): Promise<void> {
  await SecureStore.setItemAsync(CONNECTED_KEY, connected ? 'true' : 'false');
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

export function requestHealthPermissions(): Promise<boolean> {
  return new Promise((resolve) => {
    if (!isHealthAvailable()) return resolve(false);
    const perms = buildPermissions();
    if (!perms) return resolve(false);
    AppleHealthKit.initHealthKit(perms, (err: string) => {
      if (err) {
        resolve(false);
      } else {
        setHealthConnected(true).finally(() => resolve(true));
      }
    });
  });
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
