import { AppColors } from '@/constants/design-tokens';
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { CustomIcon } from '@/components/ui/custom-icon';
import { TouchableRipple } from 'react-native-paper';

export default function NotificationSection() {
  return (
    <View style={styles.container}>
      {/* Summary Bar */}
      <View style={styles.summaryBar}>
        <CustomIcon name="notification" size={24} color={AppColors.accent} />
        <ThemedText style={styles.summaryText}>Tienes 3 notificaciones</ThemedText>
      </View>

      {/* Notification Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatarPlaceholder}>
              <ThemedText style={styles.avatarText}>UA</ThemedText>
            </View>
            <ThemedText style={styles.senderName}>Pagos UA Tco</ThemedText>
            {/* Note: In a real environment, you'd add a chevron right icon here, using standard text for now as it's not a major issue */}
            <ThemedText style={{ color: AppColors.primary }}>{'>'}</ThemedText>
          </View>
          <ThemedText style={styles.timeText}>25m</ThemedText>
        </View>

        <ThemedText style={styles.messageText}>
          Hola, Martín Ávila (@aviladalenconmartin).{'\n'}
          Esta es una notificación automática de HaNet y UA Temuco para recordarte que mantengas tus pagos al día. Puedes revisarlos desde el botón “Pagos” en la pantalla principal. Gracias.
        </ThemedText>

        <TouchableRipple
          style={styles.deleteButton}
          onPress={() => { }}
          rippleColor="rgba(255, 255, 255, 0.2)"
        >
          <ThemedText style={styles.deleteButtonText}>Eliminar notificación</ThemedText>
        </TouchableRipple>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    marginBottom: 80, // Space for Floating Alert and Bottom Tab Bar
  },
  summaryBar: {
    backgroundColor: AppColors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 24,
    borderCurve: 'continuous',
    marginBottom: 16,
    gap: 12,
  },
  summaryText: {
    color: AppColors.textSecondary,
    fontSize: 16,
    lineHeight: 19.68,
    letterSpacing: -0.4,
    fontFamily: 'DMSans_700Bold',
  },
  card: {
    backgroundColor: AppColors.surface,
    borderRadius: 32,
    borderCurve: 'continuous',
    padding: 24,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderCurve: 'continuous',
    backgroundColor: AppColors.textPrimary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#E02B37',
    fontFamily: 'DMSans_700Bold',
    fontSize: 14,
  },
  notificationTitle: {
    color: AppColors.textSecondary,
    fontSize: 16,
    lineHeight: 19.68,
    letterSpacing: -0.4,
    fontFamily: 'DMSans_700Bold',
    marginBottom: 4,
  },
  senderName: {
    color: AppColors.textSecondary,
    fontSize: 18,
    lineHeight: 25.2,
    letterSpacing: -0.63,
    fontFamily: 'DMSans_500Medium',
  },
  timeText: {
    color: AppColors.textSecondary,
    opacity: 0.7,
    fontSize: 14,
    fontFamily: 'DMSans_500Medium',
    lineHeight: 21,
    letterSpacing: -0.35,
  },
  messageText: {
    color: AppColors.textSecondary,
    fontSize: 14,
    fontFamily: 'DMSans_400Regular',
    lineHeight: 21,
    letterSpacing: -0.35,
    opacity: 0.9,
    marginBottom: 24,
  },
  deleteButton: {
    backgroundColor: AppColors.accent,
    borderRadius: 30,
    borderCurve: 'continuous',
    paddingVertical: 12,
    alignItems: 'center',
  },
  deleteButtonText: {
    color: AppColors.textOnLight,
    fontSize: 14,
    fontFamily: 'DMSans_600SemiBold',
    lineHeight: 21,
    letterSpacing: -0.35,
  },
});
