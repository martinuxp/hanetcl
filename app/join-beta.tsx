import { OnboardingProgress } from '@/components/OnboardingProgress';
import { ThemedText } from '@/components/themed-text';
import { AppColors, AppRadii, AppSpacing, AppTouch } from '@/constants/design-tokens';
import { describeAuthError, getOnboardingStep, redeemInviteCode, routeForStep, useSession } from '@/services/auth-service';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View, type TextInputInstance } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { FrostedScreen, withTopInset } from '@/components/ui/frosted-screen';
import { ENTRY_WIDE_CONTENT, useEntryAsideWidth } from '@/components/EntryAside';
import { t } from '@/i18n';

const ICONS = {
  lock: require('@/assets/icons/auth/lock.svg'),
  logo: require('@/assets/icons/auth/logo-mark.svg'),
  mark: require('@/assets/icons/auth/hanet-icon.svg'),
  arrow: require('@/assets/icons/auth/arrow-right-long.svg'),
};

const WORD_COUNT = 4;
const EMPTY_WORDS = Array.from({ length: WORD_COUNT }, () => '');

// Same cleaning the backend applies, minus accents (it strips those itself).
function cleanWord(text: string) {
  return text.toLowerCase().replace(/[^a-záéíóúüñ]/g, '');
}

export default function JoinBetaScreen() {
  const insets = useSafeAreaInsets();
  // Beside the brand panel on a wide web window, the form sits in the middle.
  const wideEntry = useEntryAsideWidth() > 0;
  const router = useRouter();
  const { user, initializing, signOut } = useSession();
  const inputs = useRef<(TextInputInstance | null)[]>([]);

  const [words, setWords] = useState<string[]>(EMPTY_WORDS);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Anyone who is not exactly at this step is sent to theirs.
  useEffect(() => {
    if (initializing) return;
    if (!user) {
      router.replace('/onboarding');
      return;
    }
    let active = true;
    getOnboardingStep(user)
      .then(step => {
        if (!active) return;
        if (step === 'join-beta') setChecking(false);
        else router.replace(routeForStep(step));
      })
      .catch(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [initializing, router, user]);

  const complete = words.every(word => word.length >= 2);

  const changeWord = (index: number, text: string) => {
    setError(null);
    // Pasting or dictating the whole phrase fills the boxes from here on.
    const parts = text.split(/\s+/).map(cleanWord).filter(Boolean);
    const endedWithSpace = /\s$/.test(text);

    setWords(current => {
      const next = [...current];
      if (parts.length === 0) next[index] = '';
      parts.slice(0, WORD_COUNT - index).forEach((part, offset) => { next[index + offset] = part; });
      return next;
    });

    // A space finishes a word; several words at once land on the last one.
    const target = Math.min(index + parts.length - (endedWithSpace ? 0 : 1), WORD_COUNT - 1);
    if (parts.length > 0 && target > index) inputs.current[target]?.focus();
  };

  const submit = async () => {
    if (!complete || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await redeemInviteCode(words);
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace(routeForStep(await getOnboardingStep(user)));
    } catch (redeemError) {
      setError(describeAuthError(redeemError, t('classhall.join.noPudimosComprobarElCodigo')));
      setSubmitting(false);
    }
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

  return (
    <FrostedScreen style={styles.container} bottom>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={withTopInset([styles.scrollContent, wideEntry && ENTRY_WIDE_CONTENT], insets.top)} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.topBar}>
            <View style={styles.lockPill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Image source={ICONS.lock} style={styles.icon} contentFit="contain" />
            </View>
            <ThemedText accessibilityRole="header" style={styles.topBarTitle}>{t('joinBeta.unirseAHanet')}</ThemedText>
          </View>
          <OnboardingProgress step={3} />

          <View style={styles.card}>
            <View style={styles.headline}>
              <ThemedText style={styles.headlineText}>{t('joinBeta.seVerificoTuCorreo')}</ThemedText>
              <Image source={ICONS.logo} style={styles.logo} contentFit="contain" />
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.hero}>
              <ThemedText accessibilityRole="header" style={styles.heroText}>{t('joinBeta.unirseAHanetBeta')}</ThemedText>
              <Image source={ICONS.mark} style={styles.heroMark} contentFit="contain" accessibilityLabel="HaNet" />
            </View>

            <ThemedText style={styles.lead}>
              {t('joinBeta.escribeElCodigoDeInvitacion')}
            </ThemedText>

            <View style={styles.grid}>
              {words.map((word, index) => (
                <View key={index} style={[styles.wordBox, focusedIndex === index && styles.wordBoxFocused, !!error && styles.wordBoxError]}>
                  <ThemedText style={styles.wordLabel}>{t('joinBeta.palabraNumber', { number: index + 1 })}</ThemedText>
                  <TextInput
                    ref={(input) => { inputs.current[index] = input; }}
                    accessibilityLabel={t('joinBeta.palabraNumberDeWordcount', { number: index + 1, wordCount: WORD_COUNT })}
                    value={word}
                    onChangeText={text => changeWord(index, text)}
                    onFocus={() => setFocusedIndex(index)}
                    onBlur={() => setFocusedIndex(current => (current === index ? null : current))}
                    onKeyPress={({ nativeEvent }) => {
                      if (nativeEvent.key === 'Backspace' && !word && index > 0) inputs.current[index - 1]?.focus();
                    }}
                    onSubmitEditing={() => (index < WORD_COUNT - 1 ? inputs.current[index + 1]?.focus() : void submit())}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="off"
                    spellCheck={false}
                    returnKeyType={index < WORD_COUNT - 1 ? 'next' : 'go'}
                    submitBehavior={index < WORD_COUNT - 1 ? 'submit' : 'blurAndSubmit'}
                    selectionColor={AppColors.accent}
                    editable={!submitting}
                    autoFocus={index === 0}
                    style={styles.wordInput}
                  />
                </View>
              ))}
            </View>

            {!!error && <ThemedText accessibilityLiveRegion="assertive" style={styles.error}>{error}</ThemedText>}

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !complete || submitting, busy: submitting }}
              disabled={!complete || submitting}
              onPress={submit}
              style={({ pressed }) => [styles.submit, (!complete || submitting) && styles.submitDisabled, pressed && styles.pressed]}
            >
              <ThemedText style={styles.submitText}>{submitting ? t('joinBeta.verificando') : t('joinBeta.verificar')}</ThemedText>
              {!submitting && <Image source={ICONS.arrow} style={styles.icon} contentFit="contain" />}
            </Pressable>

            <View style={styles.help}>
              <ThemedText style={styles.helpTitle}>{t('joinBeta.noFuncionaElCodigo')}</ThemedText>
              <ThemedText style={styles.helpText}>
                {t('joinBeta.revisaQueLasPalabrasVayan')}
              </ThemedText>
            </View>
          </View>

          <Pressable accessibilityRole="button" onPress={useAnotherAccount} style={({ pressed }) => [styles.switchAccount, pressed && styles.pressed]}>
            <ThemedText style={styles.switchAccountText}>{t('joinBeta.usarOtraCuenta')}</ThemedText>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </FrostedScreen>
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
  lockPill: {
    height: 40,
    paddingHorizontal: AppSpacing.lg,
    borderRadius: AppRadii.pill,
    alignItems: 'center',
    justifyContent: 'center',
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
    lineHeight: 29,
    letterSpacing: -1.08,
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
  hero: {
    height: 138,
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.sm,
    paddingHorizontal: 35,
    borderRadius: AppRadii.xl,
    borderCurve: 'continuous',
    backgroundColor: AppColors.canvas,
  },
  heroText: {
    flex: 1,
    fontFamily: 'DMSans_700Bold',
    fontSize: 24,
    lineHeight: 29,
    letterSpacing: -1.08,
    color: AppColors.textPrimary,
  },
  heroMark: {
    width: 41,
    height: 61,
  },
  lead: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: -0.4,
    color: AppColors.textPrimary,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing.sm,
  },
  wordBox: {
    flexGrow: 1,
    flexBasis: '45%',
    minHeight: 60,
    justifyContent: 'center',
    paddingHorizontal: AppSpacing.lg,
    paddingVertical: AppSpacing.sm,
    borderRadius: AppRadii.md,
    borderCurve: 'continuous',
    borderWidth: 2,
    borderColor: AppColors.canvas,
    backgroundColor: AppColors.canvas,
  },
  wordBoxFocused: {
    borderColor: AppColors.controlActive,
  },
  wordBoxError: {
    borderColor: AppColors.accent,
  },
  wordLabel: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: -0.24,
    color: AppColors.textSecondary,
    opacity: 0.75,
  },
  wordInput: {
    padding: 0,
    fontFamily: 'DMSans_700Bold',
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: -0.4,
    color: AppColors.textPrimary,
    outlineStyle: 'none' as never,
  },
  error: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.errorText,
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
    opacity: 0.65,
  },
  submitText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: -0.4,
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
  pressed: {
    opacity: 0.6,
  },
});
