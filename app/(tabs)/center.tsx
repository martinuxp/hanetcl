import React from 'react';
import { View } from 'react-native';
import { ThemedText } from '@/components/themed-text';

export default function CenterScreen() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <ThemedText>Center Action (Intercepted)</ThemedText>
    </View>
  );
}
