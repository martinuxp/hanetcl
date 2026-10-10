import { TAB_BAR_CLEARANCE } from '@/components/AppTabBar';
import { InstitutionMembers } from '@/components/admin/InstitutionMembers';
import { ThemedText } from '@/components/themed-text';
import { HanetField } from '@/components/ui/hanet-auth-fields';
import { HanetButton } from '@/components/ui/hanet-button';
import { AppColors, AppRadii, AppSpacing, AppTouch } from '@/constants/design-tokens';
import { describeAuthError, ensureClaims, useSession } from '@/services/auth-service';
import {
  createInstitution,
  importRoster,
  listInstitutions,
  parseRoster,
  rotateInviteCode,
} from '@/services/hnt-admin-service';
import type { AdminInstitution, RosterImportResult } from '@/services/hnt-admin-service';
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const BACK_ICON = require('@/assets/icons/event/arrow-left-long.svg');

type Access = 'checking' | 'granted' | 'denied';
type CodeDialog =
  | { kind: 'confirm'; institution: AdminInstitution }
  | { kind: 'shown'; institution: AdminInstitution; words: string[]; copied: boolean };

function formatDate(millis: number) {
  return new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(millis));
}

export default function HntAdminScreen() {
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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setInstitutions(await listInstitutions());
    } catch (loadError) {
      setError(describeAuthError(loadError, 'No pudimos cargar las instituciones. Inténtalo nuevamente.'));
    } finally {
      setLoading(false);
    }
  }, []);

  // The backend enforces the role on every call; this only decides what to draw.
  useEffect(() => {
    if (initializing) return;
    if (!user) {
      router.replace('/auth');
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
      setCreateError('Escribe el nombre corto de la institución.');
      return;
    }
    setCreating(true);
    try {
      await createInstitution(name.trim(), fullName.trim());
      setName('');
      setFullName('');
      await load();
    } catch (createFailure) {
      setCreateError(describeAuthError(createFailure, 'No pudimos crear la institución.'));
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
      setCodeError(describeAuthError(rotateFailure, 'No pudimos generar el código.'));
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
      setImportError(describeAuthError(importFailure, 'No pudimos cargar la lista. Inténtalo nuevamente.'));
    } finally {
      setImporting(false);
    }
  };

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
        <ThemedText style={styles.deniedTitle}>Panel no disponible</ThemedText>
        <ThemedText style={styles.muted}>Esta sección es solo para el equipo HaNet.</ThemedText>
        <HanetButton label="Volver" onPress={goBack} style={styles.deniedButton} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.topBar}>
            <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={goBack} hitSlop={4} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
              <Image source={BACK_ICON} style={styles.icon} contentFit="contain" />
            </Pressable>
            <ThemedText accessibilityRole="header" style={styles.topBarTitle}>Panel HNT</ThemedText>
          </View>

          <ThemedText style={styles.sectionTitle}>Instituciones</ThemedText>

          {loading && institutions.length === 0 && <ActivityIndicator color={AppColors.textSecondary} style={styles.spinner} />}
          {!!error && <ThemedText accessibilityLiveRegion="assertive" style={styles.error}>{error}</ThemedText>}
          {!loading && !error && institutions.length === 0 && (
            <ThemedText style={styles.muted}>Todavía no hay instituciones. Crea la primera más abajo.</ThemedText>
          )}

          {institutions.map(institution => {
            const rosterOpen = rosterFor === institution.id;
            return (
              <View key={institution.id} style={styles.card}>
                <View>
                  <ThemedText style={styles.cardTitle}>{institution.name}</ThemedText>
                  {!!institution.fullName && <ThemedText style={styles.muted}>{institution.fullName}</ThemedText>}
                </View>

                <View style={styles.facts}>
                  <ThemedText style={styles.fact}>
                    {institution.rosterCount === 1 ? '1 persona en la lista' : `${institution.rosterCount} personas en la lista`}
                  </ThemedText>
                  <ThemedText style={styles.fact}>
                    {institution.inviteUpdatedAt ? `Código generado el ${formatDate(institution.inviteUpdatedAt)}` : 'Sin código de invitación'}
                  </ThemedText>
                </View>

                <View style={styles.actions}>
                  <HanetButton
                    label={institution.hasInviteCode ? 'Cambiar código' : 'Generar código'}
                    variant="surface"
                    onPress={() => askForCode(institution)}
                    disabled={rotating}
                    style={styles.action}
                  />
                  <HanetButton
                    label={rosterOpen ? 'Cerrar lista' : 'Cargar lista'}
                    variant={rosterOpen ? 'surface' : 'primary'}
                    onPress={() => toggleRoster(institution.id)}
                    style={styles.action}
                  />
                </View>
                {!!codeError && !codeDialog && <ThemedText accessibilityLiveRegion="assertive" style={styles.error}>{codeError}</ThemedText>}

                <HanetButton
                  label={membersFor === institution.id ? 'Ocultar personas' : 'Personas y roles'}
                  variant="surface"
                  onPress={() => setMembersFor(current => (current === institution.id ? null : institution.id))}
                />
                {membersFor === institution.id && !!user && (
                  <InstitutionMembers institutionId={institution.id} institutionName={institution.name} currentUid={user.uid} />
                )}

                {rosterOpen && (
                  <View style={styles.roster}>
                    <ThemedText style={styles.rosterHelp}>
                      Pega la planilla tal como está en Excel o Sheets, una persona por línea, con estas columnas en orden: RUT, nombres, apellidos, curso y correo institucional.
                    </ThemedText>
                    <TextInput
                      accessibilityLabel="Lista de personas"
                      value={rosterText}
                      onChangeText={(value) => { setRosterText(value); setImportResult(null); setImportError(null); }}
                      multiline
                      autoCapitalize="none"
                      autoCorrect={false}
                      spellCheck={false}
                      placeholder={'12.345.678-5\tAna María\tPérez Soto\tSegundo Medio K\tana.perez@liceo.cl'}
                      placeholderTextColor="rgba(221,221,226,0.35)"
                      editable={!importing}
                      style={styles.rosterInput}
                    />
                    <ThemedText style={styles.muted}>
                      {parsed.rows.length === 0
                        ? 'Aún no hay filas.'
                        : `${parsed.rows.length} ${parsed.rows.length === 1 ? 'fila detectada' : 'filas detectadas'}${parsed.headerRows ? ', sin contar el encabezado' : ''}.`}
                    </ThemedText>

                    {parsed.rows.length > 0 && (
                      <View style={styles.preview}>
                        <ThemedText style={styles.previewTitle}>Así se leyó la primera fila. Revisa que cada dato esté en su lugar:</ThemedText>
                        {([
                          ['RUT', parsed.rows[0].rut],
                          ['Nombres', parsed.rows[0].nombres],
                          ['Apellidos', parsed.rows[0].apellidos],
                          ['Curso', parsed.rows[0].curso],
                          ['Correo', parsed.rows[0].email],
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
                          {importResult.imported === 1 ? 'Se cargó 1 persona.' : `Se cargaron ${importResult.imported} personas.`}
                        </ThemedText>
                        {importResult.rejectedCount > 0 && (
                          <>
                            <ThemedText style={styles.error}>
                              {importResult.rejectedCount === 1 ? '1 fila no se cargó:' : `${importResult.rejectedCount} filas no se cargaron:`}
                            </ThemedText>
                            {importResult.rejected.map(item => (
                              <ThemedText key={item.row} style={styles.muted}>
                                Fila {item.row + importResult.headerRows}: {item.reason}
                              </ThemedText>
                            ))}
                          </>
                        )}
                      </View>
                    )}

                    <HanetButton
                      label={importing ? 'Cargando…' : parsed.rows.length > 0 ? `Cargar ${parsed.rows.length} ${parsed.rows.length === 1 ? 'persona' : 'personas'}` : 'Cargar lista'}
                      onPress={() => handleImport(institution.id)}
                      disabled={importing || parsed.rows.length === 0}
                    />
                  </View>
                )}
              </View>
            );
          })}

          <ThemedText style={styles.sectionTitle}>Nueva institución</ThemedText>
          <View style={styles.card}>
            <HanetField label="Nombre corto" value={name} onChangeText={setName} placeholder="LCH Temuco" editable={!creating} />
            <HanetField label="Nombre completo (opcional)" value={fullName} onChangeText={setFullName} placeholder="Liceo Camilo Henríquez de Temuco" editable={!creating} />
            {!!createError && <ThemedText accessibilityLiveRegion="assertive" style={styles.error}>{createError}</ThemedText>}
            <HanetButton label={creating ? 'Creando…' : 'Crear institución'} onPress={handleCreate} disabled={creating} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={!!codeDialog} transparent animationType="fade" statusBarTranslucent onRequestClose={() => { if (!rotating && codeDialog?.kind === 'confirm') setCodeDialog(null); }}>
        <View style={styles.overlay}>
          {codeDialog?.kind === 'confirm' && (
            <View accessibilityViewIsModal style={styles.dialog}>
              <ThemedText style={styles.dialogTitle}>¿Cambiar el código de {codeDialog.institution.name}?</ThemedText>
              <ThemedText style={styles.dialogBody}>
                El código actual dejará de funcionar de inmediato. Quienes ya se unieron no se ven afectados.
              </ThemedText>
              {!!codeError && <ThemedText accessibilityLiveRegion="assertive" style={styles.error}>{codeError}</ThemedText>}
              <View style={styles.actions}>
                <HanetButton label="Cancelar" variant="surface" onPress={() => setCodeDialog(null)} disabled={rotating} style={styles.action} />
                <HanetButton label={rotating ? 'Generando…' : 'Cambiar'} variant="accent" onPress={() => generateCode(codeDialog.institution)} disabled={rotating} style={styles.action} />
              </View>
            </View>
          )}

          {codeDialog?.kind === 'shown' && (
            <View accessibilityViewIsModal style={styles.dialog}>
              <ThemedText style={styles.dialogTitle}>Código de {codeDialog.institution.name}</ThemedText>
              <View style={styles.words}>
                {codeDialog.words.map((word, index) => (
                  <View key={word} style={styles.word}>
                    <ThemedText style={styles.wordIndex}>{index + 1}</ThemedText>
                    <ThemedText selectable style={styles.wordText}>{word}</ThemedText>
                  </View>
                ))}
              </View>
              <ThemedText style={styles.dialogBody}>
                Anótalo ahora: por seguridad solo guardamos una huella del código y no podremos mostrarlo otra vez. Si se pierde, genera uno nuevo.
              </ThemedText>
              <View style={styles.actions}>
                <HanetButton label={codeDialog.copied ? 'Copiado' : 'Copiar'} variant="surface" onPress={copyCode} style={styles.action} />
                <HanetButton label="Ya lo anoté" onPress={() => setCodeDialog(null)} style={styles.action} />
              </View>
            </View>
          )}
        </View>
      </Modal>
    </SafeAreaView>
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
  backButton: {
    height: 40,
    minWidth: AppTouch.minimum,
    paddingHorizontal: AppSpacing.lg,
    borderRadius: AppRadii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AppColors.surface,
  },
  icon: {
    width: 24,
    height: 24,
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
    color: AppColors.textPrimary,
  },
  deniedButton: {
    marginTop: AppSpacing.md,
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
    maxWidth: 380,
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
  pressed: {
    opacity: 0.6,
  },
});
