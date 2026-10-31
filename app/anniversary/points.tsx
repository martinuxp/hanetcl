import { AlliancePicker, SheetActions, SheetBody, TextField, digitsOnly, formStyles as styles } from '@/components/anniversary/anniversary-form';
import { ThemedText } from '@/components/themed-text';
import { HanetChip } from '@/components/ui/hanet-chip';
import { HanetChoice } from '@/components/ui/hanet-select';
import { withSheetFrame } from '@/components/ui/sheet-frame';
import { AppColors } from '@/constants/design-tokens';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { describeAuthError } from '@/services/auth-service';
import { addScoreEntry, formatPoints, peekAnniversary } from '@/services/anniversary-service';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

const SIGNS = [
  { value: 'plus', label: 'Sumar' },
  { value: 'minus', label: 'Descontar' },
];

// The deductions most rules spell out, to fill the form with one tap. The
// points and the words can be changed before saving.
const TYPICAL_DEDUCTIONS = [
  { label: 'Plagio de coreografía', points: 5000 },
  { label: 'Lienzo pintado fuera del liceo', points: 5000 },
  { label: 'Pareja de reyes ausente', points: 1000 },
  { label: 'Desfiló por otra alianza', points: 1000 },
];

/** An addition or a deduction, always with its reason, as the rules ask. */
function PointsScreen() {
  const router = useRouter();
  const alliances = peekAnniversary()?.anniversary?.alliances ?? [];
  const [allianceId, setAllianceId] = useState<string | null>(null);
  const [sign, setSign] = useState<'plus' | 'minus'>('plus');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const points = Number(amount || 0) * (sign === 'minus' ? -1 : 1);
  const ready = !!allianceId && points !== 0 && reason.trim().length >= 3;
  const dirty = !!allianceId || !!amount || !!reason.trim();

  const submit = async () => {
    if (!ready || !allianceId || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await addScoreEntry(allianceId, points, reason.trim());
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      allowLeave();
      router.back();
    } catch (saveError) {
      setError(describeAuthError(saveError, 'No pudimos guardar los puntos. Inténtalo nuevamente.'));
      setSubmitting(false);
    }
  };

  const label = sign === 'minus' ? 'Descontar' : 'Sumar';
  const { allowLeave, dialog } = useUnsavedChangesGuard({ dirty: dirty && !submitting, onSave: submit, saveLabel: label, canSave: ready });
  const name = alliances.find(alliance => alliance.id === allianceId)?.name;

  return (
    <SheetBody title="Sumar o descontar" lead="El motivo lo ve toda la alianza en sus movimientos. Nunca nombres a una persona.">
      <AlliancePicker alliances={alliances} value={allianceId} onChange={id => { setAllianceId(id); setError(null); }} disabled={submitting} />
      <HanetChoice label="Sumar o descontar" options={SIGNS} value={sign} onChange={value => setSign(value as 'plus' | 'minus')} disabled={submitting} />
      <View style={styles.field}>
        <ThemedText style={styles.label}>Descuentos típicos</ThemedText>
        <View style={local.chips}>
          {TYPICAL_DEDUCTIONS.map(item => (
            <HanetChip
              key={item.label}
              label={`${item.label} · −${formatPoints(item.points)}`}
              compact
              selected={sign === 'minus' && reason === item.label && Number(amount) === item.points}
              disabled={submitting}
              onPress={() => { setSign('minus'); setAmount(String(item.points)); setReason(item.label); setError(null); }}
            />
          ))}
        </View>
      </View>
      <TextField label="Puntos" value={amount} onChange={value => { setAmount(digitsOnly(value)); setError(null); }} placeholder="1000" keyboardType="number-pad" disabled={submitting} />
      <TextField
        label="Motivo"
        value={reason}
        onChange={value => { setReason(value); setError(null); }}
        placeholder={sign === 'minus' ? 'Lienzo pintado fuera del liceo' : '14 canastas solidarias'}
        maxLength={160}
        disabled={submitting}
      />
      {ready && name && (
        <ThemedText style={styles.hint}>{sign === 'minus' ? 'Se descuentan' : 'Se suman'} {formatPoints(Math.abs(points))} puntos a {name}.</ThemedText>
      )}
      <SheetActions label={label} busyLabel="Guardando…" ready={ready} busy={submitting} onSubmit={submit} error={error} />
      {dialog}
    </SheetBody>
  );
}

const local = StyleSheet.create({
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
});

export default withSheetFrame(PointsScreen, AppColors.surface);
