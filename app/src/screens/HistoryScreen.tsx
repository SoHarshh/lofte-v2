import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../components/GlassCard';
import { API_BASE } from '../config';
import { Workout, Exercise } from '../types/index';
import { useAuthFetch } from '../hooks/useAuthFetch';
import { useUnits, displayWeight, unitLabel } from '../utils/units';

import { FONT_MEDIUM } from '../utils/fonts';
const SYSTEM = FONT_MEDIUM;

const FILTERS = ['All', 'This Week', 'This Month', 'Strength', 'Cardio', 'PRs'];

interface Props { colors: Record<string, string>; }

function formatExStats(ex: Exercise, useKg = false): string {
  const u = unitLabel(useKg);
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
  if (hasSetsReps) return `${ex.sets}×${ex.reps}${hasWeight ? ` @ ${displayWeight(ex.weight!, useKg)} ${u}` : ''}`;
  return '—';
}

function sessionVolume(w: Workout): number {
  return w.exercises.reduce((a, e) =>
    a + ((e.sets || 0) * (e.reps || 0) * (e.weight || 0)), 0);
}

function formatVol(v: number): string {
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
  return `${Math.round(v)}`;
}

function getMuscleTag(w: Workout): string {
  const groups = new Set(
    w.exercises.map(e => {
      const raw = (e.muscleGroup || '').trim().toLowerCase();
      return raw.charAt(0).toUpperCase() + raw.slice(1);
    }).filter(Boolean)
  );
  return Array.from(groups).slice(0, 2).join(', ') || 'General';
}

export default function HistoryScreen({ colors }: Props) {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('All');
  const [expanded, setExpanded] = useState<number | null>(null);
  const insets = useSafeAreaInsets();
  const authFetch = useAuthFetch();
  const useKg = useUnits();

  const load = useCallback(() => {
    authFetch(`${API_BASE}/api/workouts`)
      .then(r => r.json())
      .then(data => { setWorkouts(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [authFetch]);

  useFocusEffect(load);

  const TAB_BAR_H = 80 + Math.max(insets.bottom, 8);

  const filtered = workouts.filter(w => {
    if (activeFilter === 'All') return true;
    if (activeFilter === 'This Week') {
      const d = new Date(w.date);
      const now = new Date();
      const diff = (now.getTime() - d.getTime()) / 86_400_000;
      return diff <= 7;
    }
    if (activeFilter === 'This Month') {
      const d = new Date(w.date);
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }
    if (activeFilter === 'Cardio') {
      return w.exercises.some(e => e.distance || e.duration);
    }
    if (activeFilter === 'Strength') {
      return w.exercises.some(e => e.weight && e.weight > 0);
    }
    return true; // PRs — would need backend support; show all for now
  });

  if (loading) {
    return (
      <View style={[s.root, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  return (
    <View style={s.root}>
      <ScrollView
        contentContainerStyle={[
          s.content,
          { paddingTop: insets.top + 24, paddingBottom: TAB_BAR_H + 24 },
        ]}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[1]}
      >
        {/* Header — centered, matches Health tab */}
        <View style={s.header}>
          <View style={s.headerSide} />
          <View style={s.headerCenter}>
            <Text style={s.headerEyebrow}>
              {workouts.length} SESSION{workouts.length !== 1 ? 'S' : ''}
            </Text>
            <Text style={[s.headerTitle, { fontFamily: SYSTEM }]}>History</Text>
          </View>
          <View style={s.headerSide} />
        </View>

        {/* Sticky filter pills */}
        <View style={[s.filterWrap, { backgroundColor: 'transparent' }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.filterRow}
          >
            {FILTERS.map(f => (
              <TouchableOpacity
                key={f}
                style={[s.filterPill, activeFilter === f && s.filterPillActive]}
                onPress={() => setActiveFilter(f)}
                activeOpacity={0.7}
              >
                <Text style={[s.filterText, activeFilter === f && s.filterTextActive]}>
                  {f}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Empty state */}
        {filtered.length === 0 && (
          <View style={s.empty}>
            <Ionicons name="time-outline" size={48} color="rgba(255,255,255,0.08)" />
            <Text style={[s.emptyTitle, { fontFamily: SYSTEM }]}>No sessions yet</Text>
            <Text style={s.emptySubtitle}>Your workout history will appear here</Text>
          </View>
        )}

        {/* Workout cards */}
        {filtered.map(workout => {
          const vol = sessionVolume(workout);
          const tag = getMuscleTag(workout);
          const cal = workout.exercises.reduce((a, e) => a + (e.calories || 0), 0);
          const isOpen = expanded === workout.id;
          const d = new Date(workout.date);
          const dayNum = d.getDate();
          const monthAbbr = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
          const exCount = workout.exercises.length;

          return (
            <TouchableOpacity
              key={workout.id}
              onPress={() => setExpanded(isOpen ? null : workout.id)}
              activeOpacity={0.85}
              style={s.cardWrap}
            >
              <GlassCard padding={16} style={s.card}>
                {/* Card header row */}
                <View style={s.cardTop}>
                  {/* Date box */}
                  <View style={s.dateBox}>
                    <Text style={s.dateNum}>{dayNum}</Text>
                    <Text style={s.dateMonth}>{monthAbbr}</Text>
                  </View>

                  {/* Center: tags + count */}
                  <View style={s.cardMid}>
                    <View style={s.tagsRow}>
                      <View style={s.tag}>
                        <Text style={s.tagText}>{tag}</Text>
                      </View>
                      <View style={s.tag}>
                        <Text style={s.tagText}>{exCount} ex</Text>
                      </View>
                      {cal > 0 && (
                        <View style={s.tag}>
                          <Text style={s.tagText}>{Math.round(cal)} cal</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Right: volume + chevron */}
                  <View style={s.cardRight}>
                    {vol > 0 && (
                      <Text style={s.volText}>{formatVol(vol)}</Text>
                    )}
                    <Ionicons
                      name={isOpen ? 'chevron-up' : 'chevron-down'}
                      size={16}
                      color="rgba(255,255,255,0.30)"
                    />
                  </View>
                </View>

                {/* Expanded exercise list */}
                {isOpen && (
                  <View style={s.exList}>
                    <View style={s.divider} />
                    {workout.exercises.map((ex, i) => (
                      <View key={i} style={s.exRow}>
                        <View style={s.exDot} />
                        <View style={{ flex: 1 }}>
                          <Text style={s.exName}>{ex.name}</Text>
                          <Text style={s.exStats}>{formatExStats(ex, useKg)}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </GlassCard>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  content: { paddingHorizontal: 20 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    marginBottom: 20,
  },
  headerSide: { width: 36, height: 36 },
  headerCenter: { alignItems: 'center' },
  headerEyebrow: {
    fontSize: 10, color: 'rgba(255,255,255,0.42)',
    letterSpacing: 1.7, fontWeight: '600',
  },
  headerTitle: {
    fontSize: 18, fontWeight: '500', color: '#fff',
    letterSpacing: 1.4, marginTop: 2, textTransform: 'uppercase',
  },

  filterWrap: { paddingBottom: 16, marginHorizontal: -20 },
  filterRow: { paddingHorizontal: 20, gap: 8 },
  filterPill: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
  },
  filterPillActive: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderColor: 'rgba(255,255,255,0.28)',
  },
  filterText: { fontSize: 13, color: 'rgba(255,255,255,0.55)', fontWeight: '500' },
  filterTextActive: { color: '#fff' },

  empty: { alignItems: 'center', paddingTop: 40, gap: 10 },
  emptyTitle: { fontSize: 22, color: '#fff', fontWeight: '400' },
  emptySubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.38)', textAlign: 'center' },

  cardWrap: { marginBottom: 10 },
  card: { borderRadius: 22 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },

  dateBox: {
    width: 52, height: 52,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
    borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  dateNum: { fontSize: 20, fontWeight: '500', color: '#fff', lineHeight: 22 },
  dateMonth: { fontSize: 9, color: 'rgba(255,255,255,0.45)', fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' },

  cardMid: { flex: 1 },
  tagsRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  tag: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
  },
  tagText: { fontSize: 10, color: 'rgba(255,255,255,0.75)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },

  cardRight: { alignItems: 'flex-end', gap: 4 },
  volText: { fontSize: 16, fontWeight: '500', color: '#fff' },

  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginVertical: 12 },
  exList: {},
  exRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  exDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.40)', marginTop: 6 },
  exName: { fontSize: 14, fontWeight: '500', color: '#fff' },
  exStats: { fontSize: 13, color: 'rgba(255,255,255,0.50)', marginTop: 2 },
});
