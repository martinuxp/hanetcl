import { ERROR_ICONS, ErrorScreen, Strong } from '@/components/errors/ErrorScreen';
import { HanetButton } from '@/components/ui/hanet-button';
import { HanetDialog } from '@/components/ui/hanet-dialog';
import { AppSpacing } from '@/constants/design-tokens';
import { auth } from '@/services/firebase';
import { unregisterDevice } from '@/services/push-service';
import * as Updates from 'expo-updates';
import { signOut } from 'firebase/auth';
import React, { useState } from 'react';
import { DevSettings, Linking, Platform, StyleSheet, View } from 'react-native';
import { t } from '@/i18n';

export const SUPPORT_EMAIL = 'muxp@muxp.art';
export const STATUS_PAGE = 'status.hanet.muxp.art';

/** Starts HaNet again from scratch, as far as each platform allows. */
export async function restartApp() {
  if (Platform.OS === 'web') {
    window.location.reload();
    return;
  }
  try {
    await Updates.reloadAsync();
  } catch {
    // Development builds and Expo Go reload through the dev tools instead.
    DevSettings.reload();
  }
}

/** Signs out wherever the problem left the app; the root then goes to the onboarding. */
export async function leaveSession() {
  try {
    await unregisterDevice();
    await signOut(auth);
  } catch {
    // A blocked or offline session still ends locally.
  }
}

type Props = { onDismiss: () => void; signedIn: boolean; preview?: boolean };

// In a preview the buttons only close the screen: nobody gets signed out.
function endSession(onDismiss: () => void, preview?: boolean) {
  if (preview) onDismiss();
  else void leaveSession().then(onDismiss);
}

/** Blocked HaNet ID: the appeal goes by email to the HaNet team. */
export function BlockedScreen({ onDismiss, preview }: Props) {
  const [appealing, setAppealing] = useState(false);

  const openMail = () => {
    setAppealing(false);
    const subject = encodeURIComponent(t('components.errors.appErrorScreens.apelacionDeBloqueoEnHanet'));
    const body = encodeURIComponent(t('components.errors.appErrorScreens.holaQuieroApelarElBloqueo'));
    void Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`);
  };

  return (
    <>
      <ErrorScreen
        icon={ERROR_ICONS.lock}
        title={t('components.errors.appErrorScreens.seBloqueoTuAccesoA')}
        body={<>{t('components.errors.appErrorScreens.tuCuentaFueBloqueadaPor')}{' '}<Strong>{t('components.errors.appErrorScreens.incumplimientoDeLosTerminosY')}</Strong>{' '}{t('components.errors.appErrorScreens.siCreesQueEsUn')}</>}
        note={t('components.errors.appErrorScreens.crearOtraCuentaParaEvitar')}
        primary={{ label: t('components.errors.appErrorScreens.apelar'), onPress: () => setAppealing(true) }}
        secondary={{ label: t('common.cerrarSesion'), onPress: () => endSession(onDismiss, preview) }}
      />
      <HanetDialog
        visible={appealing}
        onRequestClose={() => setAppealing(false)}
        dismissOnBackdrop
        title={t('components.errors.appErrorScreens.seAbriraTuAppDe')}
        body={t('components.errors.appErrorScreens.desdeAhiPodrasEscribirA', { supportEmail: SUPPORT_EMAIL })}
      >
        <View style={styles.dialogActions}>
          <HanetButton label={t('components.errors.appErrorScreens.abrirCorreo')} onPress={openMail} />
          <HanetButton label={t('common.volver')} variant="surface" onPress={() => setAppealing(false)} />
        </View>
      </HanetDialog>
    </>
  );
}

type RetryProps = Props & { onRetry: () => void; retrying: boolean };

export function ServerScreen({ onDismiss, onRetry, retrying, signedIn, preview }: RetryProps) {
  return (
    <ErrorScreen
      icon={ERROR_ICONS.server}
      title={t('components.errors.appErrorScreens.pareceQueLasOficinasSe')}
      body={t('components.errors.appErrorScreens.noTePreocupesNoSe')}
      note={
        <>
          {t('components.errors.appErrorScreens.mantenteAlTantoDeErrores')}{' '}
          <Strong onPress={() => void Linking.openURL(`https://${STATUS_PAGE}`)}>{STATUS_PAGE}</Strong>
        </>
      }
      primary={{ label: retrying ? t('components.errors.appErrorScreens.probando') : t('common.reintentar'), onPress: onRetry, disabled: retrying }}
      secondary={signedIn ? { label: t('common.cerrarSesion'), onPress: () => endSession(onDismiss, preview) } : undefined}
    />
  );
}

export function OfflineScreen({ onDismiss, onRetry, retrying, signedIn, preview }: RetryProps) {
  return (
    <ErrorScreen
      icon={ERROR_ICONS.offline}
      title={t('components.errors.appErrorScreens.pareceQueNoHayInternet')}
      body={t('components.errors.appErrorScreens.revisaElWifiOLos')}
      primary={{ label: retrying ? t('components.errors.appErrorScreens.probando') : t('common.reintentar'), onPress: onRetry, disabled: retrying }}
      secondary={signedIn ? { label: t('common.cerrarSesion'), onPress: () => endSession(onDismiss, preview) } : undefined}
    />
  );
}

/** Shown by the root error boundary when something in the app breaks. */
export function FatalScreen({ onDismiss, preview }: { onDismiss: () => void; preview?: boolean }) {
  return (
    <ErrorScreen
      icon=":("
      title={t('components.errors.appErrorScreens.upsAlgoFallo')}
      body={<>{t('components.errors.appErrorScreens.hanetTuvoQueDetenerseSi')}{' '}<Strong>{SUPPORT_EMAIL}</Strong>{' '}{t('components.errors.appErrorScreens.yCuentanosQueEstabasHaciendo')}</>}
      primary={{ label: t('components.errors.appErrorScreens.reiniciar'), onPress: () => (preview ? onDismiss() : void restartApp()) }}
      secondary={{ label: t('common.cerrarSesion'), onPress: () => endSession(onDismiss, preview) }}
    />
  );
}

const styles = StyleSheet.create({
  dialogActions: {
    gap: AppSpacing.sm,
  },
});
