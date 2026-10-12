import { withSheetFrame } from '@/components/ui/sheet-frame';
import { ThemedText } from '@/components/themed-text';
import { AppColors, AppRadii, AppSpacing } from '@/constants/design-tokens';
import { describeAuthError } from '@/services/auth-service';
import { HALL_THEMES, HALL_THEME_IDS, createHall, listHallCourses } from '@/services/classhall-service';
import type { HallTheme } from '@/services/classhall-service';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { SUBJECTS } from '@/constants/subjects';
import { HanetChoice } from '@/components/ui/hanet-select';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function CreateHallScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // A subject of the shared catalog (the same the Calendar uses), or "other"
  // for an elective typed by hand.
  const [catalogId, setCatalogId] = useState<string | null>(null);
  const [otherSubject, setOtherSubject] = useState('');
  const [themeTouched, setThemeTouched] = useState(false);
  const [courses, setCourses] = useState<string[] | null>(null);
  const [course, setCourse] = useState<string | null>(null);
  const [theme, setTheme] = useState<HallTheme>('backToSchool');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listHallCourses()
      .then(list => { if (active) setCourses(list); })
      .catch(loadError => {
        if (!active) return;
        setCourses([]);
        setError(describeAuthError(loadError, 'No pudimos cargar los cursos. Cierra y vuelve a intentarlo.'));
      });
    return () => { active = false; };
  }, []);

  const subject = catalogId === 'other' ? otherSubject : SUBJECTS.find(item => item.id === catalogId)?.name ?? '';
  const ready = subject.trim().length >= 2 && !!course;

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
      await createHall(subject, course, theme);
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      allowLeave();
      router.back();
    } catch (createError) {
      setError(describeAuthError(createError, 'No pudimos crear el Hall. Inténtalo nuevamente.'));
      setSubmitting(false);
    }
  };

  // Closing with a subject, course or theme chosen asks first.
  const { allowLeave, dialog } = useUnsavedChangesGuard({
    dirty: (!!catalogId || !!course || themeTouched) && !submitting,
    onSave: submit,
    saveLabel: 'Crear Hall',
    canSave: ready,
    title: '¿Descartar este Hall?',
    message: ready ? 'Todavía no lo has creado.' : 'Todavía no lo has creado, y le faltan datos para hacerlo.',
  });

  return (
    <ScrollView
      style={styles.sheet}
      contentContainerStyle={[styles.content, { paddingTop: (Platform.OS === 'android' ? 0 : insets.top) + AppSpacing.xxl, paddingBottom: insets.bottom + AppSpacing.xl }]}
      keyboardShouldPersistTaps="handled"
    >
      <ThemedText accessibilityRole="header" style={styles.title}>Crear un Hall</ThemedText>
      <ThemedText style={styles.lead}>
        Un Hall es tu asignatura en un curso. Al crearlo recibes un código para que tus estudiantes se unan.
      </ThemedText>

      <View style={styles.field}>
        <ThemedText style={styles.label}>Asignatura</ThemedText>
        <ThemedText style={styles.hint}>Las mismas del Calendar, para que las evaluaciones del curso aparezcan en tu Hall.</ThemedText>
        <HanetChoice
          label="Asignatura"
          options={[...SUBJECTS.map(item => ({ value: item.id, label: item.name })), { value: 'other', label: 'Otra asignatura' }]}
          value={catalogId}
          onChange={pickSubject}
          placeholder="Elegir asignatura"
          disabled={submitting}
        />
        {catalogId === 'other' && (
          <TextInput
            accessibilityLabel="Nombre de la asignatura"
            value={otherSubject}
            onChangeText={(text) => { setOtherSubject(text); setError(null); }}
            placeholder="Taller de robótica"
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
        <ThemedText style={styles.label}>Curso</ThemedText>
        {courses === null && <ActivityIndicator style={styles.loader} color={AppColors.textSecondary} />}
        {courses?.length === 0 && !error && (
          <ThemedText style={styles.hint}>Tu institución todavía no tiene cursos en su nómina.</ThemedText>
        )}
        {!!courses?.length && (
          <HanetChoice
            label="Curso"
            options={courses.map(option => ({ value: option, label: option }))}
            value={course}
            onChange={(option) => { setCourse(option); setError(null); }}
            placeholder="Elegir curso"
            disabled={submitting}
          />
        )}
      </View>

      <View style={styles.field}>
        <ThemedText style={styles.label}>Portada</ThemedText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.themes} accessibilityRole="radiogroup">
          {HALL_THEME_IDS.map((id, index) => {
            const selected = id === theme;
            return (
              <Pressable
                key={id}
                accessibilityRole="radio"
                accessibilityLabel={`Portada ${index + 1}`}
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
        <ThemedText style={styles.submitText}>{submitting ? 'Creando…' : 'Crear Hall'}</ThemedText>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.back()}
        style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}
      >
        <ThemedText style={styles.cancelText}>Cancelar</ThemedText>
      </Pressable>
      {dialog}
    </ScrollView>
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
