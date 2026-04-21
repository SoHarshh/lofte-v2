import React from 'react';
import Svg, { Path, Circle } from 'react-native-svg';

interface Props {
  size?: number;
  color?: string;
}

export function DnaIcon({ size = 22, color = '#FFFFFF' }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Double helix — two curving strands */}
      <Path
        d="M6 3 C 6 7, 18 7, 18 12 C 18 17, 6 17, 6 21"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d="M18 3 C 18 7, 6 7, 6 12 C 6 17, 18 17, 18 21"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        fill="none"
      />
      {/* Rungs connecting the strands */}
      <Path d="M7.5 5 L 16.5 5" stroke={color} strokeWidth={1.3} strokeLinecap="round" />
      <Path d="M8 8 L 16 8" stroke={color} strokeWidth={1.3} strokeLinecap="round" />
      <Path d="M8 16 L 16 16" stroke={color} strokeWidth={1.3} strokeLinecap="round" />
      <Path d="M7.5 19 L 16.5 19" stroke={color} strokeWidth={1.3} strokeLinecap="round" />
      {/* Subtle emphasis dots at the crossover */}
      <Circle cx={12} cy={12} r={0.9} fill={color} />
    </Svg>
  );
}
