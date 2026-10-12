import { TAB_BAR_CLEARANCE } from '@/components/AppTabBar';
import { HALL_ICONS, HallPill, HallTile, TopBarButton, hallLongDate, hallShortDate, hallStyles } from '@/components/classhall/hall-ui';
import { ThemedText } from '@/components/themed-text';
import { HanetButton } from '@/components/ui/hanet-button';
import { HanetDialog, HanetDialogActions, dialogStyles } from '@/components/ui/hanet-dialog';
import { AppColors, AppRadii, AppSpacing } from '@/constants/design-tokens';
import { describeAuthError, useSession } from '@/services/auth-service';
import { DocumentError, deleteHallEvaluation, evaluationTotal, getHall, getLoadedHall, openHallDocument, pickHallDocument, uploadHallDocument } from '@/services/classhall-service';
import type { HallDetail } from '@/services/classhall-service';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/** Four numbers split by thin rules: knowledge, application, comprehension, total. */
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

  const sums = evaluation
    ? evaluation.contents.reduce((total, row) => [total[0] + row.con, total[1] + row.apl, total[2] + row.com], [0, 0, 0])
    : [0, 0, 0];
  const total = evaluation ? evaluationTotal(evaluation) : 0;

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
                    <View style={styles.headerRow} accessibilityLabel="Columnas: conocimiento, aplicación, comprensión y total">
                      <Points header values={['CON.', 'APL.', 'COM.', 'TOTAL.']} />
                    </View>
                    {evaluation.contents.map((row, index) => (
                      <View
                        key={index}
                        style={styles.row}
                        accessible
                        accessibilityLabel={`${row.name}. ${row.detail ? `${row.detail}. ` : ''}Conocimiento ${row.con}, aplicación ${row.apl}, comprensión ${row.com}. Total ${row.con + row.apl + row.com} puntos.`}
                      >
                        <View style={styles.rowText}>
                          <ThemedText style={styles.rowName}>{row.name}</ThemedText>
                          {!!row.detail && <ThemedText numberOfLines={2} style={styles.rowDetail}>{row.detail}</ThemedText>}
                        </View>
                        <Points values={[row.con, row.apl, row.com, row.con + row.apl + row.com]} />
                      </View>
                    ))}
                    <View style={styles.totalRow} accessible accessibilityLabel={`Totales: ${sums[0]}, ${sums[1]}, ${sums[2]}. ${total} puntos.`}>
                      <Points values={[...sums, total]} />
                    </View>
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
                  {!!evaluation.oa && (
                    <View style={styles.oa}>
                      <ThemedText numberOfLines={1} style={styles.oaText}>{evaluation.oa}</ThemedText>
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
