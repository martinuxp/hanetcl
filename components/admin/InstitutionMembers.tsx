import { ThemedText } from '@/components/themed-text';
import { HanetButton } from '@/components/ui/hanet-button';
import { AppColors, AppRadii, AppSpacing, AppTouch } from '@/constants/design-tokens';
import { describeAuthError } from '@/services/auth-service';
import { joinInstitution, listMembers, MEMBER_ROLES, setMemberRole, unlinkMember } from '@/services/hnt-admin-service';
import type { Member, MemberRole } from '@/services/hnt-admin-service';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';

const ROLE_NOTES: Record<MemberRole, string> = {
  Estudiante: 'Ve el calendario de su curso.',
  Directiva: 'Directiva de curso. Publica en el calendario de su curso.',
  CEE: 'Centro de estudiantes. Publica en el calendario de su curso.',
  Profesor: 'Docente. Crea Halls en ClassHall y publica en ellos.',
  Admin: 'Administración de la institución. Publica en el calendario.',
  HNT: 'Equipo HaNet. Además, entra a este panel.',
};

// More rows than this would make the card endless; searching narrows it down.
const VISIBLE_ROWS = 40;

type Props = {
  institutionId: string;
  institutionName: string;
  /** The signed-in account: it cannot change its own role or unlink itself. */
  currentUid: string;
};

export function InstitutionMembers({ institutionId, institutionName, currentUid }: Props) {
  const [members, setMembers] = useState<Member[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [selected, setSelected] = useState<Member | null>(null);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const [joining, setJoining] = useState(false);
  const [joinNote, setJoinNote] = useState<string | null>(null);

  // Bumped by "Reintentar" to run the load again.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    listMembers(institutionId)
      .then(result => {
        if (!active) return;
        setMembers(result.members);
        setTruncated(result.truncated);
      })
      .catch(loadError => {
        if (active) setError(describeAuthError(loadError, 'No pudimos cargar las personas. Inténtalo nuevamente.'));
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt, institutionId]);

  const retry = () => {
    setLoading(true);
    setError(null);
    setAttempt(count => count + 1);
  };

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('es');
    if (!term) return members;
    return members.filter(member =>
      `${member.fullName} ${member.curso} ${member.email} ${member.role ?? ''}`.toLocaleLowerCase('es').includes(term),
    );
  }, [members, search]);

  const linkedCount = members.filter(member => member.uid).length;

  const closeDialog = () => {
    if (busy) return;
    setSelected(null);
    setConfirmUnlink(false);
    setDialogError(null);
  };

  // The new role shows at once and is rolled back if saving fails.
  const changeRole = async (role: MemberRole) => {
    if (!selected?.uid || busy || role === selected.role) return;
    const previous = selected;
    const updated = { ...selected, role };
    setSelected(updated);
    setMembers(list => list.map(member => (member.rut === updated.rut ? updated : member)));
    setBusy(true);
    setDialogError(null);
    try {
      await setMemberRole(selected.uid, role);
    } catch (roleError) {
      setSelected(previous);
      setMembers(list => list.map(member => (member.rut === previous.rut ? previous : member)));
      setDialogError(describeAuthError(roleError, 'No pudimos cambiar el rol. Inténtalo nuevamente.'));
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    if (!selected?.uid || busy) return;
    setBusy(true);
    setDialogError(null);
    try {
      await unlinkMember(selected.uid);
      setMembers(list => list.map(member => (member.rut === selected.rut ? { ...member, uid: null, role: null } : member)));
      setSelected(null);
      setConfirmUnlink(false);
    } catch (unlinkError) {
      setDialogError(describeAuthError(unlinkError, 'No pudimos desvincular a esta persona. Inténtalo nuevamente.'));
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    setJoining(true);
    setJoinNote(null);
    try {
      await joinInstitution(institutionId);
      setJoinNote(`Listo: tu perfil ahora figura en ${institutionName}.`);
    } catch (joinError) {
      setJoinNote(describeAuthError(joinError, 'No pudimos asignar tu cuenta. Inténtalo nuevamente.'));
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return <ActivityIndicator color={AppColors.textSecondary} style={styles.spinner} />;
  }

  if (error) {
    return (
      <View style={styles.wrap}>
        <ThemedText accessibilityLiveRegion="assertive" style={styles.error}>{error}</ThemedText>
        <HanetButton label="Reintentar" variant="surface" onPress={retry} />
      </View>
    );
  }

  const isSelf = selected?.uid === currentUid;

  return (
    <View style={styles.wrap}>
      <ThemedText style={styles.summary}>
        {members.length === 0
          ? 'La lista está vacía. Cárgala con "Cargar lista".'
          : `${linkedCount} de ${members.length} ${members.length === 1 ? 'persona vinculó' : 'personas vincularon'} su HaNet ID.`}
        {truncated ? ' Se muestran las primeras 1.000.' : ''}
      </ThemedText>

      {members.length > 8 && (
        <TextInput
          accessibilityLabel="Buscar persona"
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar por nombre, curso o rol"
          placeholderTextColor="rgba(221,221,226,0.4)"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.search}
        />
      )}

      {filtered.slice(0, VISIBLE_ROWS).map(member => {
        const linked = !!member.uid;
        return (
          <Pressable
            key={member.rut}
            accessibilityRole="button"
            accessibilityLabel={`${member.fullName}, ${member.curso}, ${linked ? member.role : 'sin vincular'}`}
            accessibilityState={{ disabled: !linked }}
            disabled={!linked}
            onPress={() => setSelected(member)}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <View style={styles.rowText}>
              <ThemedText style={[styles.rowName, !linked && styles.rowMuted]} numberOfLines={1}>{member.fullName}</ThemedText>
              <ThemedText style={styles.rowDetail} numberOfLines={1}>{member.curso}</ThemedText>
            </View>
            <View style={[styles.badge, linked && member.role !== 'Estudiante' && styles.badgeStrong]}>
              <ThemedText style={[styles.badgeText, linked && member.role !== 'Estudiante' && styles.badgeTextStrong]}>
                {linked ? member.role : 'Sin vincular'}
              </ThemedText>
            </View>
          </Pressable>
        );
      })}

      {filtered.length > VISIBLE_ROWS && (
        <ThemedText style={styles.note}>Se muestran {VISIBLE_ROWS} de {filtered.length}. Usa el buscador para encontrar a alguien.</ThemedText>
      )}
      {members.length > 0 && filtered.length === 0 && <ThemedText style={styles.note}>Nadie coincide con esa búsqueda.</ThemedText>}

      <View style={styles.join}>
        <ThemedText style={styles.note}>
          ¿Tu propio perfil no muestra institución? Pasa con las cuentas creadas antes de que existieran las instituciones.
        </ThemedText>
        <HanetButton label={joining ? 'Asignando…' : `Asignar mi cuenta a ${institutionName}`} variant="surface" onPress={join} disabled={joining} />
        {!!joinNote && <ThemedText accessibilityLiveRegion="polite" style={styles.note}>{joinNote}</ThemedText>}
      </View>

      <Modal visible={!!selected} transparent animationType="fade" statusBarTranslucent onRequestClose={closeDialog}>
        <View style={styles.overlay}>
          <Pressable accessibilityLabel="Cerrar" style={StyleSheet.absoluteFill} onPress={closeDialog} />
          {!!selected && (
            <View accessibilityViewIsModal style={styles.dialog}>
              <ThemedText style={styles.dialogTitle}>{selected.fullName}</ThemedText>
              <ThemedText style={styles.dialogBody}>{selected.curso} · {selected.email}</ThemedText>

              {confirmUnlink ? (
                <>
                  <ThemedText style={styles.dialogBody}>
                    Al desvincularla pierde su rol y el acceso al calendario de su curso. Conserva su HaNet ID y puede volver a vincularse con su correo institucional.
                  </ThemedText>
                  {!!dialogError && <ThemedText accessibilityLiveRegion="assertive" style={styles.error}>{dialogError}</ThemedText>}
                  <View style={styles.dialogActions}>
                    <HanetButton label="Cancelar" variant="surface" onPress={() => { setConfirmUnlink(false); setDialogError(null); }} disabled={busy} style={styles.dialogAction} />
                    <HanetButton label={busy ? 'Desvinculando…' : 'Desvincular'} variant="accent" onPress={unlink} disabled={busy} style={styles.dialogAction} />
                  </View>
                </>
              ) : (
                <>
                  {isSelf ? (
                    <ThemedText style={styles.dialogBody}>Esta es tu cuenta. No puedes cambiar tu propio rol ni desvincularte.</ThemedText>
                  ) : (
                    <View accessibilityRole="radiogroup" style={styles.roles}>
                      {MEMBER_ROLES.map(role => {
                        const active = selected.role === role;
                        return (
                          <Pressable
                            key={role}
                            accessibilityRole="radio"
                            accessibilityLabel={`${role}. ${ROLE_NOTES[role]}`}
                            accessibilityState={{ checked: active, disabled: busy }}
                            disabled={busy}
                            onPress={() => changeRole(role)}
                            style={({ pressed }) => [styles.role, active && styles.roleActive, pressed && !active && styles.pressed]}
                          >
                            <ThemedText style={[styles.roleName, active && styles.roleNameActive]}>{role}</ThemedText>
                            <ThemedText style={[styles.roleNote, active && styles.roleNoteActive]}>{ROLE_NOTES[role]}</ThemedText>
                          </Pressable>
                        );
                      })}
                    </View>
                  )}

                  {!!dialogError && <ThemedText accessibilityLiveRegion="assertive" style={styles.error}>{dialogError}</ThemedText>}
                  {!isSelf && (
                    <ThemedText style={styles.note}>
                      El rol se guarda al elegirlo. La persona lo verá la próxima vez que abra la app; puede tardar hasta una hora.
                    </ThemedText>
                  )}

                  <View style={styles.dialogActions}>
                    {!isSelf && <HanetButton label="Desvincular" variant="surface" onPress={() => setConfirmUnlink(true)} disabled={busy} style={styles.dialogAction} />}
                    <HanetButton label="Listo" onPress={closeDialog} disabled={busy} style={styles.dialogAction} />
                  </View>
                </>
              )}
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: AppSpacing.sm,
    paddingTop: AppSpacing.sm,
  },
  spinner: {
    marginVertical: AppSpacing.xl,
  },
  summary: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.textPrimary,
  },
  search: {
    minHeight: AppTouch.minimum,
    paddingHorizontal: AppSpacing.lg,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.canvas,
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    color: AppColors.textPrimary,
    outlineStyle: 'none' as never,
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
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowName: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 15,
    lineHeight: 20,
    color: AppColors.textPrimary,
  },
  rowMuted: {
    opacity: 0.6,
  },
  rowDetail: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
    lineHeight: 16,
    color: AppColors.textSecondary,
    opacity: 0.8,
  },
  badge: {
    paddingHorizontal: AppSpacing.md,
    paddingVertical: 6,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.surfaceMuted,
  },
  badgeStrong: {
    backgroundColor: AppColors.controlActive,
  },
  badgeText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 12,
    lineHeight: 16,
    color: AppColors.textSecondary,
  },
  badgeTextStrong: {
    color: AppColors.controlOnActive,
  },
  note: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
    lineHeight: 17,
    color: AppColors.textSecondary,
    opacity: 0.85,
  },
  error: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.errorText,
  },
  join: {
    gap: AppSpacing.sm,
    marginTop: AppSpacing.md,
    paddingTop: AppSpacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: AppColors.surfaceMuted,
  },
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: AppSpacing.xl,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  dialog: {
    width: '100%',
    maxWidth: 400,
    padding: AppSpacing.xl,
    gap: AppSpacing.md,
    borderRadius: AppRadii.xl,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  dialogTitle: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: -0.4,
    color: AppColors.textPrimary,
  },
  dialogBody: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.textSecondary,
  },
  roles: {
    gap: AppSpacing.xs,
  },
  role: {
    paddingHorizontal: AppSpacing.lg,
    paddingVertical: AppSpacing.md,
    borderRadius: AppRadii.md,
    borderCurve: 'continuous',
    backgroundColor: AppColors.canvas,
  },
  roleActive: {
    backgroundColor: AppColors.controlActive,
  },
  roleName: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 15,
    lineHeight: 20,
    color: AppColors.textPrimary,
  },
  roleNameActive: {
    color: AppColors.controlOnActive,
  },
  roleNote: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
    lineHeight: 16,
    color: AppColors.textSecondary,
  },
  roleNoteActive: {
    color: AppColors.controlOnActive,
  },
  dialogActions: {
    flexDirection: 'row',
    gap: AppSpacing.sm,
    marginTop: AppSpacing.sm,
  },
  dialogAction: {
    flex: 1,
  },
  pressed: {
    opacity: 0.6,
  },
});
