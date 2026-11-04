import { ThemedText } from '@/components/themed-text';
import { HanetButton } from '@/components/ui/hanet-button';
import { HanetChip } from '@/components/ui/hanet-chip';
import { HanetDialog, HanetDialogActions, dialogStyles } from '@/components/ui/hanet-dialog';
import { KeyboardScroll } from '@/components/ui/keyboard';
import { FrostedScreen, withTopInset } from '@/components/ui/frosted-screen';
import { AppColors, AppPressed, AppRadii, AppSpacing, AppType } from '@/constants/design-tokens';
import { averageOf, formatGrade, formatNumber, loadCalculator, neededGrade, parseGrade, saveCalculator, typeGrade } from '@/services/grades';
import type { CalculatorState, GradeEntry, NeedResult } from '@/services/grades';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '@/i18n';

// Calculadora de notas: the average of one's grades (plain or weighted) and
// the grade still needed to finish with a goal. HaNet stores no grades: what
// is typed here stays on this phone.

const MAX_ENTRIES = 20;
const MAX_REMAINING = 10;

let nextId = 0;
function newEntry(): GradeEntry {
  nextId += 1;
  return { id: `n${Date.now().toString(36)}${nextId}`, grade: '', weight: '' };
}

function freshState(): CalculatorState {
  return { entries: [newEntry(), newEntry(), newEntry(), newEntry()], goal: '4,0', remaining: 1, weighted: false };
}

function needText(need: NeedResult, goal: string, state: CalculatorState, left: number) {
  switch (need.kind) {
    case 'needed':
      return state.weighted
        ? t('tools.grades.necesitasUnGradeEnEl', { grade: formatGrade(need.grade), left: formatNumber(left) })
        : state.remaining === 1
          ? t('tools.grades.necesitasUnGradeEnLa', { grade: formatGrade(need.grade) })
          : t('tools.grades.necesitasUnGradeEnCada', { grade: formatGrade(need.grade), count: state.remaining });
    case 'reached':
      return t('tools.grades.yaLlegasAlGoal', { goal });
    case 'impossible':
      return t('tools.grades.aunqueSaques70Llegas', { best: formatGrade(need.best) });
    default:
      return '';
  }
}

export default function GradesScreen() {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<CalculatorState>(freshState);
  const [clearOpen, setClearOpen] = useState(false);
  const touched = useRef(false);

  useEffect(() => {
    let alive = true;
    void loadCalculator().then(saved => {
      if (!alive || !saved?.entries?.length || touched.current) return;
      setState({ ...freshState(), ...saved, weighted: !!saved.weighted });
    });
    return () => { alive = false; };
  }, []);

  const change = (patch: Partial<CalculatorState>) => {
    touched.current = true;
    setState(current => {
      const next = { ...current, ...patch };
      saveCalculator(next);
      return next;
    });
  };

  const updateEntry = (id: string, patch: Partial<GradeEntry>) => {
    change({ entries: state.entries.map(entry => (entry.id === id ? { ...entry, ...patch } : entry)) });
  };
  const removeEntry = (id: string) => {
    const rest = state.entries.filter(entry => entry.id !== id);
    change({ entries: rest.length ? rest : [newEntry()] });
  };
  const addEntry = () => {
    if (state.entries.length < MAX_ENTRIES) change({ entries: [...state.entries, newEntry()] });
  };

  const average = averageOf(state.entries, state.weighted);
  const invalid = new Set(average.invalid);
  const overWeight = state.weighted && average.usedWeight > 100 + 1e-9;
  const left = Math.max(0, 100 - average.usedWeight);

  const goal = parseGrade(state.goal);
  const need = goal !== null && !overWeight ? neededGrade(state.entries, goal, state.remaining, state.weighted) : null;
  const finished = state.weighted ? left <= 0 : state.remaining <= 0;
  const goalText = goal !== null ? formatGrade(goal) : state.goal;

  let message = need ? needText(need, goalText, state, left) : '';
  if (need && finished) {
    message = need.kind === 'reached'
      ? t('tools.grades.tuPromedioLlegaAGoal', { goal: goalText })
      : need.kind === 'impossible' ? t('tools.grades.tuPromedioQuedaBajoGoal', { goal: goalText }) : '';
  }
  const tone = need?.kind === 'impossible' ? 'low' : need?.kind === 'reached' ? 'done' : 'plain';

  return (
    <FrostedScreen style={styles.screen}>
      <KeyboardScroll contentContainerStyle={withTopInset(styles.page, insets.top)} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <ThemedText style={styles.eyebrow}>{t('common.herramientas')}</ThemedText>
          <ThemedText accessibilityRole="header" style={styles.title}>{t('tools.grades.calculadoraDeNotas')}</ThemedText>
          <ThemedText style={styles.intro}>{t('tools.grades.tuPromedioYLaNota')}</ThemedText>
        </View>

        <View style={styles.modes}>
          <HanetChip label={t('tools.grades.mismoPeso')} selected={!state.weighted} onPress={() => change({ weighted: false })} />
          <HanetChip label={t('tools.grades.conPorcentajes')} selected={state.weighted} onPress={() => change({ weighted: true })} />
        </View>

        <View style={styles.card}>
          {state.entries.map((entry, index) => {
            const wrong = invalid.has(entry.id);
            const gradeWrong = wrong && parseGrade(entry.grade) === null;
            return (
              <View key={entry.id} style={styles.entry}>
                <ThemedText style={styles.entryIndex}>{index + 1}</ThemedText>
                <TextInput
                  accessibilityLabel={t('tools.grades.notaN', { n: index + 1 })}
                  value={entry.grade}
                  onChangeText={text => updateEntry(entry.id, { grade: typeGrade(text, entry.grade) })}
                  placeholder={t('tools.grades.nota')}
                  placeholderTextColor={AppColors.surfaceMuted}
                  keyboardType="number-pad"
                  maxLength={3}
                  selectionColor={AppColors.accent}
                  style={[styles.input, styles.gradeInput, gradeWrong && styles.inputError]}
                />
                {state.weighted && (
                  <View style={styles.weightBox}>
                    <TextInput
                      accessibilityLabel={t('tools.grades.porcentajeDeLaNotaN', { n: index + 1 })}
                      value={entry.weight}
                      onChangeText={weight => updateEntry(entry.id, { weight })}
                      placeholder={t('tools.grades.peso')}
                      placeholderTextColor={AppColors.surfaceMuted}
                      keyboardType="decimal-pad"
                      maxLength={5}
                      selectionColor={AppColors.accent}
                      style={[styles.input, styles.weightInput, wrong && !gradeWrong && styles.inputError]}
                    />
                    <ThemedText style={styles.weightSign}>%</ThemedText>
                  </View>
                )}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('tools.grades.quitarLaNotaN', { n: index + 1 })}
                  hitSlop={6}
                  onPress={() => removeEntry(entry.id)}
                  style={({ pressed }) => [styles.remove, pressed && AppPressed]}
                >
                  <Ionicons name="close" size={18} color={AppColors.textSecondary} />
                </Pressable>
              </View>
            );
          })}
          {invalid.size > 0 && (
            <ThemedText style={styles.error}>
              {state.weighted ? t('tools.grades.revisaLasMarcadasCadaNota') : t('tools.grades.revisaLasMarcadasLasNotas')}
            </ThemedText>
          )}
          {overWeight && <ThemedText style={styles.error}>{t('tools.grades.losPorcentajesSumanMasDe')}</ThemedText>}
          {state.entries.length < MAX_ENTRIES && (
            <HanetButton label={t('tools.grades.agregarNota')} variant="surface" icon={<Ionicons name="add" size={18} color={AppColors.textPrimary} />} onPress={addEntry} />
          )}
        </View>

        <View style={styles.average} accessible accessibilityLiveRegion="polite" accessibilityLabel={average.rounded === null ? t('tools.grades.sinNotasTodavia') : t('tools.grades.promedioValue', { value: formatGrade(average.rounded) })}>
          <View style={styles.averageBody}>
            <ThemedText style={styles.averageLabel}>{t('tools.grades.promedio')}</ThemedText>
            <ThemedText style={styles.averageMeta}>
              {average.raw === null
                ? t('tools.grades.escribeTusNotasArriba')
                : state.weighted
                  ? t('tools.grades.conElWeightDeLa', { weight: formatNumber(average.usedWeight) })
                  : t('tools.grades.countNotasSinRedondearRaw', { count: average.count, raw: (Math.floor(average.raw * 100) / 100).toFixed(2).replace('.', ',') })}
            </ThemedText>
          </View>
          <ThemedText style={styles.averageValue}>{average.rounded === null ? '–' : formatGrade(average.rounded)}</ThemedText>
        </View>

        <View style={styles.card}>
          <ThemedText accessibilityRole="header" style={styles.sectionTitle}>{t('tools.grades.cuantoNecesito')}</ThemedText>
          <View style={styles.row}>
            <ThemedText style={styles.rowLabel}>{t('tools.grades.quieroTerminarCon')}</ThemedText>
            <TextInput
              accessibilityLabel={t('tools.grades.notaQueQuieresTener')}
              value={state.goal}
              onChangeText={text => change({ goal: typeGrade(text, state.goal) })}
              keyboardType="number-pad"
              maxLength={3}
              selectionColor={AppColors.accent}
              style={[styles.input, styles.goalInput, goal === null && styles.inputError]}
            />
          </View>
          {state.weighted ? (
            <View style={styles.row}>
              <ThemedText style={styles.rowLabel}>{t('tools.grades.faltaPorEvaluar')}</ThemedText>
              <ThemedText style={styles.rowValue}>{formatNumber(left)} %</ThemedText>
            </View>
          ) : (
            <View style={styles.row}>
              <ThemedText style={styles.rowLabel}>{t('tools.grades.notasQueFaltan')}</ThemedText>
              <View style={styles.stepper}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('tools.grades.unaNotaMenos')}
                  disabled={state.remaining <= 0}
                  onPress={() => change({ remaining: state.remaining - 1 })}
                  style={({ pressed }) => [styles.stepButton, pressed && AppPressed, state.remaining <= 0 && styles.disabled]}
                >
                  <Ionicons name="remove" size={18} color={AppColors.textPrimary} />
                </Pressable>
                <ThemedText style={styles.stepValue}>{state.remaining}</ThemedText>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('tools.grades.unaNotaMas')}
                  disabled={state.remaining >= MAX_REMAINING}
                  onPress={() => change({ remaining: state.remaining + 1 })}
                  style={({ pressed }) => [styles.stepButton, pressed && AppPressed, state.remaining >= MAX_REMAINING && styles.disabled]}
                >
                  <Ionicons name="add" size={18} color={AppColors.textPrimary} />
                </Pressable>
              </View>
            </View>
          )}
          {goal === null && <ThemedText style={styles.error}>{t('tools.grades.escribeUnaNotaEntre10')}</ThemedText>}
          {!!message && (
            <View style={[styles.verdict, tone === 'low' && styles.verdictLow, tone === 'done' && styles.verdictDone]}>
              <Ionicons
                name={tone === 'low' ? 'alert-circle-outline' : tone === 'done' ? 'checkmark-circle-outline' : 'flag-outline'}
                size={20}
                color={tone === 'done' ? AppColors.textOnLight : AppColors.textPrimary}
              />
              <ThemedText accessibilityLiveRegion="polite" style={[styles.verdictText, tone === 'done' && styles.verdictTextDone]}>{message}</ThemedText>
            </View>
          )}
        </View>

        <ThemedText style={styles.note}>{t('tools.grades.tusNotasQuedanSoloEn')}</ThemedText>
        <HanetButton label={t('tools.grades.borrarTodo')} variant="surface" onPress={() => setClearOpen(true)} />
      </KeyboardScroll>

      <HanetDialog visible={clearOpen} onRequestClose={() => setClearOpen(false)} dismissOnBackdrop title={t('tools.grades.borrarLasNotas')} body={t('tools.grades.seBorranLasNotasDe')}>
        <HanetDialogActions>
          <HanetButton label={t('common.cancelar')} variant="surface" onPress={() => setClearOpen(false)} style={dialogStyles.action} />
          <HanetButton label={t('common.borrar')} onPress={() => { change(freshState()); setClearOpen(false); }} style={dialogStyles.action} />
        </HanetDialogActions>
      </HanetDialog>
    </FrostedScreen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: AppColors.canvas },
  page: { width: '100%', maxWidth: 430, alignSelf: 'center', paddingHorizontal: AppSpacing.lg, paddingBottom: 150, gap: AppSpacing.lg },
  header: { paddingTop: AppSpacing.lg, gap: AppSpacing.xs },
  eyebrow: { ...AppType.caption, color: AppColors.textSecondary },
  title: { ...AppType.title1, color: AppColors.textPrimary },
  intro: { ...AppType.footnote, color: AppColors.textSecondary, marginTop: AppSpacing.xs },
  modes: { flexDirection: 'row', gap: AppSpacing.sm },
  card: { padding: 18, borderRadius: AppRadii.lg, backgroundColor: AppColors.surface, gap: AppSpacing.md },
  entry: { flexDirection: 'row', alignItems: 'center', gap: AppSpacing.sm },
  entryIndex: { ...AppType.caption, width: 18, textAlign: 'center', color: AppColors.textSecondary },
  input: {
    minHeight: 48,
    paddingHorizontal: AppSpacing.lg,
    borderRadius: AppRadii.md,
    borderCurve: 'continuous',
    backgroundColor: AppColors.canvas,
    borderWidth: 1,
    borderColor: 'transparent',
    fontFamily: 'DMSans_700Bold',
    fontSize: 16,
    letterSpacing: -0.4,
    color: AppColors.textPrimary,
    outlineStyle: 'none' as never,
  },
  inputError: { borderColor: AppColors.errorText },
  gradeInput: { flex: 1, minWidth: 0 },
  weightBox: { width: 96, justifyContent: 'center' },
  weightInput: { width: '100%', paddingLeft: 14, paddingRight: 30 },
  weightSign: { ...AppType.callout, position: 'absolute', right: 14, color: AppColors.textSecondary },
  remove: { width: 36, height: 36, borderRadius: AppRadii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: AppColors.canvas },
  error: { ...AppType.caption, color: AppColors.errorText },
  average: { flexDirection: 'row', alignItems: 'center', gap: AppSpacing.md, padding: 18, borderRadius: AppRadii.lg, backgroundColor: AppColors.accent },
  averageBody: { flex: 1, gap: 2 },
  averageLabel: { ...AppType.title3, color: AppColors.textPrimary },
  averageMeta: { ...AppType.caption, color: AppColors.textPrimary },
  averageValue: { fontFamily: 'DMSans_700Bold', fontSize: 44, lineHeight: 50, letterSpacing: -1.8, color: AppColors.textPrimary },
  sectionTitle: { ...AppType.title3, color: AppColors.textPrimary },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: AppSpacing.md, minHeight: 48 },
  rowLabel: { ...AppType.callout, flex: 1, color: AppColors.textSecondary },
  rowValue: { ...AppType.headline, color: AppColors.textPrimary },
  goalInput: { width: 84, textAlign: 'center', paddingHorizontal: AppSpacing.sm },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: AppSpacing.md },
  stepButton: { width: 40, height: 40, borderRadius: AppRadii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: AppColors.canvas },
  stepValue: { ...AppType.title3, minWidth: 22, textAlign: 'center', color: AppColors.textPrimary },
  disabled: { opacity: 0.4 },
  verdict: { flexDirection: 'row', alignItems: 'center', gap: AppSpacing.md, padding: 14, borderRadius: AppRadii.md, backgroundColor: AppColors.surfaceRaised },
  verdictLow: { backgroundColor: AppColors.surfaceMuted },
  verdictDone: { backgroundColor: AppColors.controlActive },
  verdictText: { ...AppType.callout, flex: 1, color: AppColors.textPrimary },
  verdictTextDone: { color: AppColors.textOnLight },
  note: { ...AppType.caption, fontFamily: 'DMSans_400Regular', color: AppColors.textSecondary, textAlign: 'center' },
});
