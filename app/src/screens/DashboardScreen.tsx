import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator, Dimensions, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../components/GlassCard';
import { API_BASE } from '../config';
import { Workout } from '../types/index';

const SERIF = Platform.OS === 'ios' ? 'Georgia' : 'serif';

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
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const load = useCallback(() => {
    fetch(`${API_BASE}/api/workouts`)
      .then(r => r.json())
      .then(data => { setWorkouts(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useFocusEffect(load);

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

  if (loading) {
    return (
      <View style={[styles.root, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

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
          <TouchableOpacity style={styles.headerBtn} activeOpacity={0.7}>
            <Ionicons name="settings-outline" size={20} color="rgba(255,255,255,0.50)" />
          </TouchableOpacity>
        </View>

        {/* Score circles */}
        <View style={styles.scoreRow}>
          <ScoreCircle icon="barbell-outline" value={String(weekSessions)} label="Sessions" />
          <ScoreCircle icon="flash-outline" value={formatVol(weekVolume)} label="Volume" />
          <ScoreCircle icon="flame-outline" value={String(streak)} label="Streak" />
          <ScoreCircle icon="sync-outline" value="—" label="Recovery" />
        </View>

        {/* Circular Start Workout CTA */}
        <View style={styles.ctaWrap}>
          <TouchableOpacity
            style={styles.ctaCircle}
            onPress={() => navigation.navigate('Session' as never)}
            activeOpacity={0.85}
          >
            <Text style={[styles.ctaText, { fontFamily: SERIF }]}>
              {sessionActive ? 'Resume\nWorkout' : 'Start\nWorkout'}
            </Text>
            {sessionActive && <View style={styles.sessionDot} />}
          </TouchableOpacity>
        </View>

        {/* Two-column glass cards */}
        <View style={styles.cardRow}>
          {/* Last Workout */}
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
                  <Text style={styles.footerValue}>{formatVol(sessionVolume(lastWorkout))} lbs</Text>
                </View>
              </>
            ) : (
              <Text style={styles.cardEmpty}>No sessions yet.{'\n'}Start your first workout.</Text>
            )}
          </GlassCard>

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
              <Text style={styles.chartTotal}>{formatVol(weekVolume)} lbs</Text>
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

        {/* Empty state */}
        {workouts.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="barbell-outline" size={52} color="rgba(255,255,255,0.08)" />
            <Text style={[styles.emptyTitle, { fontFamily: SERIF }]}>Ready to train?</Text>
            <Text style={styles.emptySubtitle}>
              Tap Start Workout above to log your first session
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function ScoreCircle({ icon, value, label }: {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  label: string;
}) {
  return (
    <View style={styles.scoreItem}>
      <View style={styles.scoreCircle}>
        <Ionicons name={icon} size={13} color="rgba(255,255,255,0.50)" />
        <Text style={styles.scoreValue}>{value}</Text>
      </View>
      <Text style={styles.scoreLabel}>{label}</Text>
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

  // Empty
  empty: { alignItems: 'center', paddingTop: 28, gap: 10 },
  emptyTitle: { fontSize: 22, color: '#fff', fontWeight: '400' },
  emptySubtitle: {
    fontSize: 14, color: 'rgba(255,255,255,0.38)',
    textAlign: 'center', paddingHorizontal: 32, lineHeight: 22,
  },
});
