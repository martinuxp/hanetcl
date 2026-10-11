import { AppColors } from '@/constants/design-tokens';
import React from 'react';
import Svg, { Path } from 'react-native-svg';

/** The HaNet mark (the "H" arrow) in the accent colour. */
export function HanetMark({ height = 29, color = AppColors.accent }: { height?: number; color?: string }) {
  const width = (height * 19.31) / 28.96;
  return (
    <Svg width={width} height={height} viewBox="0 0 19.31 28.96" fill="none">
      <Path d="M0 0L6.87688 6.43605V13.1403L10.3153 13.5425V8.98366L19.3082 9.78816V19.1741L10.3153 19.9786V15.4197L6.87688 15.822V22.5262L0 28.9622V0Z" fill={color} />
    </Svg>
  );
}
