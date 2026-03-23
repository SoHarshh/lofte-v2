import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  ActivityIndicator, SafeAreaView, Dimensions,
} from 'react-native';
import { BarChart } from 'react-native-chart-kit';
import { Ionicons } from '@expo/vector-icons';
import { API_BASE } from '../config';
import { Workout } from '../types';

const SCREEN_W = Dimensions.get('window').width;

interface Props {
  colors: Record<string, string>;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatVol(v: number) {
  if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `${Math.round(v / 1000)}k`;
  return `${Math.round(v)}`;
}

function calcStreak(workouts: Workout[]) {
  if (!workouts.length) return 0;
  const days = new Set(workouts.map(w => w.date.slice(0, 10)));
  let streak = 0;
  const d = new Date();
  while (true) {
    const key = d.toISOString().slice(0, 10);
    if (days.has(key)) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else break;
  }
  return streak;
}

export default function DashboardScreen({ colors }: Props) {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/api/workouts`)
      .then(r => r.json())
      .then(data => { setWorkouts(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // --- Stats ---
  const totalSessions = workouts.length;
  const totalVolume = workouts.reduce((acc, w) =>
    acc + w.exercises.reduce((a, e) =>
      a + ((e.sets || 0) * (e.reps || 0) * (e.weight || 0)), 0), 0);
  const streak = calcStreak(workouts);

  // --- Last 7 days volume chart ---
  const last7: { label: string; volume: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const dayLabel = d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1);
    const vol = workouts
      .filter(w => w.date.slice(0, 10) === key)
      .reduce((acc, w) =>
        acc + w.exercises.reduce((a, e) =>
          a + ((e.sets || 0) * (e.reps || 0) * (e.weight || 0)), 0), 0);
    last7.push({ label: dayLabel, volume: vol });
  }
  const hasChartData = last7.some(d => d.volume > 0);

  // --- Muscle groups ---
  const muscleMap: Record<string, number> = {};
  workouts.forEach(w =>
    w.exercises.forEach(e => {
      const raw = (e.muscleGroup || 'Other').trim().toLowerCase();
      const mg = raw.charAt(0).toUpperCase() + raw.slice(1);
      muscleMap[mg] = (muscleMap[mg] || 0) + 1;
    })
  );
  const muscleGroups = Object.entries(muscleMap).sort((a, b) => b[1] - a[1]);
  const maxMuscleCount = muscleGroups[0]?.[1] || 1;

  if (loading) {
    return (
      <SafeAreaView style={s(colors).safe}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  const styles = s(colors);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.greeting}>{getGreeting()}</Text>
          <Text style={styles.appName}>LOFTE</Text>
          {streak > 0 && (
            <View style={styles.streakBadge}>
              <Ionicons name="flame" size={13} color="#f97316" />
              <Text style={styles.streakText}> {streak} day streak</Text>
            </View>
          )}
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{totalSessions}</Text>
            <Text style={styles.statLabel}>Sessions</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{formatVol(totalVolume)}</Text>
            <Text style={styles.statLabel}>Total Volume</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{streak}</Text>
            <Text style={styles.statLabel}>Day Streak</Text>
          </View>
        </View>

        {/* Weekly volume chart */}
        {hasChartData && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>This Week</Text>
            <View style={styles.chartCard}>
              <BarChart
                data={{
                  labels: last7.map(d => d.label),
                  datasets: [{ data: last7.map(d => Math.round(d.volume / 1000)) }],
                }}
                width={SCREEN_W - 64}
                height={160}
                yAxisLabel=""
                yAxisSuffix="k"
                chartConfig={{
                  backgroundColor: colors.surface,
                  backgroundGradientFrom: colors.surface,
                  backgroundGradientTo: colors.surface,
                  decimalPlaces: 0,
                  color: (opacity = 1) => `rgba(124, 58, 237, ${opacity})`,
                  labelColor: () => colors.textDim,
                  barPercentage: 0.6,
                  propsForBackgroundLines: { stroke: colors.border, strokeWidth: 1 },
                }}
                style={{ borderRadius: 12 }}
                showValuesOnTopOfBars={false}
                withInnerLines={true}
                fromZero
              />
            </View>
          </View>
        )}

        {/* Muscle groups */}
        {muscleGroups.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Muscle Groups</Text>
            <View style={styles.card}>
              {muscleGroups.slice(0, 6).map(([mg, count]) => (
                <View key={mg} style={styles.muscleRow}>
                  <Text style={styles.muscleLabel}>{mg}</Text>
                  <View style={styles.muscleBarTrack}>
                    <View
                      style={[
                        styles.muscleBarFill,
                        { width: `${(count / maxMuscleCount) * 100}%` as any },
                      ]}
                    />
                  </View>
                  <Text style={styles.muscleCount}>{count}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Empty state */}
        {totalSessions === 0 && (
          <View style={styles.empty}>
            <Ionicons name="barbell-outline" size={56} color={colors.border} />
            <Text style={styles.emptyTitle}>No sessions yet</Text>
            <Text style={styles.emptySubtitle}>Tap Session below to log your first workout</Text>
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = (colors: Record<string, string>) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  scrollContent: { padding: 20 },

  header: { marginBottom: 28 },
  greeting: { fontSize: 14, color: colors.textDim, fontWeight: '500', marginBottom: 2 },
  appName: { fontSize: 36, fontWeight: '900', color: colors.text, letterSpacing: -1 },
  streakBadge: {
    flexDirection: 'row', alignItems: 'center',
    alignSelf: 'flex-start', marginTop: 8,
    backgroundColor: '#1a0f00', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 4,
    borderWidth: 1, borderColor: '#f97316',
  },
  streakText: { fontSize: 13, fontWeight: '700', color: '#f97316' },

  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  statCard: {
    flex: 1, backgroundColor: colors.surface,
    borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center',
  },
  statValue: { fontSize: 26, fontWeight: '900', color: colors.text, letterSpacing: -0.5 },
  statLabel: { fontSize: 11, color: colors.textDim, marginTop: 2, fontWeight: '500' },

  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 13, fontWeight: '700', color: colors.textDim,
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10,
  },
  chartCard: {
    backgroundColor: colors.surface, borderRadius: 16,
    borderWidth: 1, borderColor: colors.border,
    padding: 16, overflow: 'hidden',
  },
  card: {
    backgroundColor: colors.surface, borderRadius: 16,
    borderWidth: 1, borderColor: colors.border, padding: 16, gap: 14,
  },

  muscleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  muscleLabel: { fontSize: 13, color: colors.text, fontWeight: '500', width: 72 },
  muscleBarTrack: {
    flex: 1, height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden',
  },
  muscleBarFill: { height: '100%', backgroundColor: colors.accent, borderRadius: 3 },
  muscleCount: { fontSize: 13, color: colors.textDim, fontWeight: '600', width: 20, textAlign: 'right' },

  empty: { alignItems: 'center', marginTop: 48, gap: 8 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: colors.text },
  emptySubtitle: { fontSize: 14, color: colors.textDim, textAlign: 'center', paddingHorizontal: 32 },
});
