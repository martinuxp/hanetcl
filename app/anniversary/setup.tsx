import { DateField, SheetActions, SheetBody, TextField, formStyles as styles } from '@/components/anniversary/anniversary-form';
import { ALLIANCE_COLORS, ALLIANCE_COLOR_ORDER } from '@/components/anniversary/anniversary-ui';
import { ThemedText } from '@/components/themed-text';
import { HanetButton } from '@/components/ui/hanet-button';
import { HanetChip } from '@/components/ui/hanet-chip';
import { HanetDialog, HanetDialogActions, dialogStyles } from '@/components/ui/hanet-dialog';
import { HanetChoice } from '@/components/ui/hanet-select';
import { withSheetFrame } from '@/components/ui/sheet-frame';
import { AppColors, AppRadii, AppSpacing, AppTouch } from '@/constants/design-tokens';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { describeAuthError } from '@/services/auth-service';
import { deleteAnniversary, listAnniversaryCourses, peekAnniversary, saveAnniversary } from '@/services/anniversary-service';
import type { AllianceColor, AllianceInput, AnniversaryInput } from '@/services/anniversary-service';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

const MAX_ALLIANCES = 8;
const DEFAULT_COLORS: AllianceColor[] = ['rosa', 'azul', 'verde', 'amarillo', 'morado', 'naranjo', 'celeste', 'rojo'];
// Mascots to pick from; any other emoji can be typed.
const MASCOTS = ['🦁', '🐺', '🐯', '🦅', '🐉', '🦈', '🐍', '🦊', '🐻', '🐼', '🦄', '🐸', '🐝', '🦋', '🔥', '⚡', '🌊', '🌙', '☀️', '⭐', '👑', '💎', '🚀', '🎸', '🎭', '👾', '🍀', '🌹'];

function blankAlliance(index: number): AllianceInput {
  return { name: '', theme: '', color: DEFAULT_COLORS[index % DEFAULT_COLORS.length], emoji: '', motto: '', instagram: '', courseIds: [] };
}

/** An emoji typed by hand: no letters or digits (the server checks the rest). */
function looksLikeEmoji(value: string) {
  return !!value && !/[\p{L}\p{N}\s]/u.test(value);
}

function initialForm(): AnniversaryInput {
  const current = peekAnniversary()?.anniversary;
  if (current) {
    return {
      title: current.title,
      startsAt: current.startsAt,
      endsAt: current.endsAt,
      rulesUrl: current.rulesUrl,
      scoreHidden: current.scoreHidden,
      finished: current.finished,
      alliances: current.alliances.map(({ id, name, theme, color, emoji, motto, instagram, courseIds }) => ({ id, name, theme, color, emoji, motto, instagram, courseIds })),
    };
  }
  const start = new Date();
  start.setDate(start.getDate() + 14);
  start.setHours(8, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 4);
  end.setHours(22, 0, 0, 0);
  return {
    title: 'Aniversario',
    startsAt: start.getTime(),
    endsAt: end.getTime(),
    rulesUrl: '',
    scoreHidden: false,
    finished: false,
    alliances: [0, 1, 2, 3].map(blankAlliance),
  };
}

/** Name, dates, alianzas with their courses and colors, and the switches. */
function SetupScreen() {
  const router = useRouter();
  const editing = !!peekAnniversary()?.anniversary;
  const [initial] = useState(initialForm);
  const [form, setForm] = useState(initial);
  const [courses, setCourses] = useState<string[] | null>(null);
  const [coursesError, setCoursesError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The alianza (by its place in the form) asked to be borrada, or the whole anniversary.
  const [removing, setRemoving] = useState<number | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);

  useEffect(() => {
    let active = true;
    listAnniversaryCourses()
      .then(list => { if (active) setCourses(list); })
      .catch(loadError => { if (active) setCoursesError(describeAuthError(loadError, 'No pudimos cargar los cursos.')); });
    return () => { active = false; };
  }, []);

  const update = (patch: Partial<AnniversaryInput>) => { setForm(value => ({ ...value, ...patch })); setError(null); };
  const updateAlliance = (index: number, patch: Partial<AllianceInput>) => {
    update({ alliances: form.alliances.map((alliance, i) => (i === index ? { ...alliance, ...patch } : alliance)) });
  };

  // Each course belongs to one alianza: tapping it moves it to this one.
  const toggleCourse = (index: number, courseId: string) => {
    update({
      alliances: form.alliances.map((alliance, i) => {
        if (i === index) {
          return alliance.courseIds.includes(courseId)
            ? { ...alliance, courseIds: alliance.courseIds.filter(id => id !== courseId) }
            : { ...alliance, courseIds: [...alliance.courseIds, courseId] };
        }
        return { ...alliance, courseIds: alliance.courseIds.filter(id => id !== courseId) };
      }),
    });
  };

  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const ready = form.title.trim().length > 0
    && form.endsAt > form.startsAt
    && form.alliances.length >= 2
    && form.alliances.every(alliance => alliance.name.trim().length > 0 && (!alliance.emoji || looksLikeEmoji(alliance.emoji)));

  const submit = async () => {
    if (!ready || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await saveAnniversary({
        ...form,
        title: form.title.trim(),
        rulesUrl: form.rulesUrl.trim(),
        alliances: form.alliances.map(alliance => ({ ...alliance, emoji: alliance.emoji.trim(), motto: alliance.motto.trim(), instagram: alliance.instagram.trim() })),
      });
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      allowLeave();
      router.back();
    } catch (saveError) {
      setError(describeAuthError(saveError, 'No pudimos guardar el aniversario. Inténtalo nuevamente.'));
      setSubmitting(false);
    }
  };

  // A new alianza goes at once; a saved one asks first, because saving
  // borra its points too.
  const askRemove = (index: number) => {
    if (form.alliances.length > 2 && !form.alliances[index].id) removeAlliance(index);
    else setRemoving(index);
  };
  const removeAlliance = (index: number) => {
    update({ alliances: form.alliances.filter((_, i) => i !== index) });
    setRemoving(null);
  };

  const removeAll = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await deleteAnniversary();
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      allowLeave();
      setDeletingAll(false);
      router.back();
    } catch (deleteError) {
      setDeletingAll(false);
      setError(describeAuthError(deleteError, 'No pudimos borrar el aniversario. Inténtalo nuevamente.'));
      setSubmitting(false);
    }
  };

  const label = editing ? 'Guardar cambios' : 'Armar el aniversario';
  const { allowLeave, dialog } = useUnsavedChangesGuard({ dirty: dirty && !submitting, onSave: submit, saveLabel: label, canSave: ready });
  const unassigned = (courses ?? []).filter(courseId => !form.alliances.some(alliance => alliance.courseIds.includes(courseId)));

  return (
    <SheetBody
      title={editing ? 'Alianzas y fechas' : 'Armar el aniversario'}
      lead="Cada curso va en una alianza: sus estudiantes verán la suya sin hacer nada."
    >
      <TextField label="Nombre" value={form.title} onChange={title => update({ title })} placeholder="44° Aniversario" disabled={submitting} />
      <DateField label="Empieza" value={form.startsAt} onChange={value => value && update({ startsAt: value })} disabled={submitting} />
      <DateField label="Termina" value={form.endsAt} onChange={value => value && update({ endsAt: value })} disabled={submitting} />
      {form.endsAt <= form.startsAt && <ThemedText style={styles.hint}>El término va después del inicio.</ThemedText>}
      <TextField
        label="Link a las bases"
        optional
        value={form.rulesUrl}
        onChange={rulesUrl => update({ rulesUrl })}
        placeholder="https://drive.google.com/…"
        keyboardType="url"
        maxLength={500}
        disabled={submitting}
      />

      {form.alliances.map((alliance, index) => (
        <View key={alliance.id ?? `new-${index}`} style={local.alliance}>
          <View style={local.allianceHead}>
            <ThemedText style={styles.label}>Alianza {index + 1}</ThemedText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Borrar la alianza ${alliance.name.trim() || index + 1}`}
              disabled={submitting}
              onPress={() => askRemove(index)}
              style={({ pressed }) => [local.remove, pressed && styles.pressed]}
            >
              <Ionicons name="trash-outline" size={15} color={AppColors.textSecondary} />
              <ThemedText style={local.removeText}>Borrar</ThemedText>
            </Pressable>
          </View>
          <TextField label="Nombre" value={alliance.name} onChange={name => updateAlliance(index, { name })} placeholder="80s" maxLength={40} disabled={submitting} />
          <TextField label="Temática" optional value={alliance.theme} onChange={theme => updateAlliance(index, { theme })} placeholder="Los años 80" maxLength={60} disabled={submitting} />
          <View style={styles.field}>
            <ThemedText style={styles.label}>Mascota <ThemedText style={styles.optional}>(opcional)</ThemedText></ThemedText>
            <View accessibilityRole="radiogroup" style={local.mascots}>
              {MASCOTS.map(emoji => {
                const selected = alliance.emoji === emoji;
                return (
                  <Pressable
                    key={emoji}
                    accessibilityRole="radio"
                    accessibilityLabel={emoji}
                    accessibilityState={{ selected }}
                    disabled={submitting}
                    onPress={() => updateAlliance(index, { emoji: selected ? '' : emoji })}
                    style={({ pressed }) => [local.mascot, selected && local.mascotSelected, pressed && styles.pressed]}
                  >
                    <ThemedText maxFontSizeMultiplier={1} style={local.mascotText}>{emoji}</ThemedText>
                  </Pressable>
                );
              })}
            </View>
            <TextInput
              accessibilityLabel={`Otra mascota para la alianza ${index + 1}`}
              value={MASCOTS.includes(alliance.emoji) ? '' : alliance.emoji}
              onChangeText={emoji => updateAlliance(index, { emoji })}
              placeholder="O escribe otro emoji"
              placeholderTextColor={AppColors.surfaceMuted}
              maxLength={16}
              editable={!submitting}
              autoCorrect={false}
              selectionColor={AppColors.accent}
              style={styles.input}
            />
            {!!alliance.emoji && !looksLikeEmoji(alliance.emoji) && <ThemedText style={styles.hint}>La mascota es un solo emoji, sin letras.</ThemedText>}
          </View>
          <TextField label="Lema" optional value={alliance.motto} onChange={motto => updateAlliance(index, { motto })} placeholder="¡Nadie nos para!" maxLength={80} disabled={submitting} />
          <TextField
            label="Instagram de la alianza"
            optional
            value={alliance.instagram}
            onChange={instagram => updateAlliance(index, { instagram })}
            placeholder="@alianza80s"
            keyboardType="email-address"
            maxLength={80}
            disabled={submitting}
          />
          <View style={styles.field}>
            <ThemedText style={styles.label}>Color</ThemedText>
            <View accessibilityRole="radiogroup" style={local.colors}>
              {ALLIANCE_COLOR_ORDER.map(color => {
                const selected = alliance.color === color;
                return (
                  <Pressable
                    key={color}
                    accessibilityRole="radio"
                    accessibilityLabel={ALLIANCE_COLORS[color].label}
                    accessibilityState={{ selected }}
                    disabled={submitting}
                    onPress={() => updateAlliance(index, { color })}
                    style={({ pressed }) => [local.colorOuter, selected && local.colorSelected, pressed && styles.pressed]}
                  >
                    <View style={[local.color, { backgroundColor: ALLIANCE_COLORS[color].fill }]} />
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View style={styles.field}>
            <ThemedText style={styles.label}>Cursos <ThemedText style={styles.optional}>({alliance.courseIds.length})</ThemedText></ThemedText>
            {courses === null ? (
              <ThemedText style={styles.hint}>{coursesError ?? 'Cargando los cursos…'}</ThemedText>
            ) : (
              <View style={local.courses}>
                {[...alliance.courseIds, ...unassigned].sort((a, b) => a.localeCompare(b, 'es')).map(courseId => (
                  <HanetChip
                    key={courseId}
                    label={courseId}
                    compact
                    selected={alliance.courseIds.includes(courseId)}
                    disabled={submitting}
                    onPress={() => toggleCourse(index, courseId)}
                  />
                ))}
                {!alliance.courseIds.length && !unassigned.length && <ThemedText style={styles.hint}>Todos los cursos ya están en otra alianza.</ThemedText>}
              </View>
            )}
          </View>
        </View>
      ))}

      {form.alliances.length < MAX_ALLIANCES && (
        <HanetButton label="Agregar una alianza" variant="surface" disabled={submitting} onPress={() => update({ alliances: [...form.alliances, blankAlliance(form.alliances.length)] })} />
      )}
      {courses !== null && unassigned.length > 0 && (
        <ThemedText style={styles.hint}>Sin alianza: {unassigned.join(', ')}.</ThemedText>
      )}

      {editing && (
        <>
          <View style={styles.field}>
            <ThemedText style={styles.label}>Marcador</ThemedText>
            <HanetChoice
              label="Marcador"
              options={[{ value: 'shown', label: 'Visible' }, { value: 'hidden', label: 'Oculto' }]}
              value={form.scoreHidden ? 'hidden' : 'shown'}
              onChange={value => update({ scoreHidden: value === 'hidden' })}
              disabled={submitting}
            />
            <ThemedText style={styles.hint}>Solo quienes organizan ven los puntos. Así la ganadora se revela en la premiación.</ThemedText>
          </View>
          <View style={styles.field}>
            <ThemedText style={styles.label}>Estado</ThemedText>
            <HanetChoice
              label="Estado"
              options={[{ value: 'live', label: 'En curso' }, { value: 'finished', label: 'Terminado' }]}
              value={form.finished ? 'finished' : 'live'}
              onChange={value => update({ finished: value === 'finished' })}
              disabled={submitting}
            />
          </View>
        </>
      )}

      <SheetActions label={label} busyLabel="Guardando…" ready={ready && (dirty || !editing)} busy={submitting} onSubmit={submit} error={error} />
      {editing && <HanetButton label="Borrar el aniversario" variant="surface" disabled={submitting} onPress={() => setDeletingAll(true)} />}

      {removing !== null && form.alliances.length <= 2 ? (
        <HanetDialog
          visible
          onRequestClose={() => setRemoving(null)}
          title="Se necesitan dos alianzas"
          body="Agrega otra antes de borrar esta. Si quieres empezar de cero, borra el aniversario completo al final."
        >
          <HanetDialogActions>
            <HanetButton label="Entendido" variant="surface" onPress={() => setRemoving(null)} style={dialogStyles.action} />
          </HanetDialogActions>
        </HanetDialog>
      ) : (
        <HanetDialog
          visible={removing !== null}
          onRequestClose={() => setRemoving(null)}
          title={`¿Borrar ${removing !== null && form.alliances[removing]?.name.trim() ? form.alliances[removing].name.trim() : 'la alianza'}?`}
          body="Al guardar se van sus puntos y sus jefes, sale de los resultados (las de abajo suben un lugar) y sus cursos quedan sin alianza."
        >
          <HanetDialogActions>
            <HanetButton label="Cancelar" variant="surface" onPress={() => setRemoving(null)} style={dialogStyles.action} />
            <HanetButton label="Borrar" variant="accent" onPress={() => removing !== null && removeAlliance(removing)} style={dialogStyles.action} />
          </HanetDialogActions>
        </HanetDialog>
      )}
      <HanetDialog
        visible={deletingAll}
        onRequestClose={() => setDeletingAll(false)}
        title="¿Borrar el aniversario?"
        body="Se borran las alianzas, las actividades, los plazos y todos los puntos. Los avisos quedan en el Feed. No se puede deshacer."
      >
        <HanetDialogActions>
          <HanetButton label="Cancelar" variant="surface" onPress={() => setDeletingAll(false)} style={dialogStyles.action} />
          <HanetButton label={submitting ? 'Borrando…' : 'Borrar'} variant="accent" disabled={submitting} onPress={removeAll} style={dialogStyles.action} />
        </HanetDialogActions>
      </HanetDialog>
      {dialog}
    </SheetBody>
  );
}

const local = StyleSheet.create({
  alliance: {
    gap: AppSpacing.lg,
    padding: AppSpacing.lg,
    borderRadius: AppRadii.lg,
    borderCurve: 'continuous',
    backgroundColor: AppColors.canvas,
  },
  allianceHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  remove: {
    minHeight: AppTouch.minimum - 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: AppSpacing.md,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.surface,
  },
  removeText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 13,
    color: AppColors.textSecondary,
  },
  colors: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing.sm,
  },
  colorOuter: {
    width: AppTouch.minimum,
    height: AppTouch.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: AppTouch.minimum / 2,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorSelected: {
    borderColor: AppColors.textPrimary,
  },
  color: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: AppColors.surfaceMuted,
  },
  mascots: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing.xs,
  },
  mascot: {
    width: AppTouch.minimum,
    height: AppTouch.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: AppTouch.minimum / 2,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  mascotSelected: {
    borderColor: AppColors.textPrimary,
    backgroundColor: AppColors.surface,
  },
  mascotText: {
    fontSize: 24,
    lineHeight: 30,
  },
  courses: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing.sm,
  },
});

export default withSheetFrame(SetupScreen, AppColors.surface);
