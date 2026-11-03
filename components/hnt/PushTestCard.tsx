import { ThemedText } from '@/components/themed-text';
import { HanetButton } from '@/components/ui/hanet-button';
import { AppColors, AppRadii, AppSpacing } from '@/constants/design-tokens';
import { describeAuthError } from '@/services/auth-service';
import { functions } from '@/services/firebase';
import { enablePush, openNotificationSettings, pushPermission, pushSupport, registerDevice } from '@/services/push-service';
import type { PushPermission } from '@/services/push-service';
import { httpsCallable } from 'firebase/functions';
import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';
import { t } from '@/i18n';

type DeviceResult = { platform: string; updatedAt: number | null; token: string; ok: boolean; error: string | null };

const PLATFORM_LABELS: Record<string, string> = { ios: 'iPhone', android: 'Android', web: 'Web', unknown: t('components.hnt.pushTestCard.dispositivo') };

// What Expo's errors mean, in words the team can act on.
const ERROR_HINTS: Record<string, string> = {
  DeviceNotRegistered: t('components.hnt.pushTestCard.elTelefonoYaNoRecibe'),
  InvalidCredentials: t('components.hnt.pushTestCard.faltanLasCredencialesDePush'),
  MessageTooBig: t('components.hnt.pushTestCard.elMensajeEsDemasiadoLargo'),
  MessageRateExceeded: t('components.hnt.pushTestCard.demasiadasNotificacionesSeguidasAEse'),
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
      setMessage((await registerDevice()) ? t('components.hnt.pushTestCard.esteTelefonoQuedoRegistradoEn') : (Platform.OS === 'ios' ? t('components.hnt.pushTestCard.noPudimosObtenerElToken') : t('components.hnt.pushTestCard.noPudimosObtenerElToken2')));
    } else {
      setError(t('components.hnt.pushTestCard.elPermisoDeNotificacionesNo'));
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
      const target = username.trim() ? `@${username.trim().replace(/^@/, '')}` : t('components.hnt.pushTestCard.tuCuenta');
      if (!result.data.devices.length) {
        setError(t('components.hnt.pushTestCard.targetNoTieneTelefonosRegistrados', { target }));
      } else {
        const sent = result.data.devices.filter(device => device.ok).length;
        setMessage(t('components.hnt.pushTestCard.expoAceptoSentDeDevicescount', { sent, devicesCount: result.data.devices.length, target }));
        setResults(result.data.devices);
      }
    } catch (sendError) {
      setError(describeAuthError(sendError, t('components.hnt.pushTestCard.noPudimosEnviarLaNotificacion')));
    } finally {
      setBusy(null);
    }
  };

  const status = support === 'web'
    ? t('components.hnt.pushTestCard.estasEnLaWebAqui')
    : support === 'expo-go-android'
      ? t('components.hnt.pushTestCard.expoGoEnAndroidNo')
      : permission === 'granted'
        ? t('components.hnt.pushTestCard.esteTelefonoTienePermisoPara')
        : permission === 'denied'
          ? t('components.hnt.pushTestCard.lasNotificacionesEstanBloqueadasEn')
          : t('components.hnt.pushTestCard.esteTelefonoTodaviaNoHa');

  return (
    <View style={styles.card}>
      <ThemedText style={styles.title}>{t('components.hnt.pushTestCard.probarNotificacionesPush')}</ThemedText>
      <ThemedText style={styles.muted}>{status}</ThemedText>
      {support === 'supported' && permission !== 'denied' && (
        <HanetButton label={busy === 'register' ? t('components.hnt.pushTestCard.registrando') : t('components.hnt.pushTestCard.registrarEsteTelefono')} variant="surface" disabled={!!busy} onPress={() => void registerThisPhone()} />
      )}
      {support === 'supported' && permission === 'denied' && (
        <HanetButton label={t('common.abrirAjustes')} variant="surface" onPress={openNotificationSettings} />
      )}

      <TextInput
        accessibilityLabel={t('components.hnt.pushTestCard.hanetIdDeDestinoVacio')}
        value={username}
        onChangeText={setUsername}
        placeholder={t('components.hnt.pushTestCard.hanetidVacioTuCuenta')}
        placeholderTextColor="rgba(221,221,226,0.4)"
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
      />
      <TextInput
        accessibilityLabel={t('feedPost.titulo')}
        value={title}
        onChangeText={setTitle}
        placeholder={t('components.hnt.pushTestCard.pruebaDeHanet')}
        placeholderTextColor="rgba(221,221,226,0.4)"
        maxLength={80}
        style={styles.input}
      />
      <TextInput
        accessibilityLabel={t('feedPost.mensaje')}
        value={body}
        onChangeText={setBody}
        placeholder={t('components.hnt.pushTestCard.siVesEstoLasNotificaciones')}
        placeholderTextColor="rgba(221,221,226,0.4)"
        maxLength={200}
        multiline
        style={[styles.input, styles.multiline]}
      />
      <HanetButton label={busy === 'send' ? t('common.enviando') : t('components.hnt.pushTestCard.enviarNotificacionDePrueba')} disabled={!!busy} onPress={() => void send()} />

      {!!message && <ThemedText accessibilityLiveRegion="polite" style={styles.message}>{message}</ThemedText>}
      {!!error && <ThemedText accessibilityLiveRegion="assertive" style={styles.error}>{error}</ThemedText>}
      {results?.map((device, index) => (
        <ThemedText key={index} style={device.ok ? styles.muted : styles.error}>
          {PLATFORM_LABELS[device.platform] ?? 'Dispositivo'} {device.token}
          {device.updatedAt ? t('components.hnt.pushTestCard.registradoElLocaledatestring', { localeDateString: new Date(device.updatedAt).toLocaleDateString('es-CL') }) : ''}
          {device.ok ? t('components.hnt.pushTestCard.aceptada') : ` · ${device.error}${device.error && ERROR_HINTS[device.error] ? `: ${ERROR_HINTS[device.error]}` : ''}`}
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
