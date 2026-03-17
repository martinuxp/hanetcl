import React from 'react';
import { View, StyleSheet, TextInput, Platform } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';

export default function TopHeader() {
  return (
    <View style={styles.container}>
      <View style={styles.titleContainer}>
        <ThemedText style={styles.titleText}>HaNet Beta</ThemedText>
        <ThemedText style={styles.superscript}>1</ThemedText>
      </View>
      <View style={styles.searchContainer}>
        <IconSymbol name="magnifyingglass" size={20} color="rgba(226,225,218,0.5)" />
        <TextInput
          placeholder="Search..."
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
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 20,
    backgroundColor: '#292927',
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
    color: '#E2E1DA',
  },
  superscript: {
    fontSize: 12.9,
    fontWeight: 'bold',
    color: '#E2E1DA',
    lineHeight: 18,
    marginLeft: 2,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3E3E3A',
    borderRadius: 16,
    borderCurve: 'continuous',
    paddingHorizontal: 16,
    paddingVertical: 10,
    flex: 1,
    marginLeft: 20,
  },
  searchInput: {
    marginLeft: 8,
    color: '#E2E1DA',
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: -0.4,
    flex: 1,
    height: 24,
  },
});
