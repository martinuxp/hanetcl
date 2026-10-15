import type { EventBarActions } from '@/components/events/event-bar-store';
import { ThemedText } from '@/components/themed-text';
import { HanetButton } from '@/components/ui/hanet-button';
import { HanetDialog, HanetDialogActions, dialogStyles } from '@/components/ui/hanet-dialog';
import { AppColors, AppPressed, AppRadii, AppSpacing } from '@/constants/design-tokens';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

// "Opciones" of an event in the bar: buy on the ticketing site or claim the
// HaNet coupon. With both, iOS opens a half sheet (app/event-options.tsx) and
// Android and web an alert; with one, the button goes straight to it.

function sourceOf(actions: EventBarActions) {
  if (actions.sourceName) return actions.sourceName;
  try {
    return new URL(actions.ticketUrl).hostname.replace(/^www\./, '');
  } catch {
    return 'la ticketera';
  }
}

export function buyLabel(actions: EventBarActions) {
  return `Comprar en ${sourceOf(actions)}`;
}

export function openTickets(actions: EventBarActions) {
  if (actions.ticketUrl) void WebBrowser.openBrowserAsync(actions.ticketUrl);
}

/** The coupon and a button to copy it; shared by the sheet and the alert. */
export function CouponPanel({ coupon }: { coupon: NonNullable<EventBarActions['coupon']> }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await Clipboard.setStringAsync(coupon.code);
    if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopied(true);
  };
  return (
    <View style={styles.coupon}>
      {!!coupon.description && <ThemedText style={styles.couponText}>{coupon.description}</ThemedText>}
      <Pressable accessibilityRole="button" accessibilityLabel={`Código ${coupon.code}. Copiar`} onPress={() => void copy()} style={({ pressed }) => [styles.code, pressed && AppPressed]}>
        <ThemedText selectable style={styles.codeText}>{coupon.code}</ThemedText>
        <ThemedText accessibilityLiveRegion="polite" style={styles.codeHint}>{copied ? 'Copiado' : 'Toca para copiar'}</ThemedText>
      </Pressable>
      <ThemedText style={styles.couponNote}>Úsalo al pagar en la ticketera.</ThemedText>
    </View>
  );
}

export function useEventOptions(actions: EventBarActions | null) {
  const router = useRouter();
  const [dialog, setDialog] = useState<'choose' | 'coupon' | null>(null);

  const canBuy = !!actions?.ticketUrl;
  const coupon = actions?.coupon ?? null;
  const count = (canBuy ? 1 : 0) + (coupon ? 1 : 0);

  const showCoupon = () => {
    if (Platform.OS === 'ios') router.push({ pathname: '/event-options', params: { view: 'coupon' } });
    else setDialog('coupon');
  };

  const open = () => {
    if (!actions || count === 0) return;
    if (Platform.OS === 'ios') void Haptics.selectionAsync();
    if (count === 2) {
      if (Platform.OS === 'ios') router.push('/event-options');
      else setDialog('choose');
    } else if (canBuy) {
      openTickets(actions);
    } else {
      showCoupon();
    }
  };

  const close = () => setDialog(null);

  const element = actions ? (
    <HanetDialog
      visible={!!dialog}
      onRequestClose={close}
      dismissOnBackdrop
      title={dialog === 'coupon' ? 'Cupón HaNet' : actions.title}
      body={dialog === 'choose' ? '¿Qué quieres hacer?' : undefined}
    >
      {dialog === 'coupon' && coupon && <CouponPanel coupon={coupon} />}
      {dialog === 'choose' ? (
        <View style={styles.stack}>
          <HanetButton label={buyLabel(actions)} variant="accent" onPress={() => { close(); openTickets(actions); }} />
          <HanetButton label="Reclamar cupón HaNet" variant="surface" onPress={() => setDialog('coupon')} />
          <HanetButton label="Cancelar" variant="surface" onPress={close} />
        </View>
      ) : (
        <HanetDialogActions>
          <HanetButton label="Cerrar" variant="surface" onPress={close} style={dialogStyles.action} />
          {canBuy && <HanetButton label="Ir a comprar" variant="accent" onPress={() => { close(); openTickets(actions); }} style={dialogStyles.action} />}
        </HanetDialogActions>
      )}
    </HanetDialog>
  ) : null;

  return {
    count,
    singleLabel: canBuy ? buyLabel(actions!) : 'Reclamar cupón HaNet',
    open,
    dialog: element,
  };
}

export const optionStyles = StyleSheet.create({
  option: {
    gap: 4,
    padding: AppSpacing.xl,
    borderRadius: AppRadii.lg,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surfaceMuted,
  },
  optionAccent: {
    backgroundColor: AppColors.accent,
  },
  optionTitle: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: -0.4,
    color: AppColors.textPrimary,
  },
  optionText: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.textSecondary,
  },
  onAccent: {
    color: AppColors.textPrimary,
    opacity: 0.85,
  },
});

const styles = StyleSheet.create({
  stack: {
    alignSelf: 'stretch',
    gap: AppSpacing.sm,
  },
  coupon: {
    alignSelf: 'stretch',
    gap: AppSpacing.sm,
    marginBottom: AppSpacing.md,
  },
  couponText: {
    textAlign: 'center',
    fontFamily: 'DMSans_500Medium',
    fontSize: 15,
    lineHeight: 21,
    color: AppColors.textPrimary,
  },
  code: {
    alignItems: 'center',
    gap: 2,
    paddingVertical: AppSpacing.md,
    paddingHorizontal: AppSpacing.lg,
    borderRadius: AppRadii.lg,
    borderCurve: 'continuous',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: AppColors.accent,
  },
  codeText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: 2,
    color: AppColors.textPrimary,
  },
  codeHint: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 12,
    lineHeight: 16,
    color: AppColors.textSecondary,
  },
  couponNote: {
    textAlign: 'center',
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
    lineHeight: 16,
    color: AppColors.textSecondary,
  },
});
