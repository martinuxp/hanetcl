import { isBlockedError, showAppError } from '@/services/app-error';
import { ThemedText } from '@/components/themed-text';
import { OnboardingProgress } from '@/components/OnboardingProgress';
import { HanetField, HanetSegmented } from '@/components/ui/hanet-auth-fields';
import { AppColors, AppPressed, AppRadii, AppSpacing, AppTouch } from '@/constants/design-tokens';
import {
  describeAuthError,
  getOnboardingStep,
  resetPassword,
  routeForStep,
  signInWithEmail,
  signUpWithEmail,
  useSession,
} from '@/services/auth-service';
import type { Treatment } from '@/services/auth-service';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { Easing, FadeIn, FadeOut, LinearTransition, useReducedMotion } from 'react-native-reanimated';

const ICONS = {
  logo: require('@/assets/icons/auth/logo-mark.svg'),
  at: require('@/assets/icons/auth/at-sign.svg'),
  mail: require('@/assets/icons/auth/mail.svg'),
  eye: require('@/assets/icons/auth/eye-closed.svg'),
  arrow: require('@/assets/icons/auth/arrow-right-long.svg'),
  male: require('@/assets/icons/auth/gender-male.svg'),
  female: require('@/assets/icons/auth/gender-female.svg'),
  google: require('@/assets/icons/auth/google-circle.svg'),
};

const TERMS_URL = 'https://hanet-edu.web.app/terminos';

type Mode = 'login' | 'signup';

const USERNAME_PATTERN = /^[a-z0-9._]{3,24}$/;
const MIN_PASSWORD = 8;

export default function AuthScreen() {
  const router = useRouter();
  const { user } = useSession();
  const [mode, setMode] = useState<Mode>('login');

  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [treatment, setTreatment] = useState<Treatment>('neutro');
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  // Fields left once are checked right away, not only on submit.
  const [touched, setTouched] = useState<Partial<Record<'fullName' | 'username' | 'email' | 'password', boolean>>>({});
  const leave = (field: 'fullName' | 'username' | 'email' | 'password') => setTouched(current => ({ ...current, [field]: true }));
  const flag = (field: 'fullName' | 'username' | 'email' | 'password') => (showErrors || !!touched[field]) && invalid[field];

  // Switching between the two forms: what goes away fades out, what comes in
  // fades in, and everything else slides to its new place instead of jumping.
  const reduceMotion = useReducedMotion();
  const moveLayout = reduceMotion ? undefined : LinearTransition.duration(220).easing(Easing.out(Easing.cubic));
  const appear = reduceMotion ? undefined : FadeIn.duration(180);
  const vanish = reduceMotion ? undefined : FadeOut.duration(120);
  // Sign-up creates the session before the profile is saved; the redirect
  // below must wait until the whole step is done.
  const submitting = useRef(false);

  const usernameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!user || submitting.current) return;
    let active = true;
    getOnboardingStep(user)
      .then(step => { if (active) router.replace(routeForStep(step)); })
      .catch(() => { if (active) router.replace('/(tabs)'); });
    return () => { active = false; };
  }, [router, user]);

  const cleanUsername = username.trim().toLowerCase();
  const invalid = {
    fullName: fullName.trim().length < 2,
    username: !USERNAME_PATTERN.test(cleanUsername),
    email: !/^\S+@\S+\.\S+$/.test(email.trim()),
    password: password.length < MIN_PASSWORD,
  };

  const changeMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setNotice(null);
    setShowErrors(false);
    setTouched({});
  };

  const handleLogin = async () => {
    setError(null);
    setNotice(null);
    if (!email.trim() || !password) {
      setError('Completa el correo y la contraseña.');
      return;
    }

    setLoading(true);
    try {
      await signInWithEmail(email, password);
    } catch (authError) {
      // A HaNet ID blocked from the HNT panel gets the blocked screen, with the appeal.
      if (isBlockedError(authError)) showAppError('blocked');
      setError(describeAuthError(authError, 'No pudimos iniciar sesión. Inténtalo nuevamente.'));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setError(null);
    setNotice(null);
    if (!email.trim()) {
      setError('Escribe tu correo para enviarte el enlace de recuperación.');
      return;
    }

    setLoading(true);
    try {
      await resetPassword(email);
      setNotice('Te enviamos un enlace para restablecer tu contraseña.');
    } catch (resetError) {
      setError(describeAuthError(resetError, 'No pudimos enviar el enlace. Inténtalo nuevamente.'));
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async () => {
    setError(null);
    setNotice(null);
    setShowErrors(true);

    if (invalid.fullName || invalid.username || invalid.email || invalid.password) {
      setError(
        invalid.fullName ? 'Escribe tus nombres y apellidos.'
          : invalid.username ? 'El HaNet ID debe tener entre 3 y 24 letras, números, puntos o guiones bajos.'
            : invalid.email ? 'Ese correo no parece válido.'
              : `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`,
      );
      return;
    }
    if (!acceptedTerms) {
      setError('Debes aceptar los Términos y Condiciones.');
      return;
    }

    setLoading(true);
    submitting.current = true;
    try {
      await signUpWithEmail(email, password, {
        fullName: fullName.trim(),
        username: cleanUsername,
        treatment,
        acceptedTerms,
      });
      router.replace('/verify-email');
    } catch (signUpError) {
      setError(describeAuthError(signUpError, 'No pudimos crear tu cuenta. Inténtalo nuevamente.'));
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  };

  const isSignUp = mode === 'signup';

  const passwordToggle = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={passwordVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
      hitSlop={10}
      onPress={() => setPasswordVisible(visible => !visible)}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <Image source={ICONS.eye} style={[styles.icon, !passwordVisible && styles.iconMuted]} contentFit="contain" />
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            <Animated.View layout={moveLayout} style={styles.tabs}>
              <HanetSegmented
                accessibilityLabel="Tipo de cuenta"
                value={mode}
                onChange={changeMode}
                options={[
                  { value: 'login', label: 'Cuenta existente', accessibilityLabel: 'Cuenta existente' },
                  { value: 'signup', label: 'Cuenta nueva', accessibilityLabel: 'Cuenta nueva' },
                ]}
              />
            </Animated.View>

            {isSignUp && (
              <Animated.View key="progress" entering={appear} exiting={vanish} layout={moveLayout}>
                <OnboardingProgress step={1} />
              </Animated.View>
            )}
            {!isSignUp && (
              <Animated.View key="welcome" entering={appear} exiting={vanish} layout={moveLayout}>
                <ThemedText style={styles.welcome}>¡Qué bien que vuelves!</ThemedText>
              </Animated.View>
            )}

            <Animated.View layout={moveLayout} style={styles.headline}>
              <ThemedText accessibilityRole="header" style={styles.headlineText}>HaNet ID</ThemedText>
              <Image source={ICONS.logo} style={styles.logo} contentFit="contain" accessibilityLabel="HaNet" />
            </Animated.View>

            {isSignUp && (
              <Animated.View key="identity" entering={appear} exiting={vanish} layout={moveLayout} style={styles.group}>
                <HanetField
                  label="Nombres y Apellidos"
                  value={fullName}
                  onChangeText={setFullName}
                  autoCapitalize="words"
                  autoComplete="name"
                  textContentType="name"
                  returnKeyType="next"
                  onSubmitEditing={() => usernameRef.current?.focus()}
                  onBlur={() => leave('fullName')}
                  invalid={flag('fullName')}
                  editable={!loading}
                />
                <HanetField
                  ref={usernameRef}
                  label="HaNet ID (nombre de usuario)"
                  value={username}
                  onChangeText={(text) => setUsername(text.replace(/\s/g, '').toLowerCase())}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="username-new"
                  textContentType="username"
                  returnKeyType="next"
                  onSubmitEditing={() => emailRef.current?.focus()}
                  leading={<Image source={ICONS.at} style={styles.icon} contentFit="contain" />}
                  onBlur={() => leave('username')}
                  invalid={flag('username')}
                  editable={!loading}
                />
                <ThemedText style={[styles.hint, styles.hintWrap]}>De 3 a 24 caracteres: letras, números, punto o guion bajo.</ThemedText>
              </Animated.View>
            )}

            <Animated.View layout={moveLayout}>
            <HanetField
              ref={emailRef}
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              keyboardType="email-address"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              trailing={<Image source={ICONS.mail} style={styles.icon} contentFit="contain" />}
              onBlur={() => leave('email')}
              invalid={isSignUp && flag('email')}
              editable={!loading}
            />
            </Animated.View>

            <Animated.View layout={moveLayout}>
            <HanetField
              ref={passwordRef}
              label="Contraseña"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!passwordVisible}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              textContentType={isSignUp ? 'newPassword' : 'password'}
              returnKeyType={isSignUp ? 'done' : 'go'}
              onSubmitEditing={isSignUp ? undefined : handleLogin}
              trailing={passwordToggle}
              onBlur={() => leave('password')}
              invalid={isSignUp && flag('password')}
              editable={!loading}
            />
            </Animated.View>

            {isSignUp && (
              <Animated.View key="password-hint" entering={appear} exiting={vanish} layout={moveLayout} style={styles.hintWrap}>
                <ThemedText style={styles.hint}>Mínimo {MIN_PASSWORD} caracteres.</ThemedText>
              </Animated.View>
            )}

            {isSignUp ? (
              <Animated.View key="signup-extra" entering={appear} exiting={vanish} layout={moveLayout} style={styles.group}>
                <View>
                  <ThemedText style={styles.sectionLabel}>¿Cómo prefieres que te tratemos?</ThemedText>
                  <HanetSegmented
                    tall
                    accessibilityLabel="Tratamiento"
                    value={treatment}
                    onChange={setTreatment}
                    options={[
                      { value: 'el', accessibilityLabel: 'Él', icon: active => <Image source={ICONS.male} style={styles.icon} tintColor={active ? AppColors.controlOnActive : undefined} contentFit="contain" /> },
                      { value: 'ella', accessibilityLabel: 'Ella', icon: active => <Image source={ICONS.female} style={styles.icon} tintColor={active ? AppColors.controlOnActive : undefined} contentFit="contain" /> },
                      { value: 'neutro', label: 'No decirlo', accessibilityLabel: 'No decirlo, trato neutro' },
                    ]}
                  />
                </View>

                {/* The link sits outside the checkbox so reading the terms does not tick it. */}
                <View style={styles.terms}>
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityLabel="Acepto los Términos y Condiciones"
                    accessibilityState={{ checked: acceptedTerms }}
                    onPress={() => setAcceptedTerms(accepted => !accepted)}
                    hitSlop={12}
                    style={({ pressed }) => [styles.termsToggle, pressed && styles.pressed]}
                  >
                    <View style={[styles.checkbox, acceptedTerms && styles.checkboxChecked]}>
                      {acceptedTerms && <ThemedText style={styles.checkmark}>✓</ThemedText>}
                    </View>
                    <ThemedText style={styles.termsText}>Acepto los</ThemedText>
                  </Pressable>
                  <Pressable
                    accessibilityRole="link"
                    accessibilityLabel="Leer los Términos y Condiciones"
                    onPress={() => void WebBrowser.openBrowserAsync(TERMS_URL)}
                    hitSlop={8}
                    style={({ pressed }) => pressed && styles.pressed}
                  >
                    <ThemedText style={[styles.termsText, styles.termsLink]}>Términos y Condiciones</ThemedText>
                  </Pressable>
                </View>
              </Animated.View>
            ) : (
              <Animated.View key="forgot" entering={appear} exiting={vanish} layout={moveLayout}>
                <Pressable
                  accessibilityRole="button"
                  onPress={handleForgotPassword}
                  disabled={loading}
                  hitSlop={8}
                  style={({ pressed }) => [styles.forgot, pressed && styles.pressed]}
                >
                  <ThemedText style={styles.forgotText}>Olvidé mis credenciales</ThemedText>
                </Pressable>
              </Animated.View>
            )}

            {!!error && (
              <Animated.View entering={appear} layout={moveLayout}>
                <ThemedText accessibilityLiveRegion="assertive" style={styles.error}>{error}</ThemedText>
              </Animated.View>
            )}
            {!!notice && (
              <Animated.View entering={appear} layout={moveLayout}>
                <ThemedText accessibilityLiveRegion="polite" style={styles.notice}>{notice}</ThemedText>
              </Animated.View>
            )}

            <Animated.View layout={moveLayout}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: loading, busy: loading }}
              disabled={loading}
              onPress={isSignUp ? handleSignUp : handleLogin}
              style={({ pressed }) => [styles.submit, pressed && styles.pressed, loading && styles.submitBusy]}
            >
              <ThemedText style={styles.submitText}>
                {loading ? (isSignUp ? 'Creando tu cuenta…' : 'Entrando…') : isSignUp ? 'Crear cuenta HaNet ID' : '¡Iniciemos!'}
              </ThemedText>
              {!loading && <Image source={ICONS.arrow} style={styles.icon} contentFit="contain" />}
            </Pressable>
            </Animated.View>
          </View>

          {/* Signing in with Google is paused in auth-service, so it says so. */}
          <Animated.View layout={moveLayout} style={styles.quick}>
            <View>
              <ThemedText style={styles.quickTitle}>Inicia rápidamente</ThemedText>
              {isSignUp && <ThemedText style={styles.quickNote}>Aceptas los Términos y Condiciones.</ThemedText>}
            </View>
            <View
              accessible
              accessibilityRole="button"
              accessibilityLabel="Continuar con Google, próximamente"
              accessibilityState={{ disabled: true }}
              style={styles.quickButton}
            >
              <Image source={ICONS.google} style={styles.icon} contentFit="contain" />
              <ThemedText style={styles.quickSoon}>Próximamente</ThemedText>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AppColors.canvas,
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
  quick: {
    gap: AppSpacing.xl,
    paddingHorizontal: AppSpacing.xxl,
    paddingVertical: 40,
    borderRadius: AppRadii.xl,
    borderCurve: 'continuous',
    backgroundColor: AppColors.accent,
  },
  quickTitle: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 24,
    lineHeight: 34,
    letterSpacing: -0.96,
    color: AppColors.textOnLight,
  },
  quickNote: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: -0.2,
    color: AppColors.textOnLight,
  },
  quickButton: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: AppSpacing.md,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.surface,
  },
  quickSoon: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 14,
    lineHeight: 21,
    letterSpacing: -0.35,
    color: AppColors.textSecondary,
    opacity: 0.7,
  },
  card: {
    padding: AppSpacing.xxl,
    gap: AppSpacing.xl,
    borderRadius: AppRadii.xl,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  tabs: {
    paddingBottom: AppSpacing.md,
  },
  welcome: {
    marginBottom: -AppSpacing.md,
    fontFamily: 'DMSans_700Bold',
    fontSize: 14,
    lineHeight: 21,
    letterSpacing: -0.35,
    color: AppColors.textSecondary,
    opacity: 0.75,
  },
  headline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.sm,
  },
  headlineText: {
    flex: 1,
    fontFamily: 'DMSans_700Bold',
    fontSize: 36,
    lineHeight: 43,
    letterSpacing: -1.62,
    color: AppColors.textSecondary,
  },
  logo: {
    width: 47,
    height: 43,
  },
  icon: {
    width: 24,
    height: 24,
  },
  iconMuted: {
    opacity: 0.55,
  },
  group: {
    gap: AppSpacing.xl,
  },
  hintWrap: {
    marginTop: -AppSpacing.lg,
  },
  hint: {
    paddingHorizontal: AppSpacing.sm,
    fontFamily: 'DMSans_500Medium',
    fontSize: 12,
    lineHeight: 16,
    color: AppColors.textSecondary,
    opacity: 0.8,
  },
  sectionLabel: {
    marginBottom: AppSpacing.sm,
    fontFamily: 'DMSans_700Bold',
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: -0.24,
    color: AppColors.textSecondary,
    opacity: 0.75,
  },
  terms: {
    minHeight: AppTouch.minimum,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: 5,
  },
  termsToggle: {
    minHeight: AppTouch.minimum,
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.sm,
  },
  termsLink: {
    flex: 0,
    fontFamily: 'DMSans_600SemiBold',
    textDecorationLine: 'underline',
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: AppColors.textSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    borderColor: AppColors.accent,
    backgroundColor: AppColors.accent,
  },
  checkmark: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 12,
    lineHeight: 16,
    color: AppColors.textPrimary,
  },
  termsText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: -0.4,
    color: AppColors.textPrimary,
  },
  forgot: {
    minHeight: AppTouch.minimum,
    alignSelf: 'flex-end',
    justifyContent: 'center',
  },
  forgotText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: -0.4,
    color: AppColors.textPrimary,
  },
  error: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.errorText,
  },
  notice: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.textSecondary,
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
  submitBusy: {
    opacity: 0.6,
  },
  submitText: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: -0.4,
    color: AppColors.textPrimary,
  },
  pressed: AppPressed,
});
