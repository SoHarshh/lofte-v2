import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Animated, Easing, LayoutChangeEvent,
} from 'react-native';
import Svg, {
  Path, Defs, LinearGradient, Stop, Line,
  Circle as SvgCircle, G, Rect as SvgRect,
} from 'react-native-svg';
import { FONT_LIGHT, FONT_MEDIUM, FONT_SEMIBOLD } from '../utils/fonts';

type Point = { label: string; value: number };

interface Props {
  data: Point[];
  unit: string;
  stroke?: string;
  gradientKey?: string;
}

const AnimatedPath = Animated.createAnimatedComponent(Path);

const CHART_H = 186;
const PAD_TOP = 28;   // room for the inline value badge above the dot
const PAD_BOTTOM = 10;
const PAD_SIDES = 6;

// Smooth line chart with tap/drag scrubbing, inline value badge, and max/min
// summary header. Used for metrics that represent continuous biosignals
// (HRV, resting heart rate).
export function MetricLineChart({
  data, unit,
  stroke = '#EAFFF0',
  gradientKey = 'ln',
}: Props) {
  const [width, setWidth] = useState(0);
  const [selectedIdx, setSelectedIdx] = useState<number>(data.length - 1);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Path draw-in + area fade whenever the dataset swaps
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: 900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    // Snap selection back to the last point when data changes
    setSelectedIdx(data.length - 1);
  }, [data]);

  const values = data.map((d) => d.value);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const maxIdx = values.indexOf(max);
  const minIdx = values.indexOf(min);

  // Layout math
  const innerW = Math.max(0, width - PAD_SIDES * 2);
  const innerH = CHART_H - PAD_TOP - PAD_BOTTOM;
  const step = data.length > 1 ? innerW / (data.length - 1) : 0;

  const pts = useMemo(() => data.map((d, i) => {
    const x = PAD_SIDES + i * step;
    const y = PAD_TOP + (1 - (d.value - min) / range) * innerH;
    return { x, y };
  }), [data, step, width, min, range]);

  // Build the smooth-curve path (quadratic bezier via Q ... T)
  const { linePath, areaPath, pathLen } = useMemo(() => {
    if (pts.length < 2 || width === 0) {
      return { linePath: '', areaPath: '', pathLen: 0 };
    }
    let d = `M ${pts[0].x} ${pts[0].y}`;
    let len = 0;
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1];
      const curr = pts[i];
      const cx = (prev.x + curr.x) / 2;
      const midY = (prev.y + curr.y) / 2;
      d += ` Q ${cx} ${prev.y}, ${cx} ${midY} T ${curr.x} ${curr.y}`;
      len += Math.hypot(curr.x - prev.x, curr.y - prev.y) * 1.15;
    }
    const bottomY = CHART_H - PAD_BOTTOM;
    const area = `${d} L ${pts[pts.length - 1].x} ${bottomY} L ${pts[0].x} ${bottomY} Z`;
    return { linePath: d, areaPath: area, pathLen: Math.ceil(len) + 8 };
  }, [pts, width]);

  // Touch handling — tap or drag the chart to scrub
  const hitLayerProps = {
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    onResponderGrant: (e: any) => selectAt(e.nativeEvent.locationX),
    onResponderMove: (e: any) => selectAt(e.nativeEvent.locationX),
    onResponderRelease: () => {},
    onResponderTerminationRequest: () => false,
  };

  const selectAt = (x: number) => {
    if (step === 0) return;
    const relX = x - PAD_SIDES;
    const idx = Math.round(relX / step);
    const clamped = Math.max(0, Math.min(data.length - 1, idx));
    if (clamped !== selectedIdx) setSelectedIdx(clamped);
  };

  const sel = data[selectedIdx];
  const selPt = pts[selectedIdx];

  // Badge positioning: keep it onscreen horizontally, above the dot vertically
  const badgeW = 58;
  const badgeH = 22;
  const badgeX = Math.max(
    PAD_SIDES,
    Math.min(width - PAD_SIDES - badgeW, (selPt?.x ?? 0) - badgeW / 2)
  );
  const badgeY = Math.max(4, (selPt?.y ?? PAD_TOP) - badgeH - 10);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && w !== width) setWidth(w);
  };

  const strokeDashoffset = progress.interpolate({
    inputRange: [0, 1], outputRange: [pathLen || 400, 0],
  });
  const areaOpacity = progress.interpolate({
    inputRange: [0, 0.5, 1], outputRange: [0, 0.25, 1],
  });

  return (
    <View>
      {/* Header — selected label + big value + max/min */}
      <View style={s.header}>
        <View>
          <Text style={s.caption}>{sel ? sel.label : 'Average'}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 4 }}>
            <Text style={[s.bigNum, { fontFamily: FONT_LIGHT }]}>
              {sel ? formatNum(sel.value) : ''}
            </Text>
            <Text style={s.unit}> {unit}</Text>
          </View>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={s.summary}>Max <Text style={{ color: '#fff' }}>{formatNum(max)}</Text></Text>
          <Text style={[s.summary, { marginTop: 2 }]}>Min <Text style={{ color: '#fff' }}>{formatNum(min)}</Text></Text>
        </View>
      </View>

      {/* Chart */}
      <View style={[s.chartWrap]} onLayout={onLayout} {...hitLayerProps}>
        {width > 0 && linePath ? (
          <Svg width={width} height={CHART_H}>
            <Defs>
              <LinearGradient id={gradientKey} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={stroke} stopOpacity="0.28" />
                <Stop offset="1" stopColor={stroke} stopOpacity="0" />
              </LinearGradient>
            </Defs>

            {/* Area fill */}
            <AnimatedPath d={areaPath} fill={`url(#${gradientKey})`} opacity={areaOpacity as any} />

            {/* Main line */}
            <AnimatedPath
              d={linePath}
              stroke={stroke}
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              strokeDasharray={`${pathLen}`}
              strokeDashoffset={strokeDashoffset as any}
            />

            {/* Max / Min markers (subtle) */}
            {maxIdx !== selectedIdx && (
              <G>
                <SvgCircle cx={pts[maxIdx].x} cy={pts[maxIdx].y} r={2.2} fill="rgba(255,255,255,0.55)" />
              </G>
            )}
            {minIdx !== selectedIdx && minIdx !== maxIdx && (
              <G>
                <SvgCircle cx={pts[minIdx].x} cy={pts[minIdx].y} r={2.2} fill="rgba(255,255,255,0.35)" />
              </G>
            )}

            {/* Selected guide line */}
            {selPt && (
              <Line
                x1={selPt.x} y1={PAD_TOP}
                x2={selPt.x} y2={CHART_H - PAD_BOTTOM}
                stroke="rgba(255,255,255,0.12)"
                strokeWidth={1}
                strokeDasharray="3,4"
              />
            )}

            {/* Selected dot — halo + center */}
            {selPt && (
              <>
                <SvgCircle cx={selPt.x} cy={selPt.y} r={9} fill={stroke} opacity={0.18} />
                <SvgCircle cx={selPt.x} cy={selPt.y} r={4} fill={stroke} />
                <SvgCircle cx={selPt.x} cy={selPt.y} r={2} fill="#050B14" />
              </>
            )}

            {/* Inline value badge above selected dot */}
            {selPt && (
              <G>
                <SvgRect
                  x={badgeX}
                  y={badgeY}
                  width={badgeW}
                  height={badgeH}
                  rx={badgeH / 2}
                  ry={badgeH / 2}
                  fill="rgba(255,255,255,0.95)"
                />
              </G>
            )}
          </Svg>
        ) : (
          <View style={{ height: CHART_H }} />
        )}

        {/* Overlay the badge text in an RN <Text> so it uses Inter, not SVG text */}
        {selPt && width > 0 && (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: badgeX,
              top: badgeY,
              width: badgeW,
              height: badgeH,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={[
                s.badgeText,
                { fontFamily: FONT_SEMIBOLD, fontVariant: ['tabular-nums'] },
              ]}
              numberOfLines={1}
            >
              {formatNum(sel.value)} {unit}
            </Text>
          </View>
        )}
      </View>

      {/* X-axis labels */}
      <View style={s.labelRow}>
        {data.map((d, i) => (
          <Text
            key={i}
            style={[
              s.dayLabel,
              { fontFamily: FONT_MEDIUM },
              i === selectedIdx && { color: 'rgba(255,255,255,0.92)' },
            ]}
            numberOfLines={1}
          >
            {d.label.split(' ')[0]}
          </Text>
        ))}
      </View>
    </View>
  );
}

function formatNum(v: number): string {
  if (v >= 100_000) return `${Math.round(v / 1000)}k`;
  if (v >= 10_000) return `${(v / 1000).toFixed(1)}k`;
  if (v % 1 === 0) return String(v);
  return v.toFixed(1);
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 14,
  },
  caption: {
    fontSize: 10, color: 'rgba(255,255,255,0.40)',
    letterSpacing: 1.6, textTransform: 'uppercase',
  },
  bigNum: {
    fontSize: 40, fontWeight: '300', color: '#fff',
    letterSpacing: -0.8, fontVariant: ['tabular-nums'],
  },
  unit: { fontSize: 13, color: 'rgba(255,255,255,0.50)' },
  summary: { fontSize: 11, color: 'rgba(255,255,255,0.50)' },

  chartWrap: { height: CHART_H, width: '100%' },

  badgeText: {
    fontSize: 11, color: '#050B14', fontWeight: '600',
  },

  labelRow: { flexDirection: 'row', marginTop: 8 },
  dayLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 9,
    color: 'rgba(255,255,255,0.40)',
  },
});
