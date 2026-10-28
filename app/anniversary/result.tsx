import { SheetActions, SheetBody, digitsOnly, formStyles as styles } from '@/components/anniversary/anniversary-form';
import { allianceColor, placeLabel, shortWhen } from '@/components/anniversary/anniversary-ui';
import { SOLIDARITY, basketPoints, bonusPoints, isSolidarity, solidarityPoints } from '@/components/anniversary/solidarity';
import type { SolidarityCount } from '@/components/anniversary/solidarity';
import { ThemedText } from '@/components/themed-text';
import { HanetButton } from '@/components/ui/hanet-button';
import { HanetChoice } from '@/components/ui/hanet-select';
import { withSheetFrame } from '@/components/ui/sheet-frame';
import { AppColors, AppRadii, AppSpacing, AppTouch, AppType } from '@/constants/design-tokens';
import { describeAuthError } from '@/services/auth-service';
import { formatPoints, peekAnniversary, setActivityResult } from '@/services/anniversary-service';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

const HOW = [
  { value: 'count', label: 'Calculadora' },
  { value: 'hand', label: 'A mano' },
];

function numbers(counts: Record<string, string> | undefined): SolidarityCount {
  return Object.fromEntries(Object.entries(counts ?? {}).map(([key, value]) => [key, Number(value || 0)]).filter(([, value]) => (value as number) > 0));
}

/**
 * An activity's result. By podium: tap the alianzas in the order they
 * placed. By hand: the points of each one (negative with the sign choice).
 * The alianza solidaria has a calculator: baskets and bonus items in, points out.
 */
function ResultScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const anniversary = peekAnniversary()?.anniversary;
  const activity = anniversary?.activities.find(item => item.id === id);
  const alliances = anniversary?.alliances ?? [];

  const [order, setOrder] = useState<string[]>(() => (Array.isArray(activity?.result) ? activity.result : []));
  const [manual, setManual] = useState<Record<string, string>>(() => {
    const result = activity?.result && !Array.isArray(activity.result) ? activity.result : {};
    return Object.fromEntries(alliances.map(alliance => [alliance.id, result[alliance.id] ? String(Math.abs(result[alliance.id])) : '']));
  });
  const [negative, setNegative] = useState<Record<string, boolean>>(() => {
    const result = activity?.result && !Array.isArray(activity.result) ? activity.result : {};
    return Object.fromEntries(alliances.map(alliance => [alliance.id, (result[alliance.id] ?? 0) < 0]));
  });
  const solidarity = !!activity && isSolidarity(activity);
  const [how, setHow] = useState<'count' | 'hand'>(() => (solidarity && (activity?.tally || !activity?.result) ? 'count' : 'hand'));
  const [counts, setCounts] = useState<Record<string, Record<string, string>>>(() => Object.fromEntries(alliances.map(alliance => [
    alliance.id,
    Object.fromEntries(Object.entries(activity?.tally?.[alliance.id] ?? {}).map(([key, value]) => [key, String(value)])),
  ])));
  const [counting, setCounting] = useState<string | null>(alliances[0]?.id ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!anniversary || !activity) {
    return (
      <SheetBody title="Resultado" lead="Esta actividad ya no existe.">
        <HanetButton label="Volver" variant="surface" onPress={() => router.back()} />
      </SheetBody>
    );
  }

  const podium = activity.mode === 'podium';
  const tap = (allianceId: string) => {
    setError(null);
    setOrder(current => (current.includes(allianceId) ? current.filter(item => item !== allianceId) : [...current, allianceId]));
  };
  const calculator = solidarity && how === 'count';
  const points = Object.fromEntries(alliances.map(alliance => [
    alliance.id,
    calculator ? solidarityPoints(numbers(counts[alliance.id])) : Number(manual[alliance.id] || 0) * (negative[alliance.id] ? -1 : 1),
  ]));
  const tally = calculator ? Object.fromEntries(alliances.map(alliance => [alliance.id, numbers(counts[alliance.id])])) : undefined;
  const setCount = (allianceId: string, key: string, value: string) => {
    setError(null);
    setCounts(current => ({ ...current, [allianceId]: { ...current[allianceId], [key]: digitsOnly(value).slice(0, 5) } }));
  };
  const current = alliances.find(alliance => alliance.id === counting);
  const currentCount = current ? numbers(counts[current.id]) : {};
  const ready = podium ? order.length === alliances.length : Object.values(points).some(value => value !== 0);

  const save = async (clear = false) => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await setActivityResult(activity.id, clear ? null : podium ? { order } : { points, tally });
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (saveError) {
      setError(describeAuthError(saveError, 'No pudimos guardar el resultado. Inténtalo nuevamente.'));
      setSubmitting(false);
    }
  };

  const detail = [activity.startsAt ? shortWhen(activity.startsAt) : null, activity.place].filter(Boolean).join(' · ');

  return (
    <SheetBody
      title={activity.name}
      lead={podium
        ? 'Toca las alianzas en el orden en que quedaron, del 1° al último.'
        : calculator
          ? 'Cuenta las canastas y los bonus de cada alianza: los puntos salen solos, como dicen las bases.'
          : 'Escribe los puntos que ganó cada alianza en esta actividad.'}
    >
      {!!detail && <ThemedText style={styles.hint}>{detail}</ThemedText>}

      {podium ? (
        <View style={local.list}>
          {alliances.map(alliance => {
            const place = order.indexOf(alliance.id);
            const color = allianceColor(alliance);
            const placed = place >= 0;
            return (
              <Pressable
                key={alliance.id}
                accessibilityRole="button"
                accessibilityLabel={placed ? `${alliance.name}, ${placeLabel(place)} lugar. Tocar para quitar` : `${alliance.name}. Tocar para darle el ${placeLabel(order.length)} lugar`}
                disabled={submitting}
                onPress={() => tap(alliance.id)}
                style={({ pressed }) => [local.row, placed && { backgroundColor: color.fill }, pressed && styles.pressed]}
              >
                <View style={[local.place, placed && local.placeOn]}>
                  <ThemedText style={local.placeText}>{placed ? placeLabel(place) : '–'}</ThemedText>
                </View>
                <ThemedText style={[local.name, placed && { color: color.ink }]}>{alliance.name}</ThemedText>
                {placed && !!activity.points[place] && (
                  <ThemedText style={[local.points, { color: color.ink }]}>+{formatPoints(activity.points[place])}</ThemedText>
                )}
              </Pressable>
            );
          })}
          {order.length > 0 && <HanetButton label="Empezar de nuevo" variant="surface" disabled={submitting} onPress={() => setOrder([])} />}
        </View>
      ) : calculator ? (
        <>
          <HanetChoice label="Cómo poner los puntos" options={HOW} value={how} onChange={value => setHow(value as 'count' | 'hand')} disabled={submitting} />
          <View accessibilityRole="radiogroup" style={local.list}>
            {alliances.map(alliance => {
              const color = allianceColor(alliance);
              const selected = alliance.id === counting;
              return (
                <Pressable
                  key={alliance.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${alliance.name}, ${formatPoints(points[alliance.id] ?? 0)} puntos. Contar`}
                  disabled={submitting}
                  onPress={() => setCounting(alliance.id)}
                  style={({ pressed }) => [local.row, selected && { backgroundColor: color.fill }, pressed && styles.pressed]}
                >
                  <View style={[local.swatch, { backgroundColor: selected ? color.ink : color.fill }]} />
                  <ThemedText style={[local.name, selected && { color: color.ink }]}>{alliance.name}</ThemedText>
                  <ThemedText style={[local.points, selected ? { color: color.ink } : local.pointsIdle]}>{formatPoints(points[alliance.id] ?? 0)}</ThemedText>
                </Pressable>
              );
            })}
          </View>
          {current && (
            <View style={local.counter}>
              <CountRow
                label="Canastas"
                detail={`${SOLIDARITY.minimum} como mínimo: ${formatPoints(SOLIDARITY.minimumPoints)}. De la 11 a la 30, 500 c/u; desde la 31, 200 c/u.`}
                value={counts[current.id]?.baskets ?? ''}
                onChange={value => setCount(current.id, 'baskets', value)}
                disabled={submitting}
              />
              {(currentCount.baskets ?? 0) > 0 && (currentCount.baskets ?? 0) < SOLIDARITY.minimum && (
                <ThemedText style={local.warning}>No llega al mínimo de {SOLIDARITY.minimum} canastas: las canastas no suman puntos.</ThemedText>
              )}
              <ThemedText style={local.counterTitle}>Bonus</ThemedText>
              {SOLIDARITY.bonus.map(item => (
                <CountRow
                  key={item.key}
                  label={item.label}
                  detail={`${formatPoints(item.points)} c/u`}
                  value={counts[current.id]?.[item.key] ?? ''}
                  onChange={value => setCount(current.id, item.key, value)}
                  disabled={submitting}
                />
              ))}
              <ThemedText style={styles.hint}>
                {current.name}: {formatPoints(basketPoints(currentCount.baskets ?? 0))} por canastas + {formatPoints(bonusPoints(currentCount))} de bonus = {formatPoints(points[current.id] ?? 0)} puntos.
              </ThemedText>
            </View>
          )}
        </>
      ) : (
        <View style={local.list}>
          {solidarity && <HanetChoice label="Cómo poner los puntos" options={HOW} value={how} onChange={value => setHow(value as 'count' | 'hand')} disabled={submitting} />}
          {alliances.map(alliance => (
            <View key={alliance.id} style={local.manual}>
              <View style={[local.swatch, { backgroundColor: allianceColor(alliance).fill }]} />
              <ThemedText style={local.manualName}>{alliance.name}</ThemedText>
              <HanetChoice
                label={`Suma o descuenta, ${alliance.name}`}
                options={[{ value: 'plus', label: '+' }, { value: 'minus', label: '−' }]}
                value={negative[alliance.id] ? 'minus' : 'plus'}
                onChange={value => setNegative(current => ({ ...current, [alliance.id]: value === 'minus' }))}
                disabled={submitting}
              />
              <TextInput
                accessibilityLabel={`Puntos de ${alliance.name}`}
                value={manual[alliance.id] ?? ''}
                onChangeText={text => { setError(null); setManual(current => ({ ...current, [alliance.id]: digitsOnly(text) })); }}
                placeholder="0"
                placeholderTextColor={AppColors.surfaceMuted}
                keyboardType="number-pad"
                editable={!submitting}
                selectionColor={AppColors.accent}
                style={[styles.input, local.manualInput]}
              />
            </View>
          ))}
        </View>
      )}

      <SheetActions label="Guardar resultado" busyLabel="Guardando…" ready={ready} busy={submitting} onSubmit={() => void save()} error={error} />
      {!!activity.result && <HanetButton label="Quitar el resultado" variant="surface" disabled={submitting} onPress={() => void save(true)} />}
      <HanetButton label="Editar la actividad" variant="surface" disabled={submitting} onPress={() => router.replace({ pathname: '/anniversary/activity', params: { id: activity.id } })} />
    </SheetBody>
  );
}

/** One thing to count, with what it is worth. */
function CountRow({ label, detail, value, onChange, disabled }: { label: string; detail: string; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  return (
    <View style={local.count}>
      <View style={local.countText}>
        <ThemedText style={local.countLabel}>{label}</ThemedText>
        <ThemedText style={local.countDetail}>{detail}</ThemedText>
      </View>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        placeholder="0"
        placeholderTextColor={AppColors.surfaceMuted}
        keyboardType="number-pad"
        editable={!disabled}
        selectionColor={AppColors.accent}
        style={[styles.input, local.countInput]}
      />
    </View>
  );
}

const local = StyleSheet.create({
  list: {
    gap: AppSpacing.sm,
  },
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
    paddingHorizontal: AppSpacing.lg,
    borderRadius: AppRadii.md,
    borderCurve: 'continuous',
    backgroundColor: AppColors.canvas,
  },
  place: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: AppColors.surfaceMuted,
  },
  placeOn: {
    backgroundColor: AppColors.canvas,
  },
  placeText: {
    ...AppType.headline,
    color: AppColors.textPrimary,
  },
  name: {
    flex: 1,
    ...AppType.headline,
    color: AppColors.textPrimary,
  },
  points: {
    ...AppType.callout,
    fontFamily: 'DMSans_700Bold',
  },
  pointsIdle: {
    color: AppColors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  counter: {
    gap: AppSpacing.md,
    padding: AppSpacing.lg,
    borderRadius: AppRadii.lg,
    borderCurve: 'continuous',
    backgroundColor: AppColors.canvas,
  },
  counterTitle: {
    ...AppType.headline,
    color: AppColors.textPrimary,
    marginTop: AppSpacing.sm,
  },
  count: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
  },
  countText: {
    flex: 1,
    gap: 2,
  },
  countLabel: {
    ...AppType.callout,
    fontFamily: 'DMSans_700Bold',
    color: AppColors.textPrimary,
  },
  countDetail: {
    ...AppType.caption,
    color: AppColors.textSecondary,
  },
  countInput: {
    width: 88,
    minHeight: AppTouch.minimum,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  warning: {
    ...AppType.caption,
    color: AppColors.errorText,
  },
  manual: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: AppSpacing.sm,
  },
  swatch: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  manualName: {
    flex: 1,
    minWidth: 80,
    ...AppType.headline,
    color: AppColors.textPrimary,
  },
  manualInput: {
    width: 120,
    minHeight: AppTouch.comfortable,
    fontVariant: ['tabular-nums'],
  },
});

export default withSheetFrame(ResultScreen, AppColors.surface);
