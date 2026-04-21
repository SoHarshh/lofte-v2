import { useEffect, useState } from 'react';
import { fetchDailyRange, MetricName, isHealthAvailable } from '../utils/health';

export type SeriesPoint = { label: string; value: number };

// Aggregation method per metric:
//   - Summed metrics (total over the period): steps, cal, sleep
//   - Averaged metrics (meaningful average): hrv, hr
const SUMMED: Record<MetricName, boolean> = {
  steps: true, cal: true, sleep: true,
  hrv: false, hr: false,
};

function subDays(d: Date, n: number): Date {
  const x = new Date(d); x.setDate(x.getDate() - n); return x;
}
function startOfDay(d: Date): Date {
  const x = new Date(d); x.setHours(0, 0, 0, 0); return x;
}
function aggregate(values: number[], summed: boolean): number {
  const nonZero = values.filter((v) => v > 0);
  if (nonZero.length === 0) return 0;
  if (summed) return nonZero.reduce((a, b) => a + b, 0);
  return nonZero.reduce((a, b) => a + b, 0) / nonZero.length;
}

const WEEK_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export type Period = 'W' | 'M' | 'Y';

// Returns the series for the metric over the given period, ending at `anchor`.
// W → 7 daily points ending today.
// M → 4 weekly points (last 4 weeks).
// Y → 12 monthly points (last 12 months).
export function useMetricSeries(
  metric: MetricName,
  period: Period,
  anchor: Date,
): { loading: boolean; data: SeriesPoint[] } {
  const [state, setState] = useState<{ loading: boolean; data: SeriesPoint[] }>({
    loading: true,
    data: [],
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setState({ loading: true, data: [] });
      if (!isHealthAvailable()) {
        setState({ loading: false, data: [] });
        return;
      }

      const summed = SUMMED[metric];
      const end = startOfDay(anchor);

      if (period === 'W') {
        // 7 days ending at anchor (one point per day)
        const start = subDays(end, 6);
        const raw = await fetchDailyRange(metric, start, end);
        if (cancelled) return;
        const data = raw.map((p) => ({
          label: WEEK_LABELS[(p.date.getDay() + 6) % 7], // Mon=0
          value: Math.round(p.value * 10) / 10,
        }));
        setState({ loading: false, data });
        return;
      }

      if (period === 'M') {
        // 4 weeks, one point per week (bucketed average/sum)
        const start = subDays(end, 27);
        const raw = await fetchDailyRange(metric, start, end);
        if (cancelled) return;
        const weeks: number[][] = [[], [], [], []];
        raw.forEach((p, i) => {
          const bucket = Math.min(3, Math.floor(i / 7));
          weeks[bucket].push(p.value);
        });
        const data = weeks.map((w, i) => ({
          label: `W${i + 1}`,
          value: Math.round(aggregate(w, summed) * 10) / 10,
        }));
        setState({ loading: false, data });
        return;
      }

      // Y → 12 months
      const months: { label: string; values: number[] }[] = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(end);
        d.setMonth(d.getMonth() - i);
        months.push({ label: MONTH_LABELS[d.getMonth()], values: [] });
      }
      const yearStart = new Date(end);
      yearStart.setMonth(yearStart.getMonth() - 11, 1);
      const raw = await fetchDailyRange(metric, yearStart, end);
      if (cancelled) return;
      raw.forEach((p) => {
        const idx = 11 - (
          (end.getFullYear() - p.date.getFullYear()) * 12
          + (end.getMonth() - p.date.getMonth())
        );
        if (idx >= 0 && idx < 12) months[idx].values.push(p.value);
      });
      const data = months.map((m) => ({
        label: m.label,
        value: Math.round(aggregate(m.values, summed) * 10) / 10,
      }));
      setState({ loading: false, data });
    })().catch(() => {
      if (!cancelled) setState({ loading: false, data: [] });
    });
    return () => { cancelled = true; };
  }, [metric, period, anchor.toDateString()]);

  return state;
}
