import { ThemedText } from '@/components/themed-text';
import { AppColors, AppRadii, AppSpacing, AppType } from '@/constants/design-tokens';
import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, View } from 'react-native';

type Props = {
  /** What the banner says: the institution's name, or a phrase around it. */
  title: string;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  height?: number;
};

/**
 * The institution's identity: its banner photo with the shield and name over
 * it. Both images are set by the HaNet team in the HNT panel; without a
 * banner the card is plain, and without a shield only the name shows.
 */
export default function InstitutionBanner({ title, logoUrl, bannerUrl, height = 105 }: Props) {
  return (
    <View style={[styles.card, { height }]} accessible accessibilityRole="header" accessibilityLabel={title.replace(/\n/g, ' ')}>
      {!!bannerUrl && (
        <>
          <Image source={{ uri: bannerUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
          {/* Keeps the name legible over any photo. */}
          <View style={styles.shade} />
        </>
      )}
      <View style={styles.content}>
        {!!logoUrl && <Image source={{ uri: logoUrl }} style={styles.logo} contentFit="contain" transition={200} />}
        <ThemedText style={[styles.title, !!bannerUrl && styles.titleOverPhoto]} numberOfLines={2}>{title}</ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    overflow: 'hidden',
    justifyContent: 'center',
    borderRadius: AppRadii.xl,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  shade: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: AppSpacing.md,
    paddingHorizontal: AppSpacing.xxl,
  },
  logo: {
    width: 56,
    height: 67,
  },
  title: {
    ...AppType.title2,
    flexShrink: 1,
    color: AppColors.textSecondary,
  },
  titleOverPhoto: {
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 5,
  },
});
