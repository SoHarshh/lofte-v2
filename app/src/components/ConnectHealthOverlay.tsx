import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Pressable, ActivityIndicator,
  Animated, Easing, Image,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FONT_LIGHT, FONT_MEDIUM, FONT_REGULAR, FONT_SEMIBOLD } from '../utils/fonts';

const APPLE_HEALTH_ICON = require('../../assets/apple-health-icon.png');
const APP_BG = require('../../assets/bg.png');

interface Props {
  onConnect: () => void | Promise<unknown>;
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
      {/* Opaque base so the dashboard behind is hidden */}
      <View style={[StyleSheet.absoluteFill, s.base]} />
      {/* App's green-glow background image */}
      <Image source={APP_BG} style={s.bgImage} resizeMode="cover" />
      {/* Frost pass on top */}
      <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
      {/* Faint tint so text always has contrast */}
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
        {/* Apple Health icon */}
        <View style={s.iconWrap}>
          <Image source={APPLE_HEALTH_ICON} style={s.healthIcon} resizeMode="contain" />
        </View>

        <Text style={[s.title, { fontFamily: FONT_MEDIUM }]}>Apple Health Not Connected</Text>
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
              <Text style={[s.ctaLabel, { fontFamily: FONT_SEMIBOLD }]}>Connect</Text>
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
          LOFTE only reads the metrics you grant. We never sell or share your data.
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

const s = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  base: {
    backgroundColor: '#050B14',
  },
  bgImage: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    width: '100%', height: '100%',
    opacity: 0.40,
  },
  darkWash: {
    backgroundColor: 'rgba(5,11,20,0.18)',
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
    shadowColor: '#F43F5E',
    shadowOpacity: 0.35,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
  },
  healthIcon: {
    width: 88,
    height: 88,
    borderRadius: 22,
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
