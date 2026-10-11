import { AppColors, AppType } from '@/constants/design-tokens';
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';

export default function TopHeader() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <View style={styles.titleContainer}>
        <ThemedText style={styles.titleText}>HaNet Beta</ThemedText>
        <ThemedText style={styles.superscript}>1</ThemedText>
      </View>
      {/* Search does not exist yet; the field says so instead of taking input. */}
      <View style={styles.searchContainer} accessible accessibilityLabel="Buscar en HaNet, próximamente" accessibilityState={{ disabled: true }}>
        <IconSymbol name="magnifyingglass" size={20} color="rgba(226,225,218,0.5)" />
        <ThemedText style={styles.searchInput} numberOfLines={1}>Buscar · Próximamente</ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: AppColors.textOnLight,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  titleText: {
    ...AppType.title3,
    color: AppColors.textSecondary,
  },
  superscript: {
    fontSize: 12.9,
    fontWeight: 'bold',
    color: AppColors.textSecondary,
    lineHeight: 18,
    marginLeft: 2,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppColors.surface,
    borderRadius: 16,
    borderCurve: 'continuous',
    paddingHorizontal: 16,
    paddingVertical: 10,
    flex: 1,
    marginLeft: 20,
  },
  searchInput: {
    marginLeft: 8,
    color: 'rgba(226,225,218,0.5)',
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: -0.4,
    flex: 1,
  },
});
