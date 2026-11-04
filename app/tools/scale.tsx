import { ThemedText } from '@/components/themed-text';
import { HanetButton } from '@/components/ui/hanet-button';
import { HanetChip } from '@/components/ui/hanet-chip';
import { HanetDialog, HanetDialogActions, dialogStyles } from '@/components/ui/hanet-dialog';
import { KeyboardScroll } from '@/components/ui/keyboard';
import { FrostedScreen, withTopInset } from '@/components/ui/frosted-screen';
import { AppColors, AppRadii, AppSpacing, AppType } from '@/constants/design-tokens';
import { DEFAULT_SCALE, formatGrade, formatNumber, gradeFor, loadScale, parseNumber, pointsToPass, saveScale, scaleRows } from '@/services/grades';
import type { ScaleSettings } from '@/services/grades';
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '@/i18n';

// Escala de notas: turns the points of a test into grades from 1,0 to 7,0.
// Everything is computed here and the last scale is remembered on the phone.

const EXIGENCIES = [0.5, 0.6, 0.7];
const MIN_GRADES = [1, 2];
const MAX_POINTS = 300;

/** A chip on the settings card, set apart from the card when not chosen. */
function Choice(props: React.ComponentProps<typeof HanetChip>) {
  return <HanetChip {...props} style={!props.selected && styles.chipIdle} />;
}

function percent(value: number) {
  return `${formatNumber(Math.round(value * 1000) / 10)} %`;
}

export default function ScaleScreen() {
  const insets = useSafeAreaInsets();
  const [settings, setSettings] = useState<ScaleSettings>(DEFAULT_SCALE);
  const [maxText, setMaxText] = useState(String(DEFAULT_SCALE.maxPoints));
  const [scoreText, setScoreText] = useState('');
  const [customOpen, setCustomOpen] = useState(false);
  const [customText, setCustomText] = useState('');

  useEffect(() => {
    let alive = true;
    void loadScale().then(saved => {
      if (!alive || !saved) return;
      setSettings(saved);
      setMaxText(formatNumber(saved.maxPoints));
    });
    return () => { alive = false; };
  }, []);

  const update = (patch: Partial<ScaleSettings>) => {
    setSettings(current => {
      const next = { ...current, ...patch };
      saveScale(next);
      return next;
    });
  };

  const typedMax = parseNumber(maxText);
  const maxError = typedMax === null || typedMax <= 0
    ? t('tools.scale.escribeElPuntajeMaximo')
    : typedMax > MAX_POINTS ? t('tools.scale.hastaMaxPuntos', { max: MAX_POINTS }) : '';

  const changeMax = (text: string) => {
    setMaxText(text);
    const value = parseNumber(text);
    if (value !== null && value > 0 && value <= MAX_POINTS) update({ maxPoints: value });
  };

  // Read down each column, like a printed scale.
  const columns = useMemo(() => {
    const rows = scaleRows(settings);
    const size = Math.ceil(rows.length / 3);
    return [rows.slice(0, size), rows.slice(size, size * 2), rows.slice(size * 2)];
  }, [settings]);
  const toPass = pointsToPass(settings);
  const custom = !EXIGENCIES.some(value => Math.abs(value - settings.exigency) < 1e-9);

  const score = parseNumber(scoreText);
  const scoreError = scoreText.trim() !== '' && (score === null || score > settings.maxPoints);
  const scoreGrade = score !== null && !scoreError ? gradeFor(score, settings) : null;
  const scoreLow = scoreGrade !== null && scoreGrade < settings.passGrade;

  const customValue = parseNumber(customText);
  const customValid = customValue !== null && customValue >= 1 && customValue <= 99;
  const saveCustom = () => {
    if (!customValid || customValue === null) return;
    update({ exigency: customValue / 100 });
    setCustomOpen(false);
  };

  return (
    <FrostedScreen style={styles.screen}>
      <KeyboardScroll contentContainerStyle={withTopInset(styles.page, insets.top)} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <ThemedText style={styles.eyebrow}>{t('common.herramientas')}</ThemedText>
          <ThemedText accessibilityRole="header" style={styles.title}>{t('tools.scale.escalaDeNotas')}</ThemedText>
          <ThemedText style={styles.intro}>{t('tools.scale.convierteLosPuntosDeUna')}</ThemedText>
        </View>

        <View style={styles.card}>
          <View style={styles.field}>
            <ThemedText style={styles.label}>{t('tools.scale.puntajeMaximo')}</ThemedText>
            <TextInput
              accessibilityLabel={t('tools.scale.puntajeMaximo')}
              value={maxText}
              onChangeText={changeMax}
              keyboardType="decimal-pad"
              maxLength={6}
              selectionColor={AppColors.accent}
              style={[styles.input, !!maxError && styles.inputError]}
            />
            {!!maxError && <ThemedText style={styles.error}>{maxError}</ThemedText>}
          </View>

          <View style={styles.field}>
            <ThemedText style={styles.label}>{t('tools.scale.exigencia')}</ThemedText>
            <View style={styles.chips}>
              {EXIGENCIES.map(value => (
                <Choice key={value} label={percent(value)} selected={!custom && Math.abs(value - settings.exigency) < 1e-9} onPress={() => update({ exigency: value })} />
              ))}
              <Choice
                label={custom ? percent(settings.exigency) : t('tools.scale.otra')}
                selected={custom}
                onPress={() => { setCustomText(formatNumber(Math.round(settings.exigency * 1000) / 10)); setCustomOpen(true); }}
              />
            </View>
            <ThemedText style={styles.hint}>{t('tools.scale.laParteDelPuntajeQue')}</ThemedText>
          </View>

          <View style={styles.field}>
            <ThemedText style={styles.label}>{t('tools.scale.notaMinima')}</ThemedText>
            <View style={styles.chips}>
              {MIN_GRADES.map(value => (
                <Choice key={value} label={formatGrade(value)} selected={settings.minGrade === value} onPress={() => update({ minGrade: value })} />
              ))}
            </View>
          </View>

          <View style={styles.field}>
            <ThemedText style={styles.label}>{t('tools.scale.filasDeLaTabla')}</ThemedText>
            <View style={styles.chips}>
              <Choice label={t('tools.scale.cada1Punto')} selected={settings.step === 1} onPress={() => update({ step: 1 })} />
              <Choice label={t('tools.scale.cadaMedioPunto')} selected={settings.step === 0.5} onPress={() => update({ step: 0.5 })} />
            </View>
          </View>
        </View>

        <View style={styles.summary}>
          <View style={styles.summaryItem}>
            <ThemedText style={styles.summaryValue}>{formatNumber(toPass)}</ThemedText>
            <ThemedText style={styles.summaryLabel}>{t('tools.scale.puntosParaEl4', { grade: formatGrade(settings.passGrade) })}</ThemedText>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <ThemedText style={styles.summaryValue}>{percent(settings.exigency)}</ThemedText>
            <ThemedText style={styles.summaryLabel}>{t('tools.scale.deExigenciaSobrePoints', { points: formatNumber(settings.maxPoints) })}</ThemedText>
          </View>
        </View>

        <View style={styles.card}>
          <ThemedText accessibilityRole="header" style={styles.sectionTitle}>{t('tools.scale.calcularUnaNota')}</ThemedText>
          <View style={styles.converter}>
            <TextInput
              accessibilityLabel={t('tools.scale.puntajeObtenido')}
              value={scoreText}
              onChangeText={setScoreText}
              placeholder={t('tools.scale.puntaje')}
              placeholderTextColor={AppColors.surfaceMuted}
              keyboardType="decimal-pad"
              maxLength={6}
              selectionColor={AppColors.accent}
              style={[styles.input, styles.converterInput, scoreError && styles.inputError]}
            />
            <View style={[styles.gradeBadge, scoreLow && styles.gradeBadgeLow]}>
              <ThemedText accessibilityLiveRegion="polite" style={[styles.gradeBadgeText, scoreLow && styles.gradeBadgeTextLow]}>{scoreGrade === null ? '–' : formatGrade(scoreGrade)}</ThemedText>
            </View>
          </View>
          {scoreError && <ThemedText style={styles.error}>{t('tools.scale.escribeUnPuntajeEntre0', { max: formatNumber(settings.maxPoints) })}</ThemedText>}
        </View>

        <View style={styles.tableHead}>
          <ThemedText accessibilityRole="header" style={styles.sectionTitle}>{t('tools.scale.tabla')}</ThemedText>
          <ThemedText style={styles.hint}>{t('tools.scale.puntosYNota')}</ThemedText>
        </View>
        <View style={styles.table}>
          {columns.map((column, index) => (
            <View key={index} style={[styles.column, index > 0 && styles.columnDivider]}>
              {column.map(row => {
                const low = row.grade < settings.passGrade;
                return (
                  <View
                    key={row.points}
                    accessible
                    accessibilityLabel={t('tools.scale.pointsPuntosGrade', { points: formatNumber(row.points), grade: formatGrade(row.grade) })}
                    style={styles.cell}
                  >
                    <ThemedText style={styles.cellPoints}>{formatNumber(row.points)}</ThemedText>
                    <ThemedText style={[styles.cellGrade, low && styles.cellGradeLow]}>{formatGrade(row.grade)}</ThemedText>
                  </View>
                );
              })}
            </View>
          ))}
        </View>
        <ThemedText style={styles.note}>{t('tools.scale.lasNotasSeRedondeanA')}</ThemedText>
      </KeyboardScroll>

      <HanetDialog visible={customOpen} onRequestClose={() => setCustomOpen(false)} dismissOnBackdrop title={t('tools.scale.otraExigencia')} body={t('tools.scale.escribeElPorcentajeDelPuntaje')}>
        <TextInput
          accessibilityLabel={t('tools.scale.exigenciaEnPorcentaje')}
          value={customText}
          onChangeText={setCustomText}
          keyboardType="decimal-pad"
          maxLength={4}
          autoFocus
          selectionColor={AppColors.accent}
          onSubmitEditing={saveCustom}
          style={[styles.input, styles.dialogInput]}
        />
        <HanetDialogActions>
          <HanetButton label={t('common.cancelar')} variant="surface" onPress={() => setCustomOpen(false)} style={dialogStyles.action} />
          <HanetButton label={t('common.listo')} onPress={saveCustom} disabled={!customValid} style={dialogStyles.action} />
        </HanetDialogActions>
      </HanetDialog>
    </FrostedScreen>
  );
}

const styles = StyleSheet.create({
  chipIdle: { backgroundColor: AppColors.canvas },
  screen: { flex: 1, backgroundColor: AppColors.canvas },
  page: { width: '100%', maxWidth: 430, alignSelf: 'center', paddingHorizontal: AppSpacing.lg, paddingBottom: 150, gap: AppSpacing.lg },
  header: { paddingTop: AppSpacing.lg, gap: AppSpacing.xs },
  eyebrow: { ...AppType.caption, color: AppColors.textSecondary },
  title: { ...AppType.title1, color: AppColors.textPrimary },
  intro: { ...AppType.footnote, color: AppColors.textSecondary, marginTop: AppSpacing.xs },
  card: { padding: 18, borderRadius: AppRadii.lg, backgroundColor: AppColors.surface, gap: AppSpacing.lg },
  field: { gap: AppSpacing.sm },
  label: { ...AppType.headline, color: AppColors.textPrimary },
  hint: { ...AppType.caption, fontFamily: 'DMSans_400Regular', color: AppColors.textSecondary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: AppSpacing.sm },
  input: {
    minHeight: 52,
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
  error: { ...AppType.caption, color: AppColors.errorText },
  summary: { flexDirection: 'row', alignItems: 'center', padding: 18, borderRadius: AppRadii.lg, backgroundColor: AppColors.accent },
  summaryItem: { flex: 1, gap: 2 },
  summaryDivider: { width: 1, alignSelf: 'stretch', marginHorizontal: AppSpacing.lg, backgroundColor: 'rgba(255,255,255,0.35)' },
  summaryValue: { ...AppType.title1, color: AppColors.textPrimary },
  summaryLabel: { ...AppType.caption, color: AppColors.textPrimary },
  sectionTitle: { ...AppType.title3, color: AppColors.textPrimary },
  converter: { flexDirection: 'row', alignItems: 'center', gap: AppSpacing.md },
  converterInput: { flex: 1 },
  gradeBadge: { minWidth: 84, height: 52, paddingHorizontal: AppSpacing.lg, borderRadius: AppRadii.pill, backgroundColor: AppColors.controlActive, alignItems: 'center', justifyContent: 'center' },
  gradeBadgeLow: { backgroundColor: AppColors.accent },
  gradeBadgeText: { ...AppType.title2, color: AppColors.textOnLight },
  gradeBadgeTextLow: { color: AppColors.textPrimary },
  tableHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: -AppSpacing.sm },
  table: { flexDirection: 'row', borderRadius: AppRadii.lg, backgroundColor: AppColors.surface, paddingVertical: AppSpacing.sm, paddingHorizontal: AppSpacing.xs },
  column: { flex: 1, paddingHorizontal: AppSpacing.xs },
  columnDivider: { borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.08)' },
  cell: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 7, paddingHorizontal: 10 },
  cellPoints: { ...AppType.callout, fontFamily: 'DMSans_400Regular', color: AppColors.textSecondary },
  cellGrade: { ...AppType.headline, color: AppColors.textPrimary },
  cellGradeLow: { color: AppColors.errorText },
  note: { ...AppType.caption, fontFamily: 'DMSans_400Regular', color: AppColors.textSecondary, textAlign: 'center' },
  dialogInput: { marginTop: AppSpacing.md, marginBottom: AppSpacing.lg, textAlign: 'center' },
});
