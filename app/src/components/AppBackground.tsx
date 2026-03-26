import React from 'react';
import { View, Image, StyleSheet } from 'react-native';

const bgImage = require('../../assets/bg.png');

interface Props {
  children: React.ReactNode;
}

/**
 * Full-screen background matching the Figma RootLayout:
 * - #050B14 base
 * - Green glow orb at 40% opacity (mix-blend: screen effect via the image itself being dark)
 * - Image covers the full screen so no abrupt cutoff
 */
export function AppBackground({ children }: Props) {
  return (
    <View style={styles.root}>
      {/* Glow image layer — behind everything */}
      <Image
        source={bgImage}
        style={styles.bgImage}
        resizeMode="cover"
      />
      {/* Children on top */}
      <View style={styles.content}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#050B14',
  },
  bgImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    opacity: 0.40,
  },
  content: {
    flex: 1,
  },
});
