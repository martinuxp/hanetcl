import { hallLongDate } from '@/components/classhall/hall-ui';
import { hallFormStyles as styles } from '@/components/classhall/hall-form';
import { ThemedText } from '@/components/themed-text';
import { HanetDateTimePickerModal } from '@/components/ui/hanet-date-time-picker';
import { withSheetFrame } from '@/components/ui/sheet-frame';
import { AppColors, AppRadii, AppSpacing, AppTouch } from '@/constants/design-tokens';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { describeAuthError } from '@/services/auth-service';
import { DEFAULT_SKILLS, DocumentError, attachStagedDocument, getLoadedHall, pickHallDocument, saveHallEvaluation, scanSpecTable, skillAbbreviation } from '@/services/classhall-service';
import type { HallEvaluationContent, HallObjective, SpecTableDraft, StagedDocument } from '@/services/classhall-service';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const MAX_CONTENTS = 12;
const MAX_SKILLS = 8;
const MAX_OBJECTIVES = 6;

type Row = { name: string; detail: string; points: string[] };

export type Form = {
  title: string;
  date: number;
  exigency: string;
  skills: string[];
  rows: Row[];
  objectives: HallObjective[];
  prep: string;
};

// Tomorrow at 8:00, the usual first block.
function defaultDate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(8, 0, 0, 0);
  return date;
}

function emptyRow(columns: number): Row {
  return { name: '', detail: '', points: Array.from({ length: columns }, () => '') };
}

function toRow(content: HallEvaluationContent, columns: number): Row {
  return {
    name: content.name,
    detail: content.detail,
    points: Array.from({ length: columns }, (_, index) => (content.points[index] ? String(content.points[index]) : '')),
  };
}

function toNumber(value: string) {
  const number = parseInt(value, 10);
  return Number.isFinite(number) ? number : 0;
}

function digits(value: string, max = 3) {
  return value.replace(/[^0-9]/g, '').slice(0, max);
}

/** A small round "×" to take an item out of a list. */
function RemoveButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={8} disabled={disabled} onPress={onPress} style={({ pressed }) => [local.remove, pressed && styles.pressed]}>
      <ThemedText style={local.removeText}>Quitar</ThemedText>
    </Pressable>
  );
}

function AddButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled: boolean }) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [local.add, pressed && styles.pressed]}>
      <ThemedText style={local.addText}>{label}</ThemedText>
    </Pressable>
  );
}

function EvaluationFormScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // `fromEvent` brings an evaluation the course already put on its Calendar,
  // with its title and date, so the teacher completes it in the Hall.
  const { hallId, id, fromEvent, title: eventTitle, date: eventDate } = useLocalSearchParams<{ hallId: string; id?: string; fromEvent?: string; title?: string; date?: string }>();

  const [initial] = useState<Form>(() => {
    const existing = id ? getLoadedHall(hallId)?.evaluations.find(item => item.id === id) : undefined;
    if (existing) {
      const skills = existing.skills.length ? existing.skills : DEFAULT_SKILLS;
      return {
        title: existing.title,
        date: existing.date,
        exigency: existing.exigency === null ? '' : String(existing.exigency),
        skills,
        rows: existing.contents.length ? existing.contents.map(content => toRow(content, skills.length)) : [emptyRow(skills.length)],
        objectives: existing.objectives.length ? existing.objectives : [{ code: '', text: '' }],
        prep: existing.prep,
      };
    }
    const fromDate = Number(eventDate);
    return {
      title: fromEvent && eventTitle ? eventTitle.slice(0, 80) : '',
      date: fromEvent && Number.isFinite(fromDate) && fromDate > 0 ? fromDate : defaultDate().getTime(),
      exigency: '60',
      skills: DEFAULT_SKILLS,
      rows: [emptyRow(DEFAULT_SKILLS.length)],
      objectives: [{ code: '', text: '' }],
      prep: '',
    };
  });
  const [form, setForm] = useState<Form>(initial);
  const [picking, setPicking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The scanned T.E.: its file waits uploaded to become the evaluation's T.E. on saving.
  const [scanning, setScanning] = useState(false);
  const [scanNotes, setScanNotes] = useState<string[] | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [staged, setStaged] = useState<StagedDocument | null>(null);

  const applyDraft = (draft: SpecTableDraft) => {
    setForm(current => {
      const skills = draft.skills.length ? draft.skills : current.skills;
      let date = current.date;
      if (draft.date) {
        const [year, month, day] = draft.date.split('-').map(Number);
        const kept = new Date(current.date);
        date = new Date(year, month - 1, day, kept.getHours(), kept.getMinutes()).getTime();
      }
      return {
        title: draft.title || current.title,
        date,
        exigency: draft.exigency !== null ? String(draft.exigency) : current.exigency,
        skills,
        rows: draft.contents.length ? draft.contents.map(content => toRow(content, skills.length)) : current.rows.map(row => ({ ...row, points: skills.map((_, index) => row.points[index] ?? '') })),
        objectives: draft.objectives.length ? draft.objectives : current.objectives,
        prep: draft.prep || current.prep,
      };
    });
  };

  const scan = async () => {
    if (scanning || submitting) return;
    setScanError(null);
    try {
      const picked = await pickHallDocument();
      if (!picked) return;
      setScanning(true);
      const { draft, staged: file } = await scanSpecTable(hallId, picked);
      applyDraft(draft);
      setStaged(file);
      setScanNotes(draft.warnings);
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (readError) {
      setScanError(readError instanceof DocumentError ? readError.message : describeAuthError(readError, 'No pudimos leer la tabla. Complétala a mano.'));
    } finally {
      setScanning(false);
    }
  };

  const update = (changes: Partial<Form>) => {
    setForm(current => ({ ...current, ...changes }));
    setError(null);
  };
  const updateRow = (index: number, changes: Partial<Row>) =>
    update({ rows: form.rows.map((row, at) => (at === index ? { ...row, ...changes } : row)) });
  const setPoint = (rowIndex: number, column: number, value: string) =>
    updateRow(rowIndex, { points: form.rows[rowIndex].points.map((point, at) => (at === column ? digits(value) : point)) });
  const updateObjective = (index: number, changes: Partial<HallObjective>) =>
    update({ objectives: form.objectives.map((objective, at) => (at === index ? { ...objective, ...changes } : objective)) });

  // Columns come and go together with their points in every row.
  const addSkill = () => update({
    skills: [...form.skills, ''],
    rows: form.rows.map(row => ({ ...row, points: [...row.points, ''] })),
  });
  const removeSkill = (column: number) => update({
    skills: form.skills.filter((_, at) => at !== column),
    rows: form.rows.map(row => ({ ...row, points: row.points.filter((_, at) => at !== column) })),
  });
  const renameSkill = (column: number, name: string) =>
    update({ skills: form.skills.map((skill, at) => (at === column ? name : skill)) });

  const exigency = form.exigency ? toNumber(form.exigency) : null;
  const exigencyValid = exigency === null || (exigency >= 1 && exigency <= 100);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial) || !!staged;
  const namedSkills = form.skills.every(skill => skill.trim());
  // Taking a Calendar event in can be saved as it came.
  const ready = form.title.trim().length >= 2 && exigencyValid && namedSkills && (dirty || !!fromEvent);
  const total = form.rows.reduce((sum, row) => sum + row.points.reduce((rowSum, value) => rowSum + toNumber(value), 0), 0);

  const submit = async () => {
    if (!ready || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const evaluationId = await saveHallEvaluation({
        hallId,
        evaluationId: id,
        calendarEventId: fromEvent,
        title: form.title,
        date: form.date,
        exigency,
        skills: form.skills.map(skill => skill.trim()),
        contents: form.rows
          .filter(row => row.name.trim())
          .map(row => ({ name: row.name, detail: row.detail, points: row.points.map(toNumber) })),
        objectives: form.objectives.filter(objective => objective.code.trim() || objective.text.trim()),
        prep: form.prep,
      });
      // The scanned table becomes the evaluation's T.E.
      if (staged) {
        try {
          await attachStagedDocument(hallId, staged, { evaluationId });
        } catch {
          // The evaluation is saved; the T.E. can be uploaded from its screen.
        }
      }
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      allowLeave();
      router.back();
    } catch (saveError) {
      setError(describeAuthError(saveError, 'No pudimos guardar la evaluación. Inténtalo nuevamente.'));
      setSubmitting(false);
    }
  };

  const label = id ? 'Guardar cambios' : fromEvent ? 'Guardar en mi Hall' : 'Agendar evaluación';
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
      <ThemedText accessibilityRole="header" style={styles.title}>{id ? 'Editar evaluación' : fromEvent ? 'Completar evaluación' : 'Agendar evaluación'}</ThemedText>
      <ThemedText style={styles.lead}>
        {fromEvent
          ? 'La agendó el curso en el Calendar. Al guardarla pasa a tu Hall: podrás editarla y agregar su tabla de especificaciones, y en el Calendar quedará como verificada por ti.'
          : 'Tus estudiantes verán la fecha y la tabla de especificaciones. También aparece en el Calendar del curso.'}
      </ThemedText>

      <View style={local.scanCard}>
        <ThemedText style={local.scanTitle}>Escanear tabla de especificaciones</ThemedText>
        <ThemedText style={local.scanText}>
          Sube tu T.E. en PDF o una foto y llenamos el formulario por ti. Revisa todo antes de guardar: el archivo quedará como la T.E. de la evaluación.
        </ThemedText>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ busy: scanning }}
          disabled={scanning || submitting}
          onPress={scan}
          style={({ pressed }) => [local.scanButton, (scanning || submitting) && styles.submitDisabled, pressed && styles.pressed]}
        >
          <ThemedText style={local.scanButtonText}>{scanning ? 'Leyendo la tabla…' : staged ? 'Escanear otra' : 'Escanear T.E.'}</ThemedText>
        </Pressable>
        {!!staged && <ThemedText numberOfLines={1} style={local.scanText}>Leímos: {staged.name}</ThemedText>}
        {!!scanError && <ThemedText accessibilityLiveRegion="assertive" style={local.scanError}>{scanError}</ThemedText>}
        {!!scanNotes && (
          <View accessibilityLiveRegion="polite" style={local.notes}>
            <ThemedText style={local.notesTitle}>{scanNotes.length ? 'Revisa esto antes de guardar' : 'Listo. Revisa los datos antes de guardar.'}</ThemedText>
            {scanNotes.map((note, index) => <ThemedText key={index} style={local.note}>• {note}</ThemedText>)}
          </View>
        )}
      </View>

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

      <View style={local.pair}>
        <View style={[styles.field, local.pairWide]}>
          <ThemedText style={styles.label}>Día y hora</ThemedText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Día y hora: ${hallLongDate(form.date)}. Cambiar`}
            disabled={submitting}
            onPress={() => setPicking(true)}
            style={({ pressed }) => [styles.input, local.dateButton, pressed && styles.pressed]}
          >
            <ThemedText numberOfLines={2} style={local.dateText}>{hallLongDate(form.date)}</ThemedText>
          </Pressable>
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
        <ThemedText style={styles.label}>Objetivos de aprendizaje <ThemedText style={[styles.label, styles.optional]}>(opcional)</ThemedText></ThemedText>
        {form.objectives.map((objective, index) => (
          <View key={index} style={local.block}>
            <View style={local.blockHead}>
              <TextInput
                accessibilityLabel={`Código del objetivo ${index + 1}`}
                value={objective.code}
                onChangeText={code => updateObjective(index, { code })}
                placeholder="OA 3"
                placeholderTextColor={AppColors.surfaceMuted}
                autoCapitalize="characters"
                maxLength={40}
                editable={!submitting}
                selectionColor={AppColors.accent}
                style={[styles.input, local.codeInput]}
              />
              {form.objectives.length > 1 && (
                <RemoveButton label={`Quitar el objetivo ${index + 1}`} disabled={submitting} onPress={() => update({ objectives: form.objectives.filter((_, at) => at !== index) })} />
              )}
            </View>
            <TextInput
              accessibilityLabel={`Texto del objetivo ${index + 1}, opcional`}
              value={objective.text}
              onChangeText={text => updateObjective(index, { text })}
              placeholder="Analizar las narraciones leídas… (opcional)"
              placeholderTextColor={AppColors.surfaceMuted}
              multiline
              maxLength={600}
              editable={!submitting}
              selectionColor={AppColors.accent}
              style={[styles.input, local.objectiveText]}
            />
          </View>
        ))}
        {form.objectives.length < MAX_OBJECTIVES && (
          <AddButton label="Agregar objetivo" disabled={submitting} onPress={() => update({ objectives: [...form.objectives, { code: '', text: '' }] })} />
        )}
      </View>

      <View style={styles.field}>
        <ThemedText style={styles.label}>Habilidades de la tabla</ThemedText>
        <ThemedText style={styles.hint}>Las columnas de puntos, con los nombres que usa tu tabla.</ThemedText>
        {form.skills.map((skill, column) => (
          <View key={column} style={local.skillRow}>
            <TextInput
              accessibilityLabel={`Habilidad ${column + 1}`}
              value={skill}
              onChangeText={name => renameSkill(column, name)}
              placeholder="Comprensión"
              placeholderTextColor={AppColors.surfaceMuted}
              maxLength={40}
              editable={!submitting}
              selectionColor={AppColors.accent}
              style={[styles.input, local.skillInput]}
            />
            {form.skills.length > 1 && (
              <RemoveButton label={`Quitar la habilidad ${skill || column + 1}`} disabled={submitting} onPress={() => removeSkill(column)} />
            )}
          </View>
        ))}
        {!namedSkills && <ThemedText style={styles.error}>Ponle nombre a cada habilidad.</ThemedText>}
        {form.skills.length < MAX_SKILLS && <AddButton label="Agregar habilidad" disabled={submitting} onPress={addSkill} />}
      </View>

      <View style={styles.field}>
        <View style={local.contentsHead}>
          <ThemedText style={styles.label}>Contenidos <ThemedText style={[styles.label, styles.optional]}>(opcional)</ThemedText></ThemedText>
          {total > 0 && <ThemedText style={local.total}>Total {total} pts.</ThemedText>}
        </View>

        {form.rows.map((row, index) => (
          <View key={index} style={local.block}>
            <View style={local.blockHead}>
              <ThemedText style={local.rowNumber}>Contenido {index + 1}</ThemedText>
              {form.rows.length > 1 && (
                <RemoveButton label={`Quitar el contenido ${index + 1}`} disabled={submitting} onPress={() => update({ rows: form.rows.filter((_, at) => at !== index) })} />
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
              {form.skills.map((skill, column) => (
                <View key={column} style={local.point}>
                  <ThemedText numberOfLines={1} style={local.pointLabel}>{skill ? skillAbbreviation(skill) : `H${column + 1}`}</ThemedText>
                  <TextInput
                    accessibilityLabel={`Puntos de ${skill || `la habilidad ${column + 1}`}, contenido ${index + 1}`}
                    value={row.points[column] ?? ''}
                    onChangeText={value => setPoint(index, column, value)}
                    placeholder="0"
                    placeholderTextColor={AppColors.surfaceMuted}
                    keyboardType="number-pad"
                    editable={!submitting}
                    selectionColor={AppColors.accent}
                    style={[styles.input, local.pointInput]}
                  />
                </View>
              ))}
            </View>
          </View>
        ))}

        {form.rows.length < MAX_CONTENTS && (
          <AddButton label="Agregar contenido" disabled={submitting} onPress={() => update({ rows: [...form.rows, emptyRow(form.skills.length)] })} />
        )}
      </View>

      <View style={styles.field}>
        <ThemedText style={styles.label}>Cómo prepararse <ThemedText style={[styles.label, styles.optional]}>(opcional)</ThemedText></ThemedText>
        <TextInput
          accessibilityLabel="Cómo prepararse, opcional"
          value={form.prep}
          onChangeText={prep => update({ prep })}
          placeholder="Apuntes de clases, guía de contenidos, libro del Ministerio pp. 38-50…"
          placeholderTextColor={AppColors.surfaceMuted}
          multiline
          maxLength={1500}
          editable={!submitting}
          selectionColor={AppColors.accent}
          style={[styles.input, styles.multiline]}
        />
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
  scanCard: {
    gap: AppSpacing.sm,
    padding: AppSpacing.lg,
    borderRadius: AppRadii.lg,
    borderCurve: 'continuous',
    backgroundColor: AppColors.accent,
  },
  scanTitle: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 16,
    lineHeight: 22,
    color: AppColors.textOnLight,
  },
  scanText: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.textOnLight,
  },
  scanButton: {
    minHeight: AppTouch.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.primary,
  },
  scanButtonText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 15,
    lineHeight: 20,
    color: AppColors.textPrimary,
  },
  scanError: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.textOnLight,
  },
  notes: {
    gap: 4,
    padding: AppSpacing.md,
    borderRadius: AppRadii.md,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(40, 40, 41, 0.12)',
  },
  notesTitle: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.textOnLight,
  },
  note: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.textOnLight,
  },
  dateButton: {
    justifyContent: 'center',
  },
  dateText: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: -0.3,
    color: AppColors.textPrimary,
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
  block: {
    gap: AppSpacing.sm,
    padding: AppSpacing.md,
    borderRadius: AppRadii.lg,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surfaceMuted,
  },
  blockHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: AppSpacing.sm,
    paddingHorizontal: AppSpacing.xs,
  },
  codeInput: {
    flex: 1,
    minHeight: 48,
  },
  objectiveText: {
    minHeight: 72,
    paddingTop: AppSpacing.md,
    paddingBottom: AppSpacing.md,
    lineHeight: 21,
    textAlignVertical: 'top',
  },
  skillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.sm,
  },
  skillInput: {
    flex: 1,
    minHeight: 48,
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
  // Point boxes wrap to a new line when a table has many skills.
  points: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing.sm,
  },
  point: {
    flexGrow: 1,
    flexBasis: 72,
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
