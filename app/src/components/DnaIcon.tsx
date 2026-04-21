import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';

interface Props {
  size?: number;
  color?: string;
}

// DNA emoji — written as codepoint so there is zero risk of encoding weirdness
// in the source file dropping the surrogate pair.
const DNA_EMOJI = String.fromCodePoint(0x1F9EC);

// Renders the 🧬 emoji as a monochrome silhouette by using it as an alpha mask
// over a solid color fill. `fontFamily: AppleColorEmoji` is forced on iOS so
// the system always picks the emoji glyph (otherwise some Text environments
// fall back to a plain font, producing the "tofu" missing-glyph box).
export function DnaIcon({ size = 22, color = '#FFFFFF' }: Props) {
  const fontSize = Math.round(size * 0.92);
  return (
    <MaskedView
      style={{ width: size, height: size }}
      maskElement={
        <View style={styles.maskWrap}>
          <Text
            allowFontScaling={false}
            style={[
              styles.maskText,
              {
                fontSize,
                lineHeight: Platform.OS === 'ios' ? size : fontSize + 2,
              },
              Platform.OS === 'ios' && { fontFamily: 'AppleColorEmoji' },
            ]}
          >
            {DNA_EMOJI}
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
  maskText: {
    textAlign: 'center',
    includeFontPadding: false,
    color: '#000',
  },
});
