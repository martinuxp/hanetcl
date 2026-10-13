import { ThemedText } from '@/components/themed-text';
import { HanetButton } from '@/components/ui/hanet-button';
import { AppColors, AppRadii, AppSpacing } from '@/constants/design-tokens';
import { describeAuthError } from '@/services/auth-service';
import { functions } from '@/services/firebase';
import { enablePush, openNotificationSettings, pushPermission, pushSupport, registerDevice } from '@/services/push-service';
import type { PushPermission } from '@/services/push-service';
import { httpsCallable } from 'firebase/functions';
import React, { useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

type DeviceResult = { platform: string; updatedAt: number | null; token: string; ok: boolean; error: string | null };

const PLATFORM_LABELS: Record<string, string> = { ios: 'iPhone', android: 'Android', web: 'Web', unknown: 'Dispositivo' };

// What Expo's errors mean, in words the team can act on.
const ERROR_HINTS: Record<string, string> = {
  DeviceNotRegistered: 'el teléfono ya no recibe (se desinstaló la app o se quitó el permiso); se borró su token',
  InvalidCredentials: 'faltan las credenciales de push del proyecto en EAS (FCM o APNs)',
  MessageTooBig: 'el mensaje es demasiado largo',
  MessageRateExceeded: 'demasiadas notificaciones seguidas a ese teléfono',
};

/**
 * Panel HNT: sends a test notification to the HNT's own devices or to an
 * account by its HaNet ID, and shows what happened on each device.
 */
export function PushTestCard() {
  const support = pushSupport();
  const [permission, setPermission] = useState<PushPermission | null>(null);
  const [username, setUsername] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState<'register' | 'send' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<DeviceResult[] | null>(null);

  useEffect(() => {
    void pushPermission().then(setPermission);
  }, []);

  const registerThisPhone = async () => {
    setBusy('register');
    setError(null);
    setMessage(null);
    const status = permission === 'granted' ? 'granted' : await enablePush();
    setPermission(status);
    if (status === 'granted') {
      setMessage((await registerDevice()) ? 'Este teléfono quedó registrado en tu cuenta.' : 'No pudimos obtener el token de este teléfono. Revisa la consola de Expo.');
    } else {
      setError('El permiso de notificaciones no está concedido en este teléfono.');
    }
    setBusy(null);
  };

  const send = async () => {
    setBusy('send');
    setError(null);
    setMessage(null);
    setResults(null);
    try {
      const result = await httpsCallable<object, { devices: DeviceResult[] }>(functions, 'adminSendTestPush')({ username: username.trim(), title: title.trim(), body: body.trim() });
      const target = username.trim() ? `@${username.trim().replace(/^@/, '')}` : 'tu cuenta';
      if (!result.data.devices.length) {
        setError(`${target} no tiene teléfonos registrados. Hay que abrir la app con esa cuenta y permitir las notificaciones.`);
      } else {
        const sent = result.data.devices.filter(device => device.ok).length;
        setMessage(`Expo aceptó ${sent} de ${result.data.devices.length} para ${target}. Debería llegar en unos segundos.`);
        setResults(result.data.devices);
      }
    } catch (sendError) {
      setError(describeAuthError(sendError, 'No pudimos enviar la notificación de prueba.'));
    } finally {
      setBusy(null);
    }
  };

  const status = support === 'web'
    ? 'Estás en la web: aquí no llegan push, pero puedes enviar a otra cuenta.'
    : support === 'expo-go-android'
      ? 'Expo Go en Android no recibe push (desde SDK 53). Puedes enviar a otra cuenta.'
      : permission === 'granted'
        ? 'Este teléfono tiene permiso para recibir notificaciones.'
        : permission === 'denied'
          ? 'Las notificaciones están bloqueadas en los ajustes de este teléfono.'
          : 'Este teléfono todavía no da permiso para notificaciones.';

  return (
    <View style={styles.card}>
      <ThemedText style={styles.title}>Probar notificaciones push</ThemedText>
      <ThemedText style={styles.muted}>{status}</ThemedText>
      {support === 'supported' && permission !== 'denied' && (
        <HanetButton label={busy === 'register' ? 'Registrando…' : 'Registrar este teléfono'} variant="surface" disabled={!!busy} onPress={() => void registerThisPhone()} />
      )}
      {support === 'supported' && permission === 'denied' && (
        <HanetButton label="Abrir ajustes" variant="surface" onPress={openNotificationSettings} />
      )}

      <TextInput
        accessibilityLabel="HaNet ID de destino (vacío: tu cuenta)"
        value={username}
        onChangeText={setUsername}
        placeholder="@hanetid (vacío: tu cuenta)"
        placeholderTextColor="rgba(221,221,226,0.4)"
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
      />
      <TextInput
        accessibilityLabel="Título"
        value={title}
        onChangeText={setTitle}
        placeholder="Prueba de HaNet"
        placeholderTextColor="rgba(221,221,226,0.4)"
        maxLength={80}
        style={styles.input}
      />
      <TextInput
        accessibilityLabel="Mensaje"
        value={body}
        onChangeText={setBody}
        placeholder="Si ves esto, las notificaciones funcionan."
        placeholderTextColor="rgba(221,221,226,0.4)"
        maxLength={200}
        multiline
        style={[styles.input, styles.multiline]}
      />
      <HanetButton label={busy === 'send' ? 'Enviando…' : 'Enviar notificación de prueba'} disabled={!!busy} onPress={() => void send()} />

      {!!message && <ThemedText accessibilityLiveRegion="polite" style={styles.message}>{message}</ThemedText>}
      {!!error && <ThemedText accessibilityLiveRegion="assertive" style={styles.error}>{error}</ThemedText>}
      {results?.map((device, index) => (
        <ThemedText key={index} style={device.ok ? styles.muted : styles.error}>
          {PLATFORM_LABELS[device.platform] ?? 'Dispositivo'} {device.token}
          {device.updatedAt ? ` · registrado el ${new Date(device.updatedAt).toLocaleDateString('es-CL')}` : ''}
          {device.ok ? ' · aceptada' : ` · ${device.error}${device.error && ERROR_HINTS[device.error] ? `: ${ERROR_HINTS[device.error]}` : ''}`}
        </ThemedText>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: AppSpacing.md,
    padding: AppSpacing.xl,
    borderRadius: AppRadii.lg,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  title: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: -0.5,
    color: AppColors.textPrimary,
  },
  muted: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.textSecondary,
  },
  input: {
    minHeight: 48,
    paddingHorizontal: AppSpacing.lg,
    paddingVertical: AppSpacing.md,
    borderRadius: AppRadii.md,
    borderCurve: 'continuous',
    backgroundColor: AppColors.canvas,
    fontFamily: 'DMSans_500Medium',
    fontSize: 15,
    color: AppColors.textPrimary,
  },
  multiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  message: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.textPrimary,
  },
  error: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.errorText,
  },
});
