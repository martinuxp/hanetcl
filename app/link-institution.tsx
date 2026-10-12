import { OnboardingProgress } from '@/components/OnboardingProgress';
import { AlertModal } from '@/components/ui/alert-modal';
import InstitutionBanner from '@/components/InstitutionBanner';
import { InstitutionSync } from '@/components/InstitutionSync';
import { ThemedText } from '@/components/themed-text';
import { HanetField } from '@/components/ui/hanet-auth-fields';
import { AppColors, AppRadii, AppSpacing, AppTouch } from '@/constants/design-tokens';
import {
  completeInstitutionalLink,
  describeAuthError,
  getInstitutionalLinkStatus,
  getOnboardingStep,
  routeForStep,
  setPendingWelcome,
  startInstitutionalLink,
  useSession,
} from '@/services/auth-service';
import type { LinkStatus } from '@/services/auth-service';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const ICONS = {
  back: require('@/assets/icons/event/arrow-left-long.svg'),
  lock: require('@/assets/icons/auth/lock.svg'),
  logo: require('@/assets/icons/auth/logo-mark.svg'),
  mail: require('@/assets/icons/auth/mail.svg'),
  arrow: require('@/assets/icons/auth/arrow-right-long.svg'),
};

type Step = 'methods' | 'email' | 'waiting';

const RESEND_SECONDS = 60;
const POLL_MS = 3000;
// How long to wait before admitting the link may never arrive.
const STUCK_MS = 2 * 60 * 1000;

// Enough to read both steps of the sync screen.
const SYNC_MIN_MS = 1600;

export default function LinkInstitutionScreen() {
  const router = useRouter();
  const { user, initializing, signOut } = useSession();

  const [step, setStep] = useState<Step>('methods');
  const [status, setStatus] = useState<LinkStatus | null>(null);
  const [checking, setChecking] = useState(true);

  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [stuck, setStuck] = useState(false);
  const [sentCount, setSentCount] = useState(0);

  const [reviewOpen, setReviewOpen] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  // Closing the review must not reopen it on the next poll.
  const reviewDismissed = useRef(false);

  // Anyone who is not exactly at this step is sent to theirs; a request
  // already under way resumes where it was.
  useEffect(() => {
    if (initializing) return;
    if (!user) {
      router.replace('/onboarding');
      return;
    }
    let active = true;
    (async () => {
      try {
        const current = await getOnboardingStep(user);
        if (!active) return;
        if (current !== 'link') {
          router.replace(routeForStep(current));
          return;
        }
        const linkStatus = await getInstitutionalLinkStatus();
        if (!active) return;
        setStatus(linkStatus);
        if (linkStatus.status !== 'none') {
          setEmail(linkStatus.email ?? '');
          setStep('waiting');
        }
      } catch (loadError) {
        if (active) setError(describeAuthError(loadError, 'No pudimos cargar tu institución. Inténtalo nuevamente.'));
      } finally {
        if (active) setChecking(false);
      }
    })();
    return () => { active = false; };
  }, [initializing, router, user]);

  // While waiting, ask the backend whether the emailed link was confirmed.
  useEffect(() => {
    // Paused while the link completes, so the review does not come back over it.
    if (step !== 'waiting' || reviewOpen || syncing) return;
    let active = true;
    const timer = setInterval(async () => {
      try {
        const linkStatus = await getInstitutionalLinkStatus();
        if (!active) return;
        setStatus(linkStatus);
        if (linkStatus.status === 'email-confirmed' && !reviewDismissed.current) setReviewOpen(true);
      } catch {
        // A failed poll is retried on the next tick.
      }
    }, POLL_MS);
    return () => { active = false; clearInterval(timer); };
  }, [reviewOpen, step, syncing]);

  // The shield is fetched ahead, so the sync screen shows it from its first frame.
  const logoUrl = status?.logoUrl;
  useEffect(() => {
    if (logoUrl) void Image.prefetch(logoUrl);
  }, [logoUrl]);

  // The app cannot know whether the email is on the roster, so after a while
  // it offers help instead of waiting forever. Each new link restarts the clock.
  useEffect(() => {
    if (step !== 'waiting') return;
    const timer = setTimeout(() => setStuck(true), STUCK_MS);
    return () => { clearTimeout(timer); setStuck(false); };
  }, [sentCount, step]);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft(seconds => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  const institutionName = status?.institutionName ?? 'tu institución';

  const sendLink = async () => {
    if (sending) return;
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Escribe tu correo institucional.');
      return;
    }
    setSending(true);
    try {
      const result = await startInstitutionalLink(email.trim());
      reviewDismissed.current = false;
      setSecondsLeft(result.resendInSeconds ?? RESEND_SECONDS);
      setSentCount(count => count + 1);
      setStep('waiting');
    } catch (sendError) {
      setError(describeAuthError(sendError, 'No pudimos enviar el link. Inténtalo nuevamente.'));
    } finally {
      setSending(false);
    }
  };

  // While the link completes, the review gives way to the sync screen (Figma):
  // a secure connection, then the data coming over. It stays long enough to
  // read, never more; a failure brings the review back with the reason.
  const finish = async () => {
    setFinishing(true);
    setFinishError(null);
    setReviewOpen(false);
    setSyncing(true);
    const startedAt = Date.now();
    try {
      await completeInstitutionalLink();
      await new Promise(resolve => setTimeout(resolve, Math.max(0, SYNC_MIN_MS - (Date.now() - startedAt))));
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPendingWelcome(status?.institutionName);
      router.replace('/(tabs)');
    } catch (completeError) {
      setSyncing(false);
      setFinishError(describeAuthError(completeError, 'No pudimos terminar el vínculo. Inténtalo nuevamente.'));
      setFinishing(false);
      setReviewOpen(true);
    }
  };

  const closeReview = () => {
    if (finishing) return;
    reviewDismissed.current = true;
    setReviewOpen(false);
    setFinishError(null);
  };

  // The arrow only ever goes back one step; leaving the account is its own action.
  const goBack = () => {
    setError(null);
    setStep(step === 'waiting' ? 'email' : 'methods');
  };

  const useAnotherAccount = async () => {
    await signOut();
    router.replace('/onboarding');
  };

  if (initializing || !user || checking) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={AppColors.textSecondary} />
      </SafeAreaView>
    );
  }

  // The institution's own banner and shield when it has them (HNT panel).
  const banner = (
    <InstitutionBanner title={`Unirse a\n${institutionName}`} logoUrl={status?.logoUrl} bannerUrl={status?.bannerUrl} height={138} />
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.topBar}>
            {step === 'methods' ? (
              <View style={styles.backButton} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <Image source={ICONS.lock} style={styles.icon} contentFit="contain" />
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Volver al paso anterior"
                onPress={goBack}
                hitSlop={4}
                style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
              >
                <Image source={ICONS.back} style={styles.icon} contentFit="contain" />
              </Pressable>
            )}
            <ThemedText accessibilityRole="header" style={styles.topBarTitle} numberOfLines={1}>Unirse a {institutionName}</ThemedText>
          </View>
          <OnboardingProgress step={4} />

          <View style={styles.card}>
            <View style={styles.headline}>
              <ThemedText style={styles.headlineText}>Se verificó tu correo</ThemedText>
              <Image source={ICONS.logo} style={styles.logo} contentFit="contain" />
            </View>
          </View>

          {step === 'methods' && (
            <View style={styles.card}>
              {banner}
              <ThemedText style={styles.lead}>
                {institutionName}, la institución asociada al código que ingresaste, pide comprobar quién eres antes de entrar a su Red HaNet.
              </ThemedText>

              <Pressable accessibilityRole="button" onPress={() => { setError(null); setStep('email'); }} style={({ pressed }) => [styles.methodPrimary, pressed && styles.pressed]}>
                <ThemedText style={styles.methodHint}>(Más rápida)</ThemedText>
                <ThemedText style={styles.methodPrimaryText}>Conectar ID a email institucional</ThemedText>
              </Pressable>

              <View accessible accessibilityRole="button" accessibilityState={{ disabled: true }} accessibilityLabel="Rellenar formulario verificador, próximamente" style={styles.methodSecondary}>
                <ThemedText style={styles.methodSecondaryText}>Rellenar formulario verificador</ThemedText>
                <ThemedText style={styles.methodSoon}>Próximamente</ThemedText>
              </View>

              {!!error && <ThemedText accessibilityLiveRegion="assertive" style={styles.error}>{error}</ThemedText>}

              <View style={styles.help}>
                <ThemedText style={styles.helpTitle}>¿Por qué solo están estas opciones?</ThemedText>
                <ThemedText style={styles.helpText}>
                  Estas son las opciones que tu institución decidió activar para entrar a su Red HaNet. Si necesitas ayuda con alguno de estos métodos, comunícate con {institutionName}.
                </ThemedText>
              </View>
            </View>
          )}

          {step === 'email' && (
            <View style={styles.card}>
              {banner}
              <View>
                <ThemedText style={styles.eyebrow}>¡Enlacemos tus credenciales!</ThemedText>
                <ThemedText accessibilityRole="header" style={styles.title}>Conectar HaNet ID</ThemedText>
              </View>

              <HanetField
                label="Email institucional"
                value={email}
                onChangeText={(value) => { setEmail(value); setError(null); }}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                keyboardType="email-address"
                returnKeyType="send"
                onSubmitEditing={sendLink}
                trailing={<Image source={ICONS.mail} style={styles.icon} contentFit="contain" />}
                invalid={!!error}
                editable={!sending}
                autoFocus
              />

              {!!error && <ThemedText accessibilityLiveRegion="assertive" style={styles.error}>{error}</ThemedText>}

              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: sending, busy: sending }}
                disabled={sending}
                onPress={sendLink}
                style={({ pressed }) => [styles.submitLight, sending && styles.busy, pressed && styles.pressed]}
              >
                <ThemedText style={styles.submitLightText}>{sending ? 'Enviando…' : 'Conectar HaNet ID'}</ThemedText>
                {!sending && <Image source={ICONS.arrow} style={styles.icon} tintColor={AppColors.controlOnActive} contentFit="contain" />}
              </Pressable>

              <ThemedText style={styles.note}>Se enviará un link de verificación al correo que introduzcas.</ThemedText>
            </View>
          )}

          {step === 'waiting' && (
            <View style={styles.card}>
              {banner}
              <View>
                <ThemedText style={styles.eyebrow}>¡Enlacemos tus credenciales!</ThemedText>
                <ThemedText accessibilityRole="header" style={styles.title}>Conectar HaNet ID</ThemedText>
              </View>

              <ThemedText style={styles.lead}>Si {email} está en la lista de {institutionName}, ya va un link de verificación en camino.</ThemedText>

              <View accessibilityLiveRegion="polite" style={styles.waitingBox}>
                <ActivityIndicator color={AppColors.textSecondary} />
                <ThemedText style={styles.waitingText}>
                  {status?.status === 'email-confirmed' ? 'Correo confirmado' : 'Esperando link mágico…'}
                </ThemedText>
              </View>

              <ThemedText style={styles.note}>
                Abre ese correo y confirma. Esta pantalla avanza sola cuando lo hagas.
              </ThemedText>

              {stuck && status?.status !== 'email-confirmed' && (
                <View accessibilityLiveRegion="polite" style={styles.stuck}>
                  <ThemedText style={styles.stuckTitle}>¿No te llega?</ThemedText>
                  <ThemedText style={styles.stuckText}>
                    Revisa que escribiste tu correo institucional tal como te lo entregó {institutionName} y mira la carpeta de spam. Si sigue sin llegar, puede que tu correo no esté en su lista: pide ayuda a los encargados de HaNet en tu institución.
                  </ThemedText>
                </View>
              )}

              {!!error && <ThemedText accessibilityLiveRegion="assertive" style={styles.error}>{error}</ThemedText>}

              {status?.status === 'email-confirmed' && (
                <Pressable accessibilityRole="button" onPress={() => { reviewDismissed.current = false; setReviewOpen(true); }} style={({ pressed }) => [styles.submitLight, pressed && styles.pressed]}>
                  <ThemedText style={styles.submitLightText}>Revisar mis datos</ThemedText>
                </Pressable>
              )}

              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: secondsLeft > 0 || sending }}
                disabled={secondsLeft > 0 || sending}
                onPress={sendLink}
                style={({ pressed }) => [styles.resend, pressed && styles.pressed]}
              >
                <ThemedText style={[styles.resendText, secondsLeft > 0 && styles.resendWaiting]}>
                  {sending ? 'Enviando…' : secondsLeft > 0 ? `(${secondsLeft}s) Re-enviar link mágico` : 'Re-enviar link mágico'}
                </ThemedText>
              </Pressable>

              <Pressable accessibilityRole="button" onPress={() => { setError(null); setStep('email'); }} style={({ pressed }) => [styles.submitDark, pressed && styles.pressed]}>
                <ThemedText style={styles.submitDarkText}>Cambiar email de verificación</ThemedText>
              </Pressable>
            </View>
          )}

          <Pressable accessibilityRole="button" onPress={useAnotherAccount} style={({ pressed }) => [styles.switchAccount, pressed && styles.pressed]}>
            <ThemedText style={styles.switchAccountText}>Usar otra cuenta</ThemedText>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      <AlertModal visible={reviewOpen} onRequestClose={closeReview}>
        <View style={styles.overlay}>
          <View accessibilityViewIsModal style={styles.review}>
            <ThemedText style={styles.reviewTitle}>Verifica los datos.</ThemedText>
            <ThemedText style={styles.reviewBody}>
              Tu institución entregó los siguientes datos que se enlazarán con tu HaNet ID:
            </ThemedText>
            {!!status?.person && (
              <View style={styles.reviewList}>
                <ThemedText style={styles.reviewItem}>•  {status.person.fullName}</ThemedText>
                <ThemedText style={styles.reviewItem}>•  {status.person.rut.slice(0, -1)}-{status.person.rut.slice(-1)}</ThemedText>
                <ThemedText style={styles.reviewItem}>•  {status.person.curso}</ThemedText>
                <ThemedText style={styles.reviewItem}>•  Estudiante, {institutionName}</ThemedText>
              </View>
            )}
            {!!finishError && <ThemedText accessibilityLiveRegion="assertive" style={styles.reviewError}>{finishError}</ThemedText>}

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: finishing, busy: finishing }}
              disabled={finishing}
              onPress={finish}
              style={({ pressed }) => [styles.reviewConfirm, finishing && styles.busy, pressed && styles.pressed]}
            >
              <ThemedText style={styles.reviewConfirmText}>{finishing ? 'Enlazando…' : 'Datos correctos'}</ThemedText>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={finishing} onPress={closeReview} style={({ pressed }) => [styles.reviewBack, pressed && styles.pressed]}>
              <ThemedText style={styles.reviewBackText}>Volver atrás</ThemedText>
            </Pressable>
            <ThemedText style={styles.reviewNote}>
              Si algún dato no es tuyo o está mal, no continúes y avisa a tu institución.
            </ThemedText>
          </View>
        </View>
      </AlertModal>
      {syncing && <InstitutionSync logoUrl={status?.logoUrl} />}
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.lg,
    paddingVertical: AppSpacing.md,
  },
  backButton: {
    height: 40,
    minWidth: AppTouch.minimum,
    paddingHorizontal: AppSpacing.lg,
    borderRadius: AppRadii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AppColors.surface,
  },
  topBarTitle: {
    flex: 1,
    fontFamily: 'DMSans_500Medium',
    fontSize: 20,
    lineHeight: 28,
    letterSpacing: -0.8,
    color: AppColors.textPrimary,
  },
  icon: {
    width: 24,
    height: 24,
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
    lineHeight: 29,
    letterSpacing: -1.08,
    color: AppColors.textPrimary,
  },
  logo: {
    width: 47,
    height: 43,
  },
  lead: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: -0.4,
    color: AppColors.textPrimary,
  },
  eyebrow: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: -0.35,
    color: AppColors.textSecondary,
  },
  title: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 36,
    lineHeight: 43,
    letterSpacing: -1.62,
    color: AppColors.textPrimary,
  },
  methodPrimary: {
    minHeight: 92,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: AppSpacing.xl,
    paddingVertical: AppSpacing.lg,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.controlActive,
  },
  methodHint: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.controlOnActive,
  },
  methodPrimaryText: {
    textAlign: 'center',
    fontFamily: 'DMSans_700Bold',
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: -0.4,
    color: AppColors.controlOnActive,
  },
  methodSecondary: {
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: AppSpacing.xl,
    paddingVertical: AppSpacing.sm,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.primary,
    opacity: 0.55,
  },
  methodSecondaryText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: -0.4,
    color: AppColors.textPrimary,
  },
  methodSoon: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 12,
    lineHeight: 16,
    color: AppColors.textPrimary,
  },
  help: {
    gap: AppSpacing.xs,
    opacity: 0.7,
  },
  helpTitle: {
    textAlign: 'center',
    fontFamily: 'DMSans_700Bold',
    fontSize: 16,
    lineHeight: 21,
    letterSpacing: -0.4,
    color: AppColors.textPrimary,
  },
  helpText: {
    textAlign: 'center',
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
    lineHeight: 17,
    letterSpacing: -0.3,
    color: AppColors.textPrimary,
  },
  note: {
    textAlign: 'center',
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.textSecondary,
    opacity: 0.8,
  },
  error: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.errorText,
  },
  submitLight: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: AppSpacing.md,
    paddingHorizontal: AppSpacing.xl,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.controlActive,
  },
  submitLightText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: -0.4,
    color: AppColors.controlOnActive,
  },
  submitDark: {
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: AppSpacing.xl,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.primary,
  },
  submitDarkText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: -0.4,
    color: AppColors.textPrimary,
  },
  busy: {
    opacity: 0.6,
  },
  waitingBox: {
    height: 72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: AppSpacing.md,
    borderRadius: AppRadii.md,
    borderCurve: 'continuous',
    backgroundColor: AppColors.canvas,
  },
  stuck: {
    gap: AppSpacing.xs,
    padding: AppSpacing.lg,
    borderRadius: AppRadii.md,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surfaceMuted,
  },
  stuckTitle: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 15,
    lineHeight: 20,
    color: AppColors.textPrimary,
  },
  stuckText: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.textPrimary,
  },
  switchAccount: {
    minHeight: AppTouch.minimum,
    alignSelf: 'center',
    justifyContent: 'center',
    paddingHorizontal: AppSpacing.lg,
  },
  switchAccountText: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    lineHeight: 20,
    textDecorationLine: 'underline',
    color: AppColors.textSecondary,
    opacity: 0.8,
  },
  waitingText: {
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
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: AppSpacing.xl,
  },
  review: {
    width: '100%',
    maxWidth: 360,
    padding: AppSpacing.xxl,
    gap: AppSpacing.md,
    borderRadius: AppRadii.xl,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surfaceSoft,
  },
  reviewTitle: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: -0.8,
    color: AppColors.textOnLight,
  },
  reviewBody: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: -0.35,
    color: AppColors.textOnLight,
  },
  reviewList: {
    gap: 2,
  },
  reviewItem: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: -0.35,
    color: AppColors.textOnLight,
  },
  reviewError: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.errorTextOnLight,
  },
  reviewConfirm: {
    height: 48,
    marginTop: AppSpacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.primary,
  },
  reviewConfirmText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: -0.35,
    color: AppColors.textPrimary,
  },
  reviewBack: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.textOnLight,
  },
  reviewBackText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: -0.35,
    color: AppColors.textPrimary,
  },
  reviewNote: {
    textAlign: 'center',
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
    lineHeight: 16,
    color: AppColors.textOnLight,
    opacity: 0.8,
  },
  pressed: {
    opacity: 0.6,
  },
});
