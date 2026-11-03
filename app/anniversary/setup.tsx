import { DateField, SheetActions, SheetBody, TextField, formStyles as styles } from '@/components/anniversary/anniversary-form';
import { ALLIANCE_COLORS, ALLIANCE_COLOR_ORDER, mascotsOf } from '@/components/anniversary/anniversary-ui';
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
import { t } from '@/i18n';

const MAX_ALLIANCES = 8;
const MAX_MASCOTS = 3;
const DEFAULT_COLORS: AllianceColor[] = ['rosa', 'azul', 'verde', 'amarillo', 'morado', 'naranjo', 'celeste', 'rojo'];
// Mascots to pick from; any other emoji can be typed.
const MASCOTS = ['🦁', '🐺', '🐯', '🦅', '🐉', '🦈', '🐍', '🦊', '🐻', '🐼', '🦄', '🐸', '🐝', '🦋', '🔥', '⚡', '🌊', '🌙', '☀️', '⭐', '👑', '💎', '🚀', '🎸', '🎭', '👾', '🍀', '🌹'];

function blankAlliance(index: number): AllianceInput {
  return { name: '', theme: '', color: DEFAULT_COLORS[index % DEFAULT_COLORS.length], color2: '', emoji: '', motto: '', instagram: '', chant: '', artists: '', draw: '', courseIds: [] };
}

/** Taps a mascot in or out, keeping up to three. */
function toggleMascot(emoji: string, mascot: string) {
  const current = mascotsOf({ emoji });
  if (current.includes(mascot)) return current.filter(item => item !== mascot).join('');
  return [...current, mascot].slice(-MAX_MASCOTS).join('');
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
      alliances: current.alliances.map(({ id, name, theme, color, color2, emoji, motto, instagram, chant, artists, draw, courseIds }) => (
        { id, name, theme, color, color2: color2 ?? '', emoji, motto, instagram, chant: chant ?? '', artists: artists ?? '', draw: draw ?? '', courseIds }
      )),
    };
  }
  const start = new Date();
  start.setDate(start.getDate() + 14);
  start.setHours(8, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 4);
  end.setHours(22, 0, 0, 0);
  return {
    title: t('common.aniversario'),
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
  // The alianzas (by their place) showing their extra fields.
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const toggleExpanded = (index: number) => setExpanded(current => {
    const next = new Set(current);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    return next;
  });

  useEffect(() => {
    let active = true;
    listAnniversaryCourses()
      .then(list => { if (active) setCourses(list); })
      .catch(loadError => { if (active) setCoursesError(describeAuthError(loadError, t('anniversary.setup.noPudimosCargarLosCursos'))); });
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
        alliances: form.alliances.map(alliance => ({
          ...alliance,
          emoji: alliance.emoji.replace(/\s+/g, ''),
          motto: alliance.motto.trim(),
          instagram: alliance.instagram.trim(),
          chant: alliance.chant.trim(),
          artists: alliance.artists.trim(),
          draw: alliance.draw.trim(),
        })),
      });
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      allowLeave();
      router.back();
    } catch (saveError) {
      setError(describeAuthError(saveError, t('anniversary.setup.noPudimosGuardarElAniversario')));
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
    setExpanded(new Set());
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
      setError(describeAuthError(deleteError, t('anniversary.setup.noPudimosBorrarElAniversario')));
      setSubmitting(false);
    }
  };

  const label = editing ? t('common.guardarCambios') : t('anniversary.armarElAniversario');
  const { allowLeave, dialog } = useUnsavedChangesGuard({ dirty: dirty && !submitting, onSave: submit, saveLabel: label, canSave: ready });
  const unassigned = (courses ?? []).filter(courseId => !form.alliances.some(alliance => alliance.courseIds.includes(courseId)));

  return (
    <SheetBody
      title={editing ? t('anniversary.setup.alianzasYFechas') : t('anniversary.armarElAniversario')}
      lead={t('anniversary.setup.cadaCursoVaEnUna')}
    >
      <TextField label={t('common.nombre')} value={form.title} onChange={title => update({ title })} placeholder={t('anniversary.setup.n44Aniversario')} disabled={submitting} />
      <DateField label={t('common.empieza')} value={form.startsAt} onChange={value => value && update({ startsAt: value })} disabled={submitting} />
      <DateField label={t('common.termina')} value={form.endsAt} onChange={value => value && update({ endsAt: value })} disabled={submitting} />
      {form.endsAt <= form.startsAt && <ThemedText style={styles.hint}>{t('anniversary.setup.elTerminoVaDespuesDel')}</ThemedText>}
      <TextField
        label={t('anniversary.setup.linkALasBases')}
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
            <ThemedText style={styles.label}>{t('anniversary.setup.alianzaNumber', { number: index + 1 })}</ThemedText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('anniversary.setup.borrarLaAlianzaName', { name: alliance.name.trim() || index + 1 })}
              disabled={submitting}
              onPress={() => askRemove(index)}
              style={({ pressed }) => [local.remove, pressed && styles.pressed]}
            >
              <Ionicons name="trash-outline" size={15} color={AppColors.textSecondary} />
              <ThemedText style={local.removeText}>{t('common.borrar')}</ThemedText>
            </Pressable>
          </View>
          <TextField label={t('common.nombre')} value={alliance.name} onChange={name => updateAlliance(index, { name })} placeholder="80s" maxLength={40} disabled={submitting} />
          <TextField label={t('anniversary.setup.tematica')} optional value={alliance.theme} onChange={theme => updateAlliance(index, { theme })} placeholder={t('anniversary.setup.losAnos80')} maxLength={60} disabled={submitting} />
          <View style={styles.field}>
            <ThemedText style={styles.label}>{t('anniversary.setup.mascotas')}{' '}<ThemedText style={styles.optional}>{t('anniversary.setup.hastaMaxmascotsOpcional', { maxMascots: MAX_MASCOTS })}</ThemedText></ThemedText>
            <View style={local.mascots}>
              {MASCOTS.map(emoji => {
                const selected = mascotsOf(alliance).includes(emoji);
                return (
                  <Pressable
                    key={emoji}
                    accessibilityRole="checkbox"
                    accessibilityLabel={emoji}
                    accessibilityState={{ checked: selected }}
                    disabled={submitting}
                    onPress={() => updateAlliance(index, { emoji: toggleMascot(alliance.emoji, emoji) })}
                    style={({ pressed }) => [local.mascot, selected && local.mascotSelected, pressed && styles.pressed]}
                  >
                    <ThemedText maxFontSizeMultiplier={1} style={local.mascotText}>{emoji}</ThemedText>
                  </Pressable>
                );
              })}
            </View>
            <TextInput
              accessibilityLabel={t('anniversary.setup.mascotasDeLaAlianzaNumber', { number: index + 1 })}
              value={alliance.emoji}
              onChangeText={emoji => updateAlliance(index, { emoji })}
              placeholder={t('anniversary.setup.oEscribeOtrosEmoji')}
              placeholderTextColor={AppColors.surfaceMuted}
              maxLength={40}
              editable={!submitting}
              autoCorrect={false}
              selectionColor={AppColors.accent}
              style={styles.input}
            />
            {!!alliance.emoji && !looksLikeEmoji(alliance.emoji) && <ThemedText style={styles.hint}>{t('anniversary.setup.lasMascotasSonEmojiSin')}</ThemedText>}
            {mascotsOf(alliance).length > MAX_MASCOTS && <ThemedText style={styles.hint}>{t('anniversary.setup.seGuardanLasPrimerasMaxmascots', { maxMascots: MAX_MASCOTS })}</ThemedText>}
          </View>
          <TextField label={t('anniversary.setup.lema')} optional value={alliance.motto} onChange={motto => updateAlliance(index, { motto })} placeholder={t('anniversary.setup.nadieNosPara')} maxLength={80} disabled={submitting} />
          <TextField
            label={t('anniversary.setup.instagramDeLaAlianza')}
            optional
            value={alliance.instagram}
            onChange={instagram => updateAlliance(index, { instagram })}
            placeholder="@alianza80s"
            keyboardType="email-address"
            maxLength={80}
            disabled={submitting}
          />
          <View style={styles.field}>
            <ThemedText style={styles.label}>{t('anniversary.setup.color')}</ThemedText>
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
                    onPress={() => updateAlliance(index, { color, color2: alliance.color2 === color ? '' : alliance.color2 })}
                    style={({ pressed }) => [local.colorOuter, selected && local.colorSelected, pressed && styles.pressed]}
                  >
                    <View style={[local.color, { backgroundColor: ALLIANCE_COLORS[color].fill }]} />
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View style={styles.field}>
            <ThemedText style={styles.label}>{t('anniversary.setup.segundoColor')}{' '}<ThemedText style={styles.optional}>{t('common.opcional')}</ThemedText></ThemedText>
            <View accessibilityRole="radiogroup" style={local.colors}>
              <Pressable
                accessibilityRole="radio"
                accessibilityLabel={t('anniversary.setup.sinSegundoColor')}
                accessibilityState={{ selected: !alliance.color2 }}
                disabled={submitting}
                onPress={() => updateAlliance(index, { color2: '' })}
                style={({ pressed }) => [local.colorOuter, !alliance.color2 && local.colorSelected, pressed && styles.pressed]}
              >
                <Ionicons name="close" size={20} color={AppColors.textSecondary} />
              </Pressable>
              {ALLIANCE_COLOR_ORDER.filter(color => color !== alliance.color).map(color => {
                const selected = alliance.color2 === color;
                return (
                  <Pressable
                    key={color}
                    accessibilityRole="radio"
                    accessibilityLabel={ALLIANCE_COLORS[color].label}
                    accessibilityState={{ selected }}
                    disabled={submitting}
                    onPress={() => updateAlliance(index, { color2: color })}
                    style={({ pressed }) => [local.colorOuter, selected && local.colorSelected, pressed && styles.pressed]}
                  >
                    <View style={[local.color, { backgroundColor: ALLIANCE_COLORS[color].fill }]} />
                  </Pressable>
                );
              })}
            </View>
            <ThemedText style={styles.hint}>{t('anniversary.setup.comoLaCamisetaDeUn')}</ThemedText>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: expanded.has(index) }}
            onPress={() => toggleExpanded(index)}
            style={({ pressed }) => [local.more, pressed && styles.pressed]}
          >
            <ThemedText style={local.moreText}>{t('anniversary.setup.gritoArtistasYSorteo')}</ThemedText>
            <Ionicons name={expanded.has(index) ? 'chevron-up' : 'chevron-down'} size={16} color={AppColors.textSecondary} />
          </Pressable>
          {expanded.has(index) && (
            <>
              <TextField
                label={t('anniversary.setup.gritoDeBarra')}
                optional
                value={alliance.chant}
                onChange={chant => updateAlliance(index, { chant })}
                placeholder={t('anniversary.setup.ochentaOchentaNadieNosRevienta')}
                multiline
                maxLength={400}
                disabled={submitting}
              />
              <TextField
                label={t('anniversary.setup.artistasQueLesTocaron')}
                optional
                value={alliance.artists}
                onChange={artists => updateAlliance(index, { artists })}
                placeholder={t('anniversary.setup.popJustinBieberKPop')}
                multiline
                maxLength={300}
                disabled={submitting}
              />
              <TextField
                label={t('anniversary.setup.loQueSalioEnEl')}
                optional
                value={alliance.draw}
                onChange={draw => updateAlliance(index, { draw })}
                placeholder={t('anniversary.setup.canastasMiercolesDe12A')}
                multiline
                maxLength={300}
                disabled={submitting}
              />
            </>
          )}
          <View style={styles.field}>
            <ThemedText style={styles.label}>{t('anniversary.setup.cursos')}{' '}<ThemedText style={styles.optional}>({alliance.courseIds.length})</ThemedText></ThemedText>
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
                {!alliance.courseIds.length && !unassigned.length && <ThemedText style={styles.hint}>{t('anniversary.setup.todosLosCursosYaEstan')}</ThemedText>}
              </View>
            )}
          </View>
        </View>
      ))}

      {form.alliances.length < MAX_ALLIANCES && (
        <HanetButton label={t('anniversary.setup.agregarUnaAlianza')} variant="surface" disabled={submitting} onPress={() => update({ alliances: [...form.alliances, blankAlliance(form.alliances.length)] })} />
      )}
      {courses !== null && unassigned.length > 0 && (
        <ThemedText style={styles.hint}>{t('anniversary.setup.sinAlianzaJoin', { join: unassigned.join(', ') })}</ThemedText>
      )}

      {editing && (
        <>
          <View style={styles.field}>
            <ThemedText style={styles.label}>{t('common.marcador')}</ThemedText>
            <HanetChoice
              label={t('common.marcador')}
              options={[{ value: 'shown', label: t('anniversary.setup.visible') }, { value: 'hidden', label: t('anniversary.setup.oculto') }]}
              value={form.scoreHidden ? 'hidden' : 'shown'}
              onChange={value => update({ scoreHidden: value === 'hidden' })}
              disabled={submitting}
            />
            <ThemedText style={styles.hint}>{t('anniversary.setup.soloQuienesOrganizanVenLos')}</ThemedText>
          </View>
          <View style={styles.field}>
            <ThemedText style={styles.label}>{t('anniversary.setup.estado')}</ThemedText>
            <HanetChoice
              label={t('anniversary.setup.estado')}
              options={[{ value: 'live', label: t('anniversary.setup.enCurso') }, { value: 'finished', label: t('anniversary.setup.terminado') }]}
              value={form.finished ? 'finished' : 'live'}
              onChange={value => update({ finished: value === 'finished' })}
              disabled={submitting}
            />
          </View>
        </>
      )}

      <SheetActions label={label} busyLabel={t('common.guardando')} ready={ready && (dirty || !editing)} busy={submitting} onSubmit={submit} error={error} />
      {editing && <HanetButton label={t('anniversary.setup.borrarElAniversario')} variant="surface" disabled={submitting} onPress={() => setDeletingAll(true)} />}

      {removing !== null && form.alliances.length <= 2 ? (
        <HanetDialog
          visible
          onRequestClose={() => setRemoving(null)}
          title={t('anniversary.setup.seNecesitanDosAlianzas')}
          body={t('anniversary.setup.agregaOtraAntesDeBorrar')}
        >
          <HanetDialogActions>
            <HanetButton label={t('events.entendido')} variant="surface" onPress={() => setRemoving(null)} style={dialogStyles.action} />
          </HanetDialogActions>
        </HanetDialog>
      ) : (
        <HanetDialog
          visible={removing !== null}
          onRequestClose={() => setRemoving(null)}
          title={t('anniversary.setup.borrarValue', { value: removing !== null && form.alliances[removing]?.name.trim() ? form.alliances[removing].name.trim() : t('anniversary.setup.laAlianza') })}
          body={t('anniversary.setup.alGuardarSeVanSus')}
        >
          <HanetDialogActions>
            <HanetButton label={t('common.cancelar')} variant="surface" onPress={() => setRemoving(null)} style={dialogStyles.action} />
            <HanetButton label={t('common.borrar')} variant="accent" onPress={() => removing !== null && removeAlliance(removing)} style={dialogStyles.action} />
          </HanetDialogActions>
        </HanetDialog>
      )}
      <HanetDialog
        visible={deletingAll}
        onRequestClose={() => setDeletingAll(false)}
        title={t('anniversary.setup.borrarElAniversario2')}
        body={t('anniversary.setup.seBorranLasAlianzasLas')}
      >
        <HanetDialogActions>
          <HanetButton label={t('common.cancelar')} variant="surface" onPress={() => setDeletingAll(false)} style={dialogStyles.action} />
          <HanetButton label={submitting ? t('common.borrando') : t('common.borrar')} variant="accent" disabled={submitting} onPress={removeAll} style={dialogStyles.action} />
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
  more: {
    minHeight: AppTouch.minimum,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: AppSpacing.lg,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.surface,
  },
  moreText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 14,
    color: AppColors.textSecondary,
  },
});

export default withSheetFrame(SetupScreen, AppColors.surface);
