import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, Platform, StyleSheet, Pressable, Animated, Easing,
} from 'react-native';
import { FONT_LIGHT } from '../utils/fonts';

type Point = { label: string; value: number };

interface Props {
  data: Point[];
  unit: string;
  colorActive?: string;
  colorIdle?: string;
  compact?: boolean; // shorter bars + smaller header for tight layouts
}

const SYSTEM = FONT_LIGHT;

// Bar chart with H/L markers on max/min and tap-to-select. Matches the Figma
// BarChart drill-down. Each bar grows in on mount and on selection swap.
export function MetricBarChart({
  data, unit,
  colorActive = 'rgba(255,255,255,0.95)',
  colorIdle = 'rgba(255,255,255,0.18)',
  compact = false,
}: Props) {
  const barsMaxHeight = compact ? 90 : 160;
  const bigNumSize = compact ? 28 : 40;
  const [selected, setSelected] = useState<number>(data.length - 1);
  const values = data.map((d) => d.value);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const maxIdx = values.indexOf(max);
  const minIdx = values.indexOf(min);

  const sel = data[selected];
  const avg = values.reduce((a, b) => a + b, 0) / values.length;

  return (
    <View>
      {/* Header: selected label + value + max/min summary */}
      <View style={[s.header, compact && { marginBottom: 10 }]}>
        <View>
          <Text style={s.caption}>{sel ? sel.label : 'Average'}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 4 }}>
            <Text style={[s.bigNum, { fontFamily: SYSTEM, fontSize: bigNumSize }]}>
              {sel ? formatNum(sel.value) : avg.toFixed(1)}
            </Text>
            <Text style={s.unit}> {unit}</Text>
          </View>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={s.summary}>Max <Text style={{ color: '#fff' }}>{formatNum(max)}</Text></Text>
          <Text style={[s.summary, { marginTop: 2 }]}>Min <Text style={{ color: '#fff' }}>{formatNum(min)}</Text></Text>
        </View>
      </View>

      {/* Bars */}
      <View style={[s.barsRow, { height: barsMaxHeight + 16 }]}>
        {data.map((d, i) => {
          const pct = ((d.value - min) / range) * 0.75 + 0.22;
          return (
            <Bar
              key={`${i}-${d.label}-${d.value}`}
              pct={pct}
              isSelected={selected === i}
              isMax={i === maxIdx}
              isMin={i === minIdx}
              showMarker={(i === maxIdx || i === minIdx) && selected !== i}
              colorActive={colorActive}
              colorIdle={colorIdle}
              onPress={() => setSelected(i)}
              index={i}
              maxHeight={barsMaxHeight}
            />
          );
        })}
      </View>

      {/* Day labels */}
      <View style={s.labelRow}>
        {data.map((d, i) => (
          <Text
            key={i}
            style={[
              s.dayLabel,
              i === selected && { color: 'rgba(255,255,255,0.92)' },
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

function Bar({
  pct, isSelected, isMax, isMin, showMarker, colorActive, colorIdle, onPress, index, maxHeight,
}: {
  pct: number; isSelected: boolean; isMax: boolean; isMin: boolean;
  showMarker: boolean; colorActive: string; colorIdle: string;
  onPress: () => void; index: number; maxHeight: number;
}) {
  const scale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    scale.setValue(0);
    Animated.timing(scale, {
      toValue: 1,
      duration: 520,
      delay: index * 22,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, []);

  const barHeight = Math.max(4, Math.round(maxHeight * pct));

  return (
    <Pressable style={s.barWrap} onPress={onPress}>
      {showMarker && (
        <Text style={s.marker}>{isMax ? 'H' : 'L'}</Text>
      )}
      <Animated.View
        style={{
          width: '62%',
          height: barHeight,
          borderTopLeftRadius: 6,
          borderTopRightRadius: 6,
          backgroundColor: isSelected ? colorActive : colorIdle,
          transform: [{ scaleY: scale }],
          transformOrigin: 'bottom',
        }}
      />
    </Pressable>
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
    marginBottom: 18,
  },
  caption: {
    fontSize: 10, color: 'rgba(255,255,255,0.40)',
    letterSpacing: 1.6, textTransform: 'uppercase',
  },
  bigNum: {
    fontSize: 40,
    fontWeight: '300',
    color: '#fff',
    letterSpacing: -0.8,
  },
  unit: { fontSize: 13, color: 'rgba(255,255,255,0.50)' },
  summary: { fontSize: 11, color: 'rgba(255,255,255,0.50)' },

  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  barWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: '100%',
  },
  marker: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.38)',
    marginBottom: 4,
  },

  labelRow: { flexDirection: 'row', marginTop: 8 },
  dayLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 9,
    color: 'rgba(255,255,255,0.40)',
  },
});
