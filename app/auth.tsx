import { AppColors } from '@/constants/design-tokens';
import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import {
  useSession,
  signInWithEmail, 
  signUpWithEmail,
  checkEnrollment,
  resetPassword 
} from '@/services/auth-service';
import Svg, { Path, Rect, G, ClipPath, Defs } from 'react-native-svg';

// Hanet logo (simplified from HanetCalendarvector.svg)
function HanetLogo() {
  return (
    <Svg width={40} height={40} viewBox="0 0 24 36" fill="none">
      <Path d="M0 0L8.537 8V16.333L12.806 16.833V11.167L23.97 12.167V23.833L12.806 24.833V19.167L8.537 19.667V28L0 36V0Z" fill={AppColors.accent} />
    </Svg>
  );
}

// Google "Continue with Google" SVG
function GoogleIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
      <G clipPath="url(#c)">
        <Path d="M19.6 10.227c0-.709-.064-1.39-.182-2.045H10v3.868h5.382c-.232 1.25-.926 2.31-1.964 3.018v2.509h3.232c1.891-1.741 2.95-4.305 2.95-7.35z" fill="#4285F4"/>
        <Path d="M10 20c2.7 0 4.964-.895 6.618-2.423l-3.232-2.509c-.895.6-2.04.955-3.386.955-2.605 0-4.81-1.76-5.596-4.123H1.064v2.59A9.996 9.996 0 0 0 10 20z" fill="#34A853"/>
        <Path d="M4.404 11.9c-.2-.6-.314-1.241-.314-1.9 0-.659.114-1.3.314-1.9V5.509H1.064A9.996 9.996 0 0 0 0 10c0 1.614.386 3.141 1.064 4.491l3.34-2.591z" fill="#FBBC04"/>
        <Path d="M10 3.977c1.468 0 2.786.505 3.823 1.496l2.868-2.868C14.959.99 12.695 0 10 0 6.09 0 2.709 2.24 1.064 5.509L4.404 8.1C5.19 5.736 7.396 3.977 10 3.977z" fill="#E94235"/>
      </G>
      <Defs><ClipPath id="c"><Rect width={20} height={20} fill="white"/></ClipPath></Defs>
    </Svg>
  );
}

export default function AuthScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rut, setRut] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | 'none'>('none');
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const { user } = useSession();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEmailAuth = async () => {
    setError(null);
    if (!email || !password) {
      setError('Por favor completa todos los campos.');
      return;
    }

    setLoading(true);
    try {
      if (activeTab === 'login') {
        await signInWithEmail(email, password);
      } else {
        if (!rut || !acceptedTerms) {
          setError('Ingresa tu RUT y acepta los términos.');
          setLoading(false);
          return;
        }

        // 1. Verify RUT against Database
        let enrollmentData;
        try {
          enrollmentData = await checkEnrollment(rut);
        } catch (e: any) {
          if (e.message === 'RUT_NOT_FOUND') {
            setError('RUT no encontrado en la lista institucional.');
          } else if (e.message === 'RUT_ALREADY_LINKED') {
            setError('Este RUT ya tiene una cuenta HaNet creada.');
          } else {
            setError('Error validando RUT en el sistema.');
          }
          setLoading(false);
          return;
        }

        // 2. Create the account with institutional data
        const cleanRut = rut.replace(/[^0-9kK]/g, '').toUpperCase();
        await signUpWithEmail(email, password, cleanRut, enrollmentData.courseId, enrollmentData.fullName);
      }
    } catch (err: any) {
      console.error(err);
      setError('Error: Credenciales inválidas o cuenta ya existente.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError('Ingresa tu correo para restablecer la contraseña.');
      return;
    }
    try {
      await resetPassword(email);
      alert('Correo de recuperación enviado.');
    } catch {
      setError('Error al enviar el correo.');
    }
  };

  // Redirect if already logged in
  React.useEffect(() => {
    if (user) {
      router.replace('/(tabs)');
    }
  }, [router, user]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

          {/* Segmented Picker */}
          <View style={styles.segmentedPicker}>
            <TouchableOpacity
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTab === 'login' }}
              style={[styles.segmentBtn, activeTab === 'login' && styles.segmentBtnActive]}
              onPress={() => setActiveTab('login')}
            >
              <ThemedText style={[styles.segmentText, activeTab === 'login' && styles.segmentTextActive]}>Cuenta existente</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTab === 'signup' }}
              style={[styles.segmentBtn, activeTab === 'signup' && styles.segmentBtnActive]}
              onPress={() => setActiveTab('signup')}
            >
              <ThemedText style={[styles.segmentText, activeTab === 'signup' && styles.segmentTextActive]}>Cuenta nueva</ThemedText>
            </TouchableOpacity>
          </View>

          {/* Welcome text */}
          {activeTab === 'login' && (
            <ThemedText style={styles.welcomeText}>¡Qué bien que vuelves!</ThemedText>
          )}

          {/* Headline + Logo */}
          <View style={styles.headlineRow}>
            <ThemedText style={styles.headline}>HaNet ID</ThemedText>
            <HanetLogo />
          </View>

          {/* Forms */}
          <View style={styles.formSection}>
            {activeTab === 'signup' && (
              <View style={styles.inputContainer}>
                <ThemedText style={styles.inputLabel}>RUT del alumno</ThemedText>
                <TextInput
                  accessibilityLabel="RUT del alumno"
                  style={styles.inputField}
                  value={rut}
                  onChangeText={setRut}
                  placeholder="Ej: 21.345.678-9"
                  placeholderTextColor="rgba(250,250,249,0.3)"
                />
              </View>
            )}

            <View style={styles.inputContainer}>
              <ThemedText style={styles.inputLabel}>Email</ThemedText>
              <TextInput
                accessibilityLabel="Correo electrónico"
                style={styles.inputField}
                value={email}
                onChangeText={setEmail}
                placeholder="ejemplo@correo.com"
                placeholderTextColor="rgba(250,250,249,0.3)"
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputContainer}>
              <ThemedText style={styles.inputLabel}>Contraseña</ThemedText>
              <TextInput
                accessibilityLabel="Contraseña"
                style={styles.inputField}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor="rgba(250,250,249,0.3)"
                secureTextEntry
              />
            </View>

            {activeTab === 'signup' && (
              <>
                {/* Gender picker */}
                <View style={styles.genderPicker}>
                  <TouchableOpacity
                    accessibilityRole="radio"
                    accessibilityLabel="Masculino"
                    accessibilityState={{ selected: gender === 'male' }}
                    style={[styles.genderBtn, gender === 'male' && styles.genderBtnActive]}
                    onPress={() => setGender('male')}
                  >
                    <ThemedText style={styles.genderIcon}>♂</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    accessibilityRole="radio"
                    accessibilityLabel="Femenino"
                    accessibilityState={{ selected: gender === 'female' }}
                    style={[styles.genderBtn, gender === 'female' && styles.genderBtnActive]}
                    onPress={() => setGender('female')}
                  >
                    <ThemedText style={styles.genderIcon}>♀</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    accessibilityRole="radio"
                    accessibilityLabel="Prefiero no decirlo"
                    accessibilityState={{ selected: gender === 'none' }}
                    style={[styles.genderBtn, gender === 'none' && styles.genderBtnActive]}
                    onPress={() => setGender('none')}
                  >
                    <ThemedText style={styles.genderText}>No decirlo</ThemedText>
                  </TouchableOpacity>
                </View>

                {/* T&C checkbox */}
                <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked: acceptedTerms }} style={styles.checkboxRow} onPress={() => setAcceptedTerms(!acceptedTerms)}>
                  <View style={[styles.checkbox, acceptedTerms && styles.checkboxChecked]}>
                    {acceptedTerms && <ThemedText style={styles.checkmark}>✓</ThemedText>}
                  </View>
                  <ThemedText style={styles.checkboxLabel}>Acepto los Términos y Condiciones.</ThemedText>
                </TouchableOpacity>
              </>
            )}

            {activeTab === 'login' && (
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Recuperar contraseña" style={styles.forgotButton} onPress={handleForgotPassword}>
                <ThemedText style={styles.forgotText}>¿Olvidaste tus credenciales?</ThemedText>
              </TouchableOpacity>
            )}

            {error && (
              <ThemedText accessibilityLiveRegion="polite" style={{ color: AppColors.accent, textAlign: 'center', marginBottom: 15, fontSize: 13 }}>
                {error}
              </ThemedText>
            )}

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{ disabled: loading }}
              style={[styles.ctaButton, loading && { opacity: 0.7 }]}
              onPress={handleEmailAuth}
              disabled={loading}
            >
              <ThemedText style={styles.ctaText}>
                {loading ? 'Procesando…' : (activeTab === 'login' ? '¡Iniciemos!' : 'Crear cuenta HaNet ID')}
              </ThemedText>
              {!loading && <ThemedText style={styles.ctaArrow}>→</ThemedText>}
            </TouchableOpacity>
          </View>

          {/* Social Login */}
          <View style={styles.socialSection}>
            <View style={styles.socialTextRow}>
              <ThemedText style={styles.socialTitle}>Inicia rápidamente</ThemedText>
              {activeTab === 'signup' && (
                <ThemedText style={styles.socialSub}>Aceptas los Términos y Condiciones.</ThemedText>
              )}
            </View>
            <TouchableOpacity 
              accessibilityRole="button"
              accessibilityLabel="Inicio con Google desactivado"
              accessibilityState={{ disabled: true }}
              disabled
              style={[styles.googleButton, { opacity: 0.5, backgroundColor: '#f5f5f5' }]} 
              activeOpacity={1}
            >
              <GoogleIcon />
              <ThemedText style={[styles.googleText, { color: '#999' }]}>
                Inicio con Google desactivado
              </ThemedText>
            </TouchableOpacity>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: AppColors.textOnLight },
  scrollContent: { flexGrow: 1, justifyContent: 'center', width: '100%', maxWidth: 560, alignSelf: 'center', paddingBottom: 60, paddingVertical: 40 },

  // Segmented Picker
  segmentedPicker: {
    flexDirection: 'row',
    backgroundColor: AppColors.surface,
    borderRadius: 24,
    marginHorizontal: 44,
    padding: 8,
    marginBottom: 24,
  },
  segmentBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  segmentBtnActive: { backgroundColor: AppColors.controlActive },
  segmentText: {
    fontSize: 13,
    fontFamily: 'DMSans_500Medium',
    color: AppColors.textPrimary,
    opacity: 0.5,
  },
  segmentTextActive: { opacity: 1, color: AppColors.controlOnActive, fontFamily: 'DMSans_700Bold' },

  // Welcome
  welcomeText: {
    color: AppColors.textPrimary,
    fontSize: 14,
    fontFamily: 'DMSans_500Medium',
    opacity: 0.7,
    marginHorizontal: 44,
    marginBottom: 8,
  },

  // Headline
  headlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 44,
    marginBottom: 24,
  },
  headline: {
    fontSize: 32,
    fontFamily: 'DMSans_700Bold',
    color: AppColors.textPrimary,
    letterSpacing: -1.2,
    lineHeight: 38,
    paddingTop: 8,
  },

  // Forms
  formSection: { paddingHorizontal: 44, gap: 16 },
  inputContainer: {
    backgroundColor: AppColors.surface,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 9,
    height: 56,
    justifyContent: 'center',
  },
  inputLabel: {
    fontSize: 11,
    fontFamily: 'DMSans_400Regular',
    color: AppColors.textPrimary,
    opacity: 0.5,
    lineHeight: 14,
  },
  inputField: {
    fontSize: 15,
    fontFamily: 'DMSans_500Medium',
    color: AppColors.textPrimary,
    padding: 0,
    height: 24,
  },

  // Gender
  genderPicker: {
    flexDirection: 'row',
    backgroundColor: AppColors.surface,
    borderRadius: 24,
    padding: 8,
    gap: 4,
  },
  genderBtn: {
    flex: 1,
    height: 50,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  genderBtnActive: { backgroundColor: AppColors.primary },
  genderIcon: { fontSize: 22, color: AppColors.textPrimary },
  genderText: { fontSize: 13, fontFamily: 'DMSans_500Medium', color: AppColors.textPrimary },

  // Checkbox
  checkboxRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkbox: {
    width: 18, height: 18, borderRadius: 4,
    borderWidth: 1.5, borderColor: AppColors.textPrimary,
    justifyContent: 'center', alignItems: 'center',
  },
  checkboxChecked: { backgroundColor: AppColors.primary, borderColor: AppColors.primary },
  checkmark: { fontSize: 12, color: AppColors.textPrimary, lineHeight: 14 },
  checkboxLabel: { fontSize: 13, fontFamily: 'DMSans_500Medium', color: AppColors.textPrimary },

  // Forgot
  forgotText: {
    fontSize: 13, fontFamily: 'DMSans_500Medium',
    color: AppColors.textPrimary, textAlign: 'center', opacity: 0.8,
  },
  forgotButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },

  // CTA
  ctaButton: {
    backgroundColor: AppColors.primary,
    height: 56, borderRadius: 28,
    flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  ctaText: { fontSize: 15, fontFamily: 'DMSans_700Bold', color: AppColors.textPrimary },
  ctaArrow: { fontSize: 18, color: AppColors.textPrimary },

  // Social
  socialSection: {
    backgroundColor: AppColors.accent,
    borderRadius: 32,
    marginHorizontal: 12,
    marginTop: 24,
    padding: 32,
    gap: 16,
  },
  socialTextRow: { gap: 2 },
  socialTitle: {
    fontSize: 22, fontFamily: 'DMSans_700Bold',
    color: AppColors.textOnLight, fontStyle: 'italic', letterSpacing: -0.6,
  },
  socialSub: {
    fontSize: 12, fontFamily: 'DMSans_500Medium',
    color: AppColors.textOnLight, opacity: 0.7,
  },
  googleButton: {
    backgroundColor: '#F2F2F2',
    height: 40, borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  googleText: {
    fontSize: 14, fontFamily: 'DMSans_500Medium',
    color: '#1F1F1F',
  },
});
