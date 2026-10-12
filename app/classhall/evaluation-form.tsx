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
import Animated, { FadeIn } from 'react-native-reanimated';
import { CustomIcon } from '@/components/ui/custom-icon';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { HanetButton } from '@/components/ui/hanet-button';
import { HanetDialog } from '@/components/ui/hanet-dialog';
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
  // Sections start closed, except the ones that already hold something.
  const [openSections, setOpenSections] = useState<string[]>(() => [
    ...(initial.rows.some(row => row.name.trim()) ? ['table'] : []),
  ]);
  const toggleSection = (section: string) =>
    setOpenSections(list => (list.includes(section) ? list.filter(item => item !== section) : [...list, section]));
  const [editingSkills, setEditingSkills] = useState(false);
  const [detailRows, setDetailRows] = useState<number[]>([]);

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

  // A new evaluation starts by choosing: scan the T.E. or fill it in by hand.
  const [choosing, setChoosing] = useState(!id);

  /** Scans a T.E.; false when the teacher closed the file picker without choosing. */
  const scan = async () => {
    if (scanning || submitting) return true;
    setScanError(null);
    try {
      const picked = await pickHallDocument();
      if (!picked) return false;
      setScanning(true);
      const { draft, staged: file } = await scanSpecTable(hallId, picked);
      applyDraft(draft);
      setStaged(file);
      // What the scan filled opens, for the teacher to review.
      setOpenSections(list => [...new Set([
        ...list,
        ...(draft.contents.length ? ['table'] : []),
        ...(draft.objectives.length ? ['objectives'] : []),
        ...(draft.exigency !== null || draft.prep ? ['more'] : []),
      ])]);
      setScanNotes(draft.warnings);
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (readError) {
      setScanError(readError instanceof DocumentError ? readError.message : describeAuthError(readError, 'No pudimos leer la tabla. Complétala a mano.'));
    } finally {
      setScanning(false);
    }
    return true;
  };

  const chooseScan = async () => {
    setChoosing(false);
    // iOS cannot open the file picker while the dialog is still closing.
    await new Promise(resolve => setTimeout(resolve, 250));
    const picked = await scan();
    // Closing the file picker brings the choice back.
    if (!picked) setChoosing(true);
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

  const filledRows = form.rows.filter(row => row.name.trim()).length;
  const objectiveCodes = form.objectives.filter(objective => objective.code.trim()).map(objective => objective.code.trim());
  const filledObjectives = form.objectives.filter(objective => objective.code.trim() || objective.text.trim()).length;
  const tableSummary = filledRows
    ? `${filledRows} ${filledRows === 1 ? 'contenido' : 'contenidos'}${total ? ` · ${total} pts.` : ''}`
    : 'Contenidos y puntajes';
  const objectivesSummary = objectiveCodes.length
    ? objectiveCodes.join(' · ')
    : filledObjectives ? `${filledObjectives} ${filledObjectives === 1 ? 'objetivo' : 'objetivos'}` : 'Opcional';
  const moreSummary = [exigency !== null ? `Exigencia ${exigency} %` : 'Sin exigencia', form.prep.trim() ? 'Cómo prepararse' : null].filter(Boolean).join(' · ');

  return (
    <View style={styles.sheet}>
    <ScrollView
      style={styles.sheet}
      contentContainerStyle={[styles.content, local.content, { paddingTop: (Platform.OS === 'android' ? 0 : insets.top) + AppSpacing.xxl, paddingBottom: insets.bottom + AppSpacing.xl }]}
      keyboardShouldPersistTaps="handled"
    >
      <ThemedText accessibilityRole="header" style={styles.title}>{id ? 'Editar evaluación' : fromEvent ? 'Completar evaluación' : 'Agendar evaluación'}</ThemedText>
      <ThemedText style={styles.lead}>
        {fromEvent
          ? 'La agendó el curso en el Calendar. Al guardarla pasa a tu Hall y queda verificada por ti.'
          : 'Solo el nombre y el día son obligatorios. También aparece en el Calendar del curso.'}
      </ThemedText>

      {staged || scanError ? (
        <View style={local.scanCard}>
          <View style={local.scanRow}>
            <View style={local.scanCopy}>
              <ThemedText style={local.scanTitle}>{staged ? 'Tabla leída' : 'No pudimos leer la tabla'}</ThemedText>
              <ThemedText numberOfLines={2} style={local.scanText}>{staged ? staged.name : scanError}</ThemedText>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Escanear otra tabla"
              disabled={scanning || submitting}
              onPress={() => void scan()}
              style={({ pressed }) => [local.scanButton, (scanning || submitting) && styles.submitDisabled, pressed && styles.pressed]}
            >
              <ThemedText style={local.scanButtonText}>{staged ? 'Otra' : 'Reintentar'}</ThemedText>
            </Pressable>
          </View>
          {!!scanNotes && (
            <View accessibilityLiveRegion="polite" style={local.notes}>
              <ThemedText style={local.notesTitle}>{scanNotes.length ? 'Revisa esto antes de guardar' : 'Listo. Revisa los datos antes de guardar.'}</ThemedText>
              {scanNotes.map((note, index) => <ThemedText key={index} style={local.note}>• {note}</ThemedText>)}
            </View>
          )}
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityHint="Sube la T.E. en PDF o foto y llena el formulario"
          disabled={scanning || submitting}
          onPress={() => void scan()}
          style={({ pressed }) => [local.scanLink, pressed && styles.pressed]}
        >
          <ThemedText style={local.scanLinkText}>¿Tienes la T.E.? <ThemedText style={local.scanLinkStrong}>Escanearla</ThemedText></ThemedText>
        </Pressable>
      )}

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
          <ThemedText numberOfLines={1} style={local.dateText}>{hallLongDate(form.date)}</ThemedText>
          <ThemedText style={local.dateAction}>Cambiar</ThemedText>
        </Pressable>
      </View>

      <Section title="Tabla de especificaciones" summary={tableSummary} open={openSections.includes('table')} onToggle={() => toggleSection('table')}>
        <View style={local.skillsBar}>
          <View style={local.skillsCopy}>
            <ThemedText style={local.smallLabel}>Habilidades</ThemedText>
            <ThemedText numberOfLines={2} style={local.skillsList}>{form.skills.map(skill => skill.trim() || 'Sin nombre').join(' · ')}</ThemedText>
          </View>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: editingSkills }} onPress={() => setEditingSkills(value => !value)} style={({ pressed }) => [local.linkButton, pressed && styles.pressed]}>
            <ThemedText style={local.linkText}>{editingSkills ? 'Listo' : 'Cambiar'}</ThemedText>
          </Pressable>
        </View>
        {editingSkills && (
          <Animated.View entering={FadeIn.duration(120)} style={local.skillsEditor}>
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
            {form.skills.length < MAX_SKILLS && <AddButton label="Agregar habilidad" disabled={submitting} onPress={addSkill} />}
          </Animated.View>
        )}
        {!namedSkills && <ThemedText style={styles.error}>Ponle nombre a cada habilidad.</ThemedText>}

        {form.rows.map((row, index) => {
          const detailShown = !!row.detail || detailRows.includes(index);
          return (
            <View key={index} style={local.block}>
              <View style={local.blockHead}>
                <TextInput
                  accessibilityLabel={`Nombre del contenido ${index + 1}`}
                  value={row.name}
                  onChangeText={name => updateRow(index, { name })}
                  placeholder={`Contenido ${index + 1}`}
                  placeholderTextColor={AppColors.surfaceMuted}
                  maxLength={80}
                  editable={!submitting}
                  selectionColor={AppColors.accent}
                  style={[styles.input, local.rowInput, local.grow]}
                />
                {form.rows.length > 1 && (
                  <RemoveButton label={`Quitar el contenido ${index + 1}`} disabled={submitting} onPress={() => update({ rows: form.rows.filter((_, at) => at !== index) })} />
                )}
              </View>
              {detailShown ? (
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
              ) : (
                <Pressable accessibilityRole="button" onPress={() => setDetailRows(list => [...list, index])} style={({ pressed }) => [local.inlineLink, pressed && styles.pressed]}>
                  <ThemedText style={local.linkText}>+ Agregar detalle</ThemedText>
                </Pressable>
              )}
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
          );
        })}
        {form.rows.length < MAX_CONTENTS && (
          <AddButton label="Agregar contenido" disabled={submitting} onPress={() => update({ rows: [...form.rows, emptyRow(form.skills.length)] })} />
        )}
      </Section>

      <Section title="Objetivos de aprendizaje" summary={objectivesSummary} open={openSections.includes('objectives')} onToggle={() => toggleSection('objectives')}>
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
                style={[styles.input, local.rowInput, local.grow]}
              />
              {form.objectives.length > 1 && (
                <RemoveButton label={`Quitar el objetivo ${index + 1}`} disabled={submitting} onPress={() => update({ objectives: form.objectives.filter((_, at) => at !== index) })} />
              )}
            </View>
            <TextInput
              accessibilityLabel={`Texto del objetivo ${index + 1}, opcional`}
              value={objective.text}
              onChangeText={text => updateObjective(index, { text })}
              placeholder="Qué se espera que aprendan (opcional)"
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
      </Section>

      <Section title="Más detalles" summary={moreSummary} open={openSections.includes('more')} onToggle={() => toggleSection('more')}>
        <View style={styles.field}>
          <ThemedText style={styles.label}>Exigencia</ThemedText>
          <View style={local.exigency}>
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
          {!exigencyValid && <ThemedText style={styles.error}>La exigencia va de 1 a 100 %.</ThemedText>}
        </View>
        <View style={styles.field}>
          <ThemedText style={styles.label}>Cómo prepararse</ThemedText>
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
      </Section>

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

      {scanning && (
        <Animated.View entering={FadeIn.duration(120)} style={local.scanningLayer} accessibilityLiveRegion="polite">
          <ActivityIndicator size="large" color={AppColors.textPrimary} />
          <ThemedText style={local.scanningText}>Leyendo la tabla…</ThemedText>
          <ThemedText style={local.scanningHint}>Buscamos los contenidos, los puntajes y los objetivos.</ThemedText>
        </Animated.View>
      )}

      <HanetDialog
        visible={choosing}
        onRequestClose={() => router.back()}
        title={fromEvent ? 'Completar evaluación' : 'Nueva evaluación'}
        body="¿Cómo quieres agregar la tabla de especificaciones?"
      >
        <Pressable accessibilityRole="button" onPress={() => void chooseScan()} style={({ pressed }) => [local.option, local.optionAccent, pressed && styles.pressed]}>
          <ThemedText style={[local.optionTitle, local.onAccent]}>Escanear T.E.</ThemedText>
          <ThemedText style={[local.optionText, local.onAccent]}>Sube la tabla en PDF o una foto y llenamos todo por ti. Después la revisas.</ThemedText>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => setChoosing(false)} style={({ pressed }) => [local.option, pressed && styles.pressed]}>
          <ThemedText style={local.optionTitle}>Agregar a mano</ThemedText>
          <ThemedText style={local.optionText}>Escribe el nombre, el día y, si quieres, la tabla.</ThemedText>
        </Pressable>
        <HanetButton label="Cancelar" variant="surface" onPress={() => router.back()} />
      </HanetDialog>
    </View>
  );
}

/** A part of the form that opens on tap, with a one-line summary of what it holds. */
function Section({ title, summary, open, onToggle, children }: { title: string; summary: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <View style={local.section}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}. ${summary}`}
        accessibilityState={{ expanded: open }}
        onPress={onToggle}
        style={({ pressed }) => [local.sectionHead, pressed && styles.pressed]}
      >
        <View style={local.sectionCopy}>
          <ThemedText style={local.sectionTitle}>{title}</ThemedText>
          <ThemedText numberOfLines={1} style={local.sectionSummary}>{summary}</ThemedText>
        </View>
        <View style={open ? local.chevronOpen : local.chevron}>
          <CustomIcon name="chevron-right" size={18} color={AppColors.textSecondary} />
        </View>
      </Pressable>
      {open && (
        <Animated.View entering={FadeIn.duration(120)} style={local.sectionBody}>
          {children}
        </Animated.View>
      )}
    </View>
  );
}

const local = StyleSheet.create({
  scanLink: {
    minHeight: AppTouch.minimum,
    justifyContent: 'center',
    paddingHorizontal: AppSpacing.lg,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.surfaceMuted,
  },
  scanLinkText: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.textSecondary,
  },
  scanLinkStrong: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 14,
    color: AppColors.textPrimary,
  },
  scanningLayer: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: AppSpacing.md,
    padding: AppSpacing.xxl,
    backgroundColor: AppColors.surface,
  },
  scanningText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 20,
    lineHeight: 26,
    color: AppColors.textPrimary,
  },
  scanningHint: {
    textAlign: 'center',
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.textSecondary,
  },
  option: {
    gap: 4,
    padding: AppSpacing.lg,
    borderRadius: AppRadii.lg,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surfaceMuted,
  },
  optionAccent: {
    backgroundColor: AppColors.accent,
  },
  optionTitle: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 16,
    lineHeight: 22,
    color: AppColors.textPrimary,
  },
  optionText: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.textSecondary,
  },
  onAccent: {
    color: AppColors.textOnLight,
  },
  content: {
    gap: AppSpacing.lg,
  },
  scanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
  },
  scanCopy: {
    flex: 1,
    gap: 2,
  },
  dateAction: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.textSecondary,
  },
  section: {
    overflow: 'hidden',
    borderRadius: AppRadii.lg,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surfaceMuted,
  },
  sectionHead: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
    paddingHorizontal: AppSpacing.lg,
    paddingVertical: AppSpacing.md,
  },
  sectionCopy: {
    flex: 1,
    gap: 2,
  },
  sectionTitle: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 15,
    lineHeight: 20,
    color: AppColors.textPrimary,
  },
  sectionSummary: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.textSecondary,
  },
  chevron: {
    transform: [{ rotate: '90deg' }],
  },
  chevronOpen: {
    transform: [{ rotate: '-90deg' }],
  },
  sectionBody: {
    gap: AppSpacing.md,
    paddingHorizontal: AppSpacing.md,
    paddingBottom: AppSpacing.md,
  },
  skillsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
    paddingHorizontal: AppSpacing.xs,
  },
  skillsCopy: {
    flex: 1,
  },
  smallLabel: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 12,
    lineHeight: 16,
    color: AppColors.textSecondary,
  },
  skillsList: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.textPrimary,
  },
  skillsEditor: {
    gap: AppSpacing.sm,
  },
  linkButton: {
    minHeight: AppTouch.minimum - 8,
    justifyContent: 'center',
    paddingHorizontal: AppSpacing.md,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.surface,
  },
  linkText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.textPrimary,
  },
  inlineLink: {
    alignSelf: 'flex-start',
    minHeight: 28,
    justifyContent: 'center',
    paddingHorizontal: AppSpacing.xs,
  },
  grow: {
    flex: 1,
  },
  exigency: {
    width: 120,
  },
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
    paddingHorizontal: AppSpacing.xl,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: AppSpacing.md,
  },
  dateText: {
    flex: 1,
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
    borderRadius: AppRadii.md,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
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
    backgroundColor: AppColors.surface,
  },
  addText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.textPrimary,
  },
});

export default withSheetFrame(EvaluationFormScreen, AppColors.surface);
