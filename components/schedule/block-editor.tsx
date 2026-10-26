import { ThemedText } from '@/components/themed-text';
import { CustomIcon } from '@/components/ui/custom-icon';
import { HanetButton } from '@/components/ui/hanet-button';
import { HanetTimeWheels } from '@/components/ui/hanet-date-time-picker';
import { HanetDialog, HanetDialogActions, dialogStyles } from '@/components/ui/hanet-dialog';
import { HanetChoice } from '@/components/ui/hanet-select';
import { AppColors, AppPressed, AppRadii, AppSpacing } from '@/constants/design-tokens';
import { SUBJECTS, findSubject } from '@/constants/subjects';
import { SCHEDULE_DAYS, blocksOn, isBreak, minutesOf, timeOf } from '@/services/schedule-service';
import type { ScheduleBlock } from '@/services/schedule-service';
import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';

// The dialog that adds or edits one timetable block: the day, the start on
// wheels, the length as chips and the subject from the catalog. The course's
// Horario also adds recreos; a Hall's own blocks carry the Hall's subject.

export type BlockKind = 'class' | 'break';

// Block lengths as chips; "Otra" opens the wheels for the end.
const DURATIONS: Record<BlockKind, number[]> = { class: [45, 90, 120, 180], break: [15, 30, 45, 60] };
const BREAK_NAMES = ['Recreo', 'Almuerzo'];
// The course's Horario is the plan común, so its catalog subjects.
const SCHEDULE_SUBJECTS = SUBJECTS.filter(subject => subject.plans.includes('comun'));

type Draft = {
  day: number;
  kind: BlockKind;
  /** Minutes since midnight. */
  start: number;
  /** One of DURATIONS, or null for an end picked on the wheels. */
  duration: number | null;
  end: number;
  /** A catalog subject's name, or null for one written by hand. */
  subject: string | null;
  customSubject: string;
  breakName: string;
  room: string;
};

type Props = {
  /** The block being edited, or null for a new one. */
  block: ScheduleBlock | null;
  /** For a new block: its day and kind. */
  day: number;
  kind?: BlockKind;
  /** The other blocks of the week, to start after them and to warn of clashes. */
  others: ScheduleBlock[];
  /** A Hall's block: no subject to pick and no recreos. */
  hallSubject?: string;
  saving?: boolean;
  error?: string | null;
  onSave: (block: ScheduleBlock) => void;
  onRemove?: () => void;
  onClose: () => void;
};

function normalize(text: string) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function initialDraft({ block, day, kind = 'class', others, hallSubject }: Props): Draft {
  if (block) {
    const start = minutesOf(block.start);
    const end = minutesOf(block.end);
    const blockKind: BlockKind = isBreak(block) ? 'break' : 'class';
    const known = hallSubject ? null : findSubject(block.subject);
    return {
      day: block.day,
      kind: blockKind,
      start,
      duration: DURATIONS[blockKind].includes(end - start) ? end - start : null,
      end,
      subject: blockKind === 'class' && known ? known.name : null,
      customSubject: blockKind === 'class' && !known ? block.subject : '',
      breakName: blockKind === 'break' ? block.subject : BREAK_NAMES[0],
      room: block.room,
    };
  }
  // A new block starts when the day's last one ends.
  const dayBlocks = blocksOn(others, day);
  const previous = dayBlocks[dayBlocks.length - 1];
  const start = previous ? minutesOf(previous.end) : 8 * 60;
  const duration = DURATIONS[kind][0];
  const lastClass = [...dayBlocks].reverse().find(item => !isBreak(item));
  return { day, kind, start, duration, end: start + duration, subject: null, customSubject: '', breakName: BREAK_NAMES[0], room: lastClass?.room ?? '' };
}

/** Mount it to open it; it keeps its own draft until "Listo". */
export function BlockEditor(props: Props) {
  const { block, others, hallSubject, saving, error, onSave, onRemove, onClose } = props;
  const [draft, setDraft] = useState(() => initialDraft(props));
  const [draftError, setDraftError] = useState<string | null>(null);
  // The subject list, shown in place of the form.
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');
  const { height } = useWindowDimensions();

  const end = draft.duration !== null ? draft.start + draft.duration : draft.end;
  const noun = hallSubject ? 'bloque' : draft.kind === 'break' ? 'recreo' : 'clase';
  const title = picking ? 'Asignatura' : block ? `Editar ${noun}` : noun === 'clase' ? 'Nueva clase' : `Nuevo ${noun}`;

  const setKind = (kind: BlockKind) => {
    if (draft.kind === kind) return;
    const duration = DURATIONS[kind][0];
    setDraft({ ...draft, kind, duration, end: draft.start + duration });
  };

  const commit = () => {
    if (end <= draft.start) return setDraftError('El bloque tiene que terminar después de empezar.');
    if (end > 24 * 60) return setDraftError('El bloque tiene que terminar antes de medianoche.');
    const subject = hallSubject ?? (draft.kind === 'break' ? draft.breakName : (draft.subject ?? draft.customSubject.trim()));
    if (!subject) return setDraftError('Elige la asignatura.');
    const clash = blocksOn(others, draft.day).find(item => minutesOf(item.start) < end && draft.start < minutesOf(item.end));
    if (clash) return setDraftError(`Choca con ${clash.subject} (${clash.start} – ${clash.end}).`);
    setDraftError(null);
    onSave({
      id: block?.id ?? `b${Date.now().toString(36)}`,
      day: draft.day,
      start: timeOf(draft.start),
      end: timeOf(end),
      subject,
      room: draft.kind === 'break' ? '' : draft.room.trim(),
      ...(draft.kind === 'break' ? { kind: 'break' as const } : {}),
    });
  };

  const shownError = draftError ?? error;

  return (
    <HanetDialog visible onRequestClose={() => (picking ? setPicking(false) : !saving && onClose())} title={title}>
      {picking ? (
        <View style={styles.form}>
          <TextInput
            accessibilityLabel="Buscar asignatura"
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar"
            placeholderTextColor="rgba(221, 221, 226, 0.4)"
            autoCorrect={false}
            style={styles.input}
            selectionColor={AppColors.accent}
          />
          <ScrollView style={{ maxHeight: height * 0.45 }} contentContainerStyle={styles.subjectList} keyboardShouldPersistTaps="handled">
            {SCHEDULE_SUBJECTS
              .filter(subject => !query.trim() || [subject.name, ...subject.aliases].some(name => normalize(name).includes(normalize(query.trim()))))
              .map(subject => {
                const selected = draft.subject === subject.name;
                return (
                  <Pressable
                    key={subject.id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      if (Platform.OS !== 'web') void Haptics.selectionAsync();
                      setDraft({ ...draft, subject: subject.name, customSubject: '' });
                      setPicking(false);
                    }}
                    style={({ pressed }) => [styles.subjectOption, selected && styles.selected, pressed && AppPressed]}
                  >
                    <ThemedText style={[styles.subjectText, selected && styles.selectedText]}>{subject.name}</ThemedText>
                    {selected && <CustomIcon name="check-circle" size={20} color={AppColors.controlOnActive} />}
                  </Pressable>
                );
              })}
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ selected: draft.subject === null && !!draft.customSubject }}
              onPress={() => { setDraft({ ...draft, subject: null, customSubject: draft.customSubject || query.trim() }); setPicking(false); }}
              style={({ pressed }) => [styles.subjectOption, pressed && AppPressed]}
            >
              <ThemedText style={[styles.subjectText, styles.subjectOther]}>Otra asignatura…</ThemedText>
            </Pressable>
          </ScrollView>
          <HanetButton label="Volver" variant="surface" onPress={() => setPicking(false)} />
        </View>
      ) : (
        <ScrollView style={{ maxHeight: height * 0.7 }} contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.days}>
            {SCHEDULE_DAYS.map(item => (
              <Pressable
                key={item.day}
                accessibilityRole="radio"
                accessibilityLabel={item.name}
                accessibilityState={{ checked: draft.day === item.day }}
                onPress={() => setDraft({ ...draft, day: item.day })}
                style={({ pressed }) => [styles.day, draft.day === item.day && styles.selected, pressed && AppPressed]}
              >
                <ThemedText style={[styles.dayText, draft.day === item.day && styles.selectedText]}>{item.short}</ThemedText>
              </Pressable>
            ))}
          </View>

          {!hallSubject && (
            <HanetChoice
              label="Tipo de bloque"
              options={[{ value: 'class', label: 'Clase' }, { value: 'break', label: 'Recreo' }]}
              value={draft.kind}
              onChange={value => setKind(value as BlockKind)}
            />
          )}

          {!hallSubject && (draft.kind === 'class' ? (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Asignatura: ${draft.subject ?? (draft.customSubject || 'sin elegir')}`}
                accessibilityHint="Abre la lista de asignaturas"
                onPress={() => { setQuery(''); setPicking(true); }}
                style={({ pressed }) => [styles.field, pressed && AppPressed]}
              >
                <ThemedText numberOfLines={1} style={[styles.fieldText, !draft.subject && !draft.customSubject && styles.fieldPlaceholder]}>
                  {draft.subject ?? (draft.customSubject ? 'Otra asignatura' : 'Elegir asignatura')}
                </ThemedText>
                <CustomIcon name="chevron-right" size={18} color={AppColors.textSecondary} />
              </Pressable>
              {draft.subject === null && (
                <TextInput accessibilityLabel="Nombre de la asignatura" value={draft.customSubject} onChangeText={customSubject => setDraft({ ...draft, customSubject })} placeholder="Nombre de la asignatura" placeholderTextColor="rgba(221, 221, 226, 0.4)" maxLength={40} style={styles.input} selectionColor={AppColors.accent} />
              )}
            </>
          ) : (
            <HanetChoice
              label="Nombre del recreo"
              options={BREAK_NAMES.map(name => ({ value: name, label: name }))}
              value={draft.breakName}
              onChange={breakName => setDraft({ ...draft, breakName })}
            />
          ))}

          <View style={styles.timeRow}>
            <ThemedText style={styles.label}>Empieza</ThemedText>
            <HanetTimeWheels label="Empieza" minutes={draft.start} onChange={start => setDraft({ ...draft, start })} />
          </View>

          <ThemedText style={styles.label}>Duración</ThemedText>
          <HanetChoice
            label="Duración"
            options={[...DURATIONS[draft.kind].map(minutes => ({ value: String(minutes), label: `${minutes} min` })), { value: 'other', label: 'Otra' }]}
            value={draft.duration === null ? 'other' : String(draft.duration)}
            onChange={value => setDraft(value === 'other' ? { ...draft, duration: null, end } : { ...draft, duration: Number(value) })}
          />
          {draft.duration === null && (
            <View style={styles.timeRow}>
              <ThemedText style={styles.label}>Termina</ThemedText>
              <HanetTimeWheels label="Termina" minutes={draft.end} onChange={value => setDraft({ ...draft, end: value })} />
            </View>
          )}
          <ThemedText style={styles.range} accessibilityLiveRegion="polite">
            {timeOf(draft.start)} – {end < 24 * 60 ? timeOf(end) : '…'}
            {end > draft.start ? ` · ${end - draft.start} min` : ''}
          </ThemedText>

          {draft.kind === 'class' && (
            <TextInput accessibilityLabel="Sala (opcional)" value={draft.room} onChangeText={room => setDraft({ ...draft, room })} placeholder="Sala (opcional)" placeholderTextColor="rgba(221, 221, 226, 0.4)" maxLength={20} style={styles.input} selectionColor={AppColors.accent} />
          )}
          {!!shownError && <ThemedText accessibilityLiveRegion="assertive" style={styles.error}>{shownError}</ThemedText>}
          <HanetDialogActions>
            <HanetButton label="Cancelar" variant="surface" disabled={saving} onPress={onClose} style={dialogStyles.action} />
            <HanetButton label={saving ? 'Guardando…' : 'Listo'} disabled={saving} onPress={commit} style={dialogStyles.action} />
          </HanetDialogActions>
          {!!block && !!onRemove && <HanetButton label={`Quitar ${noun}`} variant="surface" disabled={saving} onPress={onRemove} />}
        </ScrollView>
      )}
    </HanetDialog>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: AppSpacing.sm,
  },
  days: {
    flexDirection: 'row',
    gap: 6,
  },
  day: {
    flex: 1,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.surfaceMuted,
  },
  dayText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 15,
    lineHeight: 20,
    color: AppColors.textPrimary,
  },
  selected: {
    backgroundColor: AppColors.controlActive,
  },
  selectedText: {
    color: AppColors.controlOnActive,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 15,
    lineHeight: 20,
    color: AppColors.textPrimary,
  },
  range: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  field: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
    paddingHorizontal: AppSpacing.lg,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.canvas,
  },
  fieldText: {
    flex: 1,
    fontFamily: 'DMSans_500Medium',
    fontSize: 16,
    lineHeight: 22,
    color: AppColors.textPrimary,
  },
  fieldPlaceholder: {
    color: AppColors.textSecondary,
    opacity: 0.6,
  },
  subjectList: {
    gap: 6,
  },
  subjectOption: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
    paddingHorizontal: AppSpacing.lg,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.surfaceMuted,
  },
  subjectText: {
    flex: 1,
    fontFamily: 'DMSans_500Medium',
    fontSize: 16,
    lineHeight: 22,
    color: AppColors.textPrimary,
  },
  subjectOther: {
    color: AppColors.textSecondary,
  },
  input: {
    height: 48,
    paddingHorizontal: AppSpacing.lg,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.canvas,
    fontFamily: 'DMSans_500Medium',
    fontSize: 16,
    color: AppColors.textPrimary,
    outlineStyle: 'none' as never,
  },
  error: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.errorText,
  },
});
