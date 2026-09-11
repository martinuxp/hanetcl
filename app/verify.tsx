import { AppColors } from '@/constants/design-tokens';
import React, { useState, useRef } from 'react';
import { View, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import Svg, { Path } from 'react-native-svg';

function HanetLogo() {
  return (
    <Svg width={40} height={40} viewBox="0 0 24 36" fill="none">
      <Path d="M0 0L8.537 8V16.333L12.806 16.833V11.167L23.97 12.167V23.833L12.806 24.833V19.167L8.537 19.667V28L0 36V0Z" fill={AppColors.accent} />
    </Svg>
  );
}

export default function VerifyScreen() {
  const router = useRouter();
  const [code, setCode] = useState(['', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputs = useRef<(TextInput | null)[]>([]);

  const handleCodeChange = (text: string, index: number) => {
    const newCode = [...code];
    newCode[index] = text;
    setCode(newCode);
    if (text && index < 3) {
      inputs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !code[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  };

  const handleVerify = () => {
    setLoading(true);
    setError('');
    setTimeout(() => {
      setLoading(false);
      // Placeholder — would check code here
      setError('Código incorrecto. Intenta de nuevo.');
    }, 2000);
  };

  return (
    <View style={styles.container}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ThemedText style={styles.backArrow}>←</ThemedText>
        </TouchableOpacity>
        <ThemedText style={styles.topBarTitle}>Verificar email</ThemedText>
      </View>

      <View style={styles.content}>
        {/* Form card */}
        <View style={styles.card}>
          <View style={styles.headlineRow}>
            <ThemedText style={styles.headline}>Verifica tu identidad</ThemedText>
            <HanetLogo />
          </View>

          <ThemedText style={styles.subtitle}>
            Se envió un código de verificación a{'\n'}
            <ThemedText style={styles.emailHighlight}>hristov123@gmail.com</ThemedText>
          </ThemedText>

          {/* Code inputs */}
          <View style={styles.codeRow}>
            {code.map((digit, i) => (
              <TextInput
                key={i}
                ref={(ref) => { inputs.current[i] = ref; }}
                style={styles.codeInput}
                value={digit}
                onChangeText={(t) => handleCodeChange(t, i)}
                onKeyPress={(e) => handleKeyPress(e, i)}
                keyboardType="number-pad"
                maxLength={1}
                textAlign="center"
                placeholderTextColor="rgba(250,250,249,0.3)"
                placeholder="—"
              />
            ))}
          </View>

          <TouchableOpacity>
            <ThemedText style={styles.resendText}>Re-enviar código de verificación</ThemedText>
          </TouchableOpacity>

          {/* Verify button */}
          <TouchableOpacity style={styles.verifyButton} onPress={handleVerify} disabled={loading}>
            <ThemedText style={styles.verifyText}>
              {loading ? 'Cargando...' : 'Verificar'}
            </ThemedText>
            {!loading && <ThemedText style={styles.verifyArrow}>→</ThemedText>}
          </TouchableOpacity>

          {/* Error */}
          {error ? (
            <View style={styles.errorRow}>
              <ThemedText style={styles.errorIcon}>⚠️</ThemedText>
              <ThemedText style={styles.errorText}>{error}</ThemedText>
            </View>
          ) : null}

          {/* Explanation */}
          <ThemedText style={styles.explainText}>
            ¿Por que un código al email?{'\n'}
            Al enviarte un código a tu email nos aseguramos que la persona que esta registrándose en HaNet seas realmente tú.
          </ThemedText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: AppColors.textOnLight },

  topBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 68, paddingHorizontal: 12, paddingBottom: 20,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 80, // Offset to make it look visually centered despite top bar
  },
  backButton: {
    width: 56, height: 40, justifyContent: 'center', alignItems: 'center',
  },
  backArrow: { fontSize: 22, color: AppColors.textPrimary },
  topBarTitle: {
    fontSize: 18, fontFamily: 'DMSans_500Medium', color: AppColors.textPrimary,
  },

  card: {
    backgroundColor: AppColors.surface,
    borderRadius: 32, marginHorizontal: 12,
    padding: 32, gap: 20,
  },

  headlineRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  headline: {
    fontSize: 22, fontFamily: 'DMSans_700Bold', color: AppColors.textPrimary, letterSpacing: -0.6,
  },

  subtitle: {
    fontSize: 14, fontFamily: 'DMSans_400Regular', color: AppColors.textPrimary, opacity: 0.8, lineHeight: 20,
  },
  emailHighlight: {
    fontFamily: 'DMSans_700Bold', opacity: 1,
  },

  codeRow: { flexDirection: 'row', gap: 12, justifyContent: 'center' },
  codeInput: {
    width: 63, height: 83, backgroundColor: AppColors.textOnLight,
    borderRadius: 16, fontSize: 28, fontFamily: 'DMSans_700Bold',
    color: AppColors.textPrimary, textAlign: 'center',
  },

  resendText: {
    fontSize: 13, fontFamily: 'DMSans_500Medium', color: AppColors.textPrimary,
    opacity: 0.7, textAlign: 'center',
  },

  verifyButton: {
    backgroundColor: AppColors.primary, height: 56, borderRadius: 28,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  verifyText: { fontSize: 15, fontFamily: 'DMSans_700Bold', color: AppColors.textPrimary },
  verifyArrow: { fontSize: 18, color: AppColors.textPrimary },

  errorRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  errorIcon: { fontSize: 16 },
  errorText: { fontSize: 12, fontFamily: 'DMSans_500Medium', color: AppColors.accent },

  explainText: {
    fontSize: 13, fontFamily: 'DMSans_400Regular', color: AppColors.textPrimary,
    opacity: 0.6, textAlign: 'center', lineHeight: 18,
  },
});
