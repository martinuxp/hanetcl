import { ThemedText } from '@/components/themed-text';
import { AppColors } from '@/constants/design-tokens';
import { Blobatar } from '@blobatar/react-native';
import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

// Colour comes from the seed; the tone is fixed so every blob is as bright as
// the others on the dark theme. Keep in step with functions/avatar.js.
const AVATAR_TONE = 0.5;

type Props = {
  /** The account's random blob seed (never its uid, email or name). */
  seed?: string | null;
  /** A photo wins over the blob when there is one. */
  photoUrl?: string | null;
  /** Shown only while neither a photo nor a seed is known. */
  fallback?: string;
  width: number;
  height?: number;
  radius?: number;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * A person's picture: their photo, or their blobatar (blobatar.dev) on the
 * avatar tile. Replaces the initials, which say little and look alike.
 */
export function HanetAvatar({ seed, photoUrl, fallback, width, height = width, radius = 12, accessibilityLabel, style }: Props) {
  const blobSize = Math.round(Math.min(width, height) * 0.88);
  return (
    <View
      accessible={!!accessibilityLabel}
      accessibilityLabel={accessibilityLabel}
      accessibilityElementsHidden={!accessibilityLabel}
      importantForAccessibility={accessibilityLabel ? 'yes' : 'no-hide-descendants'}
      style={[styles.tile, { width, height, borderRadius: radius }, style]}
    >
      {photoUrl ? (
        <Image source={{ uri: photoUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
      ) : seed ? (
        <Blobatar name={seed} size={blobSize} tone={AVATAR_TONE} background={false} normalize={false} />
      ) : fallback ? (
        <ThemedText style={[styles.fallback, { fontSize: Math.max(11, Math.round(width * 0.36)) }]}>{fallback}</ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderCurve: 'continuous',
    backgroundColor: AppColors.surfaceRaised,
  },
  fallback: {
    fontFamily: 'DMSans_600SemiBold',
    color: AppColors.textPrimary,
  },
});
