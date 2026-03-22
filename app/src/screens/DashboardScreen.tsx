import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  ActivityIndicator, SafeAreaView,
} from 'react-native';
import { API_BASE } from '../config';
import { Workout } from '../types';

interface Props {
  colors: Record<string, string>;
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

  const totalSessions = workouts.length;
  const totalExercises = workouts.reduce((acc, w) => acc + w.exercises.length, 0);
  const totalVolume = workouts.reduce((acc, w) =>
    acc + w.exercises.reduce((a, e) =>
      a + ((e.sets || 0) * (e.reps || 0) * (e.weight || 0)), 0), 0);

  const muscleGroups: Record<string, number> = {};
  workouts.forEach(w =>
    w.exercises.forEach(e => {
      // Normalize: lowercase, trim, then title-case
      const raw = (e.muscleGroup || 'Other').trim().toLowerCase();
      const mg = raw.charAt(0).toUpperCase() + raw.slice(1);
      muscleGroups[mg] = (muscleGroups[mg] || 0) + 1;
    })
  );

  const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    scroll: { padding: 20 },
    header: { marginBottom: 28 },
    title: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
    subtitle: { fontSize: 14, color: colors.textDim, marginTop: 4 },
    statsRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
    statCard: {
      flex: 1, backgroundColor: colors.surface,
      borderRadius: 16, padding: 16,
      borderWidth: 1, borderColor: colors.border,
    },
    statValue: { fontSize: 28, fontWeight: '800', color: colors.text },
    statLabel: { fontSize: 12, color: colors.textDim, marginTop: 2 },
    sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 12 },
    muscleRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    muscleLabel: { fontSize: 14, color: colors.text },
    muscleCount: { fontSize: 14, color: colors.accent, fontWeight: '700' },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    emptyText: { color: colors.textDim, fontSize: 15, marginTop: 12 },
  });

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.empty}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <Text style={s.title}>LOFTE</Text>
          <Text style={s.subtitle}>
            {totalSessions === 0 ? 'Start your first session' : `${totalSessions} sessions logged`}
          </Text>
        </View>

        <View style={s.statsRow}>
          <View style={s.statCard}>
            <Text style={s.statValue}>{totalSessions}</Text>
            <Text style={s.statLabel}>Sessions</Text>
          </View>
          <View style={s.statCard}>
            <Text style={s.statValue}>{totalExercises}</Text>
            <Text style={s.statLabel}>Exercises</Text>
          </View>
        </View>

        <View style={s.statsRow}>
          <View style={s.statCard}>
            <Text style={s.statValue}>{Math.round(totalVolume / 1000)}k</Text>
            <Text style={s.statLabel}>Total Volume (lbs)</Text>
          </View>
        </View>

        {Object.keys(muscleGroups).length > 0 && (
          <View>
            <Text style={s.sectionTitle}>Muscle Groups</Text>
            {Object.entries(muscleGroups)
              .sort((a, b) => b[1] - a[1])
              .map(([mg, count]) => (
                <View key={mg} style={s.muscleRow}>
                  <Text style={s.muscleLabel}>{mg}</Text>
                  <Text style={s.muscleCount}>{count} exercises</Text>
                </View>
              ))}
          </View>
        )}

        {totalSessions === 0 && (
          <View style={s.empty}>
            <Text style={{ fontSize: 40 }}>🏋️</Text>
            <Text style={s.emptyText}>No workouts yet — tap Session to start</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
