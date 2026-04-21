// Health metric definitions — titles, units, and educational copy for each
// metric shown in the Health tab. Real numeric data is pulled live from
// Apple Health via `src/utils/health.ts`; nothing in this file produces
// fake or seeded values anymore.

export type Period = 'D' | 'W' | 'M' | 'Y';
export type MetricKey = 'hrv' | 'hr' | 'sleep' | 'steps' | 'cal';

export type MetricConfig = {
  key: MetricKey;
  title: string;
  unit: string;
  range: string;
  about: string;
  high: string;
  low: string;
};

export const HEALTH_METRICS: Record<MetricKey, MetricConfig> = {
  hrv: {
    key: 'hrv',
    title: 'Heart Rate Variability',
    unit: 'ms',
    range: 'Typical: 20–70 ms. Your own baseline matters most.',
    about: 'Tiny variation between heartbeats. Higher = your body recovers well.',
    high: 'Well-rested, recovered, and handling stress well.',
    low: 'Tired, stressed, or under-recovered. Rest more.',
  },
  hr: {
    key: 'hr',
    title: 'Resting Heart Rate',
    unit: 'bpm',
    range: 'Healthy adults: 60–100 bpm. Athletes often lower.',
    about: 'How fast your heart beats at rest. A key fitness signal.',
    high: 'Could mean stress, poor sleep, or illness.',
    low: 'Usually a sign of good fitness.',
  },
  sleep: {
    key: 'sleep',
    title: 'Sleep',
    unit: 'hrs',
    range: 'Most adults need 7–9 hrs per night.',
    about: 'When your body repairs and your brain resets.',
    high: "Over 9 hrs often isn't better — quality matters.",
    low: 'Under 7 hrs repeatedly hurts focus and mood.',
  },
  steps: {
    key: 'steps',
    title: 'Steps',
    unit: 'steps',
    range: 'Common goal: 8,000–10,000 per day.',
    about: 'Your daily movement, tracked step by step.',
    high: 'Great for heart health — just ramp up gradually.',
    low: 'Fine for rest days; bad as a long pattern.',
  },
  cal: {
    key: 'cal',
    title: 'Active Calories',
    unit: 'kcal',
    range: 'Common goal: 400–600 active kcal per day.',
    about: 'Calories you burn from moving, not resting.',
    high: 'Strong effort — make sure to recover.',
    low: 'Okay for rest days; avoid long streaks.',
  },
};

// Human-readable header for a given day in the D view
export function dayHeaderLabel(d: Date): string {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const ref = new Date(d); ref.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - ref.getTime()) / 86_400_000);
  if (diff === 0) return 'TODAY';
  if (diff === 1) return 'YESTERDAY';
  const wk = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][d.getDay()];
  const m = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][d.getMonth()];
  return `${wk} · ${m} ${d.getDate()}`;
}
