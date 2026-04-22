import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Pressable, ActivityIndicator,
  Animated, Easing, StatusBar,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient, Stop, Rect, Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FONT_LIGHT, FONT_MEDIUM, FONT_REGULAR, FONT_SEMIBOLD } from '../utils/fonts';

interface Props {
  onConnect: () => Promise<boolean> | void;
  onDismiss?: () => void;
  busy?: boolean;
}

// Full-tab overlay shown when the user hasn't connected Apple Health yet.
// Mirrors the Figma connect screen but tuned to LOFTE's dark glass aesthetic.
export function ConnectHealthOverlay({ onConnect, onDismiss, busy = false }: Props) {
  const insets = useSafeAreaInsets();
  const fade = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(18)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1, duration: 420,
        easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }),
      Animated.timing(lift, {
        toValue: 0, duration: 520, delay: 60,
        easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, s.root, { opacity: fade }]}
      pointerEvents="auto"
    >
      {/* Heavy blur + tint over the underlying dashboard */}
      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, s.darkWash]} />

      <Animated.View
        style={[
          s.card,
          {
            paddingTop: insets.top + 24,
            paddingBottom: insets.bottom + 24,
            transform: [{ translateY: lift }],
          },
        ]}
      >
        {/* Apple Health–style icon: pink/red gradient tile with a white heart */}
        <View style={s.iconWrap}>
          <HealthTile size={88} />
          <View style={s.lockBadge}>
            <Ionicons name="lock-closed" size={11} color="#fff" />
          </View>
        </View>

        <Text style={[s.title, { fontFamily: FONT_MEDIUM }]}>Connect Apple Health</Text>
        <Text style={[s.blurb, { fontFamily: FONT_REGULAR }]}>
          Sync your data to unlock personalized metrics, activity rings, and deeper insights.
        </Text>

        <View style={s.perkRow}>
          <Perk icon="heart-outline" label="Heart rate" />
          <Perk icon="flame-outline" label="Activity" />
          <Perk icon="moon-outline" label="Sleep" />
        </View>

        <Pressable
          onPress={() => { if (!busy) onConnect(); }}
          style={({ pressed }) => [
            s.cta,
            pressed && !busy && { opacity: 0.88, transform: [{ scale: 0.985 }] },
            busy && { opacity: 0.75 },
          ]}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#050B14" />
          ) : (
            <>
              <Text style={[s.ctaLabel, { fontFamily: FONT_SEMIBOLD }]}>Connect Apple Health</Text>
              <Ionicons name="arrow-forward" size={16} color="#050B14" style={{ marginLeft: 8 }} />
            </>
          )}
        </Pressable>

        {onDismiss && (
          <Pressable
            onPress={onDismiss}
            style={({ pressed }) => [s.laterBtn, pressed && { opacity: 0.55 }]}
            hitSlop={10}
          >
            <Text style={[s.laterText, { fontFamily: FONT_REGULAR }]}>Maybe later</Text>
          </Pressable>
        )}

        <Text style={[s.privacyNote, { fontFamily: FONT_LIGHT }]}>
          LOFTE only reads the metrics you grant — never sells or shares your data.
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

function Perk({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View style={s.perk}>
      <View style={s.perkIconWrap}>
        <Ionicons name={icon} size={16} color="rgba(255,255,255,0.92)" />
      </View>
      <Text style={[s.perkLabel, { fontFamily: FONT_MEDIUM }]}>{label}</Text>
    </View>
  );
}

// A faithful nod to the Apple Health icon — a white heart on a vertical
// pink→red gradient tile — without shipping Apple's actual asset.
function HealthTile({ size = 88 }: { size?: number }) {
  const r = Math.round(size * 0.26);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: r,
        overflow: 'hidden',
        shadowColor: '#F43F5E',
        shadowOpacity: 0.45,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 12 },
      }}
    >
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id="hg" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FB7185" />
            <Stop offset="1" stopColor="#E11D48" />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={size} height={size} rx={r} ry={r} fill="url(#hg)" />
        {/* Heart — two overlapping circles + a triangle bottom. Simplified path. */}
        <Path
          fill="#ffffff"
          d={(() => {
            // Scale a heart into the tile. Center around size/2.
            const cx = size / 2;
            const cy = size / 2 + size * 0.04;
            const w = size * 0.52;
            const h = size * 0.46;
            // Cubic bezier heart path.
            const x = cx - w / 2;
            const y = cy - h / 2;
            return [
              `M${cx} ${y + h}`,
              `C${x} ${y + h * 0.55} ${x} ${y + h * 0.15} ${cx - w * 0.25} ${y + h * 0.02}`,
              `C${cx - w * 0.08} ${y - h * 0.06} ${cx} ${y + h * 0.1} ${cx} ${y + h * 0.22}`,
              `C${cx} ${y + h * 0.1} ${cx + w * 0.08} ${y - h * 0.06} ${cx + w * 0.25} ${y + h * 0.02}`,
              `C${x + w} ${y + h * 0.15} ${x + w} ${y + h * 0.55} ${cx} ${y + h}`,
              `Z`,
            ].join(' ');
          })()}
        />
      </Svg>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  darkWash: {
    backgroundColor: 'rgba(5,11,20,0.55)',
  },
  card: {
    width: '100%',
    maxWidth: 360,
    paddingHorizontal: 28,
    alignItems: 'center',
  },
  iconWrap: {
    marginBottom: 22,
    position: 'relative',
  },
  lockBadge: {
    position: 'absolute',
    right: -6, bottom: -6,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  title: {
    color: '#fff',
    fontSize: 22,
    letterSpacing: 0.2,
    marginBottom: 8,
    textAlign: 'center',
  },
  blurb: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 22,
    paddingHorizontal: 4,
  },
  perkRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 8,
    marginBottom: 26,
  },
  perk: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    gap: 6,
  },
  perkIconWrap: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center',
  },
  perkLabel: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 11,
    letterSpacing: 0.3,
  },
  cta: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    paddingVertical: 15,
    borderRadius: 16,
  },
  ctaLabel: {
    color: '#050B14',
    fontSize: 15,
    letterSpacing: 0.2,
  },
  laterBtn: {
    marginTop: 14,
    paddingVertical: 6, paddingHorizontal: 12,
  },
  laterText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12.5,
    letterSpacing: 0.2,
  },
  privacyNote: {
    marginTop: 22,
    color: 'rgba(255,255,255,0.38)',
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: 12,
  },
});
