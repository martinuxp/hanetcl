import { hallFormStyles as styles } from '@/components/classhall/hall-form';
import { useEventBar } from '@/components/events/event-bar-store';
import { CouponPanel, buyLabel, openTickets, optionStyles } from '@/components/events/event-options';
import { ThemedText } from '@/components/themed-text';
import { HanetButton } from '@/components/ui/hanet-button';
import { withSheetFrame } from '@/components/ui/sheet-frame';
import { AppColors, AppSpacing } from '@/constants/design-tokens';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * iOS: the half sheet of an event's "Opciones" when it can be bought and has
 * a HaNet coupon, or the coupon alone. Android and web use an alert instead.
 */
function EventOptionsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ view?: string }>();
  const { actions } = useEventBar();
  const [view, setView] = useState<'choose' | 'coupon'>(params.view === 'coupon' ? 'coupon' : 'choose');

  const buy = () => {
    if (!actions) return;
    router.back();
    openTickets(actions);
  };

  return (
    <View style={[styles.sheet, styles.content, local.content, { paddingTop: AppSpacing.xxl, paddingBottom: insets.bottom + AppSpacing.lg }]}>
      <ThemedText accessibilityRole="header" numberOfLines={2} style={styles.title}>{view === 'coupon' ? 'Cupón HaNet' : actions?.title ?? 'Opciones'}</ThemedText>

      {!actions ? (
        <ThemedText style={styles.lead}>Vuelve al evento e inténtalo de nuevo.</ThemedText>
      ) : view === 'coupon' && actions.coupon ? (
        <>
          <CouponPanel coupon={actions.coupon} />
          {!!actions.ticketUrl && <HanetButton label="Ir a comprar" variant="accent" onPress={buy} />}
        </>
      ) : (
        <>
          {!!actions.ticketUrl && (
            <Pressable accessibilityRole="button" onPress={buy} style={({ pressed }) => [optionStyles.option, optionStyles.optionAccent, pressed && styles.pressed]}>
              <ThemedText style={optionStyles.optionTitle}>{buyLabel(actions)}</ThemedText>
              <ThemedText style={[optionStyles.optionText, optionStyles.onAccent]}>Se abre la página de la ticketera para elegir tus entradas.</ThemedText>
            </Pressable>
          )}
          {!!actions.coupon && (
            <Pressable accessibilityRole="button" onPress={() => setView('coupon')} style={({ pressed }) => [optionStyles.option, pressed && styles.pressed]}>
              <ThemedText style={optionStyles.optionTitle}>Reclamar cupón HaNet</ThemedText>
              <ThemedText style={optionStyles.optionText}>{actions.coupon.description || 'Un descuento para la comunidad HaNet.'}</ThemedText>
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}

const local = StyleSheet.create({
  content: {
    gap: AppSpacing.lg,
  },
});

export default withSheetFrame(EventOptionsScreen, AppColors.surface);
