import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
  padding?: number;
}

export function GlassCard({ children, style, padding = 20 }: Props) {
  return (
    <View style={[styles.outer, style]}>
      <BlurView intensity={24} tint="dark" style={StyleSheet.absoluteFill} />
      {/* Glass tint layer */}
      <View style={styles.tint} />
      {/* Top specular gradient line */}
      <View style={styles.specular} pointerEvents="none" />
      {/* Bottom vignette */}
      <View style={styles.vignette} pointerEvents="none" />
      <View style={[styles.content, { padding }]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
    // subtle shadow for depth
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  tint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  specular: {
    position: 'absolute',
    top: 0,
    left: 20,
    right: 20,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.22)',
    zIndex: 2,
  },
  vignette: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 16,
    backgroundColor: 'rgba(0,0,0,0.05)',
    zIndex: 2,
  },
  content: {
    position: 'relative',
    zIndex: 3,
  },
});
