import { ThemedText } from '@/components/themed-text';
import { HanetButton } from '@/components/ui/hanet-button';
import { AppColors, AppPressed, AppRadii, AppSpacing } from '@/constants/design-tokens';
import { describeAuthError } from '@/services/auth-service';
import { checkInEventAttendee, getLoadedEvent } from '@/services/events-service';
import type { CheckIn } from '@/services/events-service';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

// Pasar lista: the organizer of an institution event scans each attendee's
// HN-QR at the door (functions/events.js checks the code, which changes every
// 30 seconds, so a screenshot does not work). Only organizers get here.

type Result = { kind: 'ok'; checkIn: CheckIn } | { kind: 'error'; message: string };

// The same QR stays in front of the camera for a moment: it is read once.
const SAME_QR_MS = 4000;

export default function EventCheckinScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const event = id ? getLoadedEvent(id) : null;
  const [permission, requestPermission] = useCameraPermissions();
  const [result, setResult] = useState<Result | null>(null);
  const [count, setCount] = useState<number | null>(event?.checkins?.length ?? null);
  const busy = useRef(false);
  const last = useRef<{ value: string; at: number } | null>(null);
  const reducedMotion = useReducedMotion();

  const scanned = async (value: string) => {
    if (!id || busy.current) return;
    const now = Date.now();
    if (last.current && last.current.value === value && now - last.current.at < SAME_QR_MS) return;
    last.current = { value, at: now };
    busy.current = true;
    try {
      const checkIn = await checkInEventAttendee(id, value);
      setResult({ kind: 'ok', checkIn });
      setCount(checkIn.count);
      if (Platform.OS !== 'web') void Haptics.notificationAsync(checkIn.already ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      setResult({ kind: 'error', message: describeAuthError(error, 'No pudimos registrar a esa persona.') });
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      busy.current = false;
    }
  };

  const close = () => (router.canGoBack() ? router.back() : router.replace('/events'));

  if (Platform.OS === 'web') {
    return (
      <SafeAreaView style={[styles.screen, styles.center]}>
        <ThemedText style={styles.title}>Pasar lista funciona en el teléfono</ThemedText>
        <HanetButton label="Volver" variant="surface" onPress={close} />
      </SafeAreaView>
    );
  }

  if (!permission?.granted) {
    return (
      <SafeAreaView style={[styles.screen, styles.center]}>
        <ThemedText style={styles.title}>HaNet necesita la cámara para escanear los HN-QR</ThemedText>
        <ThemedText style={styles.text}>Solo se usa mientras pasas lista. No guardamos fotos.</ThemedText>
        {permission && !permission.canAskAgain ? (
          <HanetButton label="Abrir ajustes" variant="accent" onPress={() => void Linking.openSettings()} />
        ) : (
          <HanetButton label="Permitir la cámara" variant="accent" onPress={() => void requestPermission()} />
        )}
        <HanetButton label="Volver" variant="surface" onPress={close} />
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.screen}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={({ data }) => void scanned(data)}
      />
      <SafeAreaView style={styles.overlay} edges={['top', 'bottom']}>
        <View style={styles.topBar}>
          <Pressable accessibilityRole="button" accessibilityLabel="Terminar" onPress={close} style={({ pressed }) => [styles.roundButton, pressed && AppPressed]}>
            <Image source={require('@/assets/icons/event/arrow-left-long.svg')} style={styles.icon} contentFit="contain" tintColor={AppColors.textPrimary} />
          </Pressable>
          <View style={styles.counter}>
            <ThemedText numberOfLines={1} style={styles.counterTitle}>{event?.title ?? 'Pasar lista'}</ThemedText>
            {count !== null && <ThemedText style={styles.counterText}>{count} {count === 1 ? 'llegó' : 'llegaron'}</ThemedText>}
          </View>
        </View>

        <View style={styles.frame} accessible accessibilityLabel="Apunta al HN-QR del perfil de la persona" />

        <View style={styles.bottom}>
          {result ? (
            <Animated.View key={result.kind === 'ok' ? `${result.checkIn.name}-${result.checkIn.count}` : result.message} entering={reducedMotion ? undefined : FadeIn.duration(120)} style={[styles.card, result.kind === 'error' && styles.cardError]} accessibilityLiveRegion="assertive">
              {result.kind === 'ok' ? (
                <>
                  <ThemedText style={styles.cardTitle}>{result.checkIn.already ? 'Ya estaba registrado' : '¡Llegó!'}</ThemedText>
                  <ThemedText style={styles.cardName}>{result.checkIn.name}</ThemedText>
                  <ThemedText style={styles.cardText}>
                    {[result.checkIn.courseId, result.checkIn.signedUp === false ? 'No estaba inscrito' : result.checkIn.signedUp ? 'Inscrito' : null].filter(Boolean).join(' · ')}
                  </ThemedText>
                </>
              ) : (
                <ThemedText style={styles.cardText}>{result.message}</ThemedText>
              )}
            </Animated.View>
          ) : (
            <ThemedText style={styles.hint}>Pídele a cada persona que abra Perfil → Mi HN-QR.</ThemedText>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: AppSpacing.lg,
    padding: AppSpacing.xl,
    backgroundColor: AppColors.canvas,
  },
  title: {
    textAlign: 'center',
    fontFamily: 'DMSans_500Medium',
    fontSize: 19,
    lineHeight: 25,
    color: AppColors.textPrimary,
  },
  text: {
    textAlign: 'center',
    fontFamily: 'DMSans_400Regular',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.textSecondary,
  },
  overlay: {
    flex: 1,
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
    paddingHorizontal: AppSpacing.lg,
    paddingTop: AppSpacing.sm,
  },
  roundButton: {
    height: 44,
    justifyContent: 'center',
    paddingHorizontal: AppSpacing.lg,
    borderRadius: AppRadii.pill,
    backgroundColor: 'rgba(40, 40, 41, 0.85)',
  },
  icon: {
    width: 24,
    height: 24,
  },
  counter: {
    flex: 1,
    paddingHorizontal: AppSpacing.lg,
    paddingVertical: 6,
    borderRadius: AppRadii.lg,
    backgroundColor: 'rgba(40, 40, 41, 0.85)',
  },
  counterTitle: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 15,
    lineHeight: 20,
    color: AppColors.textPrimary,
  },
  counterText: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.textSecondary,
  },
  frame: {
    alignSelf: 'center',
    width: 250,
    height: 250,
    borderRadius: AppRadii.lg,
    borderWidth: 3,
    borderColor: AppColors.accent,
  },
  bottom: {
    paddingHorizontal: AppSpacing.lg,
    paddingBottom: AppSpacing.lg,
  },
  hint: {
    alignSelf: 'center',
    overflow: 'hidden',
    paddingHorizontal: AppSpacing.lg,
    paddingVertical: AppSpacing.sm,
    borderRadius: AppRadii.pill,
    backgroundColor: 'rgba(40, 40, 41, 0.85)',
    textAlign: 'center',
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.textPrimary,
  },
  card: {
    gap: 2,
    padding: AppSpacing.lg,
    borderRadius: AppRadii.lg,
    borderCurve: 'continuous',
    backgroundColor: AppColors.canvas,
    borderWidth: 2,
    borderColor: AppColors.accentMint,
  },
  cardError: {
    borderColor: AppColors.accent,
  },
  cardTitle: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.accentMint,
  },
  cardName: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 22,
    lineHeight: 28,
    color: AppColors.textPrimary,
  },
  cardText: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 15,
    lineHeight: 21,
    color: AppColors.textSecondary,
  },
});
