import { ThemedText } from '@/components/themed-text';
import { HanetButton } from '@/components/ui/hanet-button';
import { CustomIcon } from '@/components/ui/custom-icon';
import { AppColors, AppRadii, AppSpacing } from '@/constants/design-tokens';
import { resetPassword, signInWithEmail, useSession } from '@/services/auth-service';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

type FieldName = 'email' | 'password';

function HanetLogo() {
  return (
    <Svg accessibilityLabel="HaNet" width={40} height={40} viewBox="0 0 24 36" fill="none">
      <Path d="M0 0L8.537 8V16.333L12.806 16.833V11.167L23.97 12.167V23.833L12.806 24.833V19.167L8.537 19.667V28L0 36V0Z" fill={AppColors.accent} />
    </Svg>
  );
}

function getAuthErrorMessage(error: unknown) {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : '';

  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return 'El correo o la contraseña no coinciden.';
    case 'auth/user-disabled':
      return 'Esta cuenta está desactivada. Contacta a tu institución.';
    case 'auth/too-many-requests':
      return 'Hubo demasiados intentos. Espera un momento e inténtalo nuevamente.';
    case 'auth/network-request-failed':
      return 'No pudimos conectarnos. Revisa tu conexión a internet.';
    default:
      return 'No pudimos iniciar sesión. Inténtalo nuevamente.';
  }
}

export default function AuthScreen() {
  const router = useRouter();
  const { user } = useSession();
  const passwordRef = useRef<TextInput>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [focusedField, setFocusedField] = useState<FieldName | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (user) router.replace('/(tabs)');
  }, [router, user]);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const handleEmailAuth = async () => {
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
      setError(getAuthErrorMessage(authError));
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
      setError(getAuthErrorMessage(resetError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.topBar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Volver"
              hitSlop={8}
              onPress={goBack}
              style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
            >
              <CustomIcon name="chevron-left" size={22} color={AppColors.controlOnActive} />
            </Pressable>
            <ThemedText style={styles.topBarTitle}>Iniciar sesión</ThemedText>
          </View>

          <View style={styles.content}>
            <ThemedText style={styles.eyebrow}>¡Qué bien que vuelves!</ThemedText>

            <View style={styles.headlineRow}>
              <ThemedText accessibilityRole="header" style={styles.headline}>HaNet ID</ThemedText>
              <HanetLogo />
            </View>

            <ThemedText style={styles.intro}>
              Accede con el correo asociado a tu identidad HaNet.
            </ThemedText>

            <View style={styles.formSection}>
              <View style={[styles.inputContainer, focusedField === 'email' && styles.inputFocused]}>
                <ThemedText style={styles.inputLabel}>Correo electrónico</ThemedText>
                <TextInput
                  accessibilityLabel="Correo electrónico"
                  autoCapitalize="none"
                  autoComplete="email"
                  autoCorrect={false}
                  keyboardType="email-address"
                  onBlur={() => setFocusedField(null)}
                  onChangeText={setEmail}
                  onFocus={() => setFocusedField('email')}
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  placeholder="nombre@correo.com"
                  placeholderTextColor="rgba(249,249,250,0.38)"
                  returnKeyType="next"
                  style={styles.inputField}
                  textContentType="emailAddress"
                  value={email}
                />
              </View>

              <View style={[styles.inputContainer, focusedField === 'password' && styles.inputFocused]}>
                <ThemedText style={styles.inputLabel}>Contraseña</ThemedText>
                <View style={styles.passwordRow}>
                  <TextInput
                    ref={passwordRef}
                    accessibilityLabel="Contraseña"
                    autoCapitalize="none"
                    autoComplete="current-password"
                    onBlur={() => setFocusedField(null)}
                    onChangeText={setPassword}
                    onFocus={() => setFocusedField('password')}
                    onSubmitEditing={() => void handleEmailAuth()}
                    placeholder="••••••••"
                    placeholderTextColor="rgba(249,249,250,0.38)"
                    returnKeyType="go"
                    secureTextEntry={!passwordVisible}
                    style={[styles.inputField, styles.passwordInput]}
                    textContentType="password"
                    value={password}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={passwordVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    hitSlop={8}
                    onPress={() => setPasswordVisible((value) => !value)}
                    style={({ pressed }) => [styles.passwordToggle, pressed && styles.pressed]}
                  >
                    <ThemedText style={styles.passwordToggleText}>{passwordVisible ? 'Ocultar' : 'Mostrar'}</ThemedText>
                  </Pressable>
                </View>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Recuperar contraseña"
                accessibilityState={{ disabled: loading }}
                disabled={loading}
                onPress={() => void handleForgotPassword()}
                style={({ pressed }) => [styles.forgotButton, pressed && !loading && styles.pressed]}
              >
                <ThemedText style={styles.forgotText}>¿Olvidaste tu contraseña?</ThemedText>
              </Pressable>

              {error && (
                <View accessibilityLiveRegion="assertive" style={styles.feedbackRow}>
                  <CustomIcon name="warning" size={18} color={AppColors.accent} />
                  <ThemedText style={styles.errorText}>{error}</ThemedText>
                </View>
              )}

              {notice && (
                <View accessibilityLiveRegion="polite" style={styles.feedbackRow}>
                  <CustomIcon name="check-circle" size={18} color={AppColors.controlActive} />
                  <ThemedText style={styles.noticeText}>{notice}</ThemedText>
                </View>
              )}

              <HanetButton
                accessibilityHint="Acceder a HaNet con estas credenciales"
                disabled={loading}
                label={loading ? 'Iniciando sesión…' : 'Iniciar sesión'}
                onPress={() => void handleEmailAuth()}
                style={styles.ctaButton}
              />
            </View>

            <View style={styles.registrationNotice}>
              <ThemedText style={styles.registrationTitle}>¿Aún no tienes HaNet ID?</ThemedText>
              <ThemedText style={styles.registrationText}>
                El registro institucional estará disponible cuando terminemos el enlace seguro de matrículas.
              </ThemedText>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: AppColors.canvas },
  scrollContent: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    paddingHorizontal: AppSpacing.xl,
    paddingBottom: 48,
  },
  topBar: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: AppRadii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AppColors.controlActive,
  },
  topBarTitle: {
    color: AppColors.textPrimary,
    fontFamily: 'DMSans_500Medium',
    fontSize: 17,
    lineHeight: 24,
  },
  content: { flex: 1, justifyContent: 'center', paddingVertical: AppSpacing.xl },
  eyebrow: {
    color: AppColors.textSecondary,
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: AppSpacing.xs,
  },
  headlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: AppSpacing.sm,
  },
  headline: {
    color: AppColors.textPrimary,
    fontFamily: 'DMSans_700Bold',
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: -1.2,
  },
  intro: {
    color: AppColors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: AppSpacing.xl,
    maxWidth: 360,
  },
  formSection: { gap: AppSpacing.md },
  inputContainer: {
    minHeight: 62,
    borderRadius: AppRadii.md,
    borderCurve: 'continuous',
    borderWidth: 1.5,
    borderColor: 'transparent',
    backgroundColor: AppColors.surface,
    justifyContent: 'center',
    paddingHorizontal: AppSpacing.lg,
    paddingVertical: AppSpacing.sm,
  },
  inputFocused: { borderColor: AppColors.controlActive },
  inputLabel: {
    color: AppColors.textSecondary,
    fontFamily: 'DMSans_400Regular',
    fontSize: 11,
    lineHeight: 15,
  },
  inputField: {
    minHeight: 26,
    color: AppColors.textPrimary,
    fontFamily: 'DMSans_500Medium',
    fontSize: 16,
    lineHeight: 22,
    padding: 0,
    outlineStyle: 'none' as any,
  },
  passwordRow: { flexDirection: 'row', alignItems: 'center', gap: AppSpacing.sm },
  passwordInput: { flex: 1 },
  passwordToggle: { minWidth: 60, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
  passwordToggleText: {
    color: AppColors.textSecondary,
    fontFamily: 'DMSans_700Bold',
    fontSize: 12,
    lineHeight: 18,
  },
  forgotButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  forgotText: {
    color: AppColors.textSecondary,
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
    lineHeight: 20,
  },
  feedbackRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: AppSpacing.sm,
    paddingHorizontal: AppSpacing.md,
  },
  errorText: { flex: 1, color: AppColors.accent, fontSize: 13, lineHeight: 19 },
  noticeText: { flex: 1, color: AppColors.textSecondary, fontSize: 13, lineHeight: 19 },
  ctaButton: { minHeight: 56, width: '100%' },
  registrationNotice: {
    marginTop: AppSpacing.xl,
    borderRadius: AppRadii.lg,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
    padding: AppSpacing.lg,
    gap: AppSpacing.xs,
  },
  registrationTitle: {
    color: AppColors.textPrimary,
    fontFamily: 'DMSans_700Bold',
    fontSize: 14,
    lineHeight: 20,
  },
  registrationText: { color: AppColors.textSecondary, fontSize: 13, lineHeight: 19 },
  pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
});
