import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { HanetButton } from '@/components/ui/hanet-button';
import { dialogStyles, HanetDialog, HanetDialogActions } from '@/components/ui/hanet-dialog';
import { AppColors, AppRadii, AppSpacing, AppType } from '@/constants/design-tokens';
import type { InstallGuideKind } from '@/services/web-install';
import { installGuideKind, markInstallGuideSeen, promptInstall, shouldOfferInstallGuide, useCanPromptInstall } from '@/services/web-install';
import { t } from '@/i18n';

// A beat after the Home settles, like the notifications question that comes after it.
const OFFER_DELAY_MS = 900;

type Step = { icon: keyof typeof Ionicons.glyphMap; text: string };

function stepsFor(kind: InstallGuideKind): Step[] {
  switch (kind) {
    case 'ios-safari':
      return [
        { icon: 'share-outline', text: t('components.web.installGuide.tocaElBotonCompartirEn') },
        { icon: 'add-circle-outline', text: t('components.web.installGuide.bajaYEligeAgregarA') },
        { icon: 'checkmark-circle-outline', text: t('components.web.installGuide.tocaAgregarYAbreHanet') },
      ];
    case 'ios-other':
      return [
        { icon: 'share-outline', text: t('components.web.installGuide.tocaElBotonCompartirDel') },
        { icon: 'add-circle-outline', text: t('components.web.installGuide.eligeAgregarAInicio') },
        { icon: 'checkmark-circle-outline', text: t('components.web.installGuide.tocaAgregarYAbreHanet') },
      ];
    case 'android-samsung':
      return [
        { icon: 'menu-outline', text: t('components.web.installGuide.tocaElMenuAbajoA') },
        { icon: 'add-circle-outline', text: t('components.web.installGuide.eligeAgregarPaginaAY') },
        { icon: 'checkmark-circle-outline', text: t('components.web.installGuide.confirmaYAbreHanetDesde') },
      ];
    case 'android-firefox':
      return [
        { icon: 'ellipsis-vertical', text: t('components.web.installGuide.tocaElMenuDelNavegador') },
        { icon: 'add-circle-outline', text: t('components.web.installGuide.eligeAgregarALaPantalla') },
        { icon: 'checkmark-circle-outline', text: t('components.web.installGuide.confirmaYAbreHanetDesde') },
      ];
    case 'android-chrome':
      return [
        { icon: 'ellipsis-vertical', text: t('components.web.installGuide.tocaElMenuArribaA') },
        { icon: 'add-circle-outline', text: t('components.web.installGuide.eligeAgregarALaPantalla2') },
        { icon: 'checkmark-circle-outline', text: t('components.web.installGuide.tocaInstalarYAbreHanet') },
      ];
    case 'desktop-edge':
      return [
        { icon: 'ellipsis-horizontal', text: t('components.web.installGuide.hazClicEnElMenu') },
        { icon: 'apps-outline', text: t('components.web.installGuide.eligeAplicacionesYDespuesInstalar') },
        { icon: 'checkmark-circle-outline', text: t('components.web.installGuide.hazClicEnInstalarHanet') },
      ];
    case 'desktop-chrome':
      return [
        { icon: 'download-outline', text: t('components.web.installGuide.hazClicEnElIcono') },
        { icon: 'ellipsis-vertical', text: t('components.web.installGuide.siNoApareceMenuTransmitir') },
        { icon: 'checkmark-circle-outline', text: t('components.web.installGuide.hazClicEnInstalarHanet2') },
      ];
    case 'mac-safari':
      return [
        { icon: 'desktop-outline', text: t('components.web.installGuide.enLaBarraDeMenus') },
        { icon: 'add-circle-outline', text: t('components.web.installGuide.eligeAgregarAlDock') },
        { icon: 'checkmark-circle-outline', text: t('components.web.installGuide.hazClicEnAgregarHanet') },
      ];
    default:
      return [];
  }
}

/**
 * How to add HaNet to the home screen (or the Dock, or as a computer app),
 * with the steps of the browser in use. Where the browser has its own
 * install prompt, "Instalar" opens it directly.
 */
export function InstallGuideDialog({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const kind = installGuideKind();
  const canPrompt = useCanPromptInstall();
  const [installing, setInstalling] = useState(false);
  const iphone = kind === 'ios-safari' || kind === 'ios-other';
  const computer = kind === 'desktop-chrome' || kind === 'desktop-edge' || kind === 'mac-safari';

  const close = () => {
    markInstallGuideSeen();
    onClose();
  };

  const install = async () => {
    setInstalling(true);
    await promptInstall();
    setInstalling(false);
    close();
  };

  const body = iphone
    ? t('components.web.installGuide.seAbreComoUnaApp')
    : computer
      ? t('components.web.installGuide.seAbreEnSuPropia')
      : t('components.web.installGuide.seAbreComoUnaApp2');

  return (
    <HanetDialog
      visible={visible}
      onRequestClose={close}
      title={computer ? t('components.web.installGuide.instalaHanetEnTuComputador') : t('components.web.installGuide.agregaHanetATuInicio')}
      body={body}
    >
      {!canPrompt && (
        <View style={styles.steps}>
          {stepsFor(kind).map((step, index) => (
            <View key={step.text} style={styles.step}>
              <View style={styles.number}>
                <ThemedText style={styles.numberText}>{index + 1}</ThemedText>
              </View>
              <Ionicons name={step.icon} size={20} color={AppColors.textPrimary} style={styles.icon} />
              <ThemedText style={styles.stepText}>{step.text}</ThemedText>
            </View>
          ))}
        </View>
      )}
      <HanetDialogActions>
        <HanetButton label={t('classhall.ahoraNo')} variant="surface" disabled={installing} onPress={close} style={dialogStyles.action} />
        {canPrompt
          ? <HanetButton label={installing ? t('components.web.installGuide.instalando') : t('components.web.installGuide.instalar')} variant="accent" disabled={installing} onPress={() => void install()} style={dialogStyles.action} />
          : <HanetButton label={t('events.entendido')} variant="accent" onPress={close} style={dialogStyles.action} />}
      </HanetDialogActions>
    </HanetDialog>
  );
}

/**
 * The first time the web app's Home opens in a browser (not from the home
 * screen), the guide opens by itself, once. `onDone` lets the Home ask for
 * notifications after it, never both at once.
 */
export function HomeInstallGuide({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!ready || !shouldOfferInstallGuide()) return;
    const timer = setTimeout(() => setOpen(true), OFFER_DELAY_MS);
    return () => clearTimeout(timer);
  }, [ready]);

  return (
    <InstallGuideDialog
      visible={open}
      onClose={() => {
        setOpen(false);
        onDone();
      }}
    />
  );
}

const styles = StyleSheet.create({
  steps: {
    gap: AppSpacing.md,
    paddingVertical: AppSpacing.xs,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: AppSpacing.sm,
  },
  number: {
    width: 24,
    height: 24,
    borderRadius: AppRadii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AppColors.controlActive,
  },
  numberText: {
    ...AppType.caption,
    color: AppColors.controlOnActive,
  },
  icon: {
    marginTop: 2,
  },
  stepText: {
    ...AppType.footnote,
    flex: 1,
    color: AppColors.textSecondary,
  },
});
