import { withSheetFrame } from '@/components/ui/sheet-frame';
import { ThemedText } from '@/components/themed-text';
import { AppColors, AppRadii, AppSpacing } from '@/constants/design-tokens';
import { describeAuthError } from '@/services/auth-service';
import { HALL_THEMES, HALL_THEME_IDS, createHall, getLoadedHall, listHallCourses, updateHall } from '@/services/classhall-service';
import type { HallTheme } from '@/services/classhall-service';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { HALL_PLANS, SUBJECTS, findSubject, subjectsForPlan } from '@/constants/subjects';
import type { HallPlan } from '@/constants/subjects';
import { HanetChoice } from '@/components/ui/hanet-select';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardScroll } from '@/components/ui/keyboard';
import { t } from '@/i18n';

function CreateHallScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // With an id the same form edits that Hall: subject and cover, not its course.
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [editing] = useState(() => (id ? getLoadedHall(id)?.hall ?? null : null));

  // A subject of the shared catalog (the same the Calendar uses), or "other"
  // for an elective typed by hand.
  const [initial] = useState(() => {
    const known = editing ? findSubject(editing.subject) : null;
    return {
      catalogId: editing ? known?.id ?? 'other' : null,
      otherSubject: editing && !known ? editing.subject : '',
      theme: (editing?.theme && editing.theme in HALL_THEMES ? editing.theme : 'backToSchool') as HallTheme,
      plan: (editing?.plan ?? 'comun') as HallPlan,
    };
  });
  const [plan, setPlan] = useState<HallPlan>(initial.plan);
  const [catalogId, setCatalogId] = useState<string | null>(initial.catalogId);
  const [otherSubject, setOtherSubject] = useState(initial.otherSubject);
  const [themeTouched, setThemeTouched] = useState(!!editing);
  const [courses, setCourses] = useState<string[] | null>(editing ? [editing.courseId] : null);
  const [course, setCourse] = useState<string | null>(editing?.courseId ?? null);
  const [theme, setTheme] = useState<HallTheme>(initial.theme);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editing) return;
    let active = true;
    listHallCourses()
      .then(list => { if (active) setCourses(list); })
      .catch(loadError => {
        if (!active) return;
        setCourses([]);
        setError(describeAuthError(loadError, t('classhall.create.noPudimosCargarLosCursos')));
      });
    return () => { active = false; };
  }, [editing]);

  const subject = catalogId === 'other' ? otherSubject : SUBJECTS.find(item => item.id === catalogId)?.name ?? '';
  const changed = !editing
    || catalogId !== initial.catalogId
    || (catalogId === 'other' && otherSubject.trim() !== initial.otherSubject.trim())
    || theme !== initial.theme
    || plan !== initial.plan;
  const ready = subject.trim().length >= 2 && !!course && changed;

  // The subject list follows the kind; a subject that is not taught as the
  // new kind is cleared.
  const pickPlan = (next: string) => {
    const value = next as HallPlan;
    setPlan(value);
    setError(null);
    if (catalogId && catalogId !== 'other' && !SUBJECTS.find(item => item.id === catalogId)?.plans.includes(value)) setCatalogId(null);
  };

  const pickSubject = (id: string) => {
    setCatalogId(id);
    setError(null);
    // The cover follows the subject until the teacher picks one.
    const suggested = SUBJECTS.find(item => item.id === id)?.theme;
    if (!themeTouched && suggested && suggested in HALL_THEMES) setTheme(suggested as HallTheme);
  };

  const submit = async () => {
    if (!ready || !course || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      if (editing) await updateHall(editing.id, subject, theme, plan);
      else await createHall(subject, course, theme, plan);
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      allowLeave();
      router.back();
    } catch (createError) {
      setError(describeAuthError(createError, editing ? t('classhall.create.noPudimosGuardarLosCambios') : t('classhall.create.noPudimosCrearElHall')));
      setSubmitting(false);
    }
  };

  // Closing with a subject, course or theme chosen asks first.
  const { allowLeave, dialog } = useUnsavedChangesGuard({
    dirty: (editing ? changed : !!catalogId || !!course || themeTouched || plan !== 'comun') && !submitting,
    onSave: submit,
    saveLabel: editing ? t('common.guardarCambios') : t('classhall.create.crearHall'),
    canSave: ready,
    title: editing ? t('common.descartarLosCambios') : t('classhall.create.descartarEsteHall'),
    message: editing ? t('classhall.create.elHallQuedaraComoEstaba') : ready ? t('classhall.create.todaviaNoLoHasCreado') : t('classhall.create.todaviaNoLoHasCreado2'),
  });

  return (
    <KeyboardScroll
      style={styles.sheet}
      contentContainerStyle={[styles.content, { paddingTop: (Platform.OS === 'android' ? 0 : insets.top) + AppSpacing.xxl, paddingBottom: insets.bottom + AppSpacing.xl }]}
      keyboardShouldPersistTaps="handled"
    >
      <ThemedText accessibilityRole="header" style={styles.title}>{editing ? t('classhall.create.editarHall') : t('classhall.create.crearUnHall')}</ThemedText>
      <ThemedText style={styles.lead}>
        {editing
          ? t('classhall.create.cambiaLaAsignaturaOLa')
          : t('classhall.create.unHallEsTuAsignatura')}
      </ThemedText>

      <View style={styles.field}>
        <ThemedText style={styles.label}>{t('classhall.create.tipoDeHall')}</ThemedText>
        <HanetChoice
          label={t('classhall.create.tipoDeHall')}
          options={HALL_PLANS.map(item => ({ value: item.value, label: item.label }))}
          value={plan}
          onChange={pickPlan}
          disabled={submitting}
        />
        <ThemedText style={styles.hint}>{HALL_PLANS.find(item => item.value === plan)?.hint}</ThemedText>
      </View>

      <View style={styles.field}>
        <ThemedText style={styles.label}>{t('classhall.create.asignatura')}</ThemedText>
        <ThemedText style={styles.hint}>{t('classhall.create.lasMismasDelCalendarPara')}</ThemedText>
        <HanetChoice
          label={t('classhall.create.asignatura')}
          options={[
            ...subjectsForPlan(plan).map(item => ({ value: item.id, label: item.area ? t('classhall.create.nameAreaArea', { name: item.name, area: item.area }) : item.name })),
            { value: 'other', label: t('classhall.create.otraAsignatura') },
          ]}
          value={catalogId}
          onChange={pickSubject}
          placeholder={t('classhall.create.elegirAsignatura')}
          disabled={submitting}
        />
        {catalogId === 'other' && (
          <TextInput
            accessibilityLabel={t('classhall.create.nombreDeLaAsignatura')}
            value={otherSubject}
            onChangeText={(text) => { setOtherSubject(text); setError(null); }}
            placeholder={t('classhall.create.tallerDeRobotica')}
            placeholderTextColor={AppColors.surfaceMuted}
            maxLength={60}
            autoFocus
            editable={!submitting}
            selectionColor={AppColors.accent}
            style={styles.input}
          />
        )}
      </View>

      <View style={styles.field}>
        <ThemedText style={styles.label}>{t('common.curso')}</ThemedText>
        {courses === null && <ActivityIndicator style={styles.loader} color={AppColors.textSecondary} />}
        {courses?.length === 0 && !error && (
          <ThemedText style={styles.hint}>{t('classhall.create.tuInstitucionTodaviaNoTiene')}</ThemedText>
        )}
        {editing && (
          <ThemedText style={styles.hint}>{t('classhall.create.courseidElCursoNoSe', { courseId: editing.courseId })}</ThemedText>
        )}
        {!editing && plan !== 'comun' && (
          <ThemedText style={styles.hint}>{t('classhall.create.elCursoPrincipalDelHall')}</ThemedText>
        )}
        {!editing && !!courses?.length && (
          <HanetChoice
            label={t('common.curso')}
            options={courses.map(option => ({ value: option, label: option }))}
            value={course}
            onChange={(option) => { setCourse(option); setError(null); }}
            placeholder={t('classhall.create.elegirCurso')}
            disabled={submitting}
          />
        )}
      </View>

      <View style={styles.field}>
        <ThemedText style={styles.label}>{t('classhall.create.portada')}</ThemedText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.themes} accessibilityRole="radiogroup">
          {HALL_THEME_IDS.map((id, index) => {
            const selected = id === theme;
            return (
              <Pressable
                key={id}
                accessibilityRole="radio"
                accessibilityLabel={t('classhall.create.portadaNumber', { number: index + 1 })}
                accessibilityState={{ selected }}
                disabled={submitting}
                onPress={() => { setTheme(id); setThemeTouched(true); }}
                style={({ pressed }) => [styles.theme, selected && styles.themeSelected, pressed && styles.pressed]}
              >
                <Image source={HALL_THEMES[id]} style={styles.themeImage} contentFit="cover" />
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {!!error && <ThemedText accessibilityLiveRegion="assertive" style={styles.error}>{error}</ThemedText>}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !ready || submitting, busy: submitting }}
        disabled={!ready || submitting}
        onPress={submit}
        style={({ pressed }) => [styles.submit, (!ready || submitting) && styles.submitDisabled, pressed && styles.pressed]}
      >
        <ThemedText style={styles.submitText}>{submitting ? (editing ? t('common.guardando') : t('classhall.create.creando')) : editing ? t('common.guardarCambios') : t('classhall.create.crearHall')}</ThemedText>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.back()}
        style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}
      >
        <ThemedText style={styles.cancelText}>{t('common.cancelar')}</ThemedText>
      </Pressable>
      {dialog}
    </KeyboardScroll>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: AppColors.surface,
  },
  content: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    padding: AppSpacing.xl,
    gap: AppSpacing.xl,
  },
  title: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 24,
    lineHeight: 29,
    letterSpacing: -1.08,
    color: AppColors.textPrimary,
  },
  lead: {
    marginTop: -AppSpacing.md,
    fontFamily: 'DMSans_500Medium',
    fontSize: 15,
    lineHeight: 21,
    letterSpacing: -0.3,
    color: AppColors.textSecondary,
  },
  field: {
    gap: AppSpacing.sm,
  },
  label: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: -0.3,
    color: AppColors.textPrimary,
  },
  input: {
    minHeight: 56,
    paddingHorizontal: AppSpacing.lg,
    borderRadius: AppRadii.md,
    borderCurve: 'continuous',
    backgroundColor: AppColors.canvas,
    fontFamily: 'DMSans_700Bold',
    fontSize: 16,
    letterSpacing: -0.4,
    color: AppColors.textPrimary,
    outlineStyle: 'none' as never,
  },
  loader: {
    alignSelf: 'flex-start',
  },
  hint: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.textSecondary,
  },
  themes: {
    gap: AppSpacing.sm,
  },
  theme: {
    width: 132,
    height: 64,
    overflow: 'hidden',
    borderRadius: AppRadii.md,
    borderCurve: 'continuous',
    borderWidth: 3,
    borderColor: 'transparent',
  },
  themeSelected: {
    borderColor: AppColors.controlActive,
  },
  themeImage: {
    flex: 1,
  },
  error: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.errorText,
  },
  submit: {
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.primary,
  },
  submitDisabled: {
    backgroundColor: AppColors.surfaceMuted,
    opacity: 0.65,
  },
  submitText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: -0.4,
    color: AppColors.textPrimary,
  },
  cancel: {
    minHeight: 44,
    alignSelf: 'center',
    justifyContent: 'center',
    paddingHorizontal: AppSpacing.lg,
  },
  cancelText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.textSecondary,
  },
  pressed: {
    opacity: 0.6,
  },
});

export default withSheetFrame(CreateHallScreen, AppColors.surface);
