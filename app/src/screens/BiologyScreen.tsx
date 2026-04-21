import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  Platform, Animated, Easing, ActivityIndicator, TouchableOpacity,
} from 'react-native';
import Svg, { Path, Circle as SvgCircle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { GlassCard } from '../components/GlassCard';
import { DnaIcon } from '../components/DnaIcon';
import { API_BASE } from '../config';
import { useAuthFetch } from '../hooks/useAuthFetch';
import { useHealthSync } from '../hooks/useHealthSync';
import { isHealthAvailable, isHealthConnected, requestHealthPermissions } from '../utils/health';

const SERIF = Platform.OS === 'ios' ? 'Georgia' : 'serif';
const AnimatedPath = Animated.createAnimatedComponent(Path);

interface Props { colors: Record<string, string>; }

type Row = {
  date: string;
  steps?: number | null;
  active_energy_kcal?: number | null;
  resting_heart_rate?: number | null;
  hrv_ms?: number | null;
  sleep_hours?: number | null;
  body_weight_kg?: number | null;
};

// ─── Animated number counter ────────────────────────────────────────────────

function AnimatedNumber({
  value, style, decimals = 0, suffix = '',
}: {
  value: number;
  style?: any;
  decimals?: number;
  suffix?: string;
}) {
  const [display, setDisplay] = useState(0);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    anim.setValue(0);
    const listener = anim.addListener(({ value: v }) => {
      setDisplay(v * value);
    });
    Animated.timing(anim, {
      toValue: 1,
      duration: 900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    return () => anim.removeListener(listener);
  }, [value]);

  return <Text style={style}>{display.toFixed(decimals)}{suffix}</Text>;
}

// ─── Sparkline ──────────────────────────────────────────────────────────────

function Sparkline({
  data, width, height, color = '#10B981', gradientId,
}: {
  data: number[];
  width: number;
  height: number;
  color?: string;
  gradientId: string;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  const [pathLength, setPathLength] = useState(0);

  const values = data.filter((v) => typeof v === 'number' && !isNaN(v));
  const padding = 4;
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;

  let path = '';
  let areaPath = '';
  let dots: Array<{ x: number; y: number }> = [];
  if (values.length > 1) {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const step = innerW / (values.length - 1);

    values.forEach((v, i) => {
      const x = padding + i * step;
      const y = padding + innerH - ((v - min) / range) * innerH;
      path += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
      dots.push({ x, y });
    });
    areaPath = `${path} L ${padding + innerW} ${padding + innerH} L ${padding} ${padding + innerH} Z`;
  }

  useEffect(() => {
    if (!path) return;
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: 1400,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [path]);

  const strokeDashoffset = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [pathLength || 500, 0],
  });

  if (!path) {
    return (
      <View style={{ width, height, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11 }}>Not enough data yet</Text>
      </View>
    );
  }

  const last = dots[dots.length - 1];

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="0.28" />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Path d={areaPath} fill={`url(#${gradientId})`} />
      <AnimatedPath
        d={path}
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        strokeDasharray={pathLength || 500}
        strokeDashoffset={strokeDashoffset}
        onLayout={(e: any) => {
          const len = (e?.nativeEvent?.layout?.width ?? 0) * 1.6 + 120;
          if (len > 0 && pathLength === 0) setPathLength(len);
        }}
      />
      {last && <SvgCircle cx={last.x} cy={last.y} r={3} fill={color} />}
      {last && <SvgCircle cx={last.x} cy={last.y} r={6} fill={color} opacity={0.25} />}
    </Svg>
  );
}

// ─── Entrance animation wrapper ─────────────────────────────────────────────

function FadeInUp({
  delay = 0, children,
}: { delay?: number; children: React.ReactNode }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(18)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 520,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 520,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
}

// ─── Pulsing halo (breathing circle behind hero icon) ──────────────────────

function PulseHalo({ size = 110, color = '#10B981' }: { size?: number; color?: string }) {
  const scale = useRef(new Animated.Value(0.9)).current;
  const opacity = useRef(new Animated.Value(0.25)).current;

  useEffect(() => {
    Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, { toValue: 1.15, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(scale, { toValue: 0.9, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0.08, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.28, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      ])
    ).start();
  }, []);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: color,
        transform: [{ scale }],
        opacity,
      }}
    />
  );
}

// ─── Main screen ────────────────────────────────────────────────────────────

export default function BiologyScreen({ colors }: Props) {
  const insets = useSafeAreaInsets();
  const authFetch = useAuthFetch();
  const health = useHealthSync();
  const [range, setRange] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  const load = useCallback(async () => {
    if (!health.connected) { setLoading(false); return; }
    try {
      const res = await authFetch(`${API_BASE}/api/health/summary?days=14`);
      const data = await res.json();
      setRange(Array.isArray(data?.range) ? data.range : []);
    } catch {
      setRange([]);
    } finally {
      setLoading(false);
    }
  }, [authFetch, health.connected]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const connect = async () => {
    if (connecting) return;
    setConnecting(true);
    try {
      const granted = await requestHealthPermissions();
      if (granted) {
        await health.refresh();
      }
    } finally {
      setConnecting(false);
    }
  };

  const TAB_BAR_H = 80 + Math.max(insets.bottom, 8);
  const today = health.metrics;
  const sparkHRV = range.map((r) => r.hrv_ms).filter((v): v is number => typeof v === 'number');
  const sparkRHR = range.map((r) => r.resting_heart_rate).filter((v): v is number => typeof v === 'number');

  // ── Not connected state ──
  if (isHealthAvailable() && !health.connected) {
    return (
      <View style={s.root}>
        <ScrollView
          contentContainerStyle={[s.content, { paddingTop: insets.top + 24, paddingBottom: TAB_BAR_H + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          <FadeInUp>
            <View style={s.header}>
              <View style={s.headerIconWrap}>
                <DnaIcon size={18} color="rgba(255,255,255,0.80)" />
              </View>
              <Text style={[s.headerTitle, { fontFamily: SERIF }]}>Biology</Text>
              <View style={{ width: 38 }} />
            </View>
          </FadeInUp>

          <FadeInUp delay={140}>
            <View style={s.emptyHero}>
              <View style={s.heroIconWrap}>
                <PulseHalo />
                <View style={s.heroIconInner}>
                  <DnaIcon size={42} color="rgba(255,255,255,0.92)" />
                </View>
              </View>
              <Text style={[s.emptyTitle, { fontFamily: SERIF }]}>Your body, live</Text>
              <Text style={s.emptySubtitle}>
                Connect Apple Health to see your HRV, heart rate, sleep, steps and active calories — updated in real time.
              </Text>
              <TouchableOpacity
                onPress={connect}
                activeOpacity={0.85}
                style={s.connectBtn}
                disabled={connecting}
              >
                <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} />
                {connecting
                  ? <ActivityIndicator color="#050B14" />
                  : <Text style={s.connectBtnText}>Connect Apple Health</Text>}
              </TouchableOpacity>
            </View>
          </FadeInUp>
        </ScrollView>
      </View>
    );
  }

  // ── iOS not available ──
  if (!isHealthAvailable()) {
    return (
      <View style={s.root}>
        <ScrollView
          contentContainerStyle={[s.content, { paddingTop: insets.top + 24, paddingBottom: TAB_BAR_H + 24 }]}
        >
          <View style={s.header}>
            <View style={s.headerIconWrap}>
              <DnaIcon size={18} color="rgba(255,255,255,0.80)" />
            </View>
            <Text style={[s.headerTitle, { fontFamily: SERIF }]}>Biology</Text>
            <View style={{ width: 38 }} />
          </View>
          <View style={s.emptyHero}>
            <Text style={[s.emptyTitle, { fontFamily: SERIF, marginTop: 60 }]}>iOS only</Text>
            <Text style={s.emptySubtitle}>Biology metrics require Apple Health on iPhone.</Text>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <ScrollView
        contentContainerStyle={[s.content, { paddingTop: insets.top + 24, paddingBottom: TAB_BAR_H + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <FadeInUp>
          <View style={s.header}>
            <View style={s.headerIconWrap}>
              <DnaIcon size={18} color="rgba(255,255,255,0.80)" />
            </View>
            <Text style={[s.headerTitle, { fontFamily: SERIF }]}>Biology</Text>
            <View style={{ width: 38, alignItems: 'center' }}>
              {health.loading && <ActivityIndicator color="rgba(255,255,255,0.55)" size="small" />}
            </View>
          </View>
        </FadeInUp>

        {/* Hero — HRV with sparkline */}
        <FadeInUp delay={80}>
          <GlassCard style={s.heroCard}>
            <View style={s.heroRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.metricLabel}>HEART RATE VARIABILITY</Text>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 8 }}>
                  {today?.hrvMs != null ? (
                    <>
                      <AnimatedNumber
                        value={today.hrvMs}
                        decimals={0}
                        style={[s.heroValue, { fontFamily: SERIF }]}
                      />
                      <Text style={s.heroUnit}>  ms</Text>
                    </>
                  ) : (
                    <Text style={[s.heroValue, { fontFamily: SERIF }]}>—</Text>
                  )}
                </View>
                <Text style={s.heroCaption}>
                  {sparkHRV.length > 1 ? `${sparkHRV.length}-day trend` : 'Need a few more days'}
                </Text>
              </View>
              <View style={s.heroDot}>
                <Ionicons name="pulse" size={18} color="rgba(255,255,255,0.75)" />
              </View>
            </View>
            <View style={{ marginTop: 14 }}>
              <Sparkline data={sparkHRV} width={300} height={64} color="rgba(255,255,255,0.92)" gradientId="gradHrv" />
            </View>
          </GlassCard>
        </FadeInUp>

        {/* Row: Resting HR · Sleep */}
        <View style={s.row}>
          <FadeInUp delay={160}>
            <GlassCard style={s.halfCard}>
              <View style={s.tileHeader}>
                <Ionicons name="heart-outline" size={14} color="rgba(255,255,255,0.50)" />
                <Text style={s.metricLabel}>RESTING HR</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 6 }}>
                {today?.restingHeartRate != null ? (
                  <>
                    <AnimatedNumber
                      value={today.restingHeartRate}
                      style={[s.tileValue, { fontFamily: SERIF }]}
                    />
                    <Text style={s.tileUnit}> bpm</Text>
                  </>
                ) : (
                  <Text style={[s.tileValue, { fontFamily: SERIF }]}>—</Text>
                )}
              </View>
              <View style={{ marginTop: 10 }}>
                <Sparkline data={sparkRHR} width={140} height={36} color="rgba(255,255,255,0.70)" gradientId="gradRhr" />
              </View>
            </GlassCard>
          </FadeInUp>

          <FadeInUp delay={220}>
            <GlassCard style={s.halfCard}>
              <View style={s.tileHeader}>
                <Ionicons name="moon-outline" size={14} color="rgba(255,255,255,0.50)" />
                <Text style={s.metricLabel}>SLEEP</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 6 }}>
                {today?.sleepHours != null ? (
                  <>
                    <AnimatedNumber
                      value={today.sleepHours}
                      decimals={1}
                      style={[s.tileValue, { fontFamily: SERIF }]}
                    />
                    <Text style={s.tileUnit}> h</Text>
                  </>
                ) : (
                  <Text style={[s.tileValue, { fontFamily: SERIF }]}>—</Text>
                )}
              </View>
              <Text style={s.tileCaption}>Last night</Text>
            </GlassCard>
          </FadeInUp>
        </View>

        {/* Row: Steps · Active Cal */}
        <View style={s.row}>
          <FadeInUp delay={280}>
            <GlassCard style={s.halfCard}>
              <View style={s.tileHeader}>
                <Ionicons name="footsteps-outline" size={14} color="rgba(255,255,255,0.50)" />
                <Text style={s.metricLabel}>STEPS</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 6 }}>
                {today?.steps != null ? (
                  <AnimatedNumber
                    value={today.steps}
                    style={[s.tileValue, { fontFamily: SERIF }]}
                  />
                ) : (
                  <Text style={[s.tileValue, { fontFamily: SERIF }]}>—</Text>
                )}
              </View>
              <Text style={s.tileCaption}>Today</Text>
            </GlassCard>
          </FadeInUp>

          <FadeInUp delay={340}>
            <GlassCard style={s.halfCard}>
              <View style={s.tileHeader}>
                <Ionicons name="flame-outline" size={14} color="rgba(255,255,255,0.50)" />
                <Text style={s.metricLabel}>ACTIVE CAL</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 6 }}>
                {today?.activeEnergyKcal != null ? (
                  <AnimatedNumber
                    value={today.activeEnergyKcal}
                    style={[s.tileValue, { fontFamily: SERIF }]}
                  />
                ) : (
                  <Text style={[s.tileValue, { fontFamily: SERIF }]}>—</Text>
                )}
              </View>
              <Text style={s.tileCaption}>Today</Text>
            </GlassCard>
          </FadeInUp>
        </View>

        {/* Footer sync info */}
        {health.lastSyncedAt && (
          <FadeInUp delay={400}>
            <Text style={s.syncedAt}>
              Synced {Math.round((Date.now() - health.lastSyncedAt) / 1000)}s ago · Pulled from Apple Health
            </Text>
          </FadeInUp>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  content: { paddingHorizontal: 20 },

  // Header
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 24,
  },
  headerIconWrap: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 22, fontWeight: '400', color: '#fff' },

  // Hero
  heroCard: { marginBottom: 12 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroValue: { fontSize: 56, fontWeight: '300', color: '#fff', letterSpacing: -1.5 },
  heroUnit: { fontSize: 16, color: 'rgba(255,255,255,0.40)', fontWeight: '400' },
  heroCaption: { fontSize: 11, color: 'rgba(255,255,255,0.40)', marginTop: 4, letterSpacing: 0.2 },
  heroDot: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },

  // Tile
  row: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  halfCard: { flex: 1 },
  tileHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tileValue: { fontSize: 30, fontWeight: '300', color: '#fff', letterSpacing: -0.5 },
  tileUnit: { fontSize: 12, color: 'rgba(255,255,255,0.35)' },
  tileCaption: { fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 8, letterSpacing: 0.3 },

  metricLabel: {
    fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.50)',
    letterSpacing: 1.4, textTransform: 'uppercase',
  },

  // Empty / connect
  emptyHero: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 16 },
  heroIconWrap: {
    width: 110, height: 110, borderRadius: 55,
    alignItems: 'center', justifyContent: 'center', marginBottom: 28,
  },
  heroIconInner: {
    width: 86, height: 86, borderRadius: 43,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle: { fontSize: 26, fontWeight: '400', color: '#fff', marginBottom: 10 },
  emptySubtitle: {
    fontSize: 14, color: 'rgba(255,255,255,0.50)',
    textAlign: 'center', lineHeight: 21, marginBottom: 32,
    paddingHorizontal: 12,
  },
  connectBtn: {
    paddingVertical: 16, paddingHorizontal: 40,
    borderRadius: 100, overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.92)',
    minWidth: 240, alignItems: 'center',
  },
  connectBtnText: { fontSize: 15, fontWeight: '600', color: '#050B14', letterSpacing: 0.3 },

  syncedAt: {
    fontSize: 10, color: 'rgba(255,255,255,0.25)',
    textAlign: 'center', marginTop: 20, letterSpacing: 0.3,
  },
});
