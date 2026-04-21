import React, { useEffect, useRef } from 'react';
import { View, Animated, Easing } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface Props {
  value: number; // 0 to 1
  size?: number;
  stroke?: number;
  color?: string;
  trackColor?: string;
  children?: React.ReactNode;
  gradientKey?: string;
  animate?: boolean; // false → render at final value with no sweep
}

// Activity-ring style: sweeping stroke with a soft halo shadow. Matches the
// Figma "ProgressRing" — gradient of `color` at 90% → 50% opacity, tiny glow.
export function RingProgress({
  value,
  size = 96,
  stroke = 7,
  color = '#FFFFFF',
  trackColor = 'rgba(255,255,255,0.08)',
  children,
  gradientKey = 'rp',
  animate = true,
}: Props) {
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, value));
  const anim = useRef(new Animated.Value(animate ? 0 : clamped)).current;

  useEffect(() => {
    if (!animate) { anim.setValue(clamped); return; }
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: clamped,
      duration: 1100,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [clamped, animate]);

  const strokeDashoffset = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0],
  });

  const gid = `${gradientKey}-${size}`;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Defs>
          <LinearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity="0.92" />
            <Stop offset="1" stopColor={color} stopOpacity="0.5" />
          </LinearGradient>
        </Defs>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={trackColor}
          strokeWidth={stroke}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={`url(#${gid})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset as any}
        />
      </Svg>
      {children != null && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {children}
        </View>
      )}
    </View>
  );
}
