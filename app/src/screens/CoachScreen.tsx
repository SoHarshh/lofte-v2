import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../components/GlassCard';

const SERIF = Platform.OS === 'ios' ? 'Georgia' : 'serif';

interface Props { colors: Record<string, string>; }

const FEATURES = [
  { icon: 'analytics-outline' as const, label: 'Training Analysis', desc: 'Deep insights on your volume, frequency and progression trends.' },
  { icon: 'trending-up-outline' as const, label: 'PR Predictions', desc: 'Know when you\'re ready to hit a new personal record.' },
  { icon: 'heart-outline' as const, label: 'Recovery Insights', desc: 'Coaching that adjusts to your sleep, HRV and recovery state.' },
];

export default function CoachScreen({ colors }: Props) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  return (
    <View style={s.root}>
      {/* Back button */}
      <TouchableOpacity
        style={[s.backBtn, { top: insets.top + 12 }]}
        onPress={() => navigation.navigate('Home' as never)}
        activeOpacity={0.7}
      >
        <Ionicons name="chevron-back" size={22} color="rgba(255,255,255,0.70)" />
      </TouchableOpacity>

      <ScrollView
        contentContainerStyle={[
          s.content,
          { paddingTop: insets.top + 64, paddingBottom: insets.bottom + 40 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={s.hero}>
          {/* Coach icon */}
          <View style={s.iconCircle}>
            <View style={s.iconHighlight} />
            <Ionicons name="flash" size={36} color="rgba(255,255,255,0.85)" />
          </View>

          <Text style={[s.heroTitle, { fontFamily: SERIF }]}>LOFTE Coach</Text>
          <Text style={s.heroSubtitle}>Trained on your full training history</Text>

          {/* Coming soon badge */}
          <View style={s.badge}>
            <View style={s.badgeDot} />
            <Text style={s.badgeText}>COMING SOON</Text>
          </View>
        </View>

        {/* Main card */}
        <GlassCard style={s.mainCard}>
          <Text style={s.mainCardTitle}>What is LOFTE Coach?</Text>
          <Text style={s.mainCardBody}>
            An AI coach that actually knows your training. Unlike generic fitness chatbots,
            LOFTE Coach has full context — your complete workout history, PRs, volume trends,
            and recovery data.
          </Text>
          <Text style={s.mainCardBody}>
            Ask it anything. "Why has my bench been stuck for 3 weeks?" It will look at your
            data and give you a real answer.
          </Text>
        </GlassCard>

        {/* Feature cards */}
        <View style={s.featureList}>
          {FEATURES.map(({ icon, label, desc }) => (
            <GlassCard key={label} padding={16} style={s.featureCard}>
              <View style={s.featureRow}>
                <View style={s.featureIcon}>
                  <Ionicons name={icon} size={20} color="rgba(255,255,255,0.75)" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.featureLabel}>{label}</Text>
                  <Text style={s.featureDesc}>{desc}</Text>
                </View>
              </View>
            </GlassCard>
          ))}
        </View>

        {/* Notify CTA (visual only) */}
        <TouchableOpacity style={s.notifyBtn} activeOpacity={0.85}>
          <Text style={s.notifyBtnText}>Notify me when it's ready</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  content: { paddingHorizontal: 24 },

  backBtn: {
    position: 'absolute', left: 20,
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 10,
  },

  hero: { alignItems: 'center', marginBottom: 32 },

  iconCircle: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 20, overflow: 'hidden',
  },
  iconHighlight: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 1,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },

  heroTitle: { fontSize: 32, fontWeight: '400', color: '#fff', marginBottom: 6 },
  heroSubtitle: { fontSize: 13, color: 'rgba(255,255,255,0.45)', letterSpacing: 0.3, marginBottom: 16 },

  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 100,
    backgroundColor: 'rgba(124,58,237,0.15)',
    borderWidth: 1, borderColor: 'rgba(124,58,237,0.40)',
  },
  badgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#7C3AED' },
  badgeText: {
    fontSize: 10, fontWeight: '700', color: '#A78BFA',
    letterSpacing: 1.5, textTransform: 'uppercase',
  },

  mainCard: { marginBottom: 12 },
  mainCardTitle: {
    fontSize: 15, fontWeight: '600', color: '#fff',
    marginBottom: 10,
  },
  mainCardBody: {
    fontSize: 14, color: 'rgba(255,255,255,0.65)',
    lineHeight: 22, marginBottom: 10,
  },

  featureList: { gap: 8, marginBottom: 24 },
  featureCard: {},
  featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  featureIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center', justifyContent: 'center',
  },
  featureLabel: { fontSize: 14, fontWeight: '600', color: '#fff', marginBottom: 4 },
  featureDesc: { fontSize: 12, color: 'rgba(255,255,255,0.50)', lineHeight: 18 },

  notifyBtn: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 18, paddingVertical: 16,
    alignItems: 'center',
    overflow: 'hidden',
  },
  notifyBtnText: { fontSize: 15, fontWeight: '600', color: 'rgba(255,255,255,0.75)' },
});
