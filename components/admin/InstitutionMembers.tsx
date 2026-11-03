import { ThemedText } from '@/components/themed-text';
import { AlertModal } from '@/components/ui/alert-modal';
import { HanetButton } from '@/components/ui/hanet-button';
import { AppColors, AppPressed, AppRadii, AppSpacing, AppTouch } from '@/constants/design-tokens';
import { describeAuthError } from '@/services/auth-service';
import { joinInstitution, listMembers, MEMBER_ROLES, setMemberBlocked, setMemberRole, unlinkMember } from '@/services/hnt-admin-service';
import type { Member, MemberRole } from '@/services/hnt-admin-service';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { t } from '@/i18n';

const ROLE_NOTES: Record<MemberRole, string> = {
  Estudiante: t('components.admin.institutionMembers.veElCalendarioDeSu'),
  Directiva: t('components.admin.institutionMembers.directivaDeCursoPublicaEn'),
  CEE: t('components.admin.institutionMembers.centroDeEstudiantesPublicaEn'),
  Profesor: t('components.admin.institutionMembers.docenteCreaHallsEnClasshall'),
  Admin: t('components.admin.institutionMembers.administracionDeLaInstitucionPublica'),
  HNT: t('components.admin.institutionMembers.equipoHanetAdemasEntraA'),
};

// The list grows a page at a time instead of drawing everyone at once;
// searching narrows it down.
const PAGE_ROWS = 40;

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
  const [visibleRows, setVisibleRows] = useState(PAGE_ROWS);

  const [selected, setSelected] = useState<Member | null>(null);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
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
        if (active) setError(describeAuthError(loadError, t('components.admin.institutionMembers.noPudimosCargarLasPersonas')));
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
    setConfirmBlock(false);
    setDialogError(null);
  };

  // Blocking disables the HaNet ID: it cannot sign in and its session ends.
  const toggleBlocked = async () => {
    if (!selected?.uid || busy) return;
    const blocked = !selected.blocked;
    setBusy(true);
    setDialogError(null);
    try {
      await setMemberBlocked(selected.uid, blocked);
      const updated = { ...selected, blocked };
      setSelected(updated);
      setMembers(list => list.map(member => (member.rut === updated.rut ? updated : member)));
      setConfirmBlock(false);
    } catch (blockError) {
      setDialogError(describeAuthError(blockError, blocked ? t('components.admin.institutionMembers.noPudimosBloquearEstaCuenta') : t('components.admin.institutionMembers.noPudimosDesbloquearEstaCuenta')));
    } finally {
      setBusy(false);
    }
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
      setDialogError(describeAuthError(roleError, t('components.admin.institutionMembers.noPudimosCambiarElRol')));
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
      setDialogError(describeAuthError(unlinkError, t('components.admin.institutionMembers.noPudimosDesvincularAEsta')));
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    setJoining(true);
    setJoinNote(null);
    try {
      await joinInstitution(institutionId);
      setJoinNote(t('components.admin.institutionMembers.listoTuPerfilAhoraFigura', { institutionName }));
    } catch (joinError) {
      setJoinNote(describeAuthError(joinError, t('components.admin.institutionMembers.noPudimosAsignarTuCuenta')));
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
        <HanetButton label={t('common.reintentar')} variant="surface" onPress={retry} />
      </View>
    );
  }

  const isSelf = selected?.uid === currentUid;

  return (
    <View style={styles.wrap}>
      <ThemedText style={styles.summary}>
        {members.length === 0
          ? t('components.admin.institutionMembers.laListaEstaVaciaCargala')
          : t('components.admin.institutionMembers.linkedcountDeCountPersonasVincularon', { count: members.length, linkedCount })}
        {truncated ? t('components.admin.institutionMembers.seMuestranLasPrimeras1') : ''}
      </ThemedText>

      {members.length > 8 && (
        <TextInput
          accessibilityLabel={t('components.admin.institutionMembers.buscarPersona')}
          value={search}
          onChangeText={text => { setSearch(text); setVisibleRows(PAGE_ROWS); }}
          placeholder={t('components.admin.institutionMembers.buscarPorNombreCursoO')}
          placeholderTextColor="rgba(221,221,226,0.4)"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.search}
        />
      )}

      {filtered.slice(0, visibleRows).map(member => {
        const linked = !!member.uid;
        return (
          <Pressable
            key={member.rut}
            accessibilityRole="button"
            accessibilityLabel={`${member.fullName}, ${member.curso}, ${linked ? member.role : t('components.admin.institutionMembers.sinVincular')}`}
            accessibilityState={{ disabled: !linked }}
            disabled={!linked}
            onPress={() => setSelected(member)}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <View style={styles.rowText}>
              <ThemedText style={[styles.rowName, !linked && styles.rowMuted]} numberOfLines={1}>{member.fullName}</ThemedText>
              <ThemedText style={styles.rowDetail} numberOfLines={1}>{member.curso}</ThemedText>
            </View>
            <View style={[styles.badge, linked && member.role !== 'Estudiante' && styles.badgeStrong, member.blocked && styles.badgeBlocked]}>
              <ThemedText style={[styles.badgeText, linked && member.role !== 'Estudiante' && styles.badgeTextStrong, member.blocked && styles.badgeTextBlocked]}>
                {member.blocked ? t('components.admin.institutionMembers.bloqueada') : linked ? member.role : t('components.admin.institutionMembers.sinVincular2')}
              </ThemedText>
            </View>
          </Pressable>
        );
      })}

      {filtered.length > visibleRows && (
        <View style={styles.more}>
          <ThemedText style={styles.note}>{t('components.admin.institutionMembers.seMuestranVisiblerowsDeFilteredcount', { visibleRows, filteredCount: filtered.length })}</ThemedText>
          <HanetButton
            label={t('components.admin.institutionMembers.mostrarPagerowsMas', { pageRows: Math.min(PAGE_ROWS, filtered.length - visibleRows) })}
            variant="surface"
            onPress={() => setVisibleRows(count => count + PAGE_ROWS)}
          />
        </View>
      )}
      {members.length > 0 && filtered.length === 0 && <ThemedText style={styles.note}>{t('components.admin.institutionMembers.nadieCoincideConEsaBusqueda')}</ThemedText>}

      <View style={styles.join}>
        <ThemedText style={styles.note}>
          {t('components.admin.institutionMembers.tuPropioPerfilNoMuestra')}
        </ThemedText>
        <HanetButton label={joining ? t('components.admin.institutionMembers.asignando') : t('components.admin.institutionMembers.asignarMiCuentaAInstitutionname', { institutionName })} variant="surface" onPress={join} disabled={joining} />
        {!!joinNote && <ThemedText accessibilityLiveRegion="polite" style={styles.note}>{joinNote}</ThemedText>}
      </View>

      <AlertModal visible={!!selected} onRequestClose={closeDialog}>
        <View style={styles.overlay}>
          <Pressable accessibilityLabel={t('common.cerrar')} style={StyleSheet.absoluteFill} onPress={closeDialog} />
          {!!selected && (
            <View accessibilityViewIsModal style={styles.dialog}>
              <ThemedText style={styles.dialogTitle}>{selected.fullName}</ThemedText>
              <ThemedText style={styles.dialogBody}>{selected.curso} · {selected.email}</ThemedText>

              {confirmBlock ? (
                <>
                  <ThemedText style={styles.dialogBody}>
                    {selected.blocked
                      ? t('components.admin.institutionMembers.podraVolverAIniciarSesion')
                      : t('components.admin.institutionMembers.seCerraraSuSesionY')}
                  </ThemedText>
                  {!!dialogError && <ThemedText accessibilityLiveRegion="assertive" style={styles.error}>{dialogError}</ThemedText>}
                  <View style={styles.dialogActions}>
                    <HanetButton label={t('common.cancelar')} variant="surface" onPress={() => { setConfirmBlock(false); setDialogError(null); }} disabled={busy} style={styles.dialogAction} />
                    <HanetButton
                      label={busy ? t('common.guardando') : selected.blocked ? t('components.admin.institutionMembers.desbloquear') : t('components.admin.institutionMembers.bloquear')}
                      variant="accent"
                      onPress={toggleBlocked}
                      disabled={busy}
                      style={styles.dialogAction}
                    />
                  </View>
                </>
              ) : confirmUnlink ? (
                <>
                  <ThemedText style={styles.dialogBody}>
                    {t('components.admin.institutionMembers.alDesvincularlaPierdeSuRol')}
                  </ThemedText>
                  {!!dialogError && <ThemedText accessibilityLiveRegion="assertive" style={styles.error}>{dialogError}</ThemedText>}
                  <View style={styles.dialogActions}>
                    <HanetButton label={t('common.cancelar')} variant="surface" onPress={() => { setConfirmUnlink(false); setDialogError(null); }} disabled={busy} style={styles.dialogAction} />
                    <HanetButton label={busy ? t('components.admin.institutionMembers.desvinculando') : t('components.admin.institutionMembers.desvincular')} variant="accent" onPress={unlink} disabled={busy} style={styles.dialogAction} />
                  </View>
                </>
              ) : (
                <>
                  {isSelf ? (
                    <ThemedText style={styles.dialogBody}>{t('components.admin.institutionMembers.estaEsTuCuentaNo')}</ThemedText>
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
                      {t('components.admin.institutionMembers.elRolSeGuardaAl')}
                    </ThemedText>
                  )}

                  {!isSelf && (
                    <HanetButton
                      label={selected.blocked ? t('components.admin.institutionMembers.desbloquearCuenta') : t('components.admin.institutionMembers.bloquearCuenta')}
                      variant="surface"
                      onPress={() => { setDialogError(null); setConfirmBlock(true); }}
                      disabled={busy}
                    />
                  )}
                  <View style={styles.dialogActions}>
                    {!isSelf && <HanetButton label={t('components.admin.institutionMembers.desvincular')} variant="surface" onPress={() => setConfirmUnlink(true)} disabled={busy} style={styles.dialogAction} />}
                    <HanetButton label={t('common.listo')} onPress={closeDialog} disabled={busy} style={styles.dialogAction} />
                  </View>
                </>
              )}
            </View>
          )}
        </View>
      </AlertModal>
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
  badgeBlocked: {
    backgroundColor: AppColors.accent,
  },
  badgeTextBlocked: {
    color: AppColors.textOnLight,
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
  more: {
    gap: AppSpacing.sm,
  },
  pressed: AppPressed,
});
