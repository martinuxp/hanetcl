import { TAB_BAR_CLEARANCE } from '@/components/AppTabBar';
import { HanetDialog, HanetDialogActions, dialogStyles } from '@/components/ui/hanet-dialog';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { InstitutionMembers } from '@/components/admin/InstitutionMembers';
import InstitutionBanner from '@/components/InstitutionBanner';
import { ThemedText } from '@/components/themed-text';
import { HanetField } from '@/components/ui/hanet-auth-fields';
import { HanetButton } from '@/components/ui/hanet-button';
import { PushTestCard } from '@/components/hnt/PushTestCard';
import { AppColors, AppPressed, AppRadii, AppSpacing } from '@/constants/design-tokens';
import { describeAuthError, ensureClaims, useSession } from '@/services/auth-service';
import {
  createInstitution,
  importRoster,
  pickBrandingImage,
  removeBrandingImage,
  uploadBrandingImage,
  listInstitutions,
  parseRoster,
  rotateInviteCode,
} from '@/services/hnt-admin-service';
import type { AdminInstitution, BrandingKind, RosterImportResult } from '@/services/hnt-admin-service';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { FrostedScreen, withTopInset } from '@/components/ui/frosted-screen';
import { t } from '@/i18n';


type Access = 'checking' | 'granted' | 'denied';
type CodeDialog =
  | { kind: 'confirm'; institution: AdminInstitution }
  | { kind: 'shown'; institution: AdminInstitution; words: string[]; copied: boolean };

// Enough to scan at a glance; the search finds the rest.
const INSTITUTIONS_PAGE = 10;

function formatDate(millis: number) {
  return new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(millis));
}

export default function HntAdminScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, initializing } = useSession();

  const [access, setAccess] = useState<Access>('checking');
  const [institutions, setInstitutions] = useState<AdminInstitution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [fullName, setFullName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [codeDialog, setCodeDialog] = useState<CodeDialog | null>(null);
  const [rotating, setRotating] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  const [rosterFor, setRosterFor] = useState<string | null>(null);
  const [membersFor, setMembersFor] = useState<string | null>(null);
  const [rosterText, setRosterText] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<(RosterImportResult & { headerRows: number }) | null>(null);

  const parsed = useMemo(() => parseRoster(rosterText), [rosterText]);

  // Institutions show as a compact list, a page at a time; one opens at once.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [institutionSearch, setInstitutionSearch] = useState('');
  const [institutionLimit, setInstitutionLimit] = useState(INSTITUTIONS_PAGE);
  const filteredInstitutions = useMemo(() => {
    const term = institutionSearch.trim().toLocaleLowerCase('es');
    if (!term) return institutions;
    return institutions.filter(item => `${item.name} ${item.fullName}`.toLocaleLowerCase('es').includes(term));
  }, [institutions, institutionSearch]);

  const [brandingBusy, setBrandingBusy] = useState<{ id: string; kind: BrandingKind } | null>(null);
  const [brandingError, setBrandingError] = useState<{ id: string; message: string } | null>(null);

  const changeBranding = async (institution: AdminInstitution, kind: BrandingKind) => {
    if (brandingBusy) return;
    const localUri = await pickBrandingImage();
    if (!localUri) return;
    setBrandingBusy({ id: institution.id, kind });
    setBrandingError(null);
    try {
      const url = await uploadBrandingImage(institution.id, kind, localUri);
      setInstitutions(list => list.map(item => (item.id === institution.id ? { ...item, [`${kind}Url`]: url } : item)));
    } catch (uploadError) {
      setBrandingError({ id: institution.id, message: describeAuthError(uploadError, t('hntAdmin.noPudimosGuardarLaImagen')) });
    } finally {
      setBrandingBusy(null);
    }
  };

  const clearBranding = async (institution: AdminInstitution, kind: BrandingKind) => {
    if (brandingBusy) return;
    setBrandingBusy({ id: institution.id, kind });
    setBrandingError(null);
    try {
      await removeBrandingImage(institution.id, kind);
      setInstitutions(list => list.map(item => (item.id === institution.id ? { ...item, [`${kind}Url`]: null } : item)));
    } catch (removeError) {
      setBrandingError({ id: institution.id, message: describeAuthError(removeError, t('hntAdmin.noPudimosQuitarLaImagen')) });
    } finally {
      setBrandingBusy(null);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setInstitutions(await listInstitutions());
    } catch (loadError) {
      setError(describeAuthError(loadError, t('hntAdmin.noPudimosCargarLasInstituciones')));
    } finally {
      setLoading(false);
    }
  }, []);

  // The backend enforces the role on every call; this only decides what to draw.
  useEffect(() => {
    if (initializing) return;
    if (!user) {
      router.replace('/onboarding');
      return;
    }
    let active = true;
    (async () => {
      try {
        await ensureClaims(user);
        const { claims } = await user.getIdTokenResult();
        if (!active) return;
        if (claims.role === 'HNT') {
          setAccess('granted');
          void load();
        } else {
          setAccess('denied');
        }
      } catch {
        if (active) setAccess('denied');
      }
    })();
    return () => { active = false; };
  }, [initializing, load, router, user]);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const handleCreate = async () => {
    setCreateError(null);
    if (name.trim().length < 2) {
      setCreateError(t('hntAdmin.escribeElNombreCortoDe'));
      return;
    }
    setCreating(true);
    try {
      await createInstitution(name.trim(), fullName.trim());
      setName('');
      setFullName('');
      await load();
    } catch (createFailure) {
      setCreateError(describeAuthError(createFailure, t('hntAdmin.noPudimosCrearLaInstitucion')));
    } finally {
      setCreating(false);
    }
  };

  const generateCode = async (institution: AdminInstitution) => {
    setRotating(true);
    setCodeError(null);
    try {
      const words = await rotateInviteCode(institution.id);
      setCodeDialog({ kind: 'shown', institution, words, copied: false });
      void load();
    } catch (rotateFailure) {
      setCodeError(describeAuthError(rotateFailure, t('hntAdmin.noPudimosGenerarElCodigo')));
    } finally {
      setRotating(false);
    }
  };

  const askForCode = (institution: AdminInstitution) => {
    setCodeError(null);
    // Replacing a code locks out everyone still holding the old one.
    if (institution.hasInviteCode) setCodeDialog({ kind: 'confirm', institution });
    else void generateCode(institution);
  };

  const copyCode = async () => {
    if (codeDialog?.kind !== 'shown') return;
    await Clipboard.setStringAsync(codeDialog.words.join(' '));
    setCodeDialog({ ...codeDialog, copied: true });
  };

  const toggleRoster = (institutionId: string) => {
    setRosterFor(current => (current === institutionId ? null : institutionId));
    setRosterText('');
    setImportError(null);
    setImportResult(null);
  };

  const handleImport = async (institutionId: string) => {
    if (parsed.rows.length === 0 || importing) return;
    setImporting(true);
    setImportError(null);
    setImportResult(null);
    try {
      const result = await importRoster(institutionId, parsed.rows);
      setImportResult({ ...result, headerRows: parsed.headerRows });
      if (result.rejectedCount === 0) setRosterText('');
      void load();
    } catch (importFailure) {
      setImportError(describeAuthError(importFailure, t('hntAdmin.noPudimosCargarLaLista')));
    } finally {
      setImporting(false);
    }
  };

  // Leaving with a new institution or a pasted list not yet saved asks first.
  // Saving from the dialog keeps the panel open to show the result.
  const pendingInstitution = !!(name.trim() || fullName.trim());
  const pendingRoster = !!rosterFor && !!rosterText.trim();
  const { dialog: discardDialog } = useUnsavedChangesGuard({
    dirty: (pendingInstitution || pendingRoster) && !creating && !importing,
    onSave: () => {
      if (pendingInstitution) void handleCreate();
      else if (rosterFor) void handleImport(rosterFor);
    },
    saveLabel: pendingInstitution ? t('hntAdmin.crearInstitucion') : t('hntAdmin.cargarLista'),
    canSave: pendingInstitution !== pendingRoster && (pendingInstitution ? name.trim().length >= 2 : parsed.rows.length > 0),
    title: t('hntAdmin.salirSinGuardar'),
    message: pendingInstitution && pendingRoster
      ? t('hntAdmin.hayUnaInstitucionNuevaY')
      : pendingInstitution
        ? t('hntAdmin.laInstitucionNuevaTodaviaNo')
        : t('hntAdmin.laListaQuePegasteTodavia'),
  });

  if (initializing || access === 'checking') {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={AppColors.textSecondary} />
      </SafeAreaView>
    );
  }

  if (access === 'denied') {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <ThemedText style={styles.deniedTitle}>{t('hntAdmin.panelNoDisponible')}</ThemedText>
        <ThemedText style={styles.muted}>{t('hntAdmin.estaSeccionEsSoloPara')}</ThemedText>
        <HanetButton label={t('common.volver')} onPress={goBack} style={styles.deniedButton} />
      </SafeAreaView>
    );
  }

  return (
    <FrostedScreen style={styles.container} bottom>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={withTopInset(styles.scrollContent, insets.top)} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.topBar}>
            <ThemedText accessibilityRole="header" style={styles.topBarTitle}>{t('index.panelHnt')}</ThemedText>
          </View>

          <HanetButton label={t('hntAdmin.sistemaHanetUi')} variant="surface" onPress={() => router.push('/ui-showcase')} />
          <HanetButton label={t('hntAdmin.verOnboarding')} variant="surface" onPress={() => router.push({ pathname: '/onboarding', params: { preview: '1' } })} />

          <PushTestCard />

          <ThemedText style={styles.sectionTitle}>{t('hntAdmin.instituciones')}</ThemedText>

          {loading && institutions.length === 0 && <ActivityIndicator color={AppColors.textSecondary} style={styles.spinner} />}
          {!!error && <ThemedText accessibilityLiveRegion="assertive" style={styles.error}>{error}</ThemedText>}
          {!loading && !error && institutions.length === 0 && (
            <ThemedText style={styles.muted}>{t('hntAdmin.todaviaNoHayInstitucionesCrea')}</ThemedText>
          )}

          {institutions.length > 5 && (
            <TextInput
              accessibilityLabel={t('hntAdmin.buscarInstitucion')}
              value={institutionSearch}
              onChangeText={text => { setInstitutionSearch(text); setInstitutionLimit(INSTITUTIONS_PAGE); }}
              placeholder={t('hntAdmin.buscarInstitucion')}
              placeholderTextColor="rgba(221,221,226,0.4)"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.search}
            />
          )}
          {institutions.length > 0 && filteredInstitutions.length === 0 && (
            <ThemedText style={styles.muted}>{t('hntAdmin.ningunaInstitucionCoincideConEsa')}</ThemedText>
          )}

          {filteredInstitutions.slice(0, institutionLimit).map(institution => {
            const rosterOpen = rosterFor === institution.id;
            const expanded = expandedId === institution.id;
            const busyKind = brandingBusy?.id === institution.id ? brandingBusy.kind : null;
            return (
              <View key={institution.id} style={styles.card}>
                {/* A compact row; tapping it opens the institution's tools. */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded }}
                  accessibilityHint={expanded ? t('hntAdmin.cierraLaInstitucion') : t('hntAdmin.abreLaIdentidadElCodigo')}
                  onPress={() => setExpandedId(current => (current === institution.id ? null : institution.id))}
                  style={({ pressed }) => [styles.rowHeader, pressed && styles.pressed]}
                >
                  <View style={styles.rowLogo}>
                    {institution.logoUrl
                      ? <Image source={{ uri: institution.logoUrl }} style={styles.rowLogoImage} contentFit="contain" />
                      : <ThemedText style={styles.rowInitials}>{institution.name.slice(0, 2).toLocaleUpperCase('es')}</ThemedText>}
                  </View>
                  <View style={styles.rowText}>
                    <ThemedText style={styles.cardTitle} numberOfLines={1}>{institution.name}</ThemedText>
                    <ThemedText style={styles.muted} numberOfLines={1}>
                      {t('hntAdmin.countPersonasValue', { count: institution.rosterCount, value: institution.hasInviteCode ? t('hntAdmin.conCodigo') : t('hntAdmin.sinCodigo') })}
                    </ThemedText>
                  </View>
                  <ThemedText style={styles.chevron}>{expanded ? '−' : '+'}</ThemedText>
                </Pressable>

                {expanded && (
                <>
                {!!institution.fullName && <ThemedText style={styles.muted}>{institution.fullName}</ThemedText>}

                {/* Identity shown in Home, the identity link and its emails. */}
                <View style={styles.branding}>
                  <ThemedText style={styles.brandingTitle}>{t('hntAdmin.identidad')}</ThemedText>
                  <InstitutionBanner title={institution.name} logoUrl={institution.logoUrl} bannerUrl={institution.bannerUrl} />
                  <ThemedText style={styles.muted}>
                    {t('hntAdmin.seVeEnElInicio')}
                  </ThemedText>
                  <View style={styles.actions}>
                    <HanetButton
                      label={busyKind === 'logo' ? t('common.guardando') : institution.logoUrl ? t('hntAdmin.cambiarEscudo') : t('hntAdmin.subirEscudo')}
                      variant="surface"
                      onPress={() => changeBranding(institution, 'logo')}
                      disabled={!!brandingBusy}
                      style={styles.action}
                    />
                    <HanetButton
                      label={busyKind === 'banner' ? t('common.guardando') : institution.bannerUrl ? t('hntAdmin.cambiarBanner') : t('hntAdmin.subirBanner')}
                      variant="surface"
                      onPress={() => changeBranding(institution, 'banner')}
                      disabled={!!brandingBusy}
                      style={styles.action}
                    />
                  </View>
                  {(!!institution.logoUrl || !!institution.bannerUrl) && (
                    <View style={styles.brandingRemove}>
                      {!!institution.logoUrl && (
                        <Pressable accessibilityRole="button" disabled={!!brandingBusy} onPress={() => clearBranding(institution, 'logo')} hitSlop={8} style={({ pressed }) => pressed && styles.pressed}>
                          <ThemedText style={styles.link}>{t('hntAdmin.quitarEscudo')}</ThemedText>
                        </Pressable>
                      )}
                      {!!institution.bannerUrl && (
                        <Pressable accessibilityRole="button" disabled={!!brandingBusy} onPress={() => clearBranding(institution, 'banner')} hitSlop={8} style={({ pressed }) => pressed && styles.pressed}>
                          <ThemedText style={styles.link}>{t('hntAdmin.quitarBanner')}</ThemedText>
                        </Pressable>
                      )}
                    </View>
                  )}
                  {brandingError?.id === institution.id && (
                    <ThemedText accessibilityLiveRegion="assertive" style={styles.error}>{brandingError.message}</ThemedText>
                  )}
                </View>

                <View style={styles.facts}>
                  <ThemedText style={styles.fact}>
                    {t('hntAdmin.countPersonasEnLaLista', { count: institution.rosterCount })}
                  </ThemedText>
                  <ThemedText style={styles.fact}>
                    {institution.inviteUpdatedAt ? t('hntAdmin.codigoGeneradoElDate', { date: formatDate(institution.inviteUpdatedAt) }) : t('hntAdmin.sinCodigoDeInvitacion')}
                  </ThemedText>
                </View>

                <View style={styles.actions}>
                  <HanetButton
                    label={institution.hasInviteCode ? t('hntAdmin.cambiarCodigo') : t('hntAdmin.generarCodigo')}
                    variant="surface"
                    onPress={() => askForCode(institution)}
                    disabled={rotating}
                    style={styles.action}
                  />
                  <HanetButton
                    label={rosterOpen ? t('hntAdmin.cerrarLista') : t('hntAdmin.cargarLista')}
                    variant={rosterOpen ? 'surface' : 'primary'}
                    onPress={() => toggleRoster(institution.id)}
                    style={styles.action}
                  />
                </View>
                {!!codeError && !codeDialog && <ThemedText accessibilityLiveRegion="assertive" style={styles.error}>{codeError}</ThemedText>}

                <HanetButton
                  label={membersFor === institution.id ? t('hntAdmin.ocultarPersonas') : t('hntAdmin.personasYRoles')}
                  variant="surface"
                  onPress={() => setMembersFor(current => (current === institution.id ? null : institution.id))}
                />
                {membersFor === institution.id && !!user && (
                  <InstitutionMembers institutionId={institution.id} institutionName={institution.name} currentUid={user.uid} />
                )}

                {rosterOpen && (
                  <View style={styles.roster}>
                    <ThemedText style={styles.rosterHelp}>
                      {t('hntAdmin.pegaLaPlanillaTalComo')}
                    </ThemedText>
                    <TextInput
                      accessibilityLabel={t('hntAdmin.listaDePersonas')}
                      value={rosterText}
                      onChangeText={(value) => { setRosterText(value); setImportResult(null); setImportError(null); }}
                      multiline
                      autoCapitalize="none"
                      autoCorrect={false}
                      spellCheck={false}
                      placeholder={t('hntAdmin.n123456785Ana')}
                      placeholderTextColor="rgba(221,221,226,0.35)"
                      editable={!importing}
                      style={styles.rosterInput}
                    />
                    <ThemedText style={styles.muted}>
                      {parsed.rows.length === 0
                        ? t('hntAdmin.aunNoHayFilas')
                        : t('hntAdmin.countFilasDetectadasValue', { count: parsed.rows.length, value: parsed.headerRows ? t('hntAdmin.sinContarElEncabezado') : '' })}
                    </ThemedText>

                    {parsed.rows.length > 0 && (
                      <View style={styles.preview}>
                        <ThemedText style={styles.previewTitle}>{t('hntAdmin.asiSeLeyoLaPrimera')}</ThemedText>
                        {([
                          ['RUT', parsed.rows[0].rut],
                          [t('hntAdmin.nombres'), parsed.rows[0].nombres],
                          [t('hntAdmin.apellidos'), parsed.rows[0].apellidos],
                          [t('common.curso'), parsed.rows[0].curso],
                          [t('common.correo'), parsed.rows[0].email],
                        ] as const).map(([label, value]) => (
                          <View key={label} style={styles.previewRow}>
                            <ThemedText style={styles.previewLabel}>{label}</ThemedText>
                            <ThemedText style={[styles.previewValue, !value && styles.previewMissing]} numberOfLines={1}>{value || 'vacío'}</ThemedText>
                          </View>
                        ))}
                      </View>
                    )}

                    {!!importError && <ThemedText accessibilityLiveRegion="assertive" style={styles.error}>{importError}</ThemedText>}
                    {!!importResult && (
                      <View accessibilityLiveRegion="polite" style={styles.result}>
                        <ThemedText style={styles.resultTitle}>
                          {t('hntAdmin.seCargaronCountPersonas', { count: importResult.imported })}
                        </ThemedText>
                        {importResult.rejectedCount > 0 && (
                          <>
                            <ThemedText style={styles.error}>
                              {t('hntAdmin.countFilasNoSeCargaron', { count: importResult.rejectedCount })}
                            </ThemedText>
                            {importResult.rejected.map(item => (
                              <ThemedText key={item.row} style={styles.muted}>
                                {t('hntAdmin.filaValueReason', { value: item.row + importResult.headerRows, reason: item.reason })}
                              </ThemedText>
                            ))}
                          </>
                        )}
                      </View>
                    )}

                    <HanetButton
                      label={importing ? t('common.cargando') : parsed.rows.length > 0 ? t('hntAdmin.cargarCountPersonas', { count: parsed.rows.length }) : t('hntAdmin.cargarLista')}
                      onPress={() => handleImport(institution.id)}
                      disabled={importing || parsed.rows.length === 0}
                    />
                  </View>
                )}
                </>
                )}
              </View>
            );
          })}

          {filteredInstitutions.length > institutionLimit && (
            <HanetButton
              label={t('hntAdmin.mostrarMasCountRestantes', { count: filteredInstitutions.length - institutionLimit })}
              variant="surface"
              onPress={() => setInstitutionLimit(limit => limit + INSTITUTIONS_PAGE)}
            />
          )}

          <ThemedText style={styles.sectionTitle}>{t('hntAdmin.nuevaInstitucion')}</ThemedText>
          <View style={styles.card}>
            <HanetField label={t('hntAdmin.nombreCorto')} value={name} onChangeText={setName} placeholder={t('hntAdmin.lchTemuco')} editable={!creating} />
            <HanetField label={t('hntAdmin.nombreCompletoOpcional')} value={fullName} onChangeText={setFullName} placeholder={t('hntAdmin.liceoCamiloHenriquezDeTemuco')} editable={!creating} />
            {!!createError && <ThemedText accessibilityLiveRegion="assertive" style={styles.error}>{createError}</ThemedText>}
            <HanetButton label={creating ? t('classhall.create.creando') : t('hntAdmin.crearInstitucion')} onPress={handleCreate} disabled={creating} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <HanetDialog
        visible={!!codeDialog}
        onRequestClose={() => { if (!rotating && codeDialog?.kind === 'confirm') setCodeDialog(null); }}
        title={codeDialog?.kind === 'confirm' ? t('hntAdmin.cambiarElCodigoDeName', { name: codeDialog.institution.name }) : codeDialog ? t('hntAdmin.codigoDeName', { name: codeDialog.institution.name }) : undefined}
        body={codeDialog?.kind === 'confirm' ? t('hntAdmin.elCodigoActualDejaraDe') : undefined}
      >
        {codeDialog?.kind === 'confirm' && (
          <>
            {!!codeError && <ThemedText accessibilityLiveRegion="assertive" style={styles.error}>{codeError}</ThemedText>}
            <HanetDialogActions>
              <HanetButton label={t('common.cancelar')} variant="surface" onPress={() => setCodeDialog(null)} disabled={rotating} style={dialogStyles.action} />
              <HanetButton label={rotating ? t('hntAdmin.generando') : t('common.cambiar')} variant="accent" onPress={() => generateCode(codeDialog.institution)} disabled={rotating} style={dialogStyles.action} />
            </HanetDialogActions>
          </>
        )}

        {codeDialog?.kind === 'shown' && (
          <>
            <View style={styles.words}>
              {codeDialog.words.map((word, index) => (
                <View key={word} style={styles.word}>
                  <ThemedText style={styles.wordIndex}>{index + 1}</ThemedText>
                  <ThemedText selectable style={styles.wordText}>{word}</ThemedText>
                </View>
              ))}
            </View>
            <ThemedText style={styles.dialogBody}>
              {t('hntAdmin.anotaloAhoraNoPodremosMostrarlo')}
            </ThemedText>
            <HanetDialogActions>
              <HanetButton label={codeDialog.copied ? t('common.copiado') : t('classhall.copiar')} variant="surface" onPress={copyCode} style={dialogStyles.action} />
              <HanetButton label={t('hntAdmin.yaLoAnote')} onPress={() => setCodeDialog(null)} style={dialogStyles.action} />
            </HanetDialogActions>
          </>
        )}
      </HanetDialog>
      {discardDialog}
    </FrostedScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AppColors.canvas,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: AppSpacing.xl,
    gap: AppSpacing.sm,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    padding: AppSpacing.md,
    paddingBottom: TAB_BAR_CLEARANCE,
    gap: AppSpacing.md,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.lg,
    paddingVertical: AppSpacing.md,
  },
  topBarTitle: {
    flex: 1,
    fontFamily: 'DMSans_700Bold',
    fontSize: 20,
    lineHeight: 28,
    letterSpacing: -0.8,
    color: AppColors.textPrimary,
  },
  sectionTitle: {
    marginTop: AppSpacing.sm,
    paddingHorizontal: AppSpacing.sm,
    fontFamily: 'DMSans_700Bold',
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: -0.35,
    color: AppColors.textSecondary,
  },
  spinner: {
    marginVertical: AppSpacing.xl,
  },
  card: {
    padding: AppSpacing.xl,
    gap: AppSpacing.lg,
    borderRadius: AppRadii.xl,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
    minHeight: 48,
  },
  rowLogo: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: AppRadii.md,
    borderCurve: 'continuous',
    backgroundColor: AppColors.canvas,
    overflow: 'hidden',
  },
  rowLogoImage: {
    width: 34,
    height: 38,
  },
  rowInitials: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 15,
    lineHeight: 20,
    color: AppColors.textSecondary,
  },
  rowText: {
    flex: 1,
  },
  chevron: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 24,
    lineHeight: 28,
    color: AppColors.textSecondary,
    width: 24,
    textAlign: 'center',
  },
  branding: {
    gap: AppSpacing.md,
  },
  brandingTitle: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 16,
    lineHeight: 22,
    color: AppColors.textPrimary,
  },
  brandingRemove: {
    flexDirection: 'row',
    gap: AppSpacing.xl,
  },
  link: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 14,
    lineHeight: 20,
    textDecorationLine: 'underline',
    color: AppColors.textSecondary,
  },
  search: {
    minHeight: 48,
    paddingHorizontal: AppSpacing.lg,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.surface,
    fontFamily: 'DMSans_500Medium',
    fontSize: 16,
    color: AppColors.textPrimary,
  },
  cardTitle: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.96,
    color: AppColors.textPrimary,
  },
  facts: {
    gap: AppSpacing.xs,
  },
  fact: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.textPrimary,
  },
  muted: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.textSecondary,
    opacity: 0.8,
  },
  actions: {
    flexDirection: 'row',
    gap: AppSpacing.sm,
  },
  action: {
    flex: 1,
  },
  error: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.errorText,
  },
  roster: {
    gap: AppSpacing.md,
    paddingTop: AppSpacing.sm,
  },
  rosterHelp: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.textPrimary,
  },
  rosterInput: {
    minHeight: 160,
    maxHeight: 320,
    padding: AppSpacing.lg,
    borderRadius: AppRadii.md,
    borderCurve: 'continuous',
    backgroundColor: AppColors.canvas,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.textPrimary,
    textAlignVertical: 'top',
    outlineStyle: 'none' as never,
  },
  preview: {
    gap: AppSpacing.xs,
    padding: AppSpacing.lg,
    borderRadius: AppRadii.md,
    borderCurve: 'continuous',
    backgroundColor: AppColors.canvas,
  },
  previewTitle: {
    marginBottom: AppSpacing.xs,
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.textSecondary,
  },
  previewRow: {
    flexDirection: 'row',
    gap: AppSpacing.md,
  },
  previewLabel: {
    width: 76,
    fontFamily: 'DMSans_700Bold',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.textSecondary,
  },
  previewValue: {
    flex: 1,
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.textPrimary,
  },
  previewMissing: {
    color: AppColors.errorText,
  },
  result: {
    gap: AppSpacing.xs,
  },
  resultTitle: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.textPrimary,
  },
  deniedTitle: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: -0.8,
    color: AppColors.textPrimary,
  },
  deniedButton: {
    marginTop: AppSpacing.md,
  },
  dialogBody: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.textSecondary,
  },
  words: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing.sm,
  },
  word: {
    flexGrow: 1,
    flexBasis: '45%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.sm,
    paddingHorizontal: AppSpacing.lg,
    paddingVertical: AppSpacing.md,
    borderRadius: AppRadii.md,
    borderCurve: 'continuous',
    backgroundColor: AppColors.canvas,
  },
  wordIndex: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 12,
    lineHeight: 16,
    color: AppColors.textSecondary,
    opacity: 0.6,
  },
  wordText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 18,
    lineHeight: 24,
    color: AppColors.textPrimary,
  },
  pressed: AppPressed,
});
