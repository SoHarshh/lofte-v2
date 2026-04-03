import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator, Platform, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useUser, useAuth } from '@clerk/expo';
import { GlassCard } from '../components/GlassCard';
import { API_BASE } from '../config';
import { Workout } from '../types/index';

const SERIF = Platform.OS === 'ios' ? 'Georgia' : 'serif';

interface Props { colors: Record<string, string>; }

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

function formatVol(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
  return `${Math.round(v)}`;
}

const SETTINGS = [
  { icon: 'person-outline' as const, label: 'Personal Information' },
  { icon: 'barbell-outline' as const, label: 'Workout Preferences' },
  { icon: 'watch-outline' as const, label: 'Connected Devices' },
  { icon: 'scale-outline' as const, label: 'Units & Measurements' },
];

export default function ProfileScreen({ colors }: Props) {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const insets = useSafeAreaInsets();
  const { user } = useUser();
  const { signOut } = useAuth();

  const displayName = user?.fullName || user?.firstName || user?.emailAddresses?.[0]?.emailAddress?.split('@')[0] || 'Athlete';
  const initials = displayName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
  const avatarUrl = user?.imageUrl;

  const load = useCallback(() => {
    fetch(`${API_BASE}/api/workouts`)
      .then(r => r.json())
      .then(data => { setWorkouts(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useFocusEffect(load);

  const TAB_BAR_H = 80 + Math.max(insets.bottom, 8);

  const totalSessions = workouts.length;
  const totalVolume = workouts.reduce((a, w) => a + sessionVolume(w), 0);
  const streak = calcStreak(workouts);

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
      >
        {/* Avatar + identity */}
        <View style={s.hero}>
          <View style={s.avatarWrap}>
            <View style={s.avatarHighlight} />
            {avatarUrl
              ? <Image source={{ uri: avatarUrl }} style={StyleSheet.absoluteFillObject} />
              : <Text style={[s.avatarInitials, { fontFamily: SERIF }]}>{initials}</Text>
            }
          </View>
          <Text style={[s.name, { fontFamily: SERIF }]}>{displayName}</Text>
          <Text style={s.memberLabel}>LOFTE MEMBER</Text>
        </View>

        {/* Stats grid */}
        <View style={s.statsGrid}>
          <StatCard value={String(totalSessions)} label="Sessions" icon="barbell-outline" />
          <StatCard value={formatVol(totalVolume)} label="Total Volume" icon="trending-up-outline" />
          <StatCard value={String(streak)} label="Day Streak" icon="flame-outline" />
          <StatCard value="—" label="PRs Set" icon="trophy-outline" />
        </View>

        {/* Settings section */}
        <Text style={s.sectionTitle}>Settings</Text>
        <GlassCard padding={0} style={s.settingsCard}>
          {SETTINGS.map(({ icon, label }, i) => (
            <TouchableOpacity
              key={label}
              style={[s.settingsRow, i < SETTINGS.length - 1 && s.settingsRowBorder]}
              activeOpacity={0.7}
            >
              <View style={s.settingsIconWrap}>
                <Ionicons name={icon} size={18} color="rgba(255,255,255,0.55)" />
              </View>
              <Text style={s.settingsLabel}>{label}</Text>
              <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.25)" />
            </TouchableOpacity>
          ))}
        </GlassCard>

        {/* Sign out */}
        <TouchableOpacity style={s.signOutBtn} onPress={() => signOut()} activeOpacity={0.7}>
          <Ionicons name="log-out-outline" size={16} color="rgba(255,255,255,0.45)" />
          <Text style={s.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        {/* App version */}
        <Text style={s.version}>LOFTE v1.0 · Built for athletes</Text>
      </ScrollView>
    </View>
  );
}

function StatCard({ value, label, icon }: {
  value: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <GlassCard style={s.statCard} padding={16}>
      <Ionicons name={icon} size={16} color="rgba(255,255,255,0.40)" style={{ marginBottom: 8 }} />
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </GlassCard>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  content: { paddingHorizontal: 20 },

  hero: { alignItems: 'center', marginBottom: 32 },
  avatarWrap: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16, overflow: 'hidden',
  },
  avatarHighlight: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 1,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  avatarInitials: { fontSize: 34, fontWeight: '400', color: '#fff' },
  name: { fontSize: 26, fontWeight: '400', color: '#fff', marginBottom: 6 },
  memberLabel: {
    fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.35)',
    letterSpacing: 2, textTransform: 'uppercase',
  },

  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    gap: 10, marginBottom: 28,
  },
  statCard: { width: '47%' },
  statValue: { fontSize: 24, fontWeight: '300', color: '#fff', marginBottom: 2 },
  statLabel: { fontSize: 11, color: 'rgba(255,255,255,0.40)', letterSpacing: 0.3 },

  sectionTitle: {
    fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.40)',
    letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10,
  },

  settingsCard: { borderRadius: 20, overflow: 'hidden' },
  settingsRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 16, gap: 12,
  },
  settingsRowBorder: {
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  settingsIconWrap: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center', justifyContent: 'center',
  },
  settingsLabel: { flex: 1, fontSize: 14, fontWeight: '500', color: 'rgba(255,255,255,0.80)' },

  signOutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, marginTop: 20,
    borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  signOutText: { fontSize: 14, color: 'rgba(255,255,255,0.45)', fontWeight: '500' },

  version: {
    textAlign: 'center', fontSize: 11,
    color: 'rgba(255,255,255,0.20)', marginTop: 16,
    letterSpacing: 0.5,
  },
});
