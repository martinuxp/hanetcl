import { AppColors } from '@/constants/design-tokens';
import React from 'react';
import { View, StyleSheet, TextInput } from 'react-native';
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
      <View style={styles.searchContainer}>
        <IconSymbol name="magnifyingglass" size={20} color="rgba(226,225,218,0.5)" />
        <TextInput
          accessibilityLabel="Buscar en HaNet"
          placeholder="Buscar…"
          placeholderTextColor="rgba(226,225,218,0.5)"
          style={styles.searchInput}
        />
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
    fontSize: 20,
    lineHeight: 28,
    fontFamily: 'DMSans_700Bold',
    letterSpacing: -0.8,
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
    color: AppColors.textSecondary,
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: -0.4,
    flex: 1,
    height: 24,
  },
});
