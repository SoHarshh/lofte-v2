import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';

// Glass card tuned for the app's existing background. Flat rgba stack —
// cheap to render, no per-card SVG, no blur. Hairline top highlight for
// the subtle bevel, 1px inset border.
interface Props {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  padding?: number;
  radius?: number;
}

export function HealthCard({ children, style, padding = 20, radius = 24 }: Props) {
  return (
    <View
      style={[
        {
          borderRadius: radius,
          backgroundColor: 'rgba(255,255,255,0.045)',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.08)',
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {/* Top hairline highlight — fakes the CSS inset box-shadow bevel */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0, left: 0, right: 0,
          height: StyleSheet.hairlineWidth,
          backgroundColor: 'rgba(255,255,255,0.12)',
        }}
      />
      <View style={{ padding }}>{children}</View>
    </View>
  );
}
