import { AppColors } from '@/constants/design-tokens';
import React from 'react';
import { View, StyleSheet, TouchableOpacity, Image, Modal } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import Svg, { Path } from 'react-native-svg';

interface NotificationModalProps {
  visible: boolean;
  onActivate: () => void;
  onDismiss: () => void;
}

function BellIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M13.0809 20.624C13.2888 20.2657 13.748 20.1437 14.1063 20.3516C14.4643 20.5594 14.5862 21.0178 14.3788 21.376C14.1371 21.7927 13.7894 22.1394 13.372 22.3799C12.9546 22.6202 12.4815 22.7461 11.9999 22.7461C11.5181 22.7461 11.0443 22.6203 10.6268 22.3799C10.2095 22.1394 9.86268 21.7926 9.62098 21.376C9.41349 21.0178 9.53539 20.5594 9.89344 20.3516C10.2517 20.1437 10.711 20.2657 10.9188 20.624C11.0287 20.8133 11.1862 20.9708 11.3759 21.0801C11.5656 21.1894 11.7809 21.2461 11.9999 21.2461C12.2189 21.2461 12.4342 21.1894 12.6239 21.0801C12.8136 20.9708 12.9711 20.8133 13.0809 20.624ZM11.9999 1.25C12.3821 1.25 12.7609 1.28454 13.1327 1.35156C13.5403 1.42506 13.8117 1.81502 13.7382 2.22266C13.6647 2.63019 13.2746 2.90049 12.8671 2.82715C12.5824 2.77582 12.2922 2.75 11.9999 2.75C10.6237 2.75 9.29343 3.33292 8.30457 4.3877C7.31418 5.44411 6.74989 6.88686 6.74989 8.40039C6.74983 12.2363 5.9787 14.7561 5.16786 16.3418C4.99016 16.6893 4.8107 16.9905 4.63856 17.25H19.3612C19.189 16.9905 19.0096 16.6884 18.8319 16.3408C18.2208 15.1456 17.6327 13.4199 17.3798 11C17.2804 10.0494 18.7815 9.99968 18.872 10.8545C19.108 13.102 19.6494 14.6443 20.1679 15.6582C20.5131 16.3333 20.8514 16.7812 21.0917 17.0518C21.212 17.1872 21.3082 17.279 21.369 17.333C21.3994 17.36 21.4211 17.3777 21.4325 17.3867L21.4413 17.3936C21.7023 17.5835 21.813 17.9194 21.7147 18.2275C21.6155 18.5384 21.3262 18.75 20.9999 18.75H2.99989C2.67365 18.75 2.38438 18.5392 2.28504 18.2285C2.18663 17.9203 2.2974 17.5836 2.55848 17.3936L2.56727 17.3867C2.57866 17.3777 2.60048 17.3599 2.63075 17.333C2.69155 17.2789 2.78791 17.1871 2.90809 17.0518C3.14838 16.7812 3.48673 16.3332 3.83192 15.6582C4.52099 14.3106 5.24983 12.0305 5.24989 8.40039C5.24989 6.51915 5.9498 4.70538 7.20985 3.36133C8.47143 2.01566 10.1935 1.25 11.9999 1.25ZM18.9999 1.25C21.0709 1.25003 22.7499 2.92895 22.7499 5C22.7499 7.07105 21.0709 8.74997 18.9999 8.75C16.9288 8.75 15.2499 7.07107 15.2499 5C15.2499 2.92893 16.9288 1.25 18.9999 1.25ZM18.9999 2.75C17.7572 2.75 16.7499 3.75736 16.7499 5C16.7499 6.24264 17.7572 7.25 18.9999 7.25C20.2425 7.24997 21.2499 6.24262 21.2499 5C21.2499 3.75738 20.2425 2.75003 18.9999 2.75Z"
        fill={AppColors.textOnLight}
      />
    </Svg>
  );
}

function SwitchOnIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path
        d="M17 6.25C20.1756 6.25 22.75 8.82436 22.75 12C22.75 15.1756 20.1756 17.75 17 17.75H7C3.82436 17.75 1.25 15.1756 1.25 12C1.25 8.82436 3.82436 6.25 7 6.25H17ZM7 7.75C4.65279 7.75 2.75 9.65279 2.75 12C2.75 14.3472 4.65279 16.25 7 16.25H17C19.3472 16.25 21.25 14.3472 21.25 12C21.25 9.65279 19.3472 7.75 17 7.75H7ZM17 10.25C17.9665 10.25 18.75 11.0335 18.75 12C18.75 12.9665 17.9665 13.75 17 13.75C16.0335 13.75 15.25 12.9665 15.25 12C15.25 11.0335 16.0335 10.25 17 10.25Z"
        fill={AppColors.textOnLight}
      />
    </Svg>
  );
}

export default function NotificationModal({ visible, onActivate, onDismiss }: NotificationModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Bell Icon */}
          <View style={styles.iconRow}>
            <View style={styles.iconContainer}>
              <BellIcon />
            </View>
          </View>

          {/* Text */}
          <View style={styles.textSection}>
            <ThemedText style={styles.title}>¡No te pierdas nada!</ThemedText>
            <ThemedText style={styles.subtitle}>
              Activa las notificaciones, no pierdas los avisos y mensajes que te interesan
            </ThemedText>
          </View>

          {/* Notification Preview - the image IS the full illustration */}
          <View style={styles.carouselSection}>
            <Image
              source={require('@/assets/images/notis-central.png')}
              style={styles.previewImage}
              resizeMode="contain"
            />
          </View>

          {/* CTA Button */}
          <TouchableOpacity style={styles.ctaButton} onPress={onActivate} activeOpacity={0.85}>
            <ThemedText style={styles.ctaText}>¡Activémoslas!</ThemedText>
            <SwitchOnIcon />
          </TouchableOpacity>

          {/* Dismiss Button */}
          <TouchableOpacity style={styles.dismissButton} onPress={onDismiss} activeOpacity={0.85}>
            <ThemedText style={styles.dismissText}>Nah, después</ThemedText>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: AppColors.surfaceSoft,
    borderRadius: 32,
    padding: 32,
    width: '95%',
    maxWidth: 380,
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.18,
    shadowRadius: 48,
    elevation: 12,
  },
  iconRow: {
    paddingBottom: 4,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  textSection: {
    gap: 4,
    paddingBottom: 12,
  },
  title: {
    fontSize: 20,
    fontFamily: 'DMSans_500Medium',
    color: AppColors.textOnLight,
    letterSpacing: -0.8,
    lineHeight: 28,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'DMSans_500Medium',
    color: AppColors.textOnLight,
    letterSpacing: -0.35,
    lineHeight: 21,
    opacity: 0.6,
  },
  carouselSection: {
    alignItems: 'center',
    marginBottom: 8,
  },
  previewImage: {
    width: '100%',
    height: 120,
  },
  ctaButton: {
    backgroundColor: AppColors.primary,
    height: 48,
    borderRadius: 360,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 16,
  },
  ctaText: {
    fontSize: 14,
    fontFamily: 'DMSans_700Bold',
    color: AppColors.textPrimary,
    letterSpacing: -0.35,
  },
  dismissButton: {
    backgroundColor: AppColors.textOnLight,
    height: 48,
    borderRadius: 360,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  dismissText: {
    fontSize: 14,
    fontFamily: 'DMSans_700Bold',
    color: AppColors.textPrimary,
    letterSpacing: -0.35,
  },
});
