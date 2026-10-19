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
    const subject = encodeURIComponent('Apelación de bloqueo en HaNet');
    const body = encodeURIComponent('Hola, quiero apelar el bloqueo de mi cuenta de HaNet.\n\nCorreo de mi cuenta:\nPor qué creo que es un error:\n');
    void Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`);
  };

  return (
    <>
      <ErrorScreen
        icon={ERROR_ICONS.lock}
        title="Se bloqueó tu acceso a HaNet"
        body={<>Tu cuenta fue bloqueada por <Strong>incumplimiento de los Términos y Condiciones.</Strong> Si crees que es un error, puedes apelar escribiéndonos.</>}
        note="Crear otra cuenta para evitar el bloqueo puede hacer que esa cuenta también se bloquee."
        primary={{ label: 'Apelar', onPress: () => setAppealing(true) }}
        secondary={{ label: 'Cerrar sesión', onPress: () => endSession(onDismiss, preview) }}
      />
      <HanetDialog
        visible={appealing}
        onRequestClose={() => setAppealing(false)}
        dismissOnBackdrop
        title="Se abrirá tu app de correo"
        body={`Desde ahí podrás escribir a ${SUPPORT_EMAIL} para apelar el bloqueo. Cuéntanos con qué correo creaste tu cuenta.`}
      >
        <View style={styles.dialogActions}>
          <HanetButton label="Abrir correo" onPress={openMail} />
          <HanetButton label="Volver" variant="surface" onPress={() => setAppealing(false)} />
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
      title="Parece que las oficinas se están quemando…"
      body="¡No te preocupes, no se está quemando nada! Los servidores de HaNet no responden. Vuelve a intentarlo en unos minutos."
      note={
        <>
          Mantente al tanto de errores e interrupciones de la red HaNet en{' '}
          <Strong onPress={() => void Linking.openURL(`https://${STATUS_PAGE}`)}>{STATUS_PAGE}</Strong>
        </>
      }
      primary={{ label: retrying ? 'Probando…' : 'Reintentar', onPress: onRetry, disabled: retrying }}
      secondary={signedIn ? { label: 'Cerrar sesión', onPress: () => endSession(onDismiss, preview) } : undefined}
    />
  );
}

export function OfflineScreen({ onDismiss, onRetry, retrying, signedIn, preview }: RetryProps) {
  return (
    <ErrorScreen
      icon={ERROR_ICONS.offline}
      title="Parece que no hay internet"
      body="Revisa el wifi o los datos móviles y vuelve a intentarlo."
      primary={{ label: retrying ? 'Probando…' : 'Reintentar', onPress: onRetry, disabled: retrying }}
      secondary={signedIn ? { label: 'Cerrar sesión', onPress: () => endSession(onDismiss, preview) } : undefined}
    />
  );
}

/** Shown by the root error boundary when something in the app breaks. */
export function FatalScreen({ onDismiss, preview }: { onDismiss: () => void; preview?: boolean }) {
  return (
    <ErrorScreen
      icon=":("
      title="Ups, algo falló"
      body={<>HaNet tuvo que detenerse. Si vuelve a pasar después de reiniciar, escríbenos a <Strong>{SUPPORT_EMAIL}</Strong> y cuéntanos qué estabas haciendo. ¡Gracias por probar la beta!</>}
      primary={{ label: 'Reiniciar', onPress: () => (preview ? onDismiss() : void restartApp()) }}
      secondary={{ label: 'Cerrar sesión', onPress: () => endSession(onDismiss, preview) }}
    />
  );
}

const styles = StyleSheet.create({
  dialogActions: {
    gap: AppSpacing.sm,
  },
});
