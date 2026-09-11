import { AppColors } from '@/constants/design-tokens';
import React, { useState } from 'react';
import { StyleSheet, View, ScrollView, Platform, Linking, Alert, Modal, TouchableOpacity } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { TouchableRipple } from 'react-native-paper';
import { ThemedText } from '@/components/themed-text';
import { CustomIcon } from '@/components/ui/custom-icon';
import { useSession } from '@/services/auth-service';
import { db } from '@/services/firebase';
import { doc, getDoc } from 'firebase/firestore';

export default function EventInfoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useSession();

  const [icalModalVisible, setIcalModalVisible] = useState(false);
  const [courseIdState, setCourseIdState] = useState<string | null>(null);

  const handleOpenIcalMenu = async () => {
    if (!user) {
      Alert.alert('Inicia sesión', 'Necesitas una sesión activa para consultar la fuente iCal de tu curso.');
      return;
    }
    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      const courseId = userDoc.data()?.courseId;
      if (!courseId) {
        Alert.alert('Error', 'No tienes un curso vinculado a tu RUT.');
        return;
      }
      setCourseIdState(courseId);
      setIcalModalVisible(true);
    } catch (e: any) {
      console.error(e);
    }
  };

  const copyIcalToClipboard = async () => {
    if (!courseIdState) return;
    const httpsUrl = `https://us-central1-hanet-edu.cloudfunctions.net/icalFeed?courseId=${courseIdState}`;
    await Clipboard.setStringAsync(httpsUrl);
    setIcalModalVisible(false);
    setTimeout(() => {
      Alert.alert('Copiado', 'Enlace de suscripción iCal copiado al portapapeles.');
    }, 500);
  };

  const handleSubscribe = async () => {
    if (!user) {
      Alert.alert('Inicia sesión', 'Necesitas una sesión activa para suscribirte al calendario de tu curso.');
      return;
    }
    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      const courseId = userDoc.data()?.courseId;
      if (!courseId) {
        Alert.alert('Error', 'No tienes un curso vinculado a tu RUT.');
        return;
      }

      const httpsUrl = `https://us-central1-hanet-edu.cloudfunctions.net/icalFeed?courseId=${courseId}`;

      if (Platform.OS === 'android') {
        const googleCalendarUrl = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(httpsUrl)}`;
        await Linking.openURL(googleCalendarUrl);
      } else {
        const webcalUrl = `webcal://us-central1-hanet-edu.cloudfunctions.net/icalFeed?courseId=${courseId}`;
        await Linking.openURL(webcalUrl);
      }
    } catch (e: any) {
      console.error(e);
      Alert.alert('Error', 'Hubo un error al abrir el calendario.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={{ flex: 1, width: '100%' }}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustsScrollIndicatorInsets={false}
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 16,
          paddingTop: 40,
          paddingBottom: 150
        }}
      >
        {/* Main Title */}
        <ThemedText style={styles.mainTitle}>
          Evaluación | Lenguaje y Literatura | 2do K
        </ThemedText>

        {/* Content Card */}
        <View style={styles.card}>
          <View style={styles.infoRow}>
            <View style={styles.iconContainer}>
              <CustomIcon name="calendar" size={20} color={AppColors.textSecondary} />
            </View>
            <View style={styles.infoTextContainer}>
              <ThemedText style={styles.infoLabel}>Fecha</ThemedText>
              <ThemedText style={styles.infoValue}>Hoy, 12 de Marzo, 2026</ThemedText>
            </View>
          </View>

          <View style={styles.infoRow}>
            <View style={styles.iconContainer}>
              <CustomIcon name="clock" size={20} color={AppColors.textSecondary} />
            </View>
            <View style={styles.infoTextContainer}>
              <ThemedText style={styles.infoLabel}>Duración</ThemedText>
              <ThemedText style={styles.infoValue}>09:00 - 10:30 (1 hora y 30 minutos)</ThemedText>
            </View>
          </View>

          <View style={styles.infoRow}>
            <View style={styles.iconContainer}>
              <CustomIcon name="map-pin" size={20} color={AppColors.textSecondary} />
            </View>
            <View style={styles.infoTextContainer}>
              <ThemedText style={styles.infoLabel}>Ubicación</ThemedText>
              <ThemedText style={styles.infoValue}>Sala 304-B (P3)</ThemedText>
            </View>
          </View>

          <View style={styles.infoRow}>
            <View style={styles.iconContainer}>
              <CustomIcon name="book" size={20} color={AppColors.textSecondary} />
            </View>
            <View style={styles.infoTextContainer}>
              <ThemedText style={styles.infoLabel}>Tipo de evaluación</ThemedText>
              <ThemedText style={styles.infoValue}>Evaluación sumativa (sin material pedagógico)</ThemedText>
            </View>
          </View>

          <View style={styles.infoRow}>
            <View style={styles.iconContainer}>
              <CustomIcon name="tag" size={20} color={AppColors.textSecondary} />
            </View>
            <View style={styles.infoTextContainer}>
              <ThemedText style={styles.infoLabel}>Asignatura relacionada</ThemedText>
              <ThemedText style={styles.infoValue}>Lenguaje y Literatura</ThemedText>
            </View>
          </View>

          <View style={[styles.infoRow, { alignItems: 'flex-start' }]}>
            <View style={[styles.iconContainer, { marginTop: 4 }]}>
              <CustomIcon name="file-text" size={20} color={AppColors.textSecondary} />
            </View>
            <View style={styles.infoTextContainer}>
              <ThemedText style={styles.infoLabel}>Descripción</ThemedText>
              <ThemedText style={[styles.infoValue, { lineHeight: 20 }]}>
                “Unidad 1: Sobre la ausencia: exilio, migración e identidad{'\n'}
                • Genero Narrativo y obras narrativas.{'\n'}
                • Movimientos Literarios.”
              </ThemedText>
            </View>
          </View>

          <TouchableRipple accessibilityRole="button" accessibilityState={{ disabled: true }} disabled style={[styles.actionBtnLight, styles.disabledAction]} onPress={() => undefined}>
            <ThemedText style={styles.actionBtnLightText}>Tabla de especificaciones · Próximamente</ThemedText>
          </TouchableRipple>

          <TouchableRipple accessibilityRole="button" accessibilityState={{ disabled: true }} disabled style={[styles.actionBtnDark, styles.disabledAction]} onPress={() => undefined}>
            <ThemedText style={styles.actionBtnDarkText}>Documentos de la clase · Próximamente</ThemedText>
          </TouchableRipple>

          <TouchableRipple accessibilityRole="button" accessibilityLabel="Suscribir dispositivo al calendario iCal" style={styles.actionBtnBlue} onPress={handleSubscribe}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <CustomIcon name="calendar" size={18} color={AppColors.textPrimary} />
              <ThemedText style={styles.actionBtnDarkText}>Suscribir iPad/iPhone a iCal</ThemedText>
            </View>
          </TouchableRipple>

          <ThemedText style={styles.helperText}>
            Evento generado y conectado al HaNet Calendar del curso y al HaNet ClassHall de la asignatura.
          </ThemedText>
        </View>

        {/* Verification */}
        <View style={styles.verificationContainer}>
          <CustomIcon name="check-circle" size={20} color={AppColors.success} />
          <View style={styles.verificationTextContainer}>
            <ThemedText style={styles.verificationSub}>Info. verificada por un docente:</ThemedText>
            <ThemedText style={styles.verificationName}>Monica Jannette Campos Veloso</ThemedText>
          </View>
        </View>

        <ThemedText style={styles.footerLegal}>
          La información publicada por miembros de la directiva puede no ser oficial. La información verificada por tus profesores está indicada con un verificado azul.
        </ThemedText>

        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Copiar fuente iCal" style={{ marginTop: 24, alignSelf: 'center', marginBottom: 40, minHeight: 44, justifyContent: 'center' }} onPress={handleOpenIcalMenu}>
          <ThemedText style={{ color: AppColors.textSecondary, fontSize: 13, fontFamily: 'DMSans_500Medium', textDecorationLine: 'underline', opacity: 0.7 }}>
            Copiar fuente iCal
          </ThemedText>
        </TouchableOpacity>
      </ScrollView>

      {/* Floating Bottom Bar (Volver) */}
      <View style={[styles.bottomBarWrapper, { bottom: Math.max(insets.bottom, 12) + 12 }]}>
        <BlurView
          intensity={Platform.OS === 'android' ? 0 : 80}
          tint="dark"
          style={[
            styles.bottomBarContainer,
            Platform.OS === 'android' && { backgroundColor: 'rgba(52, 52, 45, 0.95)' }
          ]}
        >
          <View style={styles.leftIconBtn}>
            <CustomIcon name="home" size={24} color={AppColors.textSecondary} />
          </View>

          <View style={styles.centerPillWrapper}>
            <TouchableRipple
              accessibilityRole="button"
              accessibilityLabel="Volver"
              style={styles.volverPill}
              onPress={() => router.back()}
              rippleColor="rgba(255, 255, 255, 0.3)"
              borderless={false}
            >
              <>
                <CustomIcon name="chevron-left" size={18} color={AppColors.textOnLight} />
                <ThemedText style={styles.volverText}>Volver</ThemedText>
              </>
            </TouchableRipple>
          </View>

          <View style={styles.rightIconBtn}>
            <CustomIcon name="user" size={24} color={AppColors.textSecondary} />
          </View>
        </BlurView>
      </View>

      {/* Custom iCal Modal */}
      <Modal
        visible={icalModalVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setIcalModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View accessibilityViewIsModal style={styles.modalCard}>
            <View style={styles.modalIconRow}>
              <CustomIcon name="calendar" size={24} color={AppColors.textOnLight} />
            </View>

            <View style={styles.modalTextSection}>
              <ThemedText style={styles.modalTitle}>Añadir calendario iCal</ThemedText>
              <ThemedText style={styles.modalSubtitle}>
                {`Al copiar la fuente iCal de "HNC - ${courseIdState || ''}", podrás suscribir el calendario a cualquier aplicación o servicio compatible sin depender de HaNet Calendar.`}
              </ThemedText>
            </View>

            <TouchableOpacity accessibilityRole="button" style={styles.modalCopyButton} onPress={copyIcalToClipboard} activeOpacity={0.85}>
              <ThemedText style={styles.modalCopyText}>Copiar al portapapeles</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity accessibilityRole="button" style={styles.modalDismissButton} onPress={() => setIcalModalVisible(false)} activeOpacity={0.85}>
              <ThemedText style={styles.modalDismissText}>Volver atrás</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AppColors.textOnLight, // Same as Figma screenshot background
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  mainTitle: {
    color: AppColors.textSecondary,
    fontSize: 32,
    fontFamily: 'DMSans_700Bold',
    lineHeight: 38,
    marginBottom: 24,
    marginLeft: 8,
  },
  card: {
    backgroundColor: AppColors.surface,
    borderRadius: 32,
    padding: 24,
    marginBottom: 24,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  iconContainer: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  infoTextContainer: {
    flex: 1,
  },
  infoLabel: {
    color: AppColors.textSecondary,
    fontSize: 14,
    fontFamily: 'DMSans_500Medium',
    opacity: 0.9,
    marginBottom: 4,
  },
  infoValue: {
    color: AppColors.textSecondary,
    fontSize: 14,
    fontFamily: 'DMSans_400Regular',
    opacity: 0.8,
  },
  actionBtnLight: {
    backgroundColor: AppColors.neutral2, // Original was AppColors.surfaceSoft but AppColors.neutral2 is close enough or use AppColors.surfaceSoft? Based on image, it looks like AppColors.surfaceSoft
    borderRadius: 360,
    height: 90,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 10,
  },
  actionBtnLightText: {
    color: AppColors.textOnLight,
    fontSize: 16,
    fontFamily: 'DMSans_700Bold',
  },
  actionBtnDark: {
    backgroundColor: AppColors.primary, // Dark Green
    borderRadius: 360,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 20,
  },
  actionBtnBlue: {
    backgroundColor: AppColors.info,
    borderRadius: 360,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  actionBtnDarkText: {
    color: AppColors.textPrimary,
    fontSize: 16,
    fontFamily: 'DMSans_700Bold',
  },
  disabledAction: {
    opacity: 0.55,
  },
  helperText: {
    color: AppColors.textSecondary,
    fontSize: 11,
    fontFamily: 'DMSans_400Regular',
    opacity: 0.6,
    textAlign: 'center',
    alignSelf: 'center',
    paddingHorizontal: 10,
  },
  verificationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  verificationTextContainer: {
    marginLeft: 8,
    flexDirection: 'column',
  },
  verificationSub: {
    color: AppColors.textSecondary,
    fontSize: 12,
    opacity: 0.7,
  },
  verificationName: {
    color: AppColors.textSecondary,
    fontSize: 13,
    fontFamily: 'DMSans_700Bold',
  },
  footerLegal: {
    color: AppColors.textSecondary,
    fontSize: 11,
    opacity: 0.6,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  bottomBarWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
    zIndex: 999,
  },
  bottomBarContainer: {
    width: '90%',
    maxWidth: 330,
    height: 64,
    borderRadius: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(52, 52, 45, 0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    boxShadow: '0px 10px 20px rgba(0, 0, 0, 0.3)',
    elevation: 8,
  },
  leftIconBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    width: 70,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rightIconBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    width: 70,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerPillWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 10,
  },
  volverPill: {
    backgroundColor: AppColors.surfaceSoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    width: 120,
    height: 45,
    borderRadius: 360,
    gap: 8,
  },
  volverText: {
    color: AppColors.textOnLight,
    fontFamily: 'DMSans_700Bold',
    fontSize: 15,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
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
  modalIconRow: {
    paddingBottom: 4,
  },
  modalTextSection: {
    gap: 6,
    paddingBottom: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: 'DMSans_500Medium',
    color: AppColors.textOnLight,
    letterSpacing: -0.8,
    lineHeight: 28,
  },
  modalSubtitle: {
    fontSize: 14,
    fontFamily: 'DMSans_500Medium',
    color: AppColors.textOnLight,
    letterSpacing: -0.35,
    lineHeight: 21,
    opacity: 0.8,
  },
  modalCopyButton: {
    backgroundColor: AppColors.primary,
    height: 48,
    borderRadius: 360,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    marginTop: 8,
  },
  modalCopyText: {
    fontSize: 14,
    fontFamily: 'DMSans_700Bold',
    color: AppColors.textPrimary,
    letterSpacing: -0.35,
  },
  modalDismissButton: {
    backgroundColor: AppColors.textOnLight,
    height: 48,
    borderRadius: 360,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    marginTop: -4,
  },
  modalDismissText: {
    fontSize: 14,
    fontFamily: 'DMSans_700Bold',
    color: AppColors.textPrimary,
    letterSpacing: -0.35,
  },
});
