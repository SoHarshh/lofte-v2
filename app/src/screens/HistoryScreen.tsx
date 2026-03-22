import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator, SafeAreaView,
} from 'react-native';
import { API_BASE } from '../config';
import { Workout } from '../types';

interface Props {
  colors: Record<string, string>;
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

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    scroll: { padding: 20 },
    title: { fontSize: 24, fontWeight: '800', color: colors.text, marginBottom: 20 },
    card: {
      backgroundColor: colors.surface, borderRadius: 16,
      marginBottom: 12, borderWidth: 1, borderColor: colors.border,
      overflow: 'hidden',
    },
    cardHeader: {
      flexDirection: 'row', justifyContent: 'space-between',
      alignItems: 'center', padding: 16,
    },
    cardDate: { fontSize: 15, fontWeight: '700', color: colors.text },
    cardMeta: { fontSize: 13, color: colors.textDim, marginTop: 2 },
    cardChevron: { fontSize: 16, color: colors.textDim },
    divider: { height: 1, backgroundColor: colors.border },
    exList: { padding: 16, gap: 8 },
    exRow: { flexDirection: 'row', justifyContent: 'space-between' },
    exName: { fontSize: 14, color: colors.text, fontWeight: '500', flex: 1 },
    exStats: { fontSize: 14, color: colors.accent, fontWeight: '600' },
    empty: { alignItems: 'center', marginTop: 60 },
    emptyText: { color: colors.textDim, fontSize: 15, marginTop: 12 },
    loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  });

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.loader}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}>
        <Text style={s.title}>History</Text>

        {workouts.length === 0 && (
          <View style={s.empty}>
            <Text style={{ fontSize: 40 }}>📋</Text>
            <Text style={s.emptyText}>No workouts logged yet</Text>
          </View>
        )}

        {workouts.map(workout => (
          <View key={workout.id} style={s.card}>
            <TouchableOpacity
              style={s.cardHeader}
              onPress={() => setExpanded(expanded === workout.id ? null : workout.id)}
              activeOpacity={0.7}
            >
              <View>
                <Text style={s.cardDate}>{formatDate(workout.date)}</Text>
                <Text style={s.cardMeta}>
                  {workout.exercises.length} exercise{workout.exercises.length !== 1 ? 's' : ''}
                  {workout.notes ? ` · ${workout.notes.slice(0, 40)}` : ''}
                </Text>
              </View>
              <Text style={s.cardChevron}>{expanded === workout.id ? '▲' : '▼'}</Text>
            </TouchableOpacity>

            {expanded === workout.id && (
              <>
                <View style={s.divider} />
                <View style={s.exList}>
                  {workout.exercises.map((ex, i) => (
                    <View key={i} style={s.exRow}>
                      <Text style={s.exName}>{ex.name}</Text>
                      <Text style={s.exStats}>
                        {ex.sets && ex.reps
                          ? `${ex.sets}×${ex.reps}${ex.weight ? ` @ ${ex.weight}lbs` : ''}`
                          : ex.distance
                          ? `${ex.distance}m`
                          : ex.duration
                          ? `${Math.round(ex.duration / 60)}min`
                          : '—'}
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            )}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
