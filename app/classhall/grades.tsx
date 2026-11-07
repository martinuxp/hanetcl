import { hallFormStyles as styles } from '@/components/classhall/hall-form';
import { ThemedText } from '@/components/themed-text';
import { KeyboardScroll } from '@/components/ui/keyboard';
import { withSheetFrame } from '@/components/ui/sheet-frame';
import { AppColors, AppRadii, AppSpacing } from '@/constants/design-tokens';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { describeAuthError } from '@/services/auth-service';
import { dropCached } from '@/services/cache';
import { getEvaluationGrades, saveEvaluationGrades } from '@/services/classhall-service';
import type { EvaluationGrades } from '@/services/classhall-service';
import { formatGrade, parseGrade, typeGrade } from '@/services/grades';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View, type TextInputInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '@/i18n';

// Notas: the teacher writes the evaluation's grades, one field per student
// by surname, as in the libro de clases. "62" becomes 6,2 and the cursor
// moves to the next student. They save as a draft until the evaluation's
// grades are published; after that, saving publishes what changed.

function GradesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { hallId, id } = useLocalSearchParams<{ hallId: string; id: string }>();

  const [data, setData] = useState<EvaluationGrades | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  // What each field shows, by student.
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [weight, setWeight] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputs = useRef<(TextInputInstance | null)[]>([]);

  useEffect(() => {
    if (!hallId || !id) return;
    let active = true;
    getEvaluationGrades(hallId, id)
      .then(result => {
        if (!active) return;
        setData(result);
        setTyped(Object.fromEntries(result.students.map(student => [student.uid, student.grade !== null ? formatGrade(student.grade) : ''])));
        setWeight(result.evaluation.weight !== null ? String(result.evaluation.weight) : '');
        setLoadError(null);
      })
      .catch(failure => { if (active) setLoadError(describeAuthError(failure, t('classhall.grades.noPudimosAbrirLasNotas'))); });
    return () => { active = false; };
  }, [hallId, id, attempt]);

  const students = data?.students ?? [];
  const published = !!data?.evaluation.published;
  const invalid = students.filter(student => (typed[student.uid] ?? '').trim() !== '' && parseGrade(typed[student.uid]) === null).map(student => student.uid);
  const changes = students
    .map(student => {
      const text = (typed[student.uid] ?? '').trim();
      const grade = text ? parseGrade(text) : null;
      return { uid: student.uid, grade, before: student.grade };
    })
    .filter(change => !invalid.includes(change.uid) && change.grade !== change.before)
    .map(({ uid, grade }) => ({ uid, grade }));
  const weightValue = weight.trim() ? Number(weight.replace(/\D/g, '')) : null;
  const weightInvalid = weightValue !== null && (!Number.isFinite(weightValue) || weightValue < 1 || weightValue > 100);
  const weightChanged = !!data && weightValue !== data.evaluation.weight;
  const filled = students.filter(student => parseGrade(typed[student.uid] ?? '') !== null).length;
  const ready = !!data && invalid.length === 0 && !weightInvalid && (changes.length > 0 || weightChanged);

  const save = async () => {
    if (!ready || saving || !hallId || !id) return;
    setSaving(true);
    setError(null);
    try {
      await saveEvaluationGrades(hallId, id, changes, weightChanged ? weightValue : undefined);
      dropCached(`hall:${hallId}`);
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      allowLeave();
      router.back();
    } catch (saveError) {
      setError(describeAuthError(saveError, t('classhall.grades.noPudimosGuardarLasNotas')));
      setSaving(false);
    }
  };

  const { allowLeave, dialog } = useUnsavedChangesGuard({
    dirty: (changes.length > 0 || weightChanged) && !saving,
    onSave: save,
    saveLabel: t('common.guardar'),
    canSave: ready,
    title: t('classhall.grades.descartarLasNotas'),
    message: t('classhall.grades.lasNotasQueEscribisteNo'),
  });

  const type = (uid: string, index: number, text: string) => {
    const next = typeGrade(text, typed[uid] ?? '');
    setTyped(current => ({ ...current, [uid]: next }));
    setError(null);
    // Two digits make a grade: on to the next student.
    if (/^\d,\d$/.test(next) && next !== typed[uid]) inputs.current[index + 1]?.focus();
  };

  return (
    <KeyboardScroll
      style={styles.sheet}
      contentContainerStyle={[styles.content, { paddingTop: (Platform.OS === 'android' ? 0 : insets.top) + AppSpacing.xxl, paddingBottom: insets.bottom + AppSpacing.xl }]}
      keyboardShouldPersistTaps="handled"
    >
      <ThemedText accessibilityRole="header" style={styles.title}>{t('classhall.evaluation.notas')}</ThemedText>
      {!!data && (
        <ThemedText style={styles.lead}>
          {published
            ? t('classhall.grades.titleYaEstanPublicadasLo', { title: data.evaluation.title })
            : t('classhall.grades.titleSeGuardanComoBorrador', { title: data.evaluation.title })}
        </ThemedText>
      )}

      {!data && !loadError && <ThemedText style={styles.lead}>{t('classhall.grades.cargandoEstudiantes')}</ThemedText>}
      {!!loadError && !data && (
        <>
          <ThemedText accessibilityLiveRegion="polite" style={styles.error}>{loadError}</ThemedText>
          <Pressable accessibilityRole="button" onPress={() => { setLoadError(null); setAttempt(count => count + 1); }} style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}>
            <ThemedText style={styles.cancelText}>{t('common.reintentar')}</ThemedText>
          </Pressable>
        </>
      )}

      {!!data && (
        <>
          <View style={local.weightRow}>
            <View style={local.weightText}>
              <ThemedText style={styles.label}>{t('classhall.grades.ponderacion')}</ThemedText>
              <ThemedText style={styles.hint}>{t('classhall.grades.opcionalSirveParaElPromedio')}</ThemedText>
            </View>
            <TextInput
              accessibilityLabel={t('classhall.grades.ponderacionEnPorcentaje')}
              value={weight}
              onChangeText={text => setWeight(text.replace(/\D/g, '').slice(0, 3))}
              placeholder={'%'}
              placeholderTextColor={AppColors.surfaceSoft}
              keyboardType="number-pad"
              editable={!saving}
              selectionColor={AppColors.accent}
              style={[local.weightInput, weightInvalid && local.inputInvalid]}
            />
          </View>
          {weightInvalid && <ThemedText style={styles.error}>{t('classhall.grades.laPonderacionVaDe1')}</ThemedText>}

          {students.length === 0 ? (
            <ThemedText style={styles.lead}>{t('classhall.grades.todaviaNoHayEstudiantesCon')}</ThemedText>
          ) : (
            <View style={local.list}>
              {students.map((student, index) => {
                const bad = invalid.includes(student.uid);
                return (
                  <View key={student.uid} style={[local.row, index > 0 && local.rowRule]}>
                    <View style={local.rowText}>
                      <ThemedText numberOfLines={1} style={local.name}>{student.name}</ThemedText>
                      {bad && <ThemedText style={local.rowError}>{t('classhall.grades.laNotaVaDe1')}</ThemedText>}
                    </View>
                    <TextInput
                      ref={element => { inputs.current[index] = element; }}
                      accessibilityLabel={t('classhall.grades.notaDeName', { name: student.name })}
                      value={typed[student.uid] ?? ''}
                      onChangeText={text => type(student.uid, index, text)}
                      placeholder={'—'}
                      placeholderTextColor={AppColors.surfaceSoft}
                      keyboardType="number-pad"
                      returnKeyType={index === students.length - 1 ? 'done' : 'next'}
                      onSubmitEditing={() => inputs.current[index + 1]?.focus()}
                      submitBehavior={index === students.length - 1 ? 'blurAndSubmit' : 'submit'}
                      editable={!saving}
                      selectionColor={AppColors.accent}
                      style={[local.gradeInput, bad && local.inputInvalid]}
                    />
                  </View>
                );
              })}
            </View>
          )}
          <ThemedText style={styles.hint}>
            {t('classhall.grades.escribe62YQueda6', { filled, studentsCount: students.length, value: data.withoutAccount ? t('classhall.grades.countEstudiantesDeLaNomina', { count: data.withoutAccount }) : '' })}
          </ThemedText>

          {!!error && <ThemedText accessibilityLiveRegion="assertive" style={styles.error}>{error}</ThemedText>}

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !ready || saving, busy: saving }}
            disabled={!ready || saving}
            onPress={save}
            style={({ pressed }) => [styles.submit, (!ready || saving) && styles.submitDisabled, pressed && styles.pressed]}
          >
            <ThemedText style={styles.submitText}>{saving ? t('common.guardando') : published ? t('classhall.grades.guardarYAvisar') : t('classhall.grades.guardarBorrador')}</ThemedText>
          </Pressable>
        </>
      )}
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}>
        <ThemedText style={styles.cancelText}>{t('common.cancelar')}</ThemedText>
      </Pressable>
      {dialog}
    </KeyboardScroll>
  );
}

const local = StyleSheet.create({
  weightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
  },
  weightText: {
    flex: 1,
    gap: AppSpacing.xs,
  },
  weightInput: {
    width: 84,
    height: 48,
    borderRadius: AppRadii.md,
    borderCurve: 'continuous',
    backgroundColor: AppColors.canvas,
    color: AppColors.textPrimary,
    fontFamily: 'DMSans_700Bold',
    fontSize: 17,
    textAlign: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  list: {
    paddingLeft: AppSpacing.lg,
    paddingRight: AppSpacing.md,
    borderRadius: AppRadii.lg,
    borderCurve: 'continuous',
    backgroundColor: AppColors.canvas,
  },
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
    paddingVertical: AppSpacing.xs,
  },
  rowRule: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: AppColors.surfaceMuted,
  },
  rowText: {
    flex: 1,
  },
  name: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 15,
    lineHeight: 20,
    color: AppColors.textPrimary,
  },
  rowError: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.errorText,
  },
  gradeInput: {
    width: 68,
    height: 44,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.surface,
    color: AppColors.textPrimary,
    fontFamily: 'DMSans_700Bold',
    fontSize: 17,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
    borderWidth: 2,
    borderColor: 'transparent',
  },
  inputInvalid: {
    borderColor: AppColors.accent,
  },
});

export default withSheetFrame(GradesScreen, AppColors.surface);
