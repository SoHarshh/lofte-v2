import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, TextInput, Pressable, Animated, Easing,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { HealthCard } from '../components/HealthCard';
import { RingProgress } from '../components/RingProgress';
import { MetricBarChart } from '../components/MetricBarChart';
import { API_BASE } from '../config';
import { Workout } from '../types/index';
import { useAuthFetch } from '../hooks/useAuthFetch';
import { FONT_LIGHT, FONT_MEDIUM } from '../utils/fonts';

interface Props { colors: Record<string, string>; }
type Period = 'W' | 'M' | 'Y';

function workoutCalories(w: Workout): number {
  return w.exercises.reduce((a, e) => a + (e.calories || 0), 0);
}
function startOfDay(d: Date): Date {
  const x = new Date(d); x.setHours(0, 0, 0, 0); return x;
}
function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / 86_400_000);
}

const WEEK_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Build the chart series from workout logs only.
function buildSeries(workouts: Workout[], period: Period, anchor: Date) {
  const end = anchor;
  // Daily bucket first
  const dailyMap = new Map<string, number>();
  workouts.forEach((w) => {
    const key = w.date.slice(0, 10);
    dailyMap.set(key, (dailyMap.get(key) || 0) + workoutCalories(w));
  });

  if (period === 'W') {
    const points: { label: string; value: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(end); d.setUTCDate(end.getUTCDate() - i);
      const key = d.toISOString().slice(0, 10);
      points.push({
        label: WEEK_LABELS[(d.getUTCDay() + 6) % 7],
        value: Math.round(dailyMap.get(key) || 0),
      });
    }
    return points;
  }

  if (period === 'M') {
    // 4 weekly buckets, each summed over 7 days
    const weeks: number[] = [0, 0, 0, 0];
    for (let i = 0; i < 28; i++) {
      const d = new Date(end); d.setUTCDate(end.getUTCDate() - i);
      const key = d.toISOString().slice(0, 10);
      const bucket = 3 - Math.floor(i / 7); // bucket 0 = oldest, 3 = this week
      if (bucket >= 0 && bucket < 4) {
        weeks[bucket] += dailyMap.get(key) || 0;
      }
    }
    return weeks.map((v, i) => ({ label: `W${i + 1}`, value: Math.round(v) }));
  }

  // Y → 12 monthly totals
  const months: { label: string; value: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCMonth(d.getUTCMonth() - i, 1);
    months.push({ label: MONTH_LABELS[d.getUTCMonth()], value: 0 });
  }
  workouts.forEach((w) => {
    const d = new Date(w.date);
    const idx = 11 - ((end.getUTCFullYear() - d.getUTCFullYear()) * 12 + (end.getUTCMonth() - d.getUTCMonth()));
    if (idx >= 0 && idx < 12) {
      months[idx].value += workoutCalories(w);
    }
  });
  months.forEach((m) => { m.value = Math.round(m.value); });
  return months;
}

// ─── Staggered fade-up ─────────────────────────────────────────────────────

function FadeInUp({ delay = 0, children }: { delay?: number; children: React.ReactNode }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 480, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 480, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, []);
  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
}

// ─── Count-up with 48ms throttle ────────────────────────────────────────────

function CountUp({
  value, style, decimals = 0,
}: { value: number; style?: any; decimals?: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const duration = 800;
    let last = -1;
    let rafId: number | null = null;
    let lastPaint = 0;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = value * eased;
      const factor = Math.pow(10, decimals);
      const rounded = Math.round(next * factor) / factor;
      const now = Date.now();
      if (rounded !== last && now - lastPaint >= 48) {
        last = rounded; lastPaint = now; setDisplay(rounded);
      }
      if (t < 1) rafId = requestAnimationFrame(tick);
      else setDisplay(value);
    };
    rafId = requestAnimationFrame(tick);
    return () => { if (rafId != null) cancelAnimationFrame(rafId); };
  }, [value, decimals]);
  return (
    <Text style={style}>
      {display.toLocaleString('en-US', { maximumFractionDigits: decimals })}
    </Text>
  );
}

// ─── Screen ────────────────────────────────────────────────────────────────

export default function CalorieDetailScreen({ colors }: Props) {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [goal, setGoal] = useState(500);
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState('500');
  const [bodyWeight, setBodyWeight] = useState(70);
  const [editingWeight, setEditingWeight] = useState(false);
  const [weightInput, setWeightInput] = useState('70');
  const [period, setPeriod] = useState<Period>('W');
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const authFetch = useAuthFetch();

  // Anchor at UTC-midnight so date keys line up with how workouts are stored.
  const today = useMemo(() => {
    const n = new Date();
    return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
  }, []);

  useEffect(() => {
    SecureStore.getItemAsync('calorie_goal').then(v => { if (v) { setGoal(parseInt(v)); setGoalInput(v); } });
    SecureStore.getItemAsync('body_weight_kg').then(v => { if (v) { setBodyWeight(parseFloat(v)); setWeightInput(v); } });
  }, []);

  const load = useCallback(() => {
    authFetch(`${API_BASE}/api/workouts`)
      .then(r => r.json())
      .then(data => setWorkouts(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [authFetch]);

  useFocusEffect(load);

  const saveWeight = () => {
    const val = parseFloat(weightInput) || 70;
    setBodyWeight(val); setWeightInput(String(val)); setEditingWeight(false);
    SecureStore.setItemAsync('body_weight_kg', String(val));
  };
  const saveGoal = () => {
    const val = parseInt(goalInput) || 500;
    setGoal(val); setGoalInput(String(val)); setEditingGoal(false);
    SecureStore.setItemAsync('calorie_goal', String(val));
  };

  const todayKey = today.toISOString().slice(0, 10);
  const todayCal = useMemo(() => Math.round(
    workouts
      .filter(w => w.date.slice(0, 10) === todayKey)
      .reduce((a, w) => a + workoutCalories(w), 0)
  ), [workouts, todayKey]);

  // Last 7 days (excluding today) for the trend comparison
  const weekAvg = useMemo(() => {
    let sum = 0, days = 0;
    for (let i = 1; i <= 7; i++) {
      const d = new Date(today); d.setUTCDate(today.getUTCDate() - i);
      const key = d.toISOString().slice(0, 10);
      const cal = workouts
        .filter(w => w.date.slice(0, 10) === key)
        .reduce((a, w) => a + workoutCalories(w), 0);
      if (cal > 0) { sum += cal; days++; }
    }
    return days > 0 ? Math.round(sum / days) : 0;
  }, [workouts, today]);

  const trendDelta = weekAvg > 0 && todayCal > 0
    ? +(((todayCal - weekAvg) / weekAvg) * 100).toFixed(1)
    : null;

  // Today's session count + most recent session
  const todayWorkouts = workouts.filter(w => w.date.slice(0, 10) === todayKey);
  const lastWorkout = workouts[0]; // list is ordered desc by date

  // Chart series from workout logs
  const seriesData = useMemo(() => buildSeries(workouts, period, today), [workouts, period, today]);
  const seriesHasData = seriesData.some(p => p.value > 0);

  const progress = goal > 0 ? todayCal / goal : 0;
  const ringColor = progress >= 1 ? '#10B981' : 'rgba(255,255,255,0.85)';

  return (
    <View style={s.root}>
      <ScrollView
        contentContainerStyle={[
          s.content,
          { paddingTop: insets.top + 8, paddingBottom: Math.max(insets.bottom, 12) + 8 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <FadeInUp>
          <View style={s.header}>
            <Pressable
              onPress={() => navigation.goBack()}
              style={({ pressed }) => [s.circleBtn, pressed && { opacity: 0.6 }]}
              hitSlop={8}
            >
              <Ionicons name="chevron-back" size={18} color="rgba(255,255,255,0.80)" />
            </Pressable>
            <Text style={[s.headerTitle, { fontFamily: FONT_MEDIUM }]}>Calories</Text>
            <View style={{ width: 36, height: 36 }} />
          </View>
        </FadeInUp>

        {/* Hero — compact ring + trend + session count */}
        <FadeInUp delay={40}>
          <HealthCard style={{ marginBottom: 10 }} padding={14}>
            <View style={s.heroRow}>
              <RingProgress
                value={progress}
                size={132}
                stroke={10}
                color={ringColor}
                gradientKey="calRing"
              >
                <View style={{ alignItems: 'center' }}>
                  <CountUp
                    value={todayCal}
                    style={[s.ringValue, { fontFamily: FONT_LIGHT }]}
                  />
                  <Text style={s.ringCaption}>of {goal}</Text>
                </View>
              </RingProgress>

              <View style={s.heroInfo}>
                <Text style={s.heroLabel}>FROM WORKOUTS</Text>
                {trendDelta != null ? (
                  <View style={[s.trendPill, trendDelta >= 0 ? s.trendPillUp : s.trendPillDown]}>
                    <Text style={s.trendText}>
                      {trendDelta >= 0 ? '▲' : '▼'} {Math.abs(trendDelta).toFixed(1)}%
                    </Text>
                  </View>
                ) : (
                  <Text style={s.heroMuted}>Log sessions to build a trend</Text>
                )}
                {trendDelta != null && (
                  <Text style={s.heroMuted}>vs 7-day avg ({weekAvg})</Text>
                )}

                <View style={s.miniBreakdown}>
                  <View style={s.miniRow}>
                    <Ionicons name="barbell-outline" size={10} color="rgba(255,255,255,0.45)" />
                    <Text style={s.miniLabel}>Sessions today</Text>
                    <Text style={s.miniValue}>{todayWorkouts.length}</Text>
                  </View>
                  {lastWorkout && (
                    <View style={s.miniRow}>
                      <Ionicons name="time-outline" size={10} color="rgba(255,255,255,0.45)" />
                      <Text style={s.miniLabel}>Last session</Text>
                      <Text style={s.miniValue}>
                        {daysBetween(today, new Date(lastWorkout.date)) === 0
                          ? 'Today'
                          : `${daysBetween(today, new Date(lastWorkout.date))}d ago`}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          </HealthCard>
        </FadeInUp>

        {/* Period chart — compact */}
        <FadeInUp delay={100}>
          <HealthCard style={{ marginBottom: 10 }} padding={14}>
            <View style={s.periodBar}>
              {(['W', 'M', 'Y'] as Period[]).map((p) => {
                const active = p === period;
                return (
                  <Pressable
                    key={p}
                    onPress={() => setPeriod(p)}
                    style={[s.periodBtn, active && s.periodBtnActive]}
                  >
                    <Text style={[s.periodText, active && { color: 'rgba(255,255,255,0.95)' }]}>
                      {p}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View key={period}>
              {seriesHasData ? (
                <MetricBarChart data={seriesData} unit="kcal" compact />
              ) : (
                <View style={s.chartEmpty}>
                  <Text style={s.chartEmptyText}>No sessions logged yet</Text>
                </View>
              )}
            </View>
          </HealthCard>
        </FadeInUp>

        {/* Settings */}
        <FadeInUp delay={160}>
          <HealthCard style={{ marginBottom: 8 }} padding={0}>
            <TouchableOpacity
              style={s.settingsRow}
              onPress={() => { setEditingGoal(!editingGoal); setGoalInput(String(goal)); }}
              activeOpacity={0.7}
            >
              <View style={s.settingsIconWrap}>
                <Ionicons name="flag-outline" size={16} color="rgba(255,255,255,0.60)" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.settingsLabel}>Daily Goal</Text>
                <Text style={s.settingsSubLabel}>{goal} cal / day</Text>
              </View>
              <Ionicons name={editingGoal ? 'chevron-up' : 'chevron-down'} size={14} color="rgba(255,255,255,0.30)" />
            </TouchableOpacity>
            {editingGoal && (
              <View style={s.editRow}>
                <TextInput
                  style={s.editInput}
                  value={goalInput}
                  onChangeText={setGoalInput}
                  keyboardType="numeric"
                  selectionColor="rgba(255,255,255,0.5)"
                  autoFocus
                />
                <TouchableOpacity style={s.saveBtn} onPress={saveGoal} activeOpacity={0.8}>
                  <Text style={s.saveBtnText}>Save</Text>
                </TouchableOpacity>
              </View>
            )}
          </HealthCard>
        </FadeInUp>

        <FadeInUp delay={220}>
          <HealthCard padding={0}>
            <TouchableOpacity
              style={s.settingsRow}
              onPress={() => { setEditingWeight(!editingWeight); setWeightInput(String(bodyWeight)); }}
              activeOpacity={0.7}
            >
              <View style={s.settingsIconWrap}>
                <Ionicons name="body-outline" size={16} color="rgba(255,255,255,0.60)" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.settingsLabel}>Body Weight</Text>
                <Text style={s.settingsSubLabel}>{bodyWeight} kg · calorie accuracy</Text>
              </View>
              <Ionicons name={editingWeight ? 'chevron-up' : 'chevron-down'} size={14} color="rgba(255,255,255,0.30)" />
            </TouchableOpacity>
            {editingWeight && (
              <View style={s.editRow}>
                <TextInput
                  style={s.editInput}
                  value={weightInput}
                  onChangeText={setWeightInput}
                  keyboardType="decimal-pad"
                  selectionColor="rgba(255,255,255,0.5)"
                  autoFocus
                />
                <TouchableOpacity style={s.saveBtn} onPress={saveWeight} activeOpacity={0.8}>
                  <Text style={s.saveBtnText}>Save</Text>
                </TouchableOpacity>
              </View>
            )}
          </HealthCard>
        </FadeInUp>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  content: { paddingHorizontal: 16 },

  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6, marginBottom: 6,
  },
  circleBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17, fontWeight: '500', color: '#fff',
    letterSpacing: 1.4, textTransform: 'uppercase',
  },

  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  ringValue: {
    fontSize: 34, color: '#fff', fontWeight: '300',
    letterSpacing: -0.8, lineHeight: 36,
    fontVariant: ['tabular-nums'],
  },
  ringCaption: {
    fontSize: 10, color: 'rgba(255,255,255,0.45)',
    marginTop: 1, letterSpacing: 0.2,
  },
  heroInfo: { flex: 1, gap: 4 },
  heroLabel: {
    fontSize: 10, color: 'rgba(255,255,255,0.50)',
    letterSpacing: 1.6, fontWeight: '600',
    textTransform: 'uppercase',
  },
  heroMuted: {
    fontSize: 10, color: 'rgba(255,255,255,0.38)',
  },
  trendPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 100, marginVertical: 2,
  },
  trendPillUp: { backgroundColor: 'rgba(16,185,129,0.14)' },
  trendPillDown: { backgroundColor: 'rgba(255,255,255,0.08)' },
  trendText: { fontSize: 11, color: 'rgba(255,255,255,0.92)', fontWeight: '600' },

  miniBreakdown: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.10)',
    gap: 3,
  },
  miniRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  miniLabel: {
    fontSize: 11, color: 'rgba(255,255,255,0.55)', flex: 1,
  },
  miniValue: {
    fontSize: 11, color: '#fff', fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },

  periodBar: {
    flexDirection: 'row', gap: 4,
    padding: 3, borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginBottom: 10,
  },
  periodBtn: {
    flex: 1, paddingVertical: 6,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 100,
  },
  periodBtnActive: { backgroundColor: 'rgba(255,255,255,0.14)' },
  periodText: {
    fontSize: 10, letterSpacing: 1.4,
    color: 'rgba(255,255,255,0.40)', fontWeight: '600',
  },
  chartEmpty: {
    paddingVertical: 28, alignItems: 'center',
  },
  chartEmptyText: {
    fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: 0.3,
  },

  settingsRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 12, gap: 12,
  },
  settingsIconWrap: {
    width: 30, height: 30, borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center', justifyContent: 'center',
  },
  settingsLabel: { fontSize: 13, fontWeight: '500', color: 'rgba(255,255,255,0.88)' },
  settingsSubLabel: { fontSize: 11, color: 'rgba(255,255,255,0.42)', marginTop: 1 },
  editRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingBottom: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  editInput: {
    flex: 1, fontSize: 16, fontWeight: '500', color: '#fff',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  saveBtn: {
    backgroundColor: '#fff', borderRadius: 10,
    paddingHorizontal: 18, paddingVertical: 8,
  },
  saveBtnText: { fontSize: 13, fontWeight: '700', color: '#050B14' },
});
