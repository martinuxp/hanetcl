import { hallLongDate } from '@/components/classhall/hall-ui';
import { hallFormStyles as styles } from '@/components/classhall/hall-form';
import { ThemedText } from '@/components/themed-text';
import { HanetDateTimePickerModal } from '@/components/ui/hanet-date-time-picker';
import { withSheetFrame } from '@/components/ui/sheet-frame';
import { AppColors, AppRadii, AppSpacing, AppTouch } from '@/constants/design-tokens';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { describeAuthError } from '@/services/auth-service';
import { getLoadedHall, saveHallEvaluation } from '@/services/classhall-service';
import type { HallEvaluationContent } from '@/services/classhall-service';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const MAX_CONTENTS = 12;

type Row = { name: string; detail: string; con: string; apl: string; com: string };

const EMPTY_ROW: Row = { name: '', detail: '', con: '', apl: '', com: '' };

// Tomorrow at 8:00, the usual first block.
function defaultDate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(8, 0, 0, 0);
  return date;
}

function toRow(content: HallEvaluationContent): Row {
  return { name: content.name, detail: content.detail, con: String(content.con), apl: String(content.apl), com: String(content.com) };
}

function toNumber(value: string) {
  const number = parseInt(value, 10);
  return Number.isFinite(number) ? number : 0;
}

function digits(value: string, max = 3) {
  return value.replace(/[^0-9]/g, '').slice(0, max);
}

type Form = { title: string; date: number; oa: string; exigency: string; rows: Row[] };

function PointInput({ label, value, onChange, disabled }: { label: string; value: string; onChange: (value: string) => void; disabled: boolean }) {
  return (
    <View style={local.point}>
      <ThemedText style={local.pointLabel}>{label}</ThemedText>
      <TextInput
        accessibilityLabel={`Puntos de ${label === 'CON.' ? 'conocimiento' : label === 'APL.' ? 'aplicación' : 'comprensión'}`}
        value={value}
        onChangeText={text => onChange(digits(text))}
        placeholder="0"
        placeholderTextColor={AppColors.surfaceMuted}
        keyboardType="number-pad"
        editable={!disabled}
        selectionColor={AppColors.accent}
        style={[styles.input, local.pointInput]}
      />
    </View>
  );
}

function EvaluationFormScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { hallId, id } = useLocalSearchParams<{ hallId: string; id?: string }>();

  const [initial] = useState<Form>(() => {
    const existing = id ? getLoadedHall(hallId)?.evaluations.find(item => item.id === id) : undefined;
    if (existing) {
      return {
        title: existing.title,
        date: existing.date,
        oa: existing.oa,
        exigency: existing.exigency === null ? '' : String(existing.exigency),
        rows: existing.contents.length ? existing.contents.map(toRow) : [EMPTY_ROW],
      };
    }
    return { title: '', date: defaultDate().getTime(), oa: '', exigency: '60', rows: [EMPTY_ROW] };
  });
  const [form, setForm] = useState<Form>(initial);
  const [picking, setPicking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (changes: Partial<Form>) => {
    setForm(current => ({ ...current, ...changes }));
    setError(null);
  };
  const updateRow = (index: number, changes: Partial<Row>) =>
    update({ rows: form.rows.map((row, at) => (at === index ? { ...row, ...changes } : row)) });

  const exigency = form.exigency ? toNumber(form.exigency) : null;
  const exigencyValid = exigency === null || (exigency >= 1 && exigency <= 100);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const ready = form.title.trim().length >= 2 && exigencyValid && dirty;
  const total = form.rows.reduce((sum, row) => sum + toNumber(row.con) + toNumber(row.apl) + toNumber(row.com), 0);

  const submit = async () => {
    if (!ready || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await saveHallEvaluation({
        hallId,
        evaluationId: id,
        title: form.title,
        date: form.date,
        oa: form.oa,
        exigency,
        contents: form.rows
          .filter(row => row.name.trim())
          .map(row => ({ name: row.name, detail: row.detail, con: toNumber(row.con), apl: toNumber(row.apl), com: toNumber(row.com) })),
      });
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      allowLeave();
      router.back();
    } catch (saveError) {
      setError(describeAuthError(saveError, 'No pudimos guardar la evaluación. Inténtalo nuevamente.'));
      setSubmitting(false);
    }
  };

  const label = id ? 'Guardar cambios' : 'Agendar evaluación';
  const { allowLeave, dialog } = useUnsavedChangesGuard({
    dirty: dirty && !submitting,
    onSave: submit,
    saveLabel: label,
    canSave: ready,
    title: id ? '¿Descartar los cambios?' : '¿Descartar esta evaluación?',
    message: id ? 'La evaluación quedará como estaba.' : 'Todavía no la has agendado.',
  });

  return (
    <ScrollView
      style={styles.sheet}
      contentContainerStyle={[styles.content, { paddingTop: (Platform.OS === 'android' ? 0 : insets.top) + AppSpacing.xxl, paddingBottom: insets.bottom + AppSpacing.xl }]}
      keyboardShouldPersistTaps="handled"
    >
      <ThemedText accessibilityRole="header" style={styles.title}>{id ? 'Editar evaluación' : 'Agendar evaluación'}</ThemedText>
      <ThemedText style={styles.lead}>
        Tus estudiantes verán la fecha y la tabla de especificaciones. También aparece en el Calendar del curso.
      </ThemedText>

      <View style={styles.field}>
        <ThemedText style={styles.label}>Nombre</ThemedText>
        <TextInput
          accessibilityLabel="Nombre de la evaluación"
          value={form.title}
          onChangeText={title => update({ title })}
          placeholder="Evaluación sumativa 2"
          placeholderTextColor={AppColors.surfaceMuted}
          maxLength={80}
          editable={!submitting}
          selectionColor={AppColors.accent}
          style={styles.input}
        />
      </View>

      <View style={styles.field}>
        <ThemedText style={styles.label}>Día y hora</ThemedText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Día y hora: ${hallLongDate(form.date)}. Cambiar`}
          disabled={submitting}
          onPress={() => setPicking(true)}
          style={({ pressed }) => [styles.input, local.dateButton, pressed && styles.pressed]}
        >
          <ThemedText style={local.dateText}>{hallLongDate(form.date)}</ThemedText>
          <ThemedText style={local.dateAction}>Cambiar</ThemedText>
        </Pressable>
      </View>

      <View style={local.pair}>
        <View style={[styles.field, local.pairWide]}>
          <ThemedText style={styles.label}>Objetivo <ThemedText style={[styles.label, styles.optional]}>(opcional)</ThemedText></ThemedText>
          <TextInput
            accessibilityLabel="Objetivo de aprendizaje, opcional"
            value={form.oa}
            onChangeText={oa => update({ oa })}
            placeholder="LE2M OA 08"
            placeholderTextColor={AppColors.surfaceMuted}
            autoCapitalize="characters"
            maxLength={40}
            editable={!submitting}
            selectionColor={AppColors.accent}
            style={styles.input}
          />
        </View>
        <View style={[styles.field, local.pairNarrow]}>
          <ThemedText style={styles.label}>Exigencia</ThemedText>
          <View>
            <TextInput
              accessibilityLabel="Exigencia en porcentaje"
              value={form.exigency}
              onChangeText={text => update({ exigency: digits(text) })}
              placeholder="60"
              placeholderTextColor={AppColors.surfaceMuted}
              keyboardType="number-pad"
              editable={!submitting}
              selectionColor={AppColors.accent}
              style={[styles.input, local.percentInput]}
            />
            <ThemedText style={local.percent} pointerEvents="none">%</ThemedText>
          </View>
        </View>
      </View>
      {!exigencyValid && <ThemedText style={styles.error}>La exigencia va de 1 a 100 %.</ThemedText>}

      <View style={styles.field}>
        <View style={local.contentsHead}>
          <ThemedText style={styles.label}>Contenidos <ThemedText style={[styles.label, styles.optional]}>(opcional)</ThemedText></ThemedText>
          {total > 0 && <ThemedText style={local.total}>Total {total} pts.</ThemedText>}
        </View>
        <ThemedText style={styles.hint}>Puntos de conocimiento (CON.), aplicación (APL.) y comprensión (COM.).</ThemedText>

        {form.rows.map((row, index) => (
          <View key={index} style={local.row}>
            <View style={local.rowHead}>
              <ThemedText style={local.rowNumber}>Contenido {index + 1}</ThemedText>
              {form.rows.length > 1 && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Quitar el contenido ${index + 1}`}
                  disabled={submitting}
                  hitSlop={8}
                  onPress={() => update({ rows: form.rows.filter((_, at) => at !== index) })}
                  style={({ pressed }) => [local.remove, pressed && styles.pressed]}
                >
                  <ThemedText style={local.removeText}>Quitar</ThemedText>
                </Pressable>
              )}
            </View>
            <TextInput
              accessibilityLabel={`Nombre del contenido ${index + 1}`}
              value={row.name}
              onChangeText={name => updateRow(index, { name })}
              placeholder="Unidad 1"
              placeholderTextColor={AppColors.surfaceMuted}
              maxLength={80}
              editable={!submitting}
              selectionColor={AppColors.accent}
              style={[styles.input, local.rowInput]}
            />
            <TextInput
              accessibilityLabel={`Detalle del contenido ${index + 1}, opcional`}
              value={row.detail}
              onChangeText={detail => updateRow(index, { detail })}
              placeholder="Detalle (opcional)"
              placeholderTextColor={AppColors.surfaceMuted}
              maxLength={160}
              editable={!submitting}
              selectionColor={AppColors.accent}
              style={[styles.input, local.rowInput]}
            />
            <View style={local.points}>
              <PointInput label="CON." value={row.con} onChange={con => updateRow(index, { con })} disabled={submitting} />
              <PointInput label="APL." value={row.apl} onChange={apl => updateRow(index, { apl })} disabled={submitting} />
              <PointInput label="COM." value={row.com} onChange={com => updateRow(index, { com })} disabled={submitting} />
            </View>
          </View>
        ))}

        {form.rows.length < MAX_CONTENTS && (
          <Pressable
            accessibilityRole="button"
            disabled={submitting}
            onPress={() => update({ rows: [...form.rows, EMPTY_ROW] })}
            style={({ pressed }) => [local.add, pressed && styles.pressed]}
          >
            <ThemedText style={local.addText}>Agregar contenido</ThemedText>
          </Pressable>
        )}
      </View>

      {!!error && <ThemedText accessibilityLiveRegion="assertive" style={styles.error}>{error}</ThemedText>}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !ready || submitting, busy: submitting }}
        disabled={!ready || submitting}
        onPress={submit}
        style={({ pressed }) => [styles.submit, (!ready || submitting) && styles.submitDisabled, pressed && styles.pressed]}
      >
        <ThemedText style={styles.submitText}>{submitting ? 'Guardando…' : label}</ThemedText>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}>
        <ThemedText style={styles.cancelText}>Cancelar</ThemedText>
      </Pressable>

      <HanetDateTimePickerModal
        visible={picking}
        value={new Date(form.date)}
        onCancel={() => setPicking(false)}
        onConfirm={date => { setPicking(false); update({ date: date.getTime() }); }}
      />
      {dialog}
    </ScrollView>
  );
}

const local = StyleSheet.create({
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: AppSpacing.md,
  },
  dateText: {
    flex: 1,
    fontFamily: 'DMSans_500Medium',
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: -0.4,
    color: AppColors.textPrimary,
  },
  dateAction: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.textSecondary,
  },
  pair: {
    flexDirection: 'row',
    gap: AppSpacing.md,
  },
  pairWide: {
    flex: 2,
  },
  pairNarrow: {
    flex: 1,
  },
  percentInput: {
    paddingRight: 36,
  },
  percent: {
    position: 'absolute',
    right: AppSpacing.lg,
    top: 17,
    fontFamily: 'DMSans_500Medium',
    fontSize: 16,
    lineHeight: 22,
    color: AppColors.textSecondary,
  },
  contentsHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  total: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.textPrimary,
  },
  row: {
    gap: AppSpacing.sm,
    padding: AppSpacing.md,
    borderRadius: AppRadii.lg,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surfaceMuted,
  },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: AppSpacing.xs,
  },
  rowNumber: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.textSecondary,
  },
  remove: {
    minHeight: 28,
    justifyContent: 'center',
  },
  removeText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.errorText,
  },
  rowInput: {
    minHeight: 48,
  },
  points: {
    flexDirection: 'row',
    gap: AppSpacing.sm,
  },
  point: {
    flex: 1,
    gap: 4,
  },
  pointLabel: {
    textAlign: 'center',
    fontFamily: 'DMSans_500Medium',
    fontSize: 12,
    lineHeight: 16,
    color: AppColors.textSecondary,
  },
  pointInput: {
    minHeight: 48,
    textAlign: 'center',
    paddingHorizontal: AppSpacing.sm,
  },
  add: {
    minHeight: AppTouch.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.surfaceMuted,
  },
  addText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.textPrimary,
  },
});

export default withSheetFrame(EvaluationFormScreen, AppColors.surface);
