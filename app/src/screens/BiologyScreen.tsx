import React, { useEffect, useRef, useState, useContext, createContext } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  Animated, Easing, Platform, Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { HealthCard } from '../components/HealthCard';
import { SmoothSparkline } from '../components/SmoothSparkline';
import { RingProgress } from '../components/RingProgress';
import { MetricBarChart } from '../components/MetricBarChart';
import { MetricLineChart } from '../components/MetricLineChart';
import { DailyPagedChart } from '../components/DailyPagedChart';
import { ConnectHealthOverlay } from '../components/ConnectHealthOverlay';
import {
  HEALTH_METRICS,
  MetricKey, MetricConfig, Period,
} from '../data/healthMetrics';
import {
  isHealthAvailable, useHealthConnection,
} from '../utils/health';
import { useHealthDay } from '../hooks/useHealthDay';
import { useMetricSeries, Period as SeriesPeriod } from '../hooks/useMetricSeries';
import { FONT_LIGHT, FONT_MEDIUM, FONT_SEMIBOLD } from '../utils/fonts';

// Metrics that render as a smooth line (continuous biosignals).
// Everything else uses bar charts.
const LINE_METRICS = new Set<MetricKey>(['hrv', 'hr']);

const SCREEN_W = Dimensions.get('window').width;
const CONTENT_W = Math.min(390, SCREEN_W);
// Uppercase screen titles on Medium weight; SemiBold only used on the metric
// detail title where it needs to read firm above a scrubbing chart.
const SYSTEM = FONT_MEDIUM;
const HERO_FONT = FONT_LIGHT;
const TILE_FONT = FONT_LIGHT;
const RING_FONT = FONT_MEDIUM;

interface Props { colors: Record<string, string>; }

// ─── "Animate once per session" context ─────────────────────────────────────
// The home rings, sparklines, numbers, and fade-ups play once the first time
// the Health tab is opened in an app session. After that, subsequent re-mounts
// (tab switches, returning from detail) skip the intro and render final state.
// The flag is module-scoped so it survives remounts but resets on JS reload.

let HOME_INTRO_PLAYED = false;

const AnimateContext = createContext<boolean>(true);
function useAnimate() { return useContext(AnimateContext); }

// ─── Staggered fade-up entrance ─────────────────────────────────────────────

function FadeInUp({ delay = 0, children }: { delay?: number; children: React.ReactNode }) {
  const animate = useAnimate();
  const opacity = useRef(new Animated.Value(animate ? 0 : 1)).current;
  const translateY = useRef(new Animated.Value(animate ? 14 : 0)).current;
  useEffect(() => {
    if (!animate) return;
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1, duration: 520, delay,
        easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0, duration: 520, delay,
        easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }),
    ]).start();
  }, []);
  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
}

// ─── LiveDot — small pulsing green dot next to "live" metrics ──────────────

function LiveDot({ size = 5 }: { size?: number }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
        Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] });
  return (
    <Animated.View
      style={{
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: '#10B981',
        opacity,
        marginLeft: 4,
      }}
    />
  );
}

// ─── Animated number counter ────────────────────────────────────────────────

// Animated number. Throttles re-renders to ~20fps and uses rAF-driven
// interpolation so there's no 8,000-setState storm for large values like steps.
function CountUp({
  value, style, decimals = 0, suffix = '', thousands = false, duration = 650,
}: {
  value: number;
  style?: any;
  decimals?: number;
  suffix?: string;
  thousands?: boolean;
  duration?: number;
}) {
  const animate = useAnimate();
  const [display, setDisplay] = useState(animate ? 0 : value);
  useEffect(() => {
    if (!animate) { setDisplay(value); return; }
    const start = Date.now();
    const from = 0;
    const to = value;
    let lastPainted = -1;
    let rafId: number | null = null;
    let lastPaintTime = 0;

    const tick = () => {
      const elapsed = Date.now() - start;
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      const current = from + (to - from) * eased;
      const factor = Math.pow(10, decimals);
      const rounded = Math.round(current * factor) / factor;
      const now = Date.now();
      if (rounded !== lastPainted && now - lastPaintTime >= 48) {
        lastPainted = rounded;
        lastPaintTime = now;
        setDisplay(rounded);
      }
      if (t < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        setDisplay(to);
      }
    };
    rafId = requestAnimationFrame(tick);
    return () => { if (rafId != null) cancelAnimationFrame(rafId); };
  }, [value, decimals, duration, animate]);

  const formatted = thousands
    ? display.toLocaleString('en-US', { maximumFractionDigits: decimals })
    : display.toFixed(decimals);
  return <Text style={style}>{formatted}{suffix}</Text>;
}

// ─── Date helpers for the header ────────────────────────────────────────────

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function headerDateLine(d: Date): string {
  const today = new Date();
  if (isSameDay(d, today)) return 'TODAY';
  const wk = ['SUN','MON','TUE','WED','THU','FRI','SAT'][d.getDay()];
  const m = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][d.getMonth()];
  return `${wk} · ${m} ${d.getDate()}`;
}

// ─── Empty state for a chart area ───────────────────────────────────────────

function EmptyChart({ message }: { message: string }) {
  return (
    <View style={{ paddingVertical: 56, alignItems: 'center' }}>
      <Text style={{
        fontSize: 12,
        color: 'rgba(255,255,255,0.35)',
        letterSpacing: 0.3,
      }}>
        {message}
      </Text>
    </View>
  );
}

// ─── Detail view (drill-down) ───────────────────────────────────────────────

function MetricDetail({ config, onBack }: { config: MetricConfig; onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const [period, setPeriod] = useState<Period>('W');
  const periods: Period[] = ['D', 'W', 'M', 'Y'];
  const TAB_BAR_H = 80 + Math.max(insets.bottom, 8);

  // Live series for W/M/Y from HealthKit (D is handled by DailyPagedChart)
  const today = (() => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; })();
  const series = useMetricSeries(
    config.key,
    (period === 'D' ? 'W' : period) as SeriesPeriod,
    today,
  );

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 12, paddingBottom: TAB_BAR_H + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            onPress={onBack}
            style={({ pressed }) => [styles.circleBtn, pressed && { opacity: 0.6 }]}
            hitSlop={8}
          >
            <Ionicons name="chevron-back" size={18} color="rgba(255,255,255,0.80)" />
          </Pressable>
          <Text style={[styles.headerTitle, { fontFamily: FONT_MEDIUM }]}>{config.title}</Text>
          <View style={{ width: 36, height: 36 }} />
        </View>

        {/* Chart card with period selector */}
        <FadeInUp>
          <HealthCard style={{ marginBottom: 12 }} padding={20}>
            {/* Period pill */}
            <View style={styles.periodBar}>
              {periods.map((p) => {
                const active = p === period;
                return (
                  <Pressable
                    key={p}
                    onPress={() => setPeriod(p)}
                    style={[styles.periodBtn, active && styles.periodBtnActive]}
                  >
                    <Text style={[
                      styles.periodText,
                      active && { color: 'rgba(255,255,255,0.95)' },
                    ]}>{p}</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* D → horizontal paging through past days; W/M/Y → live aggregates.
                HRV & Resting HR render as a line chart; Sleep/Steps/Cal as bars. */}
            <View key={period}>
              {period === 'D' ? (
                <DailyPagedChart metric={config.key} unit={config.unit} />
              ) : series.loading ? (
                <EmptyChart message="Loading…" />
              ) : series.data.length === 0 ? (
                <EmptyChart message="No data for this period" />
              ) : LINE_METRICS.has(config.key) ? (
                <MetricLineChart data={series.data} unit={config.unit} />
              ) : (
                <MetricBarChart data={series.data} unit={config.unit} />
              )}
            </View>
          </HealthCard>
        </FadeInUp>

        <FadeInUp delay={80}>
          <HealthCard style={{ marginBottom: 12 }} padding={20}>
            <Text style={styles.smallLabel}>ABOUT</Text>
            <Text style={styles.factBody}>{config.about}</Text>
          </HealthCard>
        </FadeInUp>

        <FadeInUp delay={140}>
          <HealthCard style={{ marginBottom: 12 }} padding={20}>
            <Text style={styles.smallLabel}>RANGE</Text>
            <Text style={styles.factBody}>{config.range}</Text>
          </HealthCard>
        </FadeInUp>

        <FadeInUp delay={200}>
          <HealthCard style={{ marginBottom: 12 }} padding={20}>
            <Text style={styles.smallLabel}>HIGH MEANS</Text>
            <Text style={styles.factBody}>{config.high}</Text>
          </HealthCard>
        </FadeInUp>

        <FadeInUp delay={260}>
          <HealthCard padding={20}>
            <Text style={styles.smallLabel}>LOW MEANS</Text>
            <Text style={styles.factBody}>{config.low}</Text>
          </HealthCard>
        </FadeInUp>
      </ScrollView>
    </View>
  );
}

// ─── Home ────────────────────────────────────────────────────────────────────

function HealthHome({ onOpen }: { onOpen: (k: MetricKey) => void }) {
  const insets = useSafeAreaInsets();
  const TAB_BAR_H = 80 + Math.max(insets.bottom, 8);

  // Play intro animations only the first time this session. On remount,
  // render already-animated (no flicker, no replay).
  const shouldAnimate = useRef(!HOME_INTRO_PLAYED).current;
  useEffect(() => {
    if (shouldAnimate) {
      const id = setTimeout(() => { HOME_INTRO_PLAYED = true; }, 1400);
      return () => clearTimeout(id);
    }
  }, [shouldAnimate]);

  // Date navigation — step back/forward one day. Can't go beyond today.
  const today = (() => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; })();
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const isToday = isSameDay(selectedDate, today);
  const goPrev = () => {
    const d = new Date(selectedDate); d.setDate(d.getDate() - 1);
    setSelectedDate(d);
  };
  const goNext = () => {
    if (isToday) return;
    const d = new Date(selectedDate); d.setDate(d.getDate() + 1);
    setSelectedDate(d);
  };

  // Real HealthKit data for the selected day
  const health = useHealthDay(selectedDate);
  const hrvValue = health.summary.hrvMs;
  const hrValue = health.summary.restingHeartRate;
  const sleepValue = health.summary.sleepHours;
  const stepsValue = health.summary.steps;
  const calValue = health.summary.activeEnergyKcal;

  // Sparklines: hourly today, last-N-days for the tiles.
  const sparkHrv = health.hourlyHrv;
  const sparkHr = health.hrSpark;
  const sparkSleep = health.sleepSpark;

  const STEPS_GOAL = 10000;
  const CAL_GOAL = 600;

  return (
    <AnimateContext.Provider value={shouldAnimate}>
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 12, paddingBottom: TAB_BAR_H + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Top bar: < · (date + title) · > */}
        <View style={styles.header}>
          <Pressable
            onPress={goPrev}
            style={({ pressed }) => [styles.circleBtn, pressed && { opacity: 0.5 }]}
            hitSlop={10}
          >
            <Ionicons name="chevron-back" size={18} color="rgba(255,255,255,0.82)" />
          </Pressable>
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.dateLine}>{headerDateLine(selectedDate)}</Text>
            <Text style={[styles.headerTitle, { fontFamily: SYSTEM, marginTop: 2 }]}>Health</Text>
          </View>
          <Pressable
            onPress={goNext}
            disabled={isToday}
            style={({ pressed }) => [
              styles.circleBtn,
              isToday && { opacity: 0.35 },
              !isToday && pressed && { opacity: 0.5 },
            ]}
            hitSlop={10}
          >
            <Ionicons
              name="chevron-forward"
              size={18}
              color={isToday ? 'rgba(255,255,255,0.32)' : 'rgba(255,255,255,0.82)'}
            />
          </Pressable>
        </View>

        {/* Hero — HRV */}
        <FadeInUp delay={40}>
          <Pressable
            onPress={() => onOpen('hrv')}
            style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.99 : 1 }] })}
          >
            <HealthCard style={{ marginBottom: 12 }} padding={20}>
              <View style={styles.heroRow}>
                <View style={{ flex: 1 }}>
                  <View style={styles.heroLabelRow}>
                    <Ionicons name="heart" size={11} color="rgba(255,255,255,0.50)" />
                    <Text style={styles.heroLabel}>HEART RATE VARIABILITY</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 12 }}>
                    {hrvValue != null ? (
                      <CountUp
                        value={hrvValue}
                        style={[styles.heroValue, { fontFamily: HERO_FONT }]}
                      />
                    ) : (
                      <Text style={[styles.heroValue, { fontFamily: HERO_FONT }]}>—</Text>
                    )}
                    <Text style={styles.heroUnit}>  ms</Text>
                  </View>
                  {health.hrvDelta != null && (
                    <View style={styles.deltaRow}>
                      <View style={styles.deltaPill}>
                        <Text style={styles.deltaText}>
                          {health.hrvDelta >= 0 ? '▲' : '▼'} {Math.abs(health.hrvDelta).toFixed(1)}%
                        </Text>
                      </View>
                      <Text style={styles.deltaCaption}>from yesterday</Text>
                    </View>
                  )}
                </View>
              </View>

              <View style={{ marginTop: 16, marginHorizontal: -4 }}>
                <SmoothSparkline
                  data={sparkHrv}
                  width={CONTENT_W - 72}
                  height={80}
                  stroke="#EAFFF0"
                  gradientKey="hrv"
                  animate={shouldAnimate}
                />
              </View>

            </HealthCard>
          </Pressable>
        </FadeInUp>

        {/* Activity Rings — Steps / Calories */}
        <FadeInUp delay={120}>
          <HealthCard style={{ marginBottom: 12 }} padding={20}>
            <View style={styles.actHeader}>
              <View style={styles.heroLabelRow}>
                <Ionicons name="pulse" size={11} color="rgba(255,255,255,0.50)" />
                <Text style={styles.heroLabel}>ACTIVITY RINGS</Text>
              </View>
              <Text style={styles.todaySmall}>Today</Text>
            </View>

            <View style={styles.ringsRow}>
              <Pressable
                onPress={() => onOpen('steps')}
                style={({ pressed }) => [{ flex: 1, alignItems: 'center', gap: 8 }, pressed && { opacity: 0.75 }]}
              >
                <RingProgress value={(stepsValue ?? 0) / STEPS_GOAL} size={100} gradientKey="rsteps" animate={shouldAnimate}>
                  <Ionicons name="footsteps-outline" size={14} color="rgba(255,255,255,0.60)" style={{ marginBottom: 2 }} />
                  {stepsValue != null ? (
                    <CountUp
                      value={stepsValue}
                      thousands
                      style={[styles.ringValue, { fontFamily: RING_FONT }]}
                    />
                  ) : (
                    <Text style={[styles.ringValue, { fontFamily: RING_FONT }]}>—</Text>
                  )}
                </RingProgress>
                <Text style={styles.ringLabel}>STEPS</Text>
              </Pressable>

              <Pressable
                onPress={() => onOpen('cal')}
                style={({ pressed }) => [{ flex: 1, alignItems: 'center', gap: 8 }, pressed && { opacity: 0.75 }]}
              >
                <RingProgress value={(calValue ?? 0) / CAL_GOAL} size={100} gradientKey="rcal" animate={shouldAnimate}>
                  <Ionicons name="flame-outline" size={14} color="rgba(255,255,255,0.60)" style={{ marginBottom: 2 }} />
                  {calValue != null ? (
                    <CountUp
                      value={calValue}
                      style={[styles.ringValue, { fontFamily: RING_FONT }]}
                    />
                  ) : (
                    <Text style={[styles.ringValue, { fontFamily: RING_FONT }]}>—</Text>
                  )}
                </RingProgress>
                <Text style={styles.ringLabel}>CALORIES</Text>
              </Pressable>
            </View>
          </HealthCard>
        </FadeInUp>

        {/* HR · Sleep tiles */}
        <View style={styles.tileRow}>
          <FadeInUp delay={200}>
            <Pressable
              onPress={() => onOpen('hr')}
              style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.98 : 1 }] })}
            >
              <HealthCard style={styles.smallCard} padding={16}>
                <View style={styles.heroLabelRow}>
                  <Ionicons name="heart-outline" size={10} color="rgba(255,255,255,0.50)" />
                  <Text style={[styles.tileLabel]}>RESTING HR</Text>
                  {isToday && hrValue != null && <LiveDot />}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 8 }}>
                  {hrValue != null ? (
                    <CountUp
                      value={hrValue}
                      style={[styles.tileValue, { fontFamily: TILE_FONT }]}
                    />
                  ) : (
                    <Text style={[styles.tileValue, { fontFamily: TILE_FONT }]}>—</Text>
                  )}
                  <Text style={styles.tileUnit}> bpm</Text>
                </View>
                <View style={{ marginTop: 10, marginHorizontal: -4 }}>
                  <SmoothSparkline
                    data={sparkHr}
                    width={(CONTENT_W - 32 - 12) / 2 - 24}
                    height={36}
                    stroke="#EAFFF0"
                    gradientKey="hr"
                    animate={shouldAnimate}
                    alive={isToday && hrValue != null}
                  />
                </View>
                {isToday && hrValue != null && (
                  <Text style={styles.liveCaption}>Updated now</Text>
                )}
              </HealthCard>
            </Pressable>
          </FadeInUp>

          <FadeInUp delay={260}>
            <Pressable
              onPress={() => onOpen('sleep')}
              style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.98 : 1 }] })}
            >
              <HealthCard style={styles.smallCard} padding={16}>
                <View style={styles.heroLabelRow}>
                  <Ionicons name="moon-outline" size={10} color="rgba(255,255,255,0.50)" />
                  <Text style={styles.tileLabel}>SLEEP</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 8 }}>
                  {sleepValue != null ? (
                    <CountUp
                      value={sleepValue}
                      decimals={1}
                      style={[styles.tileValue, { fontFamily: TILE_FONT }]}
                    />
                  ) : (
                    <Text style={[styles.tileValue, { fontFamily: TILE_FONT }]}>—</Text>
                  )}
                  <Text style={styles.tileUnit}> hrs</Text>
                </View>
                <View style={{ marginTop: 10, marginHorizontal: -4 }}>
                  <SmoothSparkline
                    data={sparkSleep}
                    width={(CONTENT_W - 32 - 12) / 2 - 24}
                    height={36}
                    stroke="#EAFFF0"
                    gradientKey="sleep"
                    animate={shouldAnimate}
                  />
                </View>
              </HealthCard>
            </Pressable>
          </FadeInUp>
        </View>
      </ScrollView>
    </View>
    </AnimateContext.Provider>
  );
}

// ─── Root screen with detail routing ────────────────────────────────────────

export default function BiologyScreen(_: Props) {
  const [activeMetric, setActiveMetric] = useState<MetricKey | null>(null);
  const slide = useRef(new Animated.Value(0)).current; // 0 = home, 1 = detail
  const { connected, ready, connect } = useHealthConnection();
  const [connecting, setConnecting] = useState(false);
  const healthSupported = isHealthAvailable();
  // Only show the overlay when the platform supports HealthKit AND the user
  // hasn't granted permissions yet. On Android/simulator we silently keep the
  // dashboard visible (which will render empty states).
  const showConnectOverlay = ready && healthSupported && !connected;

  const onConnectPress = async () => {
    if (connecting) return;
    setConnecting(true);
    try {
      await connect();
    } finally {
      setConnecting(false);
    }
  };

  const open = (k: MetricKey) => {
    setActiveMetric(k);
    Animated.timing(slide, {
      toValue: 1,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  const back = () => {
    Animated.timing(slide, {
      toValue: 0,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setActiveMetric(null);
    });
  };

  const homeTranslate = slide.interpolate({
    inputRange: [0, 1], outputRange: [0, -32],
  });
  const homeOpacity = slide.interpolate({
    inputRange: [0, 1], outputRange: [1, 0],
  });
  const detailTranslate = slide.interpolate({
    inputRange: [0, 1], outputRange: [40, 0],
  });
  const detailOpacity = slide.interpolate({
    inputRange: [0, 0.5, 1], outputRange: [0, 0, 1],
  });

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      {/* Home layer */}
      <Animated.View
        pointerEvents={activeMetric ? 'none' : 'auto'}
        style={[
          StyleSheet.absoluteFill,
          { opacity: homeOpacity, transform: [{ translateX: homeTranslate }] },
        ]}
      >
        <HealthHome onOpen={open} />
      </Animated.View>

      {/* Detail layer */}
      {activeMetric && (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { opacity: detailOpacity, transform: [{ translateX: detailTranslate }] },
          ]}
        >
          <MetricDetail config={HEALTH_METRICS[activeMetric]} onBack={back} />
        </Animated.View>
      )}

      {/* Connect-Apple-Health overlay (covers both home + detail layers) */}
      {showConnectOverlay && (
        <ConnectHealthOverlay onConnect={onConnectPress} busy={connecting} />
      )}
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  scrollContent: {
    paddingHorizontal: 16,
    alignSelf: 'center',
    width: '100%',
    maxWidth: CONTENT_W,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 8,
    marginBottom: 8,
  },
  circleBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18, fontWeight: '500', color: '#fff',
    letterSpacing: 1.4, textTransform: 'uppercase',
  },
  dateLine: {
    fontSize: 10, color: 'rgba(255,255,255,0.42)',
    letterSpacing: 1.7,
  },

  // Hero
  heroRow: { flexDirection: 'row', alignItems: 'flex-start' },
  heroLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroLabel: {
    fontSize: 10, color: 'rgba(255,255,255,0.50)',
    letterSpacing: 1.8, textTransform: 'uppercase',
    fontWeight: '600',
  },
  heroValue: {
    fontSize: 52, fontWeight: '300', color: '#fff',
    letterSpacing: -1.6, lineHeight: 52,
  },
  heroUnit: { fontSize: 13, color: 'rgba(255,255,255,0.50)', fontWeight: '400' },

  deltaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 8 },
  deltaPill: {
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.09)',
  },
  deltaText: { fontSize: 11, color: 'rgba(255,255,255,0.82)' },
  deltaCaption: { fontSize: 11, color: 'rgba(255,255,255,0.38)' },

  chevCircle: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center',
  },

  datesRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: 4, marginTop: 10,
  },
  dateTick: {
    fontSize: 9, color: 'rgba(255,255,255,0.30)',
    letterSpacing: 1.2,
  },

  // Activity rings card
  actHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 16,
  },
  todaySmall: { fontSize: 11, color: 'rgba(255,255,255,0.40)' },
  ringsRow: {
    flexDirection: 'row', gap: 12,
    justifyContent: 'center',
  },
  ringValue: {
    fontSize: 17, fontWeight: '500', color: '#fff',
    letterSpacing: -0.3, lineHeight: 20,
  },
  ringLabel: {
    fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.50)',
    letterSpacing: 1.2,
  },

  // Small tiles
  tileRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  smallCard: { width: (CONTENT_W - 32 - 12) / 2 },
  tileLabel: {
    fontSize: 10, color: 'rgba(255,255,255,0.50)',
    letterSpacing: 1.6, textTransform: 'uppercase', fontWeight: '600',
  },
  tileValue: {
    fontSize: 30, fontWeight: '300', color: '#fff',
    letterSpacing: -0.6, lineHeight: 32,
  },
  tileUnit: { fontSize: 12, color: 'rgba(255,255,255,0.40)' },
  liveCaption: {
    fontSize: 9, color: 'rgba(16,185,129,0.80)',
    letterSpacing: 0.5, marginTop: 6,
  },

  // Period pill
  periodBar: {
    flexDirection: 'row', gap: 4,
    padding: 4, borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginBottom: 20,
  },
  periodBtn: {
    flex: 1, paddingVertical: 7,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 100,
  },
  periodBtnActive: { backgroundColor: 'rgba(255,255,255,0.14)' },
  periodText: {
    fontSize: 11, letterSpacing: 1.4,
    color: 'rgba(255,255,255,0.40)', fontWeight: '600',
  },

  // Fact cards
  smallLabel: {
    fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.50)',
    letterSpacing: 1.8, textTransform: 'uppercase', marginBottom: 6,
  },
  factBody: {
    fontSize: 13, color: 'rgba(255,255,255,0.85)',
    lineHeight: 20,
  },
});
