import { useEffect, useRef, useState } from 'react';
import {
  fetchDailyRange, MetricName, isHealthAvailable, useHealthConnection,
} from '../utils/health';

export type SeriesPoint = { label: string; value: number };

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
function dayKeyStr(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

const WEEK_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export type Period = 'W' | 'M' | 'Y';

// Module-level cache keyed by metric+period+anchor-day. Rapid metric-tap /
// back / other-metric cycles no longer queue repeated HealthKit queries —
// a cached series renders instantly, and we revalidate in the background.
type Cached = { loading: false; data: SeriesPoint[] };
const seriesCache = new Map<string, Cached>();
let seriesCacheConnectionKey = '';

export function useMetricSeries(
  metric: MetricName,
  period: Period,
  anchor: Date,
): { loading: boolean; data: SeriesPoint[] } {
  const { connected } = useHealthConnection();
  const anchorKey = dayKeyStr(anchor);
  const connKey = String(connected);
  const cacheKey = `${metric}:${period}:${anchorKey}`;

  if (seriesCacheConnectionKey !== connKey) {
    seriesCache.clear();
    seriesCacheConnectionKey = connKey;
  }

  const cached = seriesCache.get(cacheKey);
  const [state, setState] = useState<{ loading: boolean; data: SeriesPoint[] }>(
    cached ?? { loading: true, data: [] },
  );
  const genRef = useRef(0);

  useEffect(() => {
    const hit = seriesCache.get(cacheKey);
    if (hit) setState(hit);
    else setState({ loading: true, data: [] });

    const gen = ++genRef.current;

    (async () => {
      if (!isHealthAvailable()) {
        if (genRef.current !== gen) return;
        const next: Cached = { loading: false, data: [] };
        seriesCache.set(cacheKey, next);
        setState(next);
        return;
      }

      const summed = SUMMED[metric];
      const end = startOfDay(anchor);

      let data: SeriesPoint[] = [];

      if (period === 'W') {
        const start = subDays(end, 6);
        const raw = await fetchDailyRange(metric, start, end);
        if (genRef.current !== gen) return;
        data = raw.map((p) => ({
          label: WEEK_LABELS[(p.date.getDay() + 6) % 7],
          value: Math.round(p.value * 10) / 10,
        }));
      } else if (period === 'M') {
        const start = subDays(end, 27);
        const raw = await fetchDailyRange(metric, start, end);
        if (genRef.current !== gen) return;
        const weeks: number[][] = [[], [], [], []];
        raw.forEach((p, i) => {
          const bucket = Math.min(3, Math.floor(i / 7));
          weeks[bucket].push(p.value);
        });
        data = weeks.map((w, i) => ({
          label: `W${i + 1}`,
          value: Math.round(aggregate(w, summed) * 10) / 10,
        }));
      } else {
        const months: { label: string; values: number[] }[] = [];
        for (let i = 11; i >= 0; i--) {
          const d = new Date(end);
          d.setMonth(d.getMonth() - i);
          months.push({ label: MONTH_LABELS[d.getMonth()], values: [] });
        }
        const yearStart = new Date(end);
        yearStart.setMonth(yearStart.getMonth() - 11, 1);
        const raw = await fetchDailyRange(metric, yearStart, end);
        if (genRef.current !== gen) return;
        raw.forEach((p) => {
          const idx = 11 - (
            (end.getFullYear() - p.date.getFullYear()) * 12
            + (end.getMonth() - p.date.getMonth())
          );
          if (idx >= 0 && idx < 12) months[idx].values.push(p.value);
        });
        data = months.map((m) => ({
          label: m.label,
          value: Math.round(aggregate(m.values, summed) * 10) / 10,
        }));
      }

      if (genRef.current !== gen) return;
      const next: Cached = { loading: false, data };
      seriesCache.set(cacheKey, next);
      setState(next);
    })().catch(() => {
      if (genRef.current !== gen) return;
      setState({ loading: false, data: [] });
    });
  }, [cacheKey, connKey]);

  return state;
}
