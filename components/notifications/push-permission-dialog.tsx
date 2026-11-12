import { HanetButton } from '@/components/ui/hanet-button';
import { dialogStyles, HanetDialog, HanetDialogActions } from '@/components/ui/hanet-dialog';
import { t } from '@/i18n';
import { dismissPushPrompt, enablePush, pushPermission, pushSupport, wasPushPromptDismissed } from '@/services/push-service';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';

// A beat after the Home settles, so the question doesn't land on top of the splash.
const ASK_DELAY_MS = 900;

/**
 * The first time an account reaches the Home on a phone that has never been
 * asked, HaNet asks for notifications itself, before the system dialog
 * (which only shows once). "Ahora no" is remembered on this phone, and
 * Configuraciones keeps a way to allow them later.
 *
 * `ready` is for the Home to hold it back while something else is on top
 * (the splash, the welcome after linking).
 */
export function PushPermissionDialog({ ready }: { ready: boolean }) {
  const [visible, setVisible] = useState(false);
  const [asking, setAsking] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!ready || pushSupport() !== 'supported') return;
      let active = true;
      const timer = setTimeout(() => {
        void Promise.all([pushPermission(), wasPushPromptDismissed()])
          .then(([permission, dismissed]) => { if (active && permission === 'undetermined' && !dismissed) setVisible(true); })
          .catch(() => undefined);
      }, ASK_DELAY_MS);
      return () => {
        active = false;
        clearTimeout(timer);
      };
    }, [ready])
  );

  const allow = async () => {
    setAsking(true);
    try {
      await enablePush();
    } finally {
      setAsking(false);
      setVisible(false);
    }
  };

  const notNow = () => {
    setVisible(false);
    void dismissPushPrompt();
  };

  return (
    <HanetDialog
      visible={visible}
      onRequestClose={notNow}
      title={t('components.pushPermission.activaLasNotificaciones')}
      body={t('components.pushPermission.teAvisamosDeLoNuevo')}
    >
      <HanetDialogActions>
        <HanetButton label={t('components.pushPermission.ahoraNo')} variant="surface" disabled={asking} onPress={notNow} style={dialogStyles.action} />
        <HanetButton label={t('components.pushPermission.activar')} variant="accent" disabled={asking} onPress={() => void allow()} style={dialogStyles.action} />
      </HanetDialogActions>
    </HanetDialog>
  );
}
