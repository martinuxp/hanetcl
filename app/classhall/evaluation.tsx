import { TAB_BAR_CLEARANCE } from '@/components/AppTabBar';
import { HALL_ICONS, HallPill, HallTile, TopBarButton, hallLongDate, hallShortDate, hallStyles } from '@/components/classhall/hall-ui';
import { ThemedText } from '@/components/themed-text';
import { HanetButton } from '@/components/ui/hanet-button';
import { HanetDialog, HanetDialogActions, dialogStyles } from '@/components/ui/hanet-dialog';
import { AppColors, AppRadii, AppSpacing } from '@/constants/design-tokens';
import { describeAuthError, useSession } from '@/services/auth-service';
import { DocumentError, deleteHallEvaluation, evaluationTotal, getHall, getLoadedHall, openHallDocument, pickHallDocument, skillAbbreviation, uploadHallDocument } from '@/services/classhall-service';
import type { HallDetail } from '@/services/classhall-service';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/** For tables with many skills: each value under its column name, scrolling sideways. */
function PointCells({ labels, values }: { labels: string[]; values: number[] }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cells}>
      {values.map((value, index) => (
        <View key={index} style={[styles.cell, index === values.length - 1 && styles.cellTotal]}>
          <ThemedText numberOfLines={1} style={styles.cellLabel}>{labels[index]}</ThemedText>
          <ThemedText style={[styles.cellValue, index === values.length - 1 && styles.pointTotal]}>{value}</ThemedText>
        </View>
      ))}
    </ScrollView>
  );
}

/** Numbers split by thin rules: one per skill, then the total. */
function Points({ values, header }: { values: (string | number)[]; header?: boolean }) {
  return (
    <View style={styles.points}>
      {values.map((value, index) => (
        <React.Fragment key={index}>
          {index > 0 && <View style={styles.rule} />}
          <ThemedText style={[styles.point, header && styles.pointHeader, index === values.length - 1 && styles.pointTotal]}>{value}</ThemedText>
        </React.Fragment>
      ))}
    </View>
  );
}

export default function HallEvaluationScreen() {
  const router = useRouter();
  const { hallId, id } = useLocalSearchParams<{ hallId: string; id: string }>();
  const { user, initializing } = useSession();

  const [detail, setDetail] = useState<HallDetail | null>(() => (hallId ? getLoadedHall(hallId) : null));
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!initializing && !user) router.replace('/onboarding');
  }, [initializing, router, user]);

  useFocusEffect(useCallback(() => {
    if (!user || !hallId) return;
    let active = true;
    getHall(hallId)
      .then(result => { if (active) { setDetail(result); setError(null); } })
      .catch(loadError => {
        if (active) setError(describeAuthError(loadError, 'No pudimos abrir esta evaluación. Inténtalo nuevamente.'));
      });
    return () => { active = false; };
  }, [user, hallId]));

  const hall = detail?.hall;
  const evaluation = detail?.evaluations.find(item => item.id === id);
  const missing = !!detail && !evaluation;

  // The scanned specification table (T.E.) is a Hall document tied to this evaluation.
  const teDocument = detail?.documents?.find(item => item.evaluationId === id);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const uploadTe = async () => {
    if (!hallId || !id || uploading) return;
    setUploadError(null);
    try {
      const picked = await pickHallDocument();
      if (!picked) return;
      setUploading(true);
      const added = await uploadHallDocument(hallId, picked, { evaluationId: id });
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDetail(current => current && {
        ...current,
        documents: [added, ...(current.documents ?? []).filter(item => item.evaluationId !== id)],
      });
    } catch (error) {
      setUploadError(error instanceof DocumentError ? error.message : describeAuthError(error, 'No pudimos subir la T.E. Inténtalo nuevamente.'));
    } finally {
      setUploading(false);
    }
  };

  const remove = async () => {
    if (!hallId || !id || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteHallEvaluation(hallId, id);
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setConfirming(false);
      router.back();
    } catch (removeError) {
      setDeleteError(describeAuthError(removeError, 'No pudimos eliminar la evaluación. Inténtalo nuevamente.'));
      setDeleting(false);
    }
  };

  // Up to three skills fit beside each content, as in Figma; more go below it.
  const skills = evaluation?.skills ?? [];
  const inline = skills.length <= 3;
  const labels = [...skills.map(skillAbbreviation), 'TOTAL.'];
  const sums = skills.map((_, column) => (evaluation?.contents ?? []).reduce((sum, row) => sum + (row.points[column] ?? 0), 0));
  const total = evaluation ? evaluationTotal(evaluation) : 0;
  const rowTotal = (points: number[]) => points.reduce((sum, value) => sum + value, 0);
  const describe = (points: number[]) => skills.map((skill, column) => `${skill} ${points[column] ?? 0}`).join(', ');
  const legend = skills.filter(skill => skillAbbreviation(skill) !== skill.toLocaleUpperCase('es'));

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={hallStyles.topBar}>
          <TopBarButton icon={HALL_ICONS.back} label="Volver" onPress={() => (router.canGoBack() ? router.back() : router.replace('/classhall'))} />
          <ThemedText numberOfLines={1} style={styles.topTitle}>Contenidos a evaluar</ThemedText>
        </View>

        {!detail && !error && <ActivityIndicator style={styles.loader} size="large" color={AppColors.textSecondary} />}
        {!!error && !detail && <ThemedText accessibilityLiveRegion="polite" style={styles.notice}>{error}</ThemedText>}
        {missing && <ThemedText style={styles.notice}>Esta evaluación ya no está en el Hall.</ThemedText>}

        {hall && evaluation && (
          <>
            <View style={styles.heading}>
              <ThemedText accessibilityRole="header" style={styles.subject}>{hall.subject}</ThemedText>
              <ThemedText style={styles.subjectLight}>Tabla de especificaciones</ThemedText>
              <ThemedText style={styles.evaluationTitle}>{evaluation.title}</ThemedText>
            </View>

            <View>
              <View style={styles.table}>
                <View style={styles.tableHead}>
                  <ThemedText style={styles.tableTitle}>Contenidos</ThemedText>
                  {total > 0 && <ThemedText style={styles.tableTotal}>Total {total}pts.</ThemedText>}
                </View>

                {evaluation.contents.length === 0 ? (
                  <ThemedText style={styles.empty}>Tu docente todavía no detalla los contenidos de esta evaluación.</ThemedText>
                ) : (
                  <>
                    {inline && (
                      <View style={styles.headerRow} accessibilityLabel={`Columnas: ${skills.join(', ')} y total`}>
                        <Points header values={labels} />
                      </View>
                    )}
                    {evaluation.contents.map((row, index) => (
                      <View
                        key={index}
                        style={[styles.row, !inline && styles.rowStacked]}
                        accessible
                        accessibilityLabel={`${row.name}. ${row.detail ? `${row.detail}. ` : ''}${describe(row.points)}. Total ${rowTotal(row.points)} puntos.`}
                      >
                        <View style={styles.rowText}>
                          <ThemedText style={styles.rowName}>{row.name}</ThemedText>
                          {!!row.detail && <ThemedText numberOfLines={2} style={styles.rowDetail}>{row.detail}</ThemedText>}
                        </View>
                        {inline
                          ? <Points values={[...skills.map((_, column) => row.points[column] ?? 0), rowTotal(row.points)]} />
                          : <PointCells labels={labels} values={[...skills.map((_, column) => row.points[column] ?? 0), rowTotal(row.points)]} />}
                      </View>
                    ))}
                    <View style={[styles.totalRow, !inline && styles.totalStacked]} accessible accessibilityLabel={`Totales: ${describe(sums)}. ${total} puntos.`}>
                      {inline ? <Points values={[...sums, total]} /> : (
                        <>
                          <ThemedText style={styles.rowName}>Totales</ThemedText>
                          <PointCells labels={labels} values={[...sums, total]} />
                        </>
                      )}
                    </View>
                    {legend.length > 0 && (
                      <ThemedText style={styles.legend}>
                        {legend.map(skill => `${skillAbbreviation(skill)} ${skill}`).join(' · ')}
                      </ThemedText>
                    )}
                  </>
                )}
              </View>

              <View style={styles.cta}>
                <HallTile
                  icon={HALL_ICONS.document}
                  tone="primary"
                  title={teDocument ? 'Abrir T.E.' : hall.isTeacher ? 'Subir T.E.' : 'Abrir T.E.'}
                  subtitle={uploading ? 'Subiendo…' : teDocument ? 'Ver documento' : hall.isTeacher ? 'PDF o foto' : 'Sin documento'}
                  compact
                  accessibilityLabel={teDocument ? `Abrir la tabla de especificaciones, ${teDocument.name}` : hall.isTeacher ? 'Subir la tabla de especificaciones escaneada' : 'Tabla de especificaciones, todavía sin documento'}
                  onPress={uploading ? undefined : teDocument ? () => void openHallDocument(teDocument) : hall.isTeacher ? uploadTe : undefined}
                  style={styles.openTile}
                />
                <View style={styles.facts}>
                  {evaluation.objectives.some(objective => objective.code) && (
                    <View style={styles.oa}>
                      <ThemedText numberOfLines={1} style={styles.oaText}>
                        {evaluation.objectives.filter(objective => objective.code).map(objective => objective.code).join(' · ')}
                      </ThemedText>
                    </View>
                  )}
                  {evaluation.exigency !== null && (
                    <View style={[styles.fact, styles.factRule]}>
                      <ThemedText style={styles.factLabel}>Exigencia aplicada</ThemedText>
                      <ThemedText style={styles.factValue}>{evaluation.exigency}%</ThemedText>
                    </View>
                  )}
                  <View style={styles.fact} accessible accessibilityLabel={`Día de la evaluación: ${hallLongDate(evaluation.date)}`}>
                    <ThemedText style={styles.factLabel}>Día de la evaluación</ThemedText>
                    <ThemedText style={styles.factValue}>{hallShortDate(evaluation.date)}</ThemedText>
                  </View>
                </View>
              </View>
            </View>

            <ThemedText style={styles.when}>{hallLongDate(evaluation.date)}</ThemedText>

            {evaluation.objectives.some(objective => objective.text) && (
              <View style={styles.infoCard}>
                <ThemedText style={styles.infoTitle}>Objetivos de aprendizaje</ThemedText>
                {evaluation.objectives.map((objective, index) => (
                  <ThemedText key={index} selectable style={styles.infoText}>
                    {!!objective.code && <ThemedText style={styles.infoCode}>{objective.code}{objective.text ? ' ' : ''}</ThemedText>}
                    {objective.text}
                  </ThemedText>
                ))}
              </View>
            )}

            {!!evaluation.prep && (
              <View style={styles.infoCard}>
                <ThemedText style={styles.infoTitle}>Cómo prepararse</ThemedText>
                <ThemedText selectable style={styles.infoText}>{evaluation.prep}</ThemedText>
              </View>
            )}

            <View style={styles.attribution}>
              <Image source={HALL_ICONS.badge} style={styles.badge} contentFit="contain" />
              <View style={styles.attributionText}>
                <ThemedText style={styles.attributionLabel}>Info. verificada por un docente:</ThemedText>
                <ThemedText style={styles.attributionName}>{evaluation.authorName}</ThemedText>
              </View>
            </View>
            <ThemedText style={styles.finePrint}>
              La publicó tu docente en ClassHall y también aparece en el Calendar del curso. Solo tu docente puede cambiarla.
            </ThemedText>

            {!!uploadError && <ThemedText accessibilityLiveRegion="assertive" style={styles.error}>{uploadError}</ThemedText>}
            {hall.isTeacher && (
              <View style={styles.teacherActions}>
                <HallPill label="Editar evaluación" tone="light" onPress={() => router.push({ pathname: '/classhall/evaluation-form', params: { hallId, id } })} />
                {!!teDocument && <HallPill label={uploading ? 'Subiendo…' : 'Cambiar T.E.'} disabled={uploading} onPress={uploadTe} />}
                <HallPill label="Eliminar" onPress={() => { setDeleteError(null); setConfirming(true); }} />
              </View>
            )}
          </>
        )}
      </ScrollView>

      <HanetDialog
        visible={confirming}
        onRequestClose={() => !deleting && setConfirming(false)}
        dismissOnBackdrop={!deleting}
        title="¿Eliminar esta evaluación?"
        body="Se quita del Hall y del Calendar del curso. No se puede deshacer."
      >
        {!!deleteError && <ThemedText accessibilityLiveRegion="assertive" style={styles.error}>{deleteError}</ThemedText>}
        <HanetDialogActions>
          <HanetButton label="Cancelar" variant="surface" disabled={deleting} onPress={() => setConfirming(false)} style={dialogStyles.action} />
          <HanetButton label={deleting ? 'Eliminando…' : 'Eliminar'} variant="accent" disabled={deleting} onPress={remove} style={dialogStyles.action} />
        </HanetDialogActions>
      </HanetDialog>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AppColors.canvas,
  },
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    paddingHorizontal: AppSpacing.md,
    paddingBottom: TAB_BAR_CLEARANCE + AppSpacing.xl,
    gap: AppSpacing.md,
  },
  topTitle: {
    flex: 1,
    fontFamily: 'DMSans_500Medium',
    fontSize: 20,
    lineHeight: 28,
    letterSpacing: -0.8,
    color: AppColors.textPrimary,
  },
  loader: {
    marginTop: AppSpacing.xxl,
  },
  notice: {
    padding: AppSpacing.xl,
    fontFamily: 'DMSans_500Medium',
    fontSize: 15,
    lineHeight: 21,
    color: AppColors.textSecondary,
  },
  heading: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 4,
  },
  subject: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 32,
    lineHeight: 36,
    letterSpacing: -0.8,
    color: AppColors.textPrimary,
  },
  subjectLight: {
    marginTop: -4,
    fontFamily: 'DMSans_300Light',
    fontSize: 32,
    lineHeight: 36,
    letterSpacing: -0.96,
    color: AppColors.textPrimary,
  },
  evaluationTitle: {
    marginTop: 6,
    fontFamily: 'DMSans_300Light',
    fontSize: 20,
    lineHeight: 24,
    letterSpacing: -1.2,
    color: AppColors.textPrimary,
  },
  table: {
    paddingTop: AppSpacing.xxl,
    paddingHorizontal: AppSpacing.xxl,
    paddingBottom: 48 + 80,
    marginBottom: -80,
    borderRadius: AppRadii.xl,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  tableHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingBottom: AppSpacing.md,
  },
  tableTitle: {
    flex: 1,
    fontFamily: 'DMSans_500Medium',
    fontSize: 18,
    lineHeight: 25,
    letterSpacing: -0.63,
    color: AppColors.textPrimary,
  },
  tableTotal: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -1.44,
    color: AppColors.textPrimary,
  },
  empty: {
    paddingVertical: AppSpacing.lg,
    fontFamily: 'DMSans_400Regular',
    fontSize: 14,
    lineHeight: 21,
    color: AppColors.textSecondary,
  },
  headerRow: {
    alignItems: 'flex-end',
    paddingVertical: AppSpacing.sm,
    opacity: 0.7,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.textSecondary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.lg,
    paddingVertical: AppSpacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.textSecondary,
  },
  rowText: {
    flex: 1,
    gap: 4,
  },
  rowName: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 16,
    lineHeight: 18,
    letterSpacing: -0.4,
    color: AppColors.textPrimary,
  },
  rowDetail: {
    opacity: 0.75,
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
    lineHeight: 18,
    letterSpacing: -0.3,
    color: AppColors.textSecondary,
  },
  rowStacked: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: AppSpacing.md,
  },
  totalStacked: {
    alignItems: 'stretch',
    gap: AppSpacing.sm,
    opacity: 1,
  },
  cells: {
    gap: AppSpacing.sm,
  },
  cell: {
    minWidth: 56,
    alignItems: 'center',
    paddingVertical: AppSpacing.sm,
    paddingHorizontal: AppSpacing.md,
    borderRadius: AppRadii.md,
    borderCurve: 'continuous',
    backgroundColor: AppColors.canvas,
  },
  cellTotal: {
    borderWidth: 1,
    borderColor: AppColors.errorText,
  },
  cellLabel: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 11,
    lineHeight: 14,
    color: AppColors.textSecondary,
  },
  cellValue: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 16,
    lineHeight: 22,
    color: AppColors.textPrimary,
  },
  legend: {
    marginTop: AppSpacing.md,
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
    lineHeight: 17,
    color: AppColors.textSecondary,
  },
  infoCard: {
    gap: AppSpacing.md,
    padding: AppSpacing.xl,
    borderRadius: AppRadii.xl,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  infoTitle: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: -0.63,
    color: AppColors.textPrimary,
  },
  infoText: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 14,
    lineHeight: 21,
    color: AppColors.textSecondary,
  },
  infoCode: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 14,
    color: AppColors.textPrimary,
  },
  totalRow: {
    alignItems: 'flex-end',
    paddingVertical: AppSpacing.sm,
    opacity: 0.7,
  },
  points: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingRight: AppSpacing.sm,
  },
  rule: {
    width: 1,
    height: 27,
    backgroundColor: AppColors.textSecondary,
  },
  point: {
    minWidth: 26,
    textAlign: 'center',
    opacity: 0.75,
    fontFamily: 'DMSans_400Regular',
    fontSize: 14,
    lineHeight: 21,
    letterSpacing: -0.35,
    color: AppColors.textSecondary,
  },
  pointHeader: {
    minWidth: 37,
  },
  pointTotal: {
    color: AppColors.errorText,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.xxl,
    padding: AppSpacing.xxl,
    borderRadius: AppRadii.xl,
    borderCurve: 'continuous',
    backgroundColor: AppColors.accent,
  },
  openTile: {
    width: 106,
    minHeight: 137,
  },
  facts: {
    flex: 1,
    gap: AppSpacing.md,
  },
  oa: {
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: AppSpacing.lg,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.primary,
  },
  oaText: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: -0.4,
    color: AppColors.textPrimary,
  },
  fact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.lg,
  },
  factRule: {
    paddingBottom: AppSpacing.md,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.textOnLight,
  },
  factLabel: {
    flex: 1,
    fontFamily: 'DMSans_500Medium',
    fontSize: 12,
    lineHeight: 18,
    letterSpacing: -0.24,
    color: AppColors.textOnLight,
  },
  factValue: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 18,
    lineHeight: 25,
    letterSpacing: -0.63,
    color: AppColors.textOnLight,
  },
  when: {
    textAlign: 'center',
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.textSecondary,
  },
  attribution: {
    flexDirection: 'row',
    alignSelf: 'center',
    alignItems: 'center',
    gap: 5,
    maxWidth: 260,
  },
  badge: {
    width: 21,
    height: 21,
  },
  attributionText: {
    flexShrink: 1,
  },
  attributionLabel: {
    opacity: 0.7,
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    lineHeight: 16,
    letterSpacing: -0.52,
    color: AppColors.textPrimary,
  },
  attributionName: {
    opacity: 0.7,
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 13,
    lineHeight: 16,
    letterSpacing: -0.52,
    color: AppColors.textPrimary,
  },
  finePrint: {
    alignSelf: 'center',
    maxWidth: 309,
    textAlign: 'center',
    opacity: 0.7,
    fontFamily: 'DMSans_300Light',
    fontSize: 11,
    lineHeight: 13,
    letterSpacing: -0.44,
    color: AppColors.textPrimary,
  },
  teacherActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: AppSpacing.sm,
    marginTop: AppSpacing.sm,
  },
  error: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.errorText,
  },
});
