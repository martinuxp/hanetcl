import { OnboardingProgress } from '@/components/OnboardingProgress';
import { ThemedText } from '@/components/themed-text';
import { AppColors, AppPressed, AppRadii, AppSpacing, AppTouch } from '@/constants/design-tokens';
import { HanetButton } from '@/components/ui/hanet-button';
import { HanetDialog, HanetDialogActions, dialogStyles } from '@/components/ui/hanet-dialog';
import { describeAuthError, getOnboardingStep, routeForStep, sendEmailCode, useSession, verifyEmailCode } from '@/services/auth-service';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const ICONS = {
  logo: require('@/assets/icons/auth/logo-mark.svg'),
  arrow: require('@/assets/icons/auth/arrow-right-long.svg'),
  back: require('@/assets/icons/auth/arrow-left-long.svg'),
};

const CODE_LENGTH = 4;
const RESEND_SECONDS = 60;

export default function VerifyEmailScreen() {
  const router = useRouter();
  const { user, initializing, signOut } = useSession();
  const inputRef = useRef<TextInput>(null);
  const requested = useRef(false);

  const [code, setCode] = useState('');
  const [focused, setFocused] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Only claim the code was sent once the backend says so.
  const [codeSent, setCodeSent] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const [confirmLeave, setConfirmLeave] = useState(false);

  useEffect(() => {
    if (initializing) return;
    if (!user) router.replace('/onboarding');
    else if (user.emailVerified) router.replace('/(tabs)');
  }, [initializing, router, user]);

  // One code per visit; asking again goes through "Re-enviar".
  useEffect(() => {
    if (!user || user.emailVerified || requested.current) return;
    requested.current = true;
    sendEmailCode()
      .then(result => {
        if (result.alreadyVerified) router.replace('/(tabs)');
        else setCodeSent(true);
      })
      .catch(sendError => {
        // A code sent moments ago is still valid; that is not worth an error.
        if ((sendError as { code?: string }).code === 'functions/resource-exhausted') {
          setCodeSent(true);
          return;
        }
        setSecondsLeft(0);
        setError(describeAuthError(sendError, 'No pudimos enviar el código. Usa "Re-enviar" en un momento.'));
      });
  }, [router, user]);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft(seconds => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  const submit = async (value: string) => {
    if (value.length !== CODE_LENGTH || verifying) return;
    setVerifying(true);
    setError(null);
    setNotice(null);
    try {
      await verifyEmailCode(value);
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace(routeForStep(await getOnboardingStep(user).catch(() => 'done' as const)));
    } catch (verifyError) {
      setError(describeAuthError(verifyError, 'No pudimos verificar el código. Inténtalo nuevamente.'));
      setCode('');
      inputRef.current?.focus();
      setVerifying(false);
    }
  };

  const changeCode = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(digits);
    setError(null);
    if (digits.length === CODE_LENGTH) void submit(digits);
  };

  const resend = async () => {
    if (secondsLeft > 0 || sending) return;
    setSending(true);
    setError(null);
    setNotice(null);
    try {
      await sendEmailCode();
      setCodeSent(true);
      setNotice('Te enviamos un código nuevo.');
      setSecondsLeft(RESEND_SECONDS);
    } catch (sendError) {
      setError(describeAuthError(sendError, 'No pudimos enviar el código. Inténtalo en un momento.'));
    } finally {
      setSending(false);
    }
  };

  const switchAccount = async () => {
    await signOut();
    router.replace('/onboarding');
  };

  if (initializing || !user) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={AppColors.textSecondary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.topBar}>
            {/* The account already exists: going back signs out to start over with another one. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Volver"
              accessibilityHint="Pregunta antes de cerrar la sesión para usar otra cuenta"
              onPress={() => setConfirmLeave(true)}
              style={({ pressed }) => [styles.backPill, pressed && styles.pressed]}
            >
              <Image source={ICONS.back} style={styles.icon} contentFit="contain" />
            </Pressable>
            <ThemedText accessibilityRole="header" style={styles.topBarTitle}>Verificar email</ThemedText>
          </View>
          <OnboardingProgress step={2} />

          <View style={styles.card}>
            <View style={styles.headline}>
              <ThemedText accessibilityRole="header" style={styles.headlineText}>Verifica tu identidad</ThemedText>
              <Image source={ICONS.logo} style={styles.logo} contentFit="contain" accessibilityLabel="HaNet" />
            </View>

            <ThemedText style={styles.sentTo}>
              {codeSent ? 'Se envió un código de verificación a' : 'Enviando un código de verificación a'}{'\n'}{user.email}
            </ThemedText>

            <Pressable
              accessibilityLabel={`Código de verificación, ${code.length} de ${CODE_LENGTH} dígitos`}
              onPress={() => inputRef.current?.focus()}
              style={styles.boxes}
            >
              {Array.from({ length: CODE_LENGTH }, (_, index) => {
                const active = focused && index === Math.min(code.length, CODE_LENGTH - 1);
                return (
                  <View key={index} style={[styles.box, active && styles.boxActive, !!error && styles.boxError]}>
                    <ThemedText style={[styles.boxText, !code[index] && styles.boxPlaceholder]}>{code[index] ?? '–'}</ThemedText>
                  </View>
                );
              })}
              {/* One real input behind the boxes keeps paste and SMS/email autofill working. */}
              <TextInput
                ref={inputRef}
                value={code}
                onChangeText={changeCode}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                keyboardType="number-pad"
                inputMode="numeric"
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                maxLength={CODE_LENGTH}
                autoFocus
                caretHidden
                editable={!verifying}
                style={styles.hiddenInput}
              />
            </Pressable>

            {!!error && <ThemedText accessibilityLiveRegion="assertive" style={styles.error}>{error}</ThemedText>}
            {!!notice && <ThemedText accessibilityLiveRegion="polite" style={styles.notice}>{notice}</ThemedText>}

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: secondsLeft > 0 || sending }}
              disabled={secondsLeft > 0 || sending}
              onPress={resend}
              style={({ pressed }) => [styles.resend, pressed && styles.pressed]}
            >
              <ThemedText style={[styles.resendText, secondsLeft > 0 && styles.resendWaiting]}>
                {sending ? 'Enviando…' : secondsLeft > 0 ? `Re-enviar código en ${secondsLeft} s` : 'Re-enviar código de verificación'}
              </ThemedText>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: code.length !== CODE_LENGTH || verifying, busy: verifying }}
              disabled={code.length !== CODE_LENGTH || verifying}
              onPress={() => submit(code)}
              style={({ pressed }) => [styles.submit, (code.length !== CODE_LENGTH || verifying) && styles.submitDisabled, pressed && styles.pressed]}
            >
              <ThemedText style={styles.submitText}>{verifying ? 'Verificando…' : 'Verificar'}</ThemedText>
              {!verifying && <Image source={ICONS.arrow} style={styles.icon} contentFit="contain" />}
            </Pressable>

            <View style={styles.why}>
              <ThemedText style={styles.whyTitle}>¿Por qué un código al email?</ThemedText>
              <ThemedText style={styles.whyText}>
                Así sabemos que el correo es tuyo.
              </ThemedText>
            </View>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
      {/* Going back means leaving this account: say so before doing it. */}
      <HanetDialog
        visible={confirmLeave}
        onRequestClose={() => setConfirmLeave(false)}
        dismissOnBackdrop
        title="¿Usar otra cuenta?"
        body="Tu HaNet ID ya está creado. Podrás verificarlo cuando vuelvas a iniciar sesión con él."
      >
        <HanetDialogActions>
          <HanetButton label="Seguir aquí" variant="surface" onPress={() => setConfirmLeave(false)} style={dialogStyles.action} />
          <HanetButton
            label="Usar otra"
            variant="accent"
            onPress={() => {
              setConfirmLeave(false);
              void switchAccount();
            }}
            style={dialogStyles.action}
          />
        </HanetDialogActions>
      </HanetDialog>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AppColors.canvas,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    padding: AppSpacing.md,
    gap: AppSpacing.md,
  },
  topBar: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.lg,
    paddingVertical: AppSpacing.md,
  },
  backPill: {
    height: 40,
    minWidth: AppTouch.minimum,
    paddingHorizontal: AppSpacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.surface,
  },
  topBarTitle: {
    flex: 1,
    fontFamily: 'DMSans_700Bold',
    fontSize: 20,
    lineHeight: 28,
    letterSpacing: -0.8,
    color: AppColors.textPrimary,
  },
  card: {
    padding: AppSpacing.xxl,
    gap: AppSpacing.xl,
    borderRadius: AppRadii.xl,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  headline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.sm,
  },
  headlineText: {
    flex: 1,
    fontFamily: 'DMSans_700Bold',
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.96,
    color: AppColors.textPrimary,
  },
  logo: {
    width: 47,
    height: 43,
  },
  icon: {
    width: 24,
    height: 24,
  },
  sentTo: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: -0.4,
    color: AppColors.textPrimary,
  },
  boxes: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: AppSpacing.sm,
  },
  box: {
    width: 58,
    height: 76,
    borderRadius: AppRadii.md,
    borderCurve: 'continuous',
    borderWidth: 2,
    borderColor: AppColors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AppColors.canvas,
  },
  boxActive: {
    borderColor: AppColors.controlActive,
  },
  boxError: {
    borderColor: AppColors.accent,
  },
  boxText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 24,
    lineHeight: 32,
    color: AppColors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  boxPlaceholder: {
    opacity: 0.35,
  },
  hiddenInput: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    opacity: 0,
  },
  error: {
    textAlign: 'center',
    fontFamily: 'DMSans_700Bold',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.errorText,
  },
  notice: {
    textAlign: 'center',
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.textSecondary,
  },
  resend: {
    minHeight: AppTouch.minimum,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resendText: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: -0.4,
    color: AppColors.textPrimary,
  },
  resendWaiting: {
    opacity: 0.55,
  },
  submit: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: AppSpacing.md,
    paddingHorizontal: AppSpacing.xl,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.primary,
  },
  submitDisabled: {
    backgroundColor: AppColors.surfaceMuted,
    opacity: 0.7,
  },
  submitText: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: -0.4,
    color: AppColors.textPrimary,
  },
  why: {
    gap: AppSpacing.xs,
  },
  whyTitle: {
    textAlign: 'center',
    fontFamily: 'DMSans_500Medium',
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: -0.4,
    color: AppColors.textSecondary,
  },
  whyText: {
    textAlign: 'center',
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
    lineHeight: 18,
    color: AppColors.textSecondary,
    opacity: 0.8,
  },
  pressed: AppPressed,
});
