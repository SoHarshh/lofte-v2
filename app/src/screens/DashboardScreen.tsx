import React from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Dimensions, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../components/GlassCard';
import { Workout } from '../types/index';
import { useWorkouts } from '../hooks/useWorkouts';
import { useUnits, displayWeight, unitLabel } from '../utils/units';
import { useHealthSync } from '../hooks/useHealthSync';

import { HEADING_LIGHT, FONT_SEMIBOLD } from '../utils/fonts';
// Dashboard "Start Workout" circle and empty-state title are headlines → serif.
const SYSTEM = HEADING_LIGHT;

interface Props {
  colors: Record<string, string>;
  sessionActive: boolean;
}

function formatVol(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
  return `${Math.round(v)}`;
}

function sessionVolume(w: Workout): number {
  return w.exercises.reduce((a, e) =>
    a + ((e.sets || 0) * (e.reps || 0) * (e.weight || 0)), 0);
}

function calcStreak(workouts: Workout[]): number {
  if (!workouts.length) return 0;
  const days = new Set(workouts.map(w => w.date.slice(0, 10)));
  let streak = 0;
  const d = new Date();
  while (true) {
    const key = d.toISOString().slice(0, 10);
    if (days.has(key)) { streak++; d.setDate(d.getDate() - 1); }
    else break;
  }
  return streak;
}

function getCoachInsight(workouts: Workout[], streak: number): string {
  if (workouts.length === 0) return 'Log your first session to unlock personalised insights.';
  if (streak >= 7) return `${streak}-day streak — elite consistency. Keep it going.`;
  if (streak > 0) return `${streak}-day streak. One more session to build momentum.`;
  const daysSince = Math.floor(
    (Date.now() - new Date(workouts[0].date).getTime()) / 86_400_000
  );
  if (daysSince >= 3) return `${daysSince} days since your last session. Time to get back in.`;
  return 'Recovery day. Come back strong tomorrow.';
}

export default function DashboardScreen({ colors, sessionActive }: Props) {
  const { workouts, reload } = useWorkouts();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const useKg = useUnits();
  const unit = unitLabel(useKg);
  const health = useHealthSync();

  // Refetch when the tab gains focus. The hook dedupes + debounces internally
  // so even if the callback ref changes on every render, only one request
  // actually fires and it's skipped if we fetched recently. No full-screen
  // loading gate: the UI renders instantly from cache (or empty state),
  // and refreshed data slots in silently when it arrives.
  useFocusEffect(React.useCallback(() => { reload(); }, [reload]));

  // --- Computed stats ---
  const streak = calcStreak(workouts);

  const now = new Date();
  const dow = now.getDay();
  const daysFromMon = dow === 0 ? 6 : dow - 1;
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - daysFromMon);
  startOfWeek.setHours(0, 0, 0, 0);

  const thisWeekWorkouts = workouts.filter(w => new Date(w.date) >= startOfWeek);
  const weekSessions = thisWeekWorkouts.length;
  const weekVolume = thisWeekWorkouts.reduce((a, w) => a + sessionVolume(w), 0);

  // Calories burned today
  const todayKey = now.toISOString().slice(0, 10);
  const todayCalories = workouts
    .filter(w => w.date.slice(0, 10) === todayKey)
    .reduce((a, w) => a + w.exercises.reduce((b, e) => b + (e.calories || 0), 0), 0);

  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(now.getDate() - (6 - i));
    const key = d.toISOString().slice(0, 10);
    const label = ['S', 'M', 'T', 'W', 'T', 'F', 'S'][d.getDay()];
    const vol = workouts
      .filter(w => w.date.slice(0, 10) === key)
      .reduce((a, w) => a + sessionVolume(w), 0);
    return { label, volume: vol, isToday: i === 6 };
  });
  const maxDayVol = Math.max(...last7.map(d => d.volume), 1);
  const hasChart = last7.some(d => d.volume > 0);

  const lastWorkout = workouts[0];
  const coachInsight = getCoachInsight(workouts, streak);
  const TAB_BAR_H = 80 + Math.max(insets.bottom, 8);

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 20, paddingBottom: TAB_BAR_H + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={{ width: 40 }} />
          <Text style={styles.logo}>LOFTE</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Score circles */}
        <View style={styles.scoreRow}>
          <ScoreCircle icon="barbell-outline" value={String(weekSessions)} label="Sessions" onPress={() => navigation.navigate('Calendar' as never)} />
          <ScoreCircle icon="flash-outline" value={formatVol(weekVolume)} label="Volume" />
          <ScoreCircle icon="flame-outline" value={String(streak)} label="Streak" />
          <ScoreCircle icon="flame" value={todayCalories > 0 ? formatVol(todayCalories) : '0'} label="Calories" onPress={() => navigation.navigate('CalorieDetail' as never)} />
        </View>

        {/* Circular Start Workout CTA */}
        <View style={styles.ctaWrap}>
          <TouchableOpacity
            style={styles.ctaCircle}
            onPress={() => navigation.navigate('Session' as never)}
            activeOpacity={0.85}
          >
            <Text style={[styles.ctaText, { fontFamily: SYSTEM }]}>
              {sessionActive ? 'Resume\nWorkout' : 'Start\nWorkout'}
            </Text>
            {sessionActive && <View style={styles.sessionDot} />}
          </TouchableOpacity>
        </View>

        {/* Two-column glass cards */}
        <View style={styles.cardRow}>
          {/* Last Workout */}
          <TouchableOpacity
            onPress={() => navigation.navigate('History' as never)}
            activeOpacity={0.85}
            style={{ flex: 1 }}
          >
            <GlassCard style={{ flex: 1 }}>
              <Text style={styles.cardLabel}>LAST WORKOUT</Text>
              {lastWorkout ? (
                <>
                  {lastWorkout.exercises.slice(0, 2).map((ex, i) => (
                    <View key={i} style={[styles.exRow, i === 0 && { marginTop: 10 }]}>
                      <View style={[styles.exDot, i > 0 && { backgroundColor: 'rgba(255,255,255,0.40)' }]} />
                      <Text style={styles.exName} numberOfLines={1}>{ex.name}</Text>
                    </View>
                  ))}
                  <View style={styles.cardFooter}>
                    <Text style={styles.footerLabel}>Total</Text>
                    <Text style={styles.footerValue}>{formatVol(useKg ? sessionVolume(lastWorkout) * 0.4536 : sessionVolume(lastWorkout))} {unit}</Text>
                  </View>
                </>
              ) : (
                <Text style={styles.cardEmpty}>No sessions yet.{'\n'}Start your first workout.</Text>
              )}
            </GlassCard>
          </TouchableOpacity>

          {/* Coach Insight */}
          <TouchableOpacity
            onPress={() => navigation.navigate('Coach' as never)}
            activeOpacity={0.85}
            style={{ flex: 1 }}
          >
            <GlassCard style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={styles.cardLabel}>LOFTE COACH</Text>
                <Ionicons name="flash" size={10} color="rgba(255,255,255,0.65)" />
              </View>
              <Text style={[styles.coachText, { marginTop: 10 }]} numberOfLines={4}>
                {coachInsight}
              </Text>
              <Text style={styles.coachCta}>See insight →</Text>
            </GlassCard>
          </TouchableOpacity>
        </View>

        {/* Weekly bar chart */}
        {hasChart && (
          <GlassCard style={styles.chartCard}>
            <View style={styles.chartHeader}>
              <Text style={styles.cardLabel}>THIS WEEK</Text>
              <Text style={styles.chartTotal}>{formatVol(useKg ? weekVolume * 0.4536 : weekVolume)} {unit}</Text>
            </View>
            {/* Bars */}
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 72, marginBottom: 8 }}>
              {last7.map((bar, i) => {
                const barH = bar.volume > 0
                  ? Math.max(6, (bar.volume / maxDayVol) * 68)
                  : 3;
                return (
                  <View key={i} style={{ flex: 1, alignItems: 'center' }}>
                    <View style={{
                      width: '65%',
                      height: barH,
                      borderRadius: 4,
                      backgroundColor: bar.isToday && bar.volume > 0
                        ? 'rgba(255,255,255,0.85)'
                        : bar.volume > 0
                          ? 'rgba(255,255,255,0.25)'
                          : 'rgba(255,255,255,0.06)',
                    }} />
                  </View>
                );
              })}
            </View>
            {/* Day labels */}
            <View style={{ flexDirection: 'row' }}>
              {last7.map((bar, i) => (
                <Text key={i} style={{
                  flex: 1, textAlign: 'center', fontSize: 10,
                  color: bar.isToday ? '#fff' : 'rgba(255,255,255,0.38)',
                  fontWeight: bar.isToday ? '600' : '400',
                }}>
                  {bar.label}
                </Text>
              ))}
            </View>
          </GlassCard>
        )}

        {/* Apple Health — Today's body */}
        {health.connected && health.metrics && (
          <GlassCard style={styles.healthCard}>
            <View style={styles.healthHeader}>
              <Text style={styles.cardLabel}>TODAY</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="heart" size={10} color="#10B981" />
                <Text style={styles.healthBadge}>APPLE HEALTH</Text>
              </View>
            </View>
            <View style={styles.healthRow}>
              <HealthTile
                icon="footsteps-outline"
                value={health.metrics.steps != null ? formatVol(health.metrics.steps) : '—'}
                label="Steps"
              />
              <HealthTile
                icon="flame-outline"
                value={health.metrics.activeEnergyKcal != null ? String(health.metrics.activeEnergyKcal) : '—'}
                label="Active Cal"
              />
              <HealthTile
                icon="heart-outline"
                value={health.metrics.restingHeartRate != null ? String(health.metrics.restingHeartRate) : '—'}
                label="Resting HR"
              />
              <HealthTile
                icon="moon-outline"
                value={health.metrics.sleepHours != null ? `${health.metrics.sleepHours.toFixed(1)}h` : '—'}
                label="Sleep"
              />
            </View>
          </GlassCard>
        )}

        {/* Empty state */}
        {workouts.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="barbell-outline" size={52} color="rgba(255,255,255,0.08)" />
            <Text style={[styles.emptyTitle, { fontFamily: FONT_SEMIBOLD }]}>Ready to train?</Text>
            <Text style={styles.emptySubtitle}>
              Tap Start Workout above to log your first session
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function ScoreCircle({ icon, value, label, onPress }: {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  label: string;
  onPress?: () => void;
}) {
  const Wrap = onPress ? TouchableOpacity : View;
  return (
    <Wrap style={styles.scoreItem} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.scoreCircle}>
        <Ionicons name={icon} size={13} color="rgba(255,255,255,0.50)" />
        <Text style={styles.scoreValue}>{value}</Text>
      </View>
      <Text style={styles.scoreLabel}>{label}</Text>
    </Wrap>
  );
}

function HealthTile({ icon, value, label }: {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  label: string;
}) {
  return (
    <View style={styles.healthTile}>
      <Ionicons name={icon} size={14} color="rgba(255,255,255,0.55)" style={{ marginBottom: 6 }} />
      <Text style={styles.healthValue}>{value}</Text>
      <Text style={styles.healthLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  content: { paddingHorizontal: 20 },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 28,
  },
  logo: { fontSize: 17, fontWeight: '400', color: '#FFFFFF', letterSpacing: 4.5 },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },

  // Score circles
  scoreRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 32 },
  scoreItem: { alignItems: 'center', gap: 7 },
  scoreCircle: {
    width: 68, height: 68, borderRadius: 34,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center', gap: 2,
  },
  scoreValue: { fontSize: 19, fontWeight: '300', color: '#fff' },
  scoreLabel: { fontSize: 11, color: 'rgba(255,255,255,0.42)', letterSpacing: 0.3 },

  // CTA
  ctaWrap: { alignItems: 'center', marginBottom: 28 },
  ctaCircle: {
    width: 178, height: 178, borderRadius: 89,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center', justifyContent: 'center',
  },
  ctaText: { fontSize: 26, color: '#fff', textAlign: 'center', lineHeight: 33, fontWeight: '400' },
  sessionDot: {
    position: 'absolute', top: 18, right: 18,
    width: 9, height: 9, borderRadius: 5, backgroundColor: '#EF4444',
  },

  // Glass cards
  cardRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  cardLabel: {
    fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.45)',
    letterSpacing: 1.5, textTransform: 'uppercase',
  },
  exRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  exDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  exName: { fontSize: 13, color: '#fff', fontWeight: '500', flex: 1 },
  cardFooter: {
    flexDirection: 'row', justifyContent: 'space-between',
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)',
    marginTop: 10, paddingTop: 10,
  },
  footerLabel: { fontSize: 11, color: 'rgba(255,255,255,0.38)' },
  footerValue: { fontSize: 13, color: '#fff', fontWeight: '500' },
  cardEmpty: {
    fontSize: 12, color: 'rgba(255,255,255,0.35)',
    marginTop: 8, lineHeight: 18,
  },
  coachText: {
    fontSize: 13, color: 'rgba(255,255,255,0.72)',
    lineHeight: 20, flex: 1,
  },
  coachCta: { fontSize: 11, color: 'rgba(255,255,255,0.38)', marginTop: 10 },

  // Bar chart
  chartCard: { marginBottom: 12 },
  chartHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 18,
  },
  chartTotal: { fontSize: 14, color: '#fff', fontWeight: '500' },

  // Apple Health today card
  healthCard: { marginBottom: 12 },
  healthHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 14,
  },
  healthBadge: {
    fontSize: 9, fontWeight: '700', color: '#10B981',
    letterSpacing: 1.5, textTransform: 'uppercase',
  },
  healthRow: { flexDirection: 'row', gap: 8 },
  healthTile: {
    flex: 1, alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  healthValue: { fontSize: 16, fontWeight: '400', color: '#fff', marginBottom: 3 },
  healthLabel: { fontSize: 9, color: 'rgba(255,255,255,0.38)', letterSpacing: 0.3 },

  // Empty
  empty: { alignItems: 'center', paddingTop: 28, gap: 10 },
  emptyTitle: { fontSize: 22, color: '#fff', fontWeight: '400' },
  emptySubtitle: {
    fontSize: 14, color: 'rgba(255,255,255,0.38)',
    textAlign: 'center', paddingHorizontal: 32, lineHeight: 22,
  },
});
