import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { TopNotice } from '@/components/system/top-notice';
import { applyUpdate, registerServiceWorker, useUpdateReady } from '@/services/service-worker';
import { t } from '@/i18n';

/**
 * Web only: registers the service worker and, when a new build of HaNet is
 * waiting, offers it. Accepting reloads the page with the new build; until
 * then the app on screen keeps working with its own files.
 */
export function UpdatePrompt() {
  const ready = useUpdateReady();
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web') void registerServiceWorker();
  }, []);

  if (!ready) return null;
  return (
    <TopNotice
      icon="sparkles-outline"
      text={t('components.system.updatePrompt.hayUnaVersionNuevaDe')}
      action={{
        label: updating ? t('components.system.updatePrompt.actualizando') : t('components.system.updatePrompt.actualizar'),
        disabled: updating,
        onPress: () => {
          setUpdating(true);
          void applyUpdate();
        },
      }}
    />
  );
}
