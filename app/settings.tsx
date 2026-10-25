import { ThemedText } from '@/components/themed-text';
import { HanetButton } from '@/components/ui/hanet-button';
import { HanetChoice } from '@/components/ui/hanet-select';
import { AppColors, AppPressed, AppRadii, AppSpacing, AppType } from '@/constants/design-tokens';
import { APP_ICONS, canChangeAppIcon, currentAppIcon, setAppIcon } from '@/services/app-icon';
import type { AppIconId } from '@/services/app-icon';
import { describeAuthError, getMyProfile, useSession } from '@/services/auth-service';
import { examRemindersEnabled, setExamRemindersEnabled } from '@/services/exam-reminders';
import { enablePush, openNotificationSettings, pushPermission, pushSupport, saveClasshallNotifications, saveMorningNotifications } from '@/services/push-service';
import { widgetsAvailable } from '@/services/widget-service';
import type { PushPermission } from '@/services/push-service';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const CONTACT = 'muxp@muxp.art';

export default function SettingsScreen() {
  const router = useRouter();
  const { user, signOut } = useSession();

  const iconsAvailable = canChangeAppIcon();
  const [icon, setIcon] = useState<AppIconId>(() => currentAppIcon());
  const [savingIcon, setSavingIcon] = useState(false);
  const [iconError, setIconError] = useState<string | null>(null);

  // ClassHall notifications: the account's switch and the phone's permission.
  const [classhallOn, setClasshallOn] = useState(true);
  const [permission, setPermission] = useState<PushPermission | null>(null);
  const [loadingNotifications, setLoadingNotifications] = useState(true);
  const [savingNotifications, setSavingNotifications] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const support = pushSupport();
  // The 7:00 summary (saved with the account) and the evaluation reminders (this phone only).
  const [morningOn, setMorningOn] = useState(true);
  const [examsOn, setExamsOn] = useState(true);
  const [savingDay, setSavingDay] = useState(false);

  useEffect(() => {
    void examRemindersEnabled().then(setExamsOn);
  }, []);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      try {
        const profile = await getMyProfile();
        if (!active) return;
        setClasshallOn(profile.classhallNotifications !== false);
        setMorningOn(profile.morningNotifications !== false);
        setPermission(await pushPermission());
      } catch (error) {
        if (active) setNotificationsError(describeAuthError(error, 'No pudimos cargar tus ajustes. Revisa tu conexión.'));
      } finally {
        if (active) setLoadingNotifications(false);
      }
    })();
    return () => { active = false; };
  }, [user]);

  const chooseIcon = async (next: AppIconId) => {
    if (!iconsAvailable || savingIcon || next === icon) return;
    const previous = icon;
    setIcon(next);
    setIconError(null);
    setSavingIcon(true);
    void Haptics.selectionAsync();
    try {
      await setAppIcon(next);
    } catch {
      setIcon(previous);
      setIconError('No pudimos cambiar el ícono. Inténtalo nuevamente.');
    } finally {
      setSavingIcon(false);
    }
  };

  const chooseClasshall = async (on: boolean) => {
    if (savingNotifications || on === classhallOn) return;
    setNotificationsError(null);
    setSavingNotifications(true);
    setClasshallOn(on);
    try {
      await saveClasshallNotifications(on);
      // Turning them on asks the phone too, if it has not been asked yet.
      if (on && permission === 'undetermined') setPermission(await enablePush());
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      setClasshallOn(!on);
      setNotificationsError(describeAuthError(error, 'No pudimos guardar el cambio. Inténtalo nuevamente.'));
    } finally {
      setSavingNotifications(false);
    }
  };

  const chooseMorning = async (on: boolean) => {
    if (savingDay || on === morningOn) return;
    setNotificationsError(null);
    setSavingDay(true);
    setMorningOn(on);
    try {
      await saveMorningNotifications(on);
      if (on && permission === 'undetermined') setPermission(await enablePush());
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      setMorningOn(!on);
      setNotificationsError(describeAuthError(error, 'No pudimos guardar el cambio. Inténtalo nuevamente.'));
    } finally {
      setSavingDay(false);
    }
  };

  const chooseExams = async (on: boolean) => {
    if (savingDay || on === examsOn) return;
    setSavingDay(true);
    setExamsOn(on);
    try {
      if (on && permission === 'undetermined') setPermission(await enablePush());
      await setExamRemindersEnabled(on);
      if (Platform.OS !== 'web') void Haptics.selectionAsync();
    } finally {
      setSavingDay(false);
    }
  };

  const version = Constants.expoConfig?.version;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <ThemedText style={styles.eyebrow}>HaNet ID</ThemedText>
          <ThemedText accessibilityRole="header" style={styles.title}>Configuraciones</ThemedText>
        </View>

        <Section title="Ícono de la app">
          <View accessibilityRole="radiogroup" style={styles.icons}>
            {APP_ICONS.map(option => {
              const selected = iconsAvailable && option.id === icon;
              return (
                <Pressable
                  key={option.label}
                  accessibilityRole="radio"
                  accessibilityLabel={`Ícono ${option.label}${option.id === null ? ', predeterminado' : ''}`}
                  accessibilityState={{ checked: selected, disabled: !iconsAvailable }}
                  disabled={!iconsAvailable}
                  onPress={() => void chooseIcon(option.id)}
                  style={({ pressed }) => [styles.iconOption, pressed && AppPressed]}
                >
                  <View style={[styles.iconRing, selected && styles.iconRingSelected]}>
                    <Image source={option.preview} style={styles.iconImage} contentFit="cover" />
                    {selected && (
                      <View style={styles.iconCheck}>
                        <Ionicons name="checkmark" size={14} color={AppColors.controlOnActive} />
                      </View>
                    )}
                  </View>
                  <ThemedText numberOfLines={1} style={[styles.iconLabel, selected && styles.iconLabelSelected]}>{option.label}</ThemedText>
                </Pressable>
              );
            })}
          </View>
          {!!iconError && <ThemedText accessibilityLiveRegion="assertive" style={styles.error}>{iconError}</ThemedText>}
          <ThemedText style={styles.note}>
            {iconsAvailable
              ? 'El ícono cambia en tu pantalla de inicio. Fractal es el de siempre.'
              : Platform.OS === 'web'
                ? 'El ícono se cambia desde la app del teléfono.'
                : 'Para cambiar el ícono necesitas la app de HaNet instalada; Expo Go no puede hacerlo.'}
          </ThemedText>
        </Section>

        <Section title="Notificaciones de ClassHall" plain>
          <HanetChoice
            label="Notificaciones de ClassHall"
            options={[{ value: 'on', label: 'Activadas' }, { value: 'off', label: 'Desactivadas' }]}
            value={classhallOn ? 'on' : 'off'}
            onChange={value => void chooseClasshall(value === 'on')}
            disabled={savingNotifications || loadingNotifications}
          />
          {!!notificationsError && <ThemedText accessibilityLiveRegion="assertive" style={styles.error}>{notificationsError}</ThemedText>}
          <ThemedText style={styles.note}>
            {support === 'web'
              ? 'Las notificaciones llegan a la app del teléfono, no a la web.'
              : support === 'expo-go-android'
                ? 'En Android, las notificaciones necesitan la app de HaNet instalada; Expo Go no las recibe.'
                : 'Anuncios, tareas y material nuevo de tus clases, un recordatorio el día antes de entregar y el aviso cuando tu docente revisa una entrega.'}
          </ThemedText>
          {support === 'supported' && classhallOn && permission === 'denied' && (
            <>
              <ThemedText style={styles.note}>Están bloqueadas en los ajustes del teléfono, así que no te llegarán.</ThemedText>
              <HanetButton label="Abrir ajustes" variant="surface" onPress={openNotificationSettings} />
            </>
          )}
          {support === 'supported' && classhallOn && permission === 'undetermined' && (
            <HanetButton label="Permitir en este teléfono" variant="surface" onPress={() => void enablePush().then(setPermission)} />
          )}
        </Section>

        <Section title="Tu día y tus pruebas" plain>
          <HanetChoice
            label="Resumen de las 7:00"
            options={[{ value: 'on', label: 'Activado' }, { value: 'off', label: 'Desactivado' }]}
            value={morningOn ? 'on' : 'off'}
            onChange={value => void chooseMorning(value === 'on')}
            disabled={savingDay || loadingNotifications}
          />
          <ThemedText style={styles.note}>Los días de clases, a las 7:00: tus pruebas y entregas del día y con qué asignatura entras.</ThemedText>
          <HanetChoice
            label="Avisos de pruebas"
            options={[{ value: 'on', label: 'Activados' }, { value: 'off', label: 'Desactivados' }]}
            value={examsOn ? 'on' : 'off'}
            onChange={value => void chooseExams(value === 'on')}
            disabled={savingDay || support === 'web'}
          />
          <ThemedText style={styles.note}>
            {support === 'web'
              ? 'Los avisos llegan a la app del teléfono, no a la web.'
              : widgetsAvailable
                ? '24 y 4 horas antes de cada prueba del Calendario, con una cuenta regresiva en la pantalla bloqueada y la Dynamic Island. Se guardan en este teléfono.'
                : '24 y 4 horas antes de cada prueba del Calendario. Se guardan en este teléfono.'}
          </ThemedText>
        </Section>

        <Section title="Cuenta">
          <Row icon="pencil-outline" label="Editar perfil" detail="Foto, blobatar y letra de tu nombre" onPress={() => router.push('/edit-profile')} />
          {!!user?.email && <Row icon="mail-outline" label="Correo" detail={user.email} />}
        </Section>

        <Section title="Acerca de HaNet">
          {!!version && <Row icon="information-circle-outline" label="Versión" detail={`${version} beta`} />}
          <Row icon="chatbubble-ellipses-outline" label="Contacto" detail={CONTACT} onPress={() => void Linking.openURL(`mailto:${CONTACT}`)} />
          <Row icon="document-text-outline" label="Licencias de código abierto" detail="Las bibliotecas con que está hecha HaNet" onPress={() => router.push('/licenses')} />
        </Section>

        <HanetButton
          label="Cerrar sesión"
          variant="surface"
          accessibilityHint={user?.email ? `Sesión iniciada como ${user.email}` : undefined}
          onPress={() => void signOut()}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

// `plain` drops the card, for chips: they share the card's color.
function Section({ title, plain = false, children }: { title: string; plain?: boolean; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText accessibilityRole="header" style={styles.sectionTitle}>{title}</ThemedText>
      <View style={plain ? styles.plain : styles.card}>{children}</View>
    </View>
  );
}

function Row({ icon, label, detail, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; detail?: string; onPress?: () => void }) {
  const content = (
    <>
      <View style={styles.rowBadge}>
        <Ionicons name={icon} size={18} color={AppColors.controlOnActive} />
      </View>
      <View style={styles.rowCopy}>
        <ThemedText style={styles.rowLabel}>{label}</ThemedText>
        {!!detail && <ThemedText numberOfLines={1} style={styles.rowDetail}>{detail}</ThemedText>}
      </View>
      {!!onPress && <Ionicons name="chevron-forward" size={18} color={AppColors.textSecondary} />}
    </>
  );
  if (!onPress) return <View style={styles.row} accessible accessibilityLabel={detail ? `${label}: ${detail}` : label}>{content}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={detail} onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: AppColors.canvas },
  page: { width: '100%', maxWidth: 430, alignSelf: 'center', paddingHorizontal: AppSpacing.lg, paddingBottom: 150, gap: AppSpacing.xl },

  header: { paddingTop: AppSpacing.lg },
  eyebrow: { ...AppType.caption, color: AppColors.textSecondary },
  title: { ...AppType.largeTitle, color: AppColors.textPrimary },

  section: { gap: AppSpacing.sm },
  sectionTitle: { ...AppType.headline, color: AppColors.textPrimary, paddingHorizontal: AppSpacing.xs },
  plain: { gap: AppSpacing.md, paddingHorizontal: AppSpacing.xs },
  card: { gap: AppSpacing.md, padding: AppSpacing.lg, borderRadius: AppRadii.xl, borderCurve: 'continuous', backgroundColor: AppColors.surface },

  icons: { flexDirection: 'row', justifyContent: 'space-between', gap: AppSpacing.sm },
  iconOption: { flex: 1, alignItems: 'center', gap: AppSpacing.sm },
  // The ring sits outside the icon so the artwork is never covered.
  iconRing: { width: '100%', maxWidth: 76, aspectRatio: 1, padding: 3, borderRadius: 22, borderCurve: 'continuous', borderWidth: 2, borderColor: 'transparent' },
  iconRingSelected: { borderColor: AppColors.controlActive },
  iconImage: { flex: 1, borderRadius: 17, borderCurve: 'continuous' },
  iconCheck: { position: 'absolute', right: -6, top: -6, width: 22, height: 22, borderRadius: AppRadii.pill, backgroundColor: AppColors.controlActive, alignItems: 'center', justifyContent: 'center' },
  iconLabel: { ...AppType.caption, color: AppColors.textSecondary, textAlign: 'center' },
  iconLabelSelected: { color: AppColors.textPrimary, fontFamily: 'DMSans_700Bold' },


  row: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: AppSpacing.md },
  rowBadge: { width: 36, height: 36, borderRadius: AppRadii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: AppColors.controlActive },
  rowCopy: { flex: 1 },
  rowLabel: { ...AppType.callout, color: AppColors.textPrimary },
  rowDetail: { ...AppType.caption, color: AppColors.textSecondary },

  note: { ...AppType.caption, color: AppColors.textSecondary, opacity: 0.85 },
  error: { ...AppType.footnote, fontFamily: 'DMSans_700Bold', color: AppColors.errorText },
  pressed: { opacity: 0.72 },
});
