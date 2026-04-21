import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, TextInput, Pressable, Animated, Easing,
  ActivityIndicator,
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
import { useHealthDay } from '../hooks/useHealthDay';
import { useMetricSeries, Period as SeriesPeriod } from '../hooks/useMetricSeries';
import { FONT_LIGHT, FONT_MEDIUM, FONT_SEMIBOLD } from '../utils/fonts';

interface Props { colors: Record<string, string>; }

type Period = 'W' | 'M' | 'Y';

function workoutCalories(w: Workout): number {
  return w.exercises.reduce((a, e) => a + (e.calories || 0), 0);
}

// ─── Staggered fade-up ─────────────────────────────────────────────────────

function FadeInUp({ delay = 0, children }: { delay?: number; children: React.ReactNode }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(14)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1, duration: 520, delay,
        easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0, duration: 520, delay,
        easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }),
    ]).start();
  }, []);
  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
}

// ─── Animated number counter ────────────────────────────────────────────────

function CountUp({
  value, style, decimals = 0, suffix = '',
}: {
  value: number; style?: any; decimals?: number; suffix?: string;
}) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const duration = 900;
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
      {display.toLocaleString('en-US', { maximumFractionDigits: decimals })}{suffix}
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

  const today = (() => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; })();
  const health = useHealthDay(today);
  const series = useMetricSeries('cal', period as SeriesPeriod, today);

  useEffect(() => {
    SecureStore.getItemAsync('calorie_goal').then(v => {
      if (v) { setGoal(parseInt(v)); setGoalInput(v); }
    });
    SecureStore.getItemAsync('body_weight_kg').then(v => {
      if (v) { setBodyWeight(parseFloat(v)); setWeightInput(v); }
    });
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
    setBodyWeight(val);
    setWeightInput(String(val));
    setEditingWeight(false);
    SecureStore.setItemAsync('body_weight_kg', String(val));
  };

  const saveGoal = () => {
    const val = parseInt(goalInput) || 500;
    setGoal(val);
    setGoalInput(String(val));
    setEditingGoal(false);
    SecureStore.setItemAsync('calorie_goal', String(val));
  };

  // Today's numbers
  const todayKey = today.toISOString().slice(0, 10);
  const workoutCalToday = workouts
    .filter(w => w.date.slice(0, 10) === todayKey)
    .reduce((a, w) => a + workoutCalories(w), 0);
  const healthCalToday = health.summary.activeEnergyKcal;
  // Prefer Apple Health total (includes everything), fall back to workout-only
  const displayedToday = healthCalToday ?? Math.round(workoutCalToday);
  const otherActiveToday = healthCalToday != null ? Math.max(0, healthCalToday - Math.round(workoutCalToday)) : null;

  // This week average from real daily range
  const seriesVals = series.data.map(p => p.value).filter(v => v > 0);
  const weekAvg = seriesVals.length > 0
    ? Math.round(seriesVals.reduce((a, b) => a + b, 0) / seriesVals.length)
    : 0;

  // Trend — today vs 7d avg
  const trendDelta = weekAvg > 0 && displayedToday > 0
    ? +(((displayedToday - weekAvg) / weekAvg) * 100).toFixed(1)
    : null;

  const progress = goal > 0 ? displayedToday / goal : 0;
  const isHit = progress >= 1;
  const goalColor = isHit ? '#10B981' : 'rgba(255,255,255,0.80)';

  return (
    <View style={s.root}>
      <ScrollView
        contentContainerStyle={[s.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32 }]}
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

        {/* Hero — ring + big number + trend pill */}
        <FadeInUp delay={40}>
          <HealthCard style={{ marginBottom: 12 }} padding={20}>
            <View style={s.heroLabelRow}>
              <Ionicons name="flame-outline" size={11} color="rgba(255,255,255,0.50)" />
              <Text style={s.eyebrow}>ACTIVE CALORIES</Text>
            </View>

            <View style={s.ringWrap}>
              <RingProgress
                value={progress}
                size={210}
                stroke={13}
                color={goalColor}
                gradientKey="calRing"
              >
                <View style={{ alignItems: 'center' }}>
                  <CountUp
                    value={displayedToday}
                    style={[s.ringValue, { fontFamily: FONT_LIGHT }]}
                  />
                  <Text style={s.ringCaption}>of {goal} cal</Text>
                </View>
              </RingProgress>
            </View>

            {trendDelta != null && (
              <View style={s.trendRow}>
                <View style={[s.trendPill, trendDelta >= 0 ? s.trendPillUp : s.trendPillDown]}>
                  <Text style={s.trendText}>
                    {trendDelta >= 0 ? '▲' : '▼'} {Math.abs(trendDelta).toFixed(1)}%
                  </Text>
                </View>
                <Text style={s.trendCaption}>vs 7-day average</Text>
              </View>
            )}

            {/* Workout / Other breakdown when Apple Health connected */}
            {healthCalToday != null && (
              <View style={s.breakdownRow}>
                <View style={s.breakdownBlock}>
                  <Text style={s.breakdownValue}>
                    {Math.round(workoutCalToday)}
                  </Text>
                  <View style={s.breakdownLabelRow}>
                    <Ionicons name="barbell-outline" size={10} color="rgba(255,255,255,0.45)" />
                    <Text style={s.breakdownLabel}>WORKOUTS</Text>
                  </View>
                </View>
                <View style={s.breakdownDivider} />
                <View style={s.breakdownBlock}>
                  <Text style={s.breakdownValue}>{otherActiveToday ?? 0}</Text>
                  <View style={s.breakdownLabelRow}>
                    <Ionicons name="walk-outline" size={10} color="rgba(255,255,255,0.45)" />
                    <Text style={s.breakdownLabel}>OTHER</Text>
                  </View>
                </View>
              </View>
            )}
          </HealthCard>
        </FadeInUp>

        {/* Stats row */}
        <FadeInUp delay={120}>
          <View style={s.statsRow}>
            <HealthCard style={s.statCard} padding={14}>
              <Text style={s.statEyebrow}>TODAY</Text>
              <CountUp
                value={displayedToday}
                style={[s.statValue, { fontFamily: FONT_LIGHT }]}
              />
            </HealthCard>
            <HealthCard style={s.statCard} padding={14}>
              <Text style={s.statEyebrow}>DAILY AVG</Text>
              <CountUp
                value={weekAvg}
                style={[s.statValue, { fontFamily: FONT_LIGHT }]}
              />
            </HealthCard>
            <HealthCard style={s.statCard} padding={14}>
              <Text style={s.statEyebrow}>GOAL</Text>
              <CountUp
                value={goal}
                style={[s.statValue, { fontFamily: FONT_LIGHT }]}
              />
            </HealthCard>
          </View>
        </FadeInUp>

        {/* Period selector + interactive bar chart */}
        <FadeInUp delay={200}>
          <HealthCard style={{ marginBottom: 12 }} padding={20}>
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
              {series.loading ? (
                <View style={s.chartEmpty}>
                  <ActivityIndicator color="rgba(255,255,255,0.55)" />
                </View>
              ) : series.data.length === 0 ? (
                <View style={s.chartEmpty}>
                  <Text style={s.chartEmptyText}>No data yet</Text>
                </View>
              ) : (
                <MetricBarChart data={series.data} unit="kcal" />
              )}
            </View>
          </HealthCard>
        </FadeInUp>

        {/* Settings */}
        <FadeInUp delay={280}>
          <Text style={s.sectionTitle}>Daily Goal</Text>
          <HealthCard style={{ marginBottom: 16 }} padding={0}>
            <TouchableOpacity
              style={s.settingsRow}
              onPress={() => { setEditingGoal(!editingGoal); setGoalInput(String(goal)); }}
              activeOpacity={0.7}
            >
              <View style={s.settingsIconWrap}>
                <Ionicons name="flag-outline" size={18} color="rgba(255,255,255,0.55)" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.settingsLabel}>Calorie Goal</Text>
                <Text style={s.settingsSubLabel}>{goal} cal per day</Text>
              </View>
              <Ionicons name={editingGoal ? 'chevron-up' : 'chevron-down'} size={16} color="rgba(255,255,255,0.30)" />
            </TouchableOpacity>
            {editingGoal && (
              <View style={s.goalEditRow}>
                <TextInput
                  style={s.goalInput}
                  value={goalInput}
                  onChangeText={setGoalInput}
                  keyboardType="numeric"
                  selectionColor="rgba(255,255,255,0.5)"
                  autoFocus
                />
                <TouchableOpacity style={s.goalSaveBtn} onPress={saveGoal} activeOpacity={0.8}>
                  <Text style={s.goalSaveBtnText}>Save</Text>
                </TouchableOpacity>
              </View>
            )}
          </HealthCard>

          <Text style={s.sectionTitle}>Body Weight</Text>
          <HealthCard padding={0}>
            <TouchableOpacity
              style={s.settingsRow}
              onPress={() => { setEditingWeight(!editingWeight); setWeightInput(String(bodyWeight)); }}
              activeOpacity={0.7}
            >
              <View style={s.settingsIconWrap}>
                <Ionicons name="body-outline" size={18} color="rgba(255,255,255,0.55)" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.settingsLabel}>Your Weight</Text>
                <Text style={s.settingsSubLabel}>{bodyWeight} kg — used for workout calorie accuracy</Text>
              </View>
              <Ionicons name={editingWeight ? 'chevron-up' : 'chevron-down'} size={16} color="rgba(255,255,255,0.30)" />
            </TouchableOpacity>
            {editingWeight && (
              <View style={s.goalEditRow}>
                <TextInput
                  style={s.goalInput}
                  value={weightInput}
                  onChangeText={setWeightInput}
                  keyboardType="decimal-pad"
                  selectionColor="rgba(255,255,255,0.5)"
                  autoFocus
                />
                <TouchableOpacity style={s.goalSaveBtn} onPress={saveWeight} activeOpacity={0.8}>
                  <Text style={s.goalSaveBtnText}>Save</Text>
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

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8, marginBottom: 8,
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

  // Hero
  heroLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eyebrow: {
    fontSize: 10, fontWeight: '600',
    color: 'rgba(255,255,255,0.50)',
    letterSpacing: 1.6, textTransform: 'uppercase',
  },
  ringWrap: { alignItems: 'center', marginVertical: 20 },
  ringValue: {
    fontSize: 54, fontWeight: '300', color: '#fff',
    letterSpacing: -1.6, lineHeight: 56,
    fontVariant: ['tabular-nums'],
  },
  ringCaption: {
    fontSize: 11, color: 'rgba(255,255,255,0.45)',
    marginTop: 2, letterSpacing: 0.3,
  },

  trendRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 8, alignSelf: 'center', marginTop: 4,
  },
  trendPill: {
    paddingHorizontal: 10, paddingVertical: 3,
    borderRadius: 100,
  },
  trendPillUp: { backgroundColor: 'rgba(16,185,129,0.14)' },
  trendPillDown: { backgroundColor: 'rgba(255,255,255,0.08)' },
  trendText: { fontSize: 11, color: 'rgba(255,255,255,0.90)', fontWeight: '600' },
  trendCaption: { fontSize: 11, color: 'rgba(255,255,255,0.38)' },

  // Breakdown
  breakdownRow: {
    flexDirection: 'row',
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.10)',
  },
  breakdownBlock: { flex: 1, alignItems: 'center', gap: 4 },
  breakdownDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.10)',
    marginVertical: 4,
  },
  breakdownValue: {
    fontSize: 20, color: '#fff', fontWeight: '400',
    letterSpacing: -0.3, fontVariant: ['tabular-nums'],
  },
  breakdownLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  breakdownLabel: {
    fontSize: 9, color: 'rgba(255,255,255,0.45)',
    letterSpacing: 1.4, fontWeight: '600',
  },

  // Stats row
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  statCard: { flex: 1, alignItems: 'center' },
  statEyebrow: {
    fontSize: 9, color: 'rgba(255,255,255,0.45)',
    letterSpacing: 1.4, fontWeight: '600',
    marginBottom: 6, textTransform: 'uppercase',
  },
  statValue: {
    fontSize: 24, color: '#fff', fontWeight: '300',
    letterSpacing: -0.4, fontVariant: ['tabular-nums'],
  },

  // Period pill
  periodBar: {
    flexDirection: 'row', gap: 4,
    padding: 4, borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginBottom: 20,
  },
  periodBtn: {
    flex: 1, paddingVertical: 7,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 100,
  },
  periodBtnActive: { backgroundColor: 'rgba(255,255,255,0.14)' },
  periodText: {
    fontSize: 11, letterSpacing: 1.4,
    color: 'rgba(255,255,255,0.40)', fontWeight: '600',
  },
  chartEmpty: {
    paddingVertical: 56, alignItems: 'center',
  },
  chartEmptyText: {
    fontSize: 12, color: 'rgba(255,255,255,0.35)', letterSpacing: 0.3,
  },

  // Settings
  sectionTitle: {
    fontSize: 10, fontWeight: '600',
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 1.6, textTransform: 'uppercase',
    marginBottom: 8, marginTop: 4,
  },
  settingsRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 16, gap: 12,
  },
  settingsIconWrap: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center', justifyContent: 'center',
  },
  settingsLabel: { fontSize: 14, fontWeight: '500', color: 'rgba(255,255,255,0.85)' },
  settingsSubLabel: { fontSize: 11, color: 'rgba(255,255,255,0.40)', marginTop: 2 },
  goalEditRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingBottom: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingTop: 12,
  },
  goalInput: {
    flex: 1, fontSize: 18, fontWeight: '500', color: '#fff',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  goalSaveBtn: {
    backgroundColor: '#fff', borderRadius: 12,
    paddingHorizontal: 20, paddingVertical: 10,
  },
  goalSaveBtnText: { fontSize: 14, fontWeight: '700', color: '#050B14' },
});
