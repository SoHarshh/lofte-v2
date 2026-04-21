import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  NativeSyntheticEvent, NativeScrollEvent, LayoutChangeEvent,
} from 'react-native';
import { MetricBarChart } from './MetricBarChart';
import { MetricLineChart } from './MetricLineChart';
import { FONT_MEDIUM } from '../utils/fonts';
import { MetricKey, dayHeaderLabel } from '../data/healthMetrics';
import {
  fetchHourlyHRV, fetchHourlyHR, fetchHourlySteps, fetchHourlyActiveEnergy,
  fetchDayMetrics, isHealthAvailable,
} from '../utils/health';

// Continuous biosignals render as a smooth line; everything else as bars.
const LINE_METRICS = new Set<MetricKey>(['hrv', 'hr']);
const HOUR_LABELS = ['12a', '3a', '6a', '9a', '12p', '3p', '6p', '9p'];

const DAYS_BACK = 14; // preload 14 days — fewer than before to keep fetches cheap

interface Props {
  metric: MetricKey;
  unit: string;
  initialDate?: Date;
}

type HourlySeries = { label: string; value: number };

// Downsample 24 hourly values into 8 three-hour buckets for a cleaner chart.
function downsampleTo8(values: number[], summed: boolean): HourlySeries[] {
  if (values.length !== 24) return HOUR_LABELS.map((label) => ({ label, value: 0 }));
  return HOUR_LABELS.map((label, i) => {
    const slice = values.slice(i * 3, i * 3 + 3).filter((v) => v > 0);
    if (slice.length === 0) return { label, value: 0 };
    const agg = summed ? slice.reduce((a, b) => a + b, 0) : slice.reduce((a, b) => a + b, 0) / slice.length;
    return { label, value: Math.round(agg * 10) / 10 };
  });
}

// Horizontal paging: one day's hourly chart per page. Each day fetches fresh
// HealthKit data when it becomes visible (lazy). Snaps between pages and
// updates the header label (TODAY / YESTERDAY / THU · APR 18).
export function DailyPagedChart({ metric, unit, initialDate }: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const [pageWidth, setPageWidth] = useState(0);
  const [pageIdx, setPageIdx] = useState(DAYS_BACK - 1); // rightmost = today
  const summed = metric === 'steps' || metric === 'cal';

  // One entry per day (oldest first, today last). Lazy fetch when visited.
  const dates = useMemo(() => {
    const base = initialDate ? new Date(initialDate) : new Date();
    base.setHours(0, 0, 0, 0);
    return Array.from({ length: DAYS_BACK }, (_, i) => {
      const offset = DAYS_BACK - 1 - i;
      const d = new Date(base);
      d.setDate(base.getDate() - offset);
      return d;
    });
  }, [metric, initialDate?.getTime()]);

  const [pageData, setPageData] = useState<Record<string, HourlySeries[]>>({});
  const [loadingDays, setLoadingDays] = useState<Set<string>>(new Set());

  // Fetch hourly data for a single day
  const fetchDay = async (d: Date): Promise<HourlySeries[]> => {
    if (!isHealthAvailable()) return HOUR_LABELS.map((label) => ({ label, value: 0 }));
    let values: number[] = [];
    if (metric === 'hrv') values = await fetchHourlyHRV(d);
    else if (metric === 'hr') values = await fetchHourlyHR(d);
    else if (metric === 'steps') values = await fetchHourlySteps(d);
    else if (metric === 'cal') values = await fetchHourlyActiveEnergy(d);
    else if (metric === 'sleep') {
      // Sleep on the D view — single bar representing last night's total
      const summary = await fetchDayMetrics(d);
      const hrs = summary.sleepHours ?? 0;
      return HOUR_LABELS.map((label, i) => ({ label, value: i === 2 ? hrs : 0 })); // bucket around 6a–9a
    }
    if (!values || values.length === 0) {
      return HOUR_LABELS.map((label) => ({ label, value: 0 }));
    }
    return downsampleTo8(values, summed);
  };

  // Load today + visible page on mount / metric change
  useEffect(() => {
    const toLoad = [dates[DAYS_BACK - 1]]; // prefetch today
    loadDays(toLoad);
  }, [metric]);

  const dayKey = (d: Date) => d.toISOString().slice(0, 10);

  const loadDays = async (days: Date[]) => {
    const needed = days.filter((d) => !pageData[dayKey(d)]);
    if (needed.length === 0) return;
    setLoadingDays((s) => {
      const next = new Set(s);
      needed.forEach((d) => next.add(dayKey(d)));
      return next;
    });
    const results = await Promise.all(needed.map((d) => fetchDay(d).then((pts) => ({ key: dayKey(d), pts }))));
    setPageData((prev) => {
      const next = { ...prev };
      results.forEach((r) => { next[r.key] = r.pts; });
      return next;
    });
    setLoadingDays((s) => {
      const next = new Set(s);
      needed.forEach((d) => next.delete(dayKey(d)));
      return next;
    });
  };

  // Snap to today once we know the width
  useEffect(() => {
    if (pageWidth > 0) {
      scrollRef.current?.scrollTo({
        x: pageWidth * (DAYS_BACK - 1),
        animated: false,
      });
    }
  }, [pageWidth]);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && w !== pageWidth) setPageWidth(w);
  };

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (pageWidth === 0) return;
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.round(x / pageWidth);
    if (idx !== pageIdx) setPageIdx(idx);
    // Prefetch the visible page + one on either side
    const neighbors = [idx - 1, idx, idx + 1]
      .filter((i) => i >= 0 && i < DAYS_BACK)
      .map((i) => dates[i]);
    loadDays(neighbors);
  };

  const visibleDate = dates[pageIdx] ?? new Date();

  return (
    <View>
      <View style={s.headerRow}>
        <Text style={[s.dayLabel, { fontFamily: FONT_MEDIUM }]}>
          {dayHeaderLabel(visibleDate)}
        </Text>
        <Text style={s.hint}>Swipe to change day</Text>
      </View>
      <View onLayout={onLayout}>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onMomentumEnd}
          decelerationRate="fast"
        >
          {dates.map((d, i) => {
            const key = dayKey(d);
            const pts = pageData[key];
            const loading = loadingDays.has(key);
            return (
              <View key={i} style={{ width: pageWidth || undefined }}>
                {pts ? (
                  pts.every((p) => p.value === 0) ? (
                    <EmptyPage message="No data for this day" />
                  ) : LINE_METRICS.has(metric) ? (
                    <MetricLineChart data={pts} unit={unit} />
                  ) : (
                    <MetricBarChart data={pts} unit={unit} />
                  )
                ) : (
                  <EmptyPage message={loading ? 'Loading…' : 'Swipe to load'} />
                )}
              </View>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

function EmptyPage({ message }: { message: string }) {
  return (
    <View style={{ paddingVertical: 56, alignItems: 'center' }}>
      <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', letterSpacing: 0.3 }}>
        {message}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 12,
  },
  dayLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.60)',
    letterSpacing: 1.6,
  },
  hint: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.30)',
    letterSpacing: 0.5,
  },
});
