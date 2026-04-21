import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Platform, TextInput,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../components/GlassCard';
import { AnimatedRing } from '../components/AnimatedRing';
import { API_BASE } from '../config';
import { Workout } from '../types/index';
import { useAuthFetch } from '../hooks/useAuthFetch';

import { FONT_MEDIUM } from '../utils/fonts';
const SYSTEM = FONT_MEDIUM;

interface Props { colors: Record<string, string>; }

function workoutCalories(w: Workout): number {
  return w.exercises.reduce((a, e) => a + (e.calories || 0), 0);
}

export default function CalorieDetailScreen({ colors }: Props) {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [goal, setGoal] = useState(500);
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState('500');
  const [bodyWeight, setBodyWeight] = useState(70);
  const [editingWeight, setEditingWeight] = useState(false);
  const [weightInput, setWeightInput] = useState('70');
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const authFetch = useAuthFetch();

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

  // Today's calories
  const todayKey = new Date().toISOString().slice(0, 10);
  const todayCal = workouts
    .filter(w => w.date.slice(0, 10) === todayKey)
    .reduce((a, w) => a + workoutCalories(w), 0);
  const todayRounded = Math.round(todayCal);

  // This week
  const now = new Date();
  const dow = now.getDay();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
  startOfWeek.setHours(0, 0, 0, 0);
  const weekWorkouts = workouts.filter(w => new Date(w.date) >= startOfWeek);
  const weekCal = weekWorkouts.reduce((a, w) => a + workoutCalories(w), 0);
  const daysElapsed = Math.max(1, dow === 0 ? 7 : dow);
  const weekAvg = Math.round(weekCal / daysElapsed);

  // Last week for trend
  const lastWeekStart = new Date(startOfWeek);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const lastWeekWorkouts = workouts.filter(w => {
    const d = new Date(w.date);
    return d >= lastWeekStart && d < startOfWeek;
  });
  const lastWeekCal = lastWeekWorkouts.reduce((a, w) => a + workoutCalories(w), 0);
  const lastWeekAvg = Math.round(lastWeekCal / 7);
  const trendUp = weekAvg >= lastWeekAvg;
  const trendDiff = Math.abs(weekAvg - lastWeekAvg);

  const progress = goal > 0 ? todayRounded / goal : 0;

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
          <Text style={[s.headerTitle, { fontFamily: SYSTEM }]}>Calories</Text>
          <View style={{ width: 38 }} />
        </View>

        {/* Ring */}
        <View style={s.ringWrap}>
          <AnimatedRing
            size={220}
            strokeWidth={14}
            progress={progress}
            color={progress >= 1 ? '#10B981' : 'rgba(255,255,255,0.70)'}
            label={String(todayRounded)}
            sublabel={`of ${goal} cal`}
          />
        </View>

        {/* Stats row */}
        <View style={s.statsRow}>
          <GlassCard style={s.statCard} padding={16}>
            <Text style={s.statValue}>{todayRounded}</Text>
            <Text style={s.statLabel}>Today</Text>
          </GlassCard>
          <GlassCard style={s.statCard} padding={16}>
            <Text style={s.statValue}>{weekAvg}</Text>
            <Text style={s.statLabel}>Daily Avg</Text>
          </GlassCard>
          <GlassCard style={s.statCard} padding={16}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons
                name={trendUp ? 'trending-up' : 'trending-down'}
                size={14}
                color={trendUp ? '#10B981' : '#EF4444'}
              />
              <Text style={[s.statValue, { color: trendUp ? '#10B981' : '#EF4444' }]}>
                {trendDiff}
              </Text>
            </View>
            <Text style={s.statLabel}>vs Last Wk</Text>
          </GlassCard>
        </View>

        {/* Goal setting */}
        <Text style={s.sectionTitle}>Daily Goal</Text>
        <GlassCard padding={0} style={s.settingsCard}>
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
            <Ionicons name={editingGoal ? 'chevron-up' : 'chevron-down'} size={16} color="rgba(255,255,255,0.25)" />
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
        </GlassCard>

        {/* Body weight */}
        <Text style={[s.sectionTitle, { marginTop: 20 }]}>Body Weight</Text>
        <GlassCard padding={0} style={s.settingsCard}>
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
              <Text style={s.settingsSubLabel}>{bodyWeight} kg — used for calorie accuracy</Text>
            </View>
            <Ionicons name={editingWeight ? 'chevron-up' : 'chevron-down'} size={16} color="rgba(255,255,255,0.25)" />
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
        </GlassCard>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  content: { paddingHorizontal: 20 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 24,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '500', color: '#fff', letterSpacing: 1.4, textTransform: 'uppercase' },

  ringWrap: { alignItems: 'center', marginBottom: 32 },

  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 28 },
  statCard: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '300', color: '#fff', marginBottom: 4 },
  statLabel: { fontSize: 11, color: 'rgba(255,255,255,0.40)' },

  sectionTitle: {
    fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.40)',
    letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10,
  },
  settingsCard: { borderRadius: 20, overflow: 'hidden' },
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
  settingsLabel: { fontSize: 14, fontWeight: '500', color: 'rgba(255,255,255,0.80)' },
  settingsSubLabel: { fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 },
  goalEditRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingBottom: 16,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)',
  },
  goalInput: {
    flex: 1, fontSize: 18, fontWeight: '500', color: '#fff',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
    textAlign: 'center',
  },
  goalSaveBtn: {
    backgroundColor: '#fff', borderRadius: 12,
    paddingHorizontal: 20, paddingVertical: 10,
  },
  goalSaveBtnText: { fontSize: 14, fontWeight: '700', color: '#050B14' },
});
