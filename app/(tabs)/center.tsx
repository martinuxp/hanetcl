import React from 'react';
import { View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { t } from '@/i18n';

export default function CenterScreen() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <ThemedText>{t('center.centerActionIntercepted')}</ThemedText>
    </View>
  );
}
