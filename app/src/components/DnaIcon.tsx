import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';

interface Props {
  size?: number;
  color?: string;
}

// Renders the DNA emoji 🧬 as a monochrome shape by using it as a mask over a
// solid-color fill. The iOS colored glyph is hidden — only its silhouette shows
// in whatever `color` is passed.
export function DnaIcon({ size = 22, color = '#FFFFFF' }: Props) {
  const fontSize = Math.round(size * 0.95);
  return (
    <MaskedView
      style={{ width: size, height: size }}
      maskElement={
        <View style={styles.maskWrap}>
          <Text
            style={{
              fontSize,
              lineHeight: Platform.OS === 'ios' ? size : fontSize + 2,
              textAlign: 'center',
              includeFontPadding: false,
            }}
          >
            🧬
          </Text>
        </View>
      }
    >
      <View style={{ flex: 1, backgroundColor: color }} />
    </MaskedView>
  );
}

const styles = StyleSheet.create({
  maskWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
});
