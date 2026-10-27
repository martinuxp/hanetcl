import { AlliancePicker, SheetActions, SheetBody, formStyles as styles } from '@/components/anniversary/anniversary-form';
import { ThemedText } from '@/components/themed-text';
import { HanetButton } from '@/components/ui/hanet-button';
import { withSheetFrame } from '@/components/ui/sheet-frame';
import { AppColors, AppRadii, AppSpacing, AppType } from '@/constants/design-tokens';
import { describeAuthError } from '@/services/auth-service';
import { listLeadCandidates, peekAnniversary, setAllianceLeads } from '@/services/anniversary-service';
import type { LeadCandidate } from '@/services/anniversary-service';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

const MAX_LEADS = 4;

/** The leads of each alianza: they get the flash tests and the deadlines. */
function LeadsScreen() {
  const router = useRouter();
  const alliances = peekAnniversary()?.anniversary?.alliances ?? [];
  const [allianceId, setAllianceId] = useState<string | null>(alliances[0]?.id ?? null);
  const alliance = alliances.find(item => item.id === allianceId);
  const [loaded, setLoaded] = useState<{ allianceId: string; people: LeadCandidate[] } | null>(null);
  const [loadError, setLoadError] = useState<{ allianceId: string; message: string } | null>(null);
  const [chosen, setChosen] = useState<string[]>(alliance?.leadUids ?? []);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!allianceId) return;
    let active = true;
    listLeadCandidates(allianceId)
      .then(list => { if (active) setLoaded({ allianceId, people: list }); })
      .catch(failure => { if (active) setLoadError({ allianceId, message: describeAuthError(failure, 'No pudimos cargar a los estudiantes.') }); });
    return () => { active = false; };
  }, [allianceId]);
  const people = loaded?.allianceId === allianceId ? loaded.people : null;

  const pick = (id: string) => {
    const next = alliances.find(item => item.id === id);
    setAllianceId(id);
    setError(null);
    setChosen(next?.leadUids ?? []);
  };

  const toggle = (uid: string) => {
    setError(null);
    setChosen(current => (current.includes(uid) ? current.filter(item => item !== uid) : current.length < MAX_LEADS ? [...current, uid] : current));
  };

  const dirty = JSON.stringify([...chosen].sort()) !== JSON.stringify([...(alliance?.leadUids ?? [])].sort());

  const submit = async () => {
    if (!allianceId || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await setAllianceLeads(allianceId, chosen);
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSubmitting(false);
    } catch (saveError) {
      setError(describeAuthError(saveError, 'No pudimos guardar a los jefes. Inténtalo nuevamente.'));
      setSubmitting(false);
    }
  };

  return (
    <SheetBody title="Jefes de alianza" lead={`Hasta ${MAX_LEADS} por alianza, de sus propios cursos. Les llegan las pruebas flash y los plazos.`}>
      <AlliancePicker alliances={alliances} value={allianceId} onChange={pick} disabled={submitting} />
      {!alliance?.courseIds.length ? (
        <ThemedText style={styles.hint}>Esta alianza todavía no tiene cursos. Agrégalos en “Alianzas y fechas”.</ThemedText>
      ) : people === null ? (
        <ThemedText style={styles.hint}>{loadError?.allianceId === allianceId ? loadError.message : 'Cargando a los estudiantes…'}</ThemedText>
      ) : people.length === 0 ? (
        <ThemedText style={styles.hint}>Nadie de esos cursos tiene cuenta en HaNet todavía.</ThemedText>
      ) : (
        <View style={local.list}>
          {people.map(person => {
            const selected = chosen.includes(person.uid);
            return (
              <Pressable
                key={person.uid}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected, disabled: submitting }}
                accessibilityLabel={`${person.name}, ${person.courseId}`}
                disabled={submitting || (!selected && chosen.length >= MAX_LEADS)}
                onPress={() => toggle(person.uid)}
                style={({ pressed }) => [local.row, selected && local.rowOn, pressed && styles.pressed]}
              >
                <View style={local.text}>
                  <ThemedText style={[local.name, selected && local.nameOn]}>{person.name}</ThemedText>
                  <ThemedText style={[local.course, selected && local.nameOn]}>{person.courseId}</ThemedText>
                </View>
                <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={selected ? AppColors.controlOnActive : AppColors.textSecondary} />
              </Pressable>
            );
          })}
        </View>
      )}
      <SheetActions label="Guardar jefes" busyLabel="Guardando…" ready={dirty} busy={submitting} onSubmit={submit} error={error} />
      {!dirty && <HanetButton label="Listo" variant="surface" onPress={() => router.back()} />}
    </SheetBody>
  );
}

const local = StyleSheet.create({
  list: {
    gap: AppSpacing.sm,
  },
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
    paddingHorizontal: AppSpacing.lg,
    paddingVertical: AppSpacing.sm,
    borderRadius: AppRadii.md,
    borderCurve: 'continuous',
    backgroundColor: AppColors.canvas,
  },
  rowOn: {
    backgroundColor: AppColors.controlActive,
  },
  text: {
    flex: 1,
  },
  name: {
    ...AppType.headline,
    color: AppColors.textPrimary,
  },
  nameOn: {
    color: AppColors.controlOnActive,
  },
  course: {
    ...AppType.footnote,
    color: AppColors.textSecondary,
  },
});

export default withSheetFrame(LeadsScreen, AppColors.surface);
