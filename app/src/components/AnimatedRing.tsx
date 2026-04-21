import React, { useEffect, useRef } from 'react';
import { View, Animated, Easing, StyleSheet, Text, Platform } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
import { FONT_LIGHT } from '../utils/fonts';
const SYSTEM = FONT_LIGHT;

interface Props {
  size: number;
  strokeWidth: number;
  progress: number; // 0 to 1 (can exceed 1)
  color?: string;
  trackColor?: string;
  label: string;
  sublabel: string;
}

export function AnimatedRing({
  size,
  strokeWidth,
  progress,
  color = '#10B981',
  trackColor = 'rgba(255,255,255,0.06)',
  label,
  sublabel,
}: Props) {
  const animValue = useRef(new Animated.Value(0)).current;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  useEffect(() => {
    animValue.setValue(0);
    Animated.timing(animValue, {
      toValue: Math.min(progress, 1),
      duration: 1200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [progress]);

  const strokeDashoffset = animValue.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0],
  });

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        {/* Track */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress */}
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
        />
      </Svg>
      {/* Center text */}
      <View style={styles.center}>
        <Text style={[styles.label, { fontFamily: SYSTEM }]}>{label}</Text>
        <Text style={styles.sublabel}>{sublabel}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 36, fontWeight: '300', color: '#fff' },
  sublabel: { fontSize: 12, color: 'rgba(255,255,255,0.40)', marginTop: 2 },
});
