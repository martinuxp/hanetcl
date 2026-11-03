import { ThemedText } from '@/components/themed-text';
import { HanetButton } from '@/components/ui/hanet-button';
import { AppColors, AppPressed, AppRadii, AppSpacing, AppType } from '@/constants/design-tokens';
import { describeAuthError } from '@/services/auth-service';
import { DocumentError, listMyHalls, scanSpecTable, setPendingScan, sharedSpecTable } from '@/services/classhall-service';
import type { Hall, PickedDocument } from '@/services/classhall-service';
import { clearSharedFile, peekSharedFile } from '@/services/share-intake';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '@/i18n';

// "Compartir a HaNet": a T.E. shared from another app (Files, Drive, Mail,
// WhatsApp…) through the system share sheet. The teacher picks one of their
// Halls; HaNet reads the table and opens the evaluation form with the draft,
// like "Escanear T.E." in ClassHall.

function readFile(): { picked: PickedDocument | null; error: string } {
  const file = peekSharedFile();
  if (!file) return { picked: null, error: t('share.noLlegoNingunArchivoVuelve') };
  try {
    return { picked: sharedSpecTable(file), error: '' };
  } catch (fileError) {
    return { picked: null, error: fileError instanceof DocumentError ? fileError.message : t('share.noPudimosAbrirEseArchivo') };
  }
}

function sizeText(bytes: number) {
  if (!bytes) return '';
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function ShareScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [{ picked, error: fileError }] = useState(readFile);
  const [halls, setHalls] = useState<Hall[] | null | undefined>(undefined);
  const [scanning, setScanning] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!picked) return;
    let alive = true;
    listMyHalls()
      .then(data => { if (alive) setHalls(data.halls.filter(hall => hall.isTeacher)); })
      .catch(loadError => {
        if (!alive) return;
        setHalls(null);
        setError(describeAuthError(loadError, t('classhall.noPudimosCargarTusClases')));
      });
    return () => { alive = false; };
  }, [picked]);

  const close = () => {
    clearSharedFile();
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const scanInto = async (hall: Hall) => {
    if (!picked || scanning) return;
    setError('');
    setScanning(hall.id);
    try {
      const { draft, staged } = await scanSpecTable(hall.id, picked);
      setPendingScan(hall.id, draft, staged);
      clearSharedFile();
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace({ pathname: '/classhall/evaluation-form', params: { hallId: hall.id } });
    } catch (scanError) {
      setScanning(null);
      setError(scanError instanceof DocumentError ? scanError.message : describeAuthError(scanError, t('share.noPudimosLeerLaTabla')));
    }
  };

  const image = picked?.mimeType.startsWith('image/');

  return (
    <View style={[styles.screen, { paddingTop: insets.top + AppSpacing.sm }]}>
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.cerrar')}
          hitSlop={8}
          onPress={close}
          style={({ pressed }) => [styles.round, pressed && AppPressed]}
        >
          <Ionicons name="close" size={22} color={AppColors.textPrimary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={[styles.page, { paddingBottom: insets.bottom + AppSpacing.xl }]} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <ThemedText style={styles.eyebrow}>{t('share.compartirAHanet')}</ThemedText>
          <ThemedText accessibilityRole="header" style={styles.title}>{t('share.agregarUnaTablaDeEspecificaciones')}</ThemedText>
          <ThemedText style={styles.intro}>{t('share.eligeLaClaseHanetLee')}</ThemedText>
        </View>

        {picked && (
          <View style={styles.file} accessible accessibilityLabel={t('share.archivoName', { name: picked.name })}>
            <View style={styles.fileIcon}>
              <Ionicons name={image ? 'image-outline' : 'document-text-outline'} size={22} color={AppColors.accent} />
            </View>
            <View style={styles.fileBody}>
              <ThemedText style={styles.fileName} numberOfLines={2}>{picked.name}</ThemedText>
              {!!picked.size && <ThemedText style={styles.fileMeta}>{sizeText(picked.size)}</ThemedText>}
            </View>
          </View>
        )}

        {!!fileError && (
          <View style={styles.notice}>
            <ThemedText style={styles.error}>{fileError}</ThemedText>
            <HanetButton label={t('common.cerrar')} variant="surface" onPress={close} />
          </View>
        )}

        {picked && halls === undefined && <ActivityIndicator color={AppColors.textSecondary} style={styles.loading} />}

        {picked && halls && halls.length === 0 && (
          <View style={styles.notice}>
            <ThemedText style={styles.noticeText}>{t('share.paraAgregarUnaTE')}</ThemedText>
            <HanetButton label={t('common.cerrar')} variant="surface" onPress={close} />
          </View>
        )}

        {picked && !!halls?.length && (
          <View style={styles.section}>
            <ThemedText accessibilityRole="header" style={styles.sectionTitle}>{t('share.enQueClase')}</ThemedText>
            {halls.map(hall => {
              const busy = scanning === hall.id;
              return (
                <Pressable
                  key={hall.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${hall.subject}, ${hall.courseId}`}
                  accessibilityState={{ disabled: !!scanning, busy }}
                  disabled={!!scanning}
                  onPress={() => void scanInto(hall)}
                  style={({ pressed }) => [styles.hall, busy && styles.hallBusy, pressed && AppPressed, !!scanning && !busy && styles.dimmed]}
                >
                  <View style={styles.hallBody}>
                    <ThemedText style={styles.hallName} numberOfLines={1}>{hall.subject}</ThemedText>
                    <ThemedText style={styles.hallCourse} numberOfLines={1}>{hall.courseId}</ThemedText>
                  </View>
                  {busy ? (
                    <View style={styles.reading}>
                      <ActivityIndicator color={AppColors.textPrimary} size="small" />
                      <ThemedText style={styles.readingText}>{t('classhall.evaluationForm.leyendoLaTabla')}</ThemedText>
                    </View>
                  ) : (
                    <Ionicons name="chevron-forward" size={18} color={AppColors.textSecondary} />
                  )}
                </Pressable>
              );
            })}
          </View>
        )}

        {!!error && <ThemedText accessibilityLiveRegion="assertive" style={styles.error}>{error}</ThemedText>}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: AppColors.canvas },
  topBar: { flexDirection: 'row', paddingHorizontal: AppSpacing.lg, width: '100%', maxWidth: 430, alignSelf: 'center' },
  round: { width: 40, height: 40, borderRadius: AppRadii.pill, backgroundColor: AppColors.surface, alignItems: 'center', justifyContent: 'center' },
  page: { width: '100%', maxWidth: 430, alignSelf: 'center', paddingHorizontal: AppSpacing.lg, gap: AppSpacing.lg },
  header: { paddingTop: AppSpacing.lg, gap: AppSpacing.xs },
  eyebrow: { ...AppType.caption, color: AppColors.textSecondary },
  title: { ...AppType.title1, color: AppColors.textPrimary },
  intro: { ...AppType.callout, fontFamily: 'DMSans_400Regular', color: AppColors.textSecondary, marginTop: AppSpacing.xs },
  file: { flexDirection: 'row', alignItems: 'center', gap: AppSpacing.md, padding: 14, borderRadius: AppRadii.lg, backgroundColor: AppColors.surface, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  fileIcon: { width: 44, height: 44, borderRadius: 13, backgroundColor: 'rgba(239,34,116,0.18)', alignItems: 'center', justifyContent: 'center' },
  fileBody: { flex: 1, gap: 2 },
  fileName: { ...AppType.headline, color: AppColors.textPrimary },
  fileMeta: { ...AppType.caption, fontFamily: 'DMSans_400Regular', color: AppColors.textSecondary },
  loading: { marginTop: AppSpacing.lg },
  notice: { gap: AppSpacing.md },
  noticeText: { ...AppType.callout, color: AppColors.textSecondary },
  section: { gap: AppSpacing.sm },
  sectionTitle: { ...AppType.headline, color: AppColors.textPrimary, marginBottom: AppSpacing.xs },
  hall: { flexDirection: 'row', alignItems: 'center', gap: AppSpacing.md, minHeight: 64, paddingHorizontal: 16, paddingVertical: 12, borderRadius: AppRadii.lg, backgroundColor: AppColors.surface },
  hallBusy: { backgroundColor: AppColors.accent },
  dimmed: { opacity: 0.5 },
  hallBody: { flex: 1, gap: 2 },
  hallName: { ...AppType.headline, color: AppColors.textPrimary },
  hallCourse: { ...AppType.caption, fontFamily: 'DMSans_400Regular', color: AppColors.textSecondary },
  reading: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  readingText: { ...AppType.caption, fontFamily: 'DMSans_700Bold', color: AppColors.textPrimary },
  error: { ...AppType.callout, color: AppColors.errorText },
});
