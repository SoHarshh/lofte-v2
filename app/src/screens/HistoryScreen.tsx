import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator, SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { API_BASE } from '../config';
import { Workout } from '../types';

interface Props {
  colors: Record<string, string>;
}

function smartDate(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function sessionVolume(w: Workout) {
  return w.exercises.reduce((a, e) =>
    a + ((e.sets || 0) * (e.reps || 0) * (e.weight || 0)), 0);
}

function muscleTag(w: Workout) {
  const groups = new Set(
    w.exercises
      .map(e => {
        const raw = (e.muscleGroup || '').trim().toLowerCase();
        return raw.charAt(0).toUpperCase() + raw.slice(1);
      })
      .filter(Boolean)
  );
  return Array.from(groups).slice(0, 3).join(' · ') || 'General';
}

export default function HistoryScreen({ colors }: Props) {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/workouts`)
      .then(r => r.json())
      .then(data => { setWorkouts(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const styles = s(colors);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>History</Text>
        <Text style={styles.subtitle}>{workouts.length} sessions logged</Text>

        {workouts.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="time-outline" size={48} color="#333" />
            <Text style={styles.emptyTitle}>No sessions yet</Text>
            <Text style={styles.emptySubtitle}>Your workout history will appear here</Text>
          </View>
        )}

        {workouts.map(workout => {
          const vol = sessionVolume(workout);
          const tags = muscleTag(workout);
          const isOpen = expanded === workout.id;

          return (
            <TouchableOpacity
              key={workout.id}
              style={styles.card}
              onPress={() => setExpanded(isOpen ? null : workout.id)}
              activeOpacity={0.85}
            >
              {/* Card header */}
              <View style={styles.cardTop}>
                <View style={styles.cardLeft}>
                  <Text style={styles.cardDate}>{smartDate(workout.date)}</Text>
                  <Text style={styles.cardTime}>{formatTime(workout.date)}</Text>
                </View>
                <Text style={styles.chevron}>{isOpen ? '▲' : '▼'}</Text>
              </View>

              {/* Tags row */}
              <View style={styles.tagsRow}>
                <View style={styles.tag}>
                  <Text style={styles.tagText}>{tags}</Text>
                </View>
                <View style={[styles.tag, styles.tagAlt]}>
                  <Text style={styles.tagText}>
                    {workout.exercises.length} exercise{workout.exercises.length !== 1 ? 's' : ''}
                  </Text>
                </View>
                {vol > 0 && (
                  <View style={[styles.tag, styles.tagAlt]}>
                    <Text style={styles.tagText}>
                      {vol >= 1000 ? `${Math.round(vol / 1000)}k` : Math.round(vol)} lbs
                    </Text>
                  </View>
                )}
              </View>

              {/* Expanded exercises */}
              {isOpen && (
                <View style={styles.exList}>
                  <View style={styles.divider} />
                  {workout.exercises.map((ex, i) => (
                    <View key={i} style={styles.exRow}>
                      <View style={styles.exDot} />
                      <View style={styles.exBody}>
                        <Text style={styles.exName}>{ex.name}</Text>
                        <Text style={styles.exStats}>
                          {(() => {
                            const hasCardio = ex.distance || ex.duration;
                            const hasWeight = ex.weight && ex.weight > 0;
                            const hasSetsReps = ex.sets && ex.reps && (ex.sets > 1 || ex.reps > 1);
                            if (hasCardio && !hasWeight) {
                              const parts: string[] = [];
                              if (ex.distance) parts.push(`${(ex.distance / 1609).toFixed(1)} mi`);
                              if (ex.duration) parts.push(`${Math.round(ex.duration / 60)} min`);
                              if (ex.pace) parts.push(ex.pace);
                              return parts.join(' · ') || '—';
                            }
                            if (hasSetsReps) return `${ex.sets}×${ex.reps}${hasWeight ? ` @ ${ex.weight} lbs` : ''}`;
                            return '—';
                          })()}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </TouchableOpacity>
          );
        })}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = (colors: Record<string, string>) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  scrollContent: { padding: 20 },

  title: { fontSize: 32, fontWeight: '900', color: colors.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: colors.textDim, marginTop: 4, marginBottom: 24, fontWeight: '500' },

  card: {
    backgroundColor: colors.surface, borderRadius: 18,
    borderWidth: 1, borderColor: colors.border,
    padding: 16, marginBottom: 12,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardLeft: { gap: 2 },
  cardDate: { fontSize: 17, fontWeight: '700', color: colors.text },
  cardTime: { fontSize: 13, color: colors.textDim },
  chevron: { fontSize: 12, color: colors.textDim, marginTop: 4 },

  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  tag: {
    backgroundColor: colors.accentDim, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  tagAlt: { backgroundColor: colors.border },
  tagText: { fontSize: 12, fontWeight: '600', color: colors.text },

  divider: { height: 1, backgroundColor: colors.border, marginVertical: 12 },
  exList: { gap: 10 },
  exRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  exDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: colors.accent, marginTop: 6,
  },
  exBody: { flex: 1 },
  exName: { fontSize: 14, fontWeight: '600', color: colors.text },
  exStats: { fontSize: 13, color: colors.accent, marginTop: 2 },

  empty: { alignItems: 'center', marginTop: 60, gap: 10 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: colors.text },
  emptySubtitle: { fontSize: 14, color: colors.textDim, textAlign: 'center' },
});
