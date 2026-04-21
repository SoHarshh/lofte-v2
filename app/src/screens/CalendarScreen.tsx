import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Platform, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../components/GlassCard';
import { API_BASE } from '../config';
import { Workout } from '../types/index';
import { useAuthFetch } from '../hooks/useAuthFetch';
import { useUnits, displayWeight, unitLabel } from '../utils/units';

const SERIF = Platform.OS === 'ios' ? 'Georgia' : 'serif';
const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface Props { colors: Record<string, string>; }

function getMonthGrid(year: number, month: number): (number | null)[][] {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const weeks: (number | null)[][] = [];
  let week: (number | null)[] = Array(firstDay).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    week.push(d);
    if (week.length === 7) { weeks.push(week); week = []; }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }
  return weeks;
}

function getMuscleGroups(w: Workout): string[] {
  const groups = new Set<string>();
  w.exercises.forEach(e => {
    if (e.muscleGroup) groups.add(e.muscleGroup);
  });
  return [...groups];
}

export default function CalendarScreen({ colors }: Props) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const authFetch = useAuthFetch();
  const useKg = useUnits();

  const load = useCallback(() => {
    authFetch(`${API_BASE}/api/workouts`)
      .then(r => r.json())
      .then(data => { setWorkouts(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [authFetch]);

  useFocusEffect(load);

  // Build date → workouts map
  const workoutMap = new Map<string, Workout[]>();
  workouts.forEach(w => {
    const key = w.date.slice(0, 10);
    if (!workoutMap.has(key)) workoutMap.set(key, []);
    workoutMap.get(key)!.push(w);
  });

  const todayKey = now.toISOString().slice(0, 10);
  const grid = getMonthGrid(year, month);

  const prevMonth = () => {
    setSelectedDay(null);
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    setSelectedDay(null);
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  const selectedKey = selectedDay
    ? `${year}-${String(month + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`
    : null;
  const selectedWorkouts = selectedKey ? (workoutMap.get(selectedKey) || []) : [];

  // Month stats
  const monthWorkouts = workouts.filter(w => {
    const d = new Date(w.date);
    return d.getFullYear() === year && d.getMonth() === month;
  });
  const monthSessions = monthWorkouts.length;
  const monthCal = monthWorkouts.reduce(
    (a, w) => a + w.exercises.reduce((b, e) => b + (e.calories || 0), 0), 0
  );

  if (loading) {
    return (
      <View style={[s.root, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color="rgba(255,255,255,0.55)" size="large" />
      </View>
    );
  }

  return (
    <View style={s.root}>
      <ScrollView
        contentContainerStyle={[s.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={22} color="rgba(255,255,255,0.70)" />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { fontFamily: SERIF }]}>Calendar</Text>
          <View style={{ width: 38 }} />
        </View>

        {/* Month navigator */}
        <View style={s.monthNav}>
          <TouchableOpacity onPress={prevMonth} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-back" size={20} color="rgba(255,255,255,0.50)" />
          </TouchableOpacity>
          <Text style={[s.monthTitle, { fontFamily: SERIF }]}>
            {MONTH_NAMES[month]} {year}
          </Text>
          <TouchableOpacity onPress={nextMonth} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.50)" />
          </TouchableOpacity>
        </View>

        {/* Calendar grid */}
        <GlassCard padding={16} style={s.calendarCard}>
          {/* Day labels */}
          <View style={s.dayLabelsRow}>
            {DAY_LABELS.map((l, i) => (
              <Text key={i} style={s.dayLabel}>{l}</Text>
            ))}
          </View>

          {/* Weeks */}
          {grid.map((week, wi) => (
            <View key={wi} style={s.weekRow}>
              {week.map((day, di) => {
                if (day === null) return <View key={di} style={s.dayCell} />;

                const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const hasWorkout = workoutMap.has(dateKey);
                const isToday = dateKey === todayKey;
                const isSelected = day === selectedDay;

                return (
                  <TouchableOpacity
                    key={di}
                    style={[
                      s.dayCell,
                      isToday && s.dayCellToday,
                      isSelected && s.dayCellSelected,
                    ]}
                    onPress={() => setSelectedDay(day === selectedDay ? null : day)}
                    activeOpacity={0.7}
                  >
                    <Text style={[
                      s.dayText,
                      isToday && s.dayTextToday,
                      isSelected && s.dayTextSelected,
                    ]}>
                      {day}
                    </Text>
                    {hasWorkout && <View style={s.workoutDot} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </GlassCard>

        {/* Month stats */}
        <View style={s.monthStatsRow}>
          <Text style={s.monthStat}>{monthSessions} sessions</Text>
          {monthCal > 0 && <Text style={s.monthStat}>{Math.round(monthCal)} cal</Text>}
        </View>

        {/* Selected date detail */}
        {selectedDay !== null && (
          <GlassCard padding={16} style={s.detailCard}>
            <Text style={s.detailDate}>
              {new Date(year, month, selectedDay).toLocaleDateString('en-US', {
                weekday: 'long', month: 'long', day: 'numeric',
              })}
            </Text>

            {selectedWorkouts.length === 0 ? (
              <Text style={s.detailEmpty}>Rest day</Text>
            ) : (
              selectedWorkouts.map((w, i) => {
                const groups = getMuscleGroups(w);
                const cal = w.exercises.reduce((a, e) => a + (e.calories || 0), 0);
                return (
                  <View key={i} style={i > 0 ? { marginTop: 12 } : {}}>
                    {/* Tags */}
                    <View style={s.detailTags}>
                      {groups.map(g => (
                        <View key={g} style={s.detailTag}>
                          <Text style={s.detailTagText}>{g}</Text>
                        </View>
                      ))}
                      <View style={s.detailTag}>
                        <Text style={s.detailTagText}>{w.exercises.length} ex</Text>
                      </View>
                      {cal > 0 && (
                        <View style={s.detailTag}>
                          <Text style={s.detailTagText}>{Math.round(cal)} cal</Text>
                        </View>
                      )}
                    </View>
                    {/* Exercises preview */}
                    {w.exercises.slice(0, 3).map((ex, j) => (
                      <Text key={j} style={s.detailExercise}>
                        {ex.name}{ex.weight ? ` — ${ex.sets}x${ex.reps} @ ${displayWeight(ex.weight, useKg)} ${unitLabel(useKg)}` : ''}
                      </Text>
                    ))}
                    {w.exercises.length > 3 && (
                      <Text style={s.detailMore}>+{w.exercises.length - 3} more</Text>
                    )}
                    <TouchableOpacity
                      style={s.viewSessionBtn}
                      onPress={() => navigation.navigate('History' as never)}
                      activeOpacity={0.7}
                    >
                      <Text style={s.viewSessionText}>View session</Text>
                      <Ionicons name="arrow-forward" size={14} color="rgba(255,255,255,0.50)" />
                    </TouchableOpacity>
                  </View>
                );
              })
            )}
          </GlassCard>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  content: { paddingHorizontal: 20 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 20,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '400', color: '#fff' },

  monthNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 16, paddingHorizontal: 4,
  },
  monthTitle: { fontSize: 20, fontWeight: '400', color: '#fff' },

  calendarCard: { marginBottom: 12 },
  dayLabelsRow: { flexDirection: 'row', marginBottom: 8 },
  dayLabel: {
    flex: 1, textAlign: 'center', fontSize: 11,
    color: 'rgba(255,255,255,0.35)', fontWeight: '600',
  },
  weekRow: { flexDirection: 'row', marginBottom: 4 },
  dayCell: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    height: 44, borderRadius: 22,
  },
  dayCellToday: {
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.30)',
  },
  dayCellSelected: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  dayText: { fontSize: 15, color: 'rgba(255,255,255,0.60)' },
  dayTextToday: { color: '#fff', fontWeight: '600' },
  dayTextSelected: { color: '#fff', fontWeight: '600' },
  workoutDot: {
    width: 5, height: 5, borderRadius: 3,
    backgroundColor: '#10B981',
    position: 'absolute', bottom: 6,
  },

  monthStatsRow: {
    flexDirection: 'row', justifyContent: 'center', gap: 16,
    marginBottom: 16,
  },
  monthStat: { fontSize: 12, color: 'rgba(255,255,255,0.35)' },

  detailCard: { marginBottom: 12 },
  detailDate: {
    fontSize: 14, fontWeight: '500', color: 'rgba(255,255,255,0.70)',
    marginBottom: 12,
  },
  detailEmpty: { fontSize: 14, color: 'rgba(255,255,255,0.30)', fontStyle: 'italic' },
  detailTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  detailTag: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
  },
  detailTagText: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.50)' },
  detailExercise: {
    fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 4,
  },
  detailMore: { fontSize: 12, color: 'rgba(255,255,255,0.30)', marginTop: 2 },
  viewSessionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12,
    paddingVertical: 8,
  },
  viewSessionText: { fontSize: 13, color: 'rgba(255,255,255,0.50)', fontWeight: '500' },
});
