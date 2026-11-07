import { AppColors } from '@/constants/design-tokens';
import React from 'react';
import { StyleSheet, View } from 'react-native';

// The scratch card's pink stripes as a plain background, for what points to
// a covered grade (the Home tile, the Notas banner). Views instead of Skia,
// so it costs nothing and draws the same on the web.

const STRIPE = '#D81D68';
const SIZE = 640;
const COUNT = 50;

export function Stripes() {
  return (
    <View style={styles.clip} pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <View style={styles.field}>
        {Array.from({ length: COUNT }, (_, index) => <View key={index} style={styles.stripe} />)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
    backgroundColor: AppColors.accent,
  },
  field: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: SIZE,
    height: SIZE,
    marginTop: -SIZE / 2,
    marginLeft: -SIZE / 2,
    flexDirection: 'row',
    gap: 9,
    transform: [{ rotate: '45deg' }],
  },
  stripe: {
    width: 5,
    height: SIZE,
    backgroundColor: STRIPE,
  },
});
