import React, { useEffect } from 'react';
import { View, StyleSheet, TouchableWithoutFeedback } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

export type NotificationType = 'warning' | 'danger' | 'success';

export interface NotificationInfo {
  id: string;
  type: NotificationType;
  title: string;
  description: string;
}

interface NotificationCardProps {
  notification: NotificationInfo;
}

export function NotificationCard({ notification }: NotificationCardProps) {
  const getIconName = (type: NotificationType): keyof typeof Ionicons.glyphMap => {
    switch (type) {
      case 'warning': return 'alert-circle-outline';
      case 'danger': return 'alert-circle-outline'; 
      case 'success': return 'checkmark-circle-outline';
      default: return 'information-circle-outline';
    }
  };

  const targetTextColor = (notification.type === 'danger' || notification.type === 'success') ? '#E2E1DA' : '#292927';
  const targetDescColor = (notification.type === 'danger' || notification.type === 'success') ? 'rgba(226, 225, 218, 0.8)' : 'rgba(41, 41, 39, 0.8)';

  // We use key on this component to trigger unmount/remount for FadeIn/FadeOut animations 
  // from Reanimated when the currentIndex changes in the parent.
  return (
    <Animated.View 
        entering={FadeIn.duration(300)} 
        exiting={FadeOut.duration(200)} 
        style={styles.content}
    >
      <Ionicons 
        name={getIconName(notification.type)} 
        size={28} 
        color={targetTextColor} 
        style={styles.icon} 
      />
      <View style={styles.textContainer}>
        <ThemedText style={[styles.title, { color: targetTextColor }]}>{notification.title}</ThemedText>
        <ThemedText style={[styles.description, { color: targetDescColor }]}>{notification.description}</ThemedText>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  content: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '100%',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 28, // Adjusted down from 55 since height constraints are tighter and we don't need excessive empty overlapping space
  },
  icon: {
    marginRight: 12,
    marginTop: 2,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    lineHeight: 19.68,
    letterSpacing: -0.4,
    color: '#292927', // Default, overridden inline
    marginBottom: 4,
    fontFamily: 'DMSans_700Bold', 
  },
  description: {
    fontSize: 10,
    lineHeight: 15,
    letterSpacing: -0.2,
    color: 'rgba(41, 41, 39, 0.8)', // Default, overridden inline
    fontFamily: 'DMSans_500Medium',
  },
});
