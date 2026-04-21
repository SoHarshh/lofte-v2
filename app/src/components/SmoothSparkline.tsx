import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, Easing } from 'react-native';
import Svg, {
  Path, Defs, LinearGradient, Stop, Circle as SvgCircle,
} from 'react-native-svg';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(SvgCircle);

interface Props {
  data: number[];
  width?: number;
  height?: number;
  stroke?: string;
  showDot?: boolean;
  gradientKey?: string;
  animate?: boolean; // false → render fully drawn with no path-draw/dot-pop
  alive?: boolean;   // true → end dot breathes continuously (live-signal feel)
}

// Smooth curved sparkline with gradient area fill, optional end dot, and
// path-draw entrance animation. Matches the Figma Make "Sparkline" component.
export function SmoothSparkline({
  data,
  width = 300,
  height = 80,
  stroke = '#EAFFF0',
  showDot = true,
  gradientKey = 'sl',
  animate = true,
  alive = false,
}: Props) {
  const progress = useRef(new Animated.Value(animate ? 0 : 1)).current;
  const dotScale = useRef(new Animated.Value(animate ? 0 : 1)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  const clean = data.filter((v) => typeof v === 'number' && !isNaN(v));
  const hasData = clean.length > 1;

  let dPath = '';
  let areaPath = '';
  let lastPoint = { x: 0, y: 0 };
  let pathLength = 0;

  if (hasData) {
    const min = Math.min(...clean);
    const max = Math.max(...clean);
    const range = max - min || 1;
    const step = width / (clean.length - 1);
    const topPad = 4;
    const bottomPad = 4;
    const innerH = height - topPad - bottomPad;

    const pts: Array<{ x: number; y: number }> = clean.map((v, i) => ({
      x: i * step,
      y: topPad + (innerH - ((v - min) / range) * innerH),
    }));

    // Smooth bezier through points (T command style from Figma port)
    pts.forEach((p, i) => {
      if (i === 0) {
        dPath += `M ${p.x} ${p.y}`;
        return;
      }
      const prev = pts[i - 1];
      const cx = (prev.x + p.x) / 2;
      const midY = (prev.y + p.y) / 2;
      dPath += ` Q ${cx} ${prev.y}, ${cx} ${midY} T ${p.x} ${p.y}`;
      pathLength += Math.hypot(p.x - prev.x, p.y - prev.y) * 1.12;
    });
    pathLength = Math.ceil(pathLength) + 8;
    lastPoint = pts[pts.length - 1];
    areaPath = `${dPath} L ${width} ${height} L 0 ${height} Z`;
  }

  useEffect(() => {
    if (!alive) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [alive]);

  useEffect(() => {
    if (!hasData) return;
    if (!animate) { progress.setValue(1); dotScale.setValue(1); return; }
    progress.setValue(0);
    dotScale.setValue(0);
    Animated.sequence([
      Animated.timing(progress, {
        toValue: 1,
        duration: 1000,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.spring(dotScale, {
        toValue: 1,
        friction: 6,
        tension: 90,
        useNativeDriver: false,
      }),
    ]).start();
  }, [hasData, dPath, animate]);

  if (!hasData) {
    return (
      <View style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11 }}>No data yet</Text>
      </View>
    );
  }

  const strokeDashoffset = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [pathLength, 0],
  });
  const areaOpacity = progress.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: [0, 0.15, 1],
  });
  const dotR = dotScale.interpolate({ inputRange: [0, 1], outputRange: [0, 2.8] });
  // When `alive` is on, the halo breathes 6.5 → 10px and fades 0.25 → 0.08
  const haloR = alive
    ? pulse.interpolate({ inputRange: [0, 1], outputRange: [6.5, 10] })
    : dotScale.interpolate({ inputRange: [0, 1], outputRange: [0, 6.5] });
  const haloOpacity = alive
    ? pulse.interpolate({ inputRange: [0, 1], outputRange: [0.28, 0.08] })
    : new Animated.Value(0.25);

  const gid = `${gradientKey}-${width}-${height}`;

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={stroke} stopOpacity="0.28" />
          <Stop offset="1" stopColor={stroke} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      {/* Area fill fades in together with the stroke */}
      <AnimatedPath d={areaPath} fill={`url(#${gid})`} opacity={areaOpacity as any} />
      {/* Main stroke */}
      <AnimatedPath
        d={dPath}
        stroke={stroke}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        strokeDasharray={`${pathLength}`}
        strokeDashoffset={strokeDashoffset as any}
      />
      {showDot && (
        <>
          <AnimatedCircle cx={lastPoint.x} cy={lastPoint.y} r={haloR as any} fill={stroke} opacity={haloOpacity as any} />
          <AnimatedCircle cx={lastPoint.x} cy={lastPoint.y} r={dotR as any} fill={stroke} />
        </>
      )}
    </Svg>
  );
}
