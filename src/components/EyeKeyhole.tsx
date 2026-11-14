import React from 'react';
import Svg, { Circle, Ellipse, G, Path } from 'react-native-svg';
import { theme } from '../theme';

/**
 * The UNLOCKED mark: an eye peering out through a keyhole. Same shapes as the
 * website's logo (escape-web/src/components/brand/EyeKeyhole.tsx).
 *
 * - `onDark` (default): a red keyhole for dark backgrounds.
 * - `onRed`: a black keyhole, for sitting on a red tile.
 */
export function EyeKeyhole({ size = 48, variant = 'onDark' }: { size?: number; variant?: 'onRed' | 'onDark' }) {
  const keyhole = variant === 'onRed' ? '#0a0000' : theme.colors.redPrimary;
  return (
    <Svg width={size} height={size} viewBox="9 9.5 30 30" accessibilityElementsHidden importantForAccessibility="no">
      <Circle cx="24" cy="19" r="9" fill={keyhole} />
      <Path d="M20 25 L16.5 39 H31.5 L28 25 Z" fill={keyhole} />
      <G>
        <Path d="M17 19 Q24 12.5 31 19 Q24 25.5 17 19 Z" fill={theme.colors.textPrimary} />
        <Circle cx="24" cy="19" r="2.8" fill={variant === 'onRed' ? theme.colors.redLight : '#8f0610'} />
        <Ellipse cx="24" cy="19" rx="0.9" ry="2.3" fill="#0a0000" />
      </G>
    </Svg>
  );
}
