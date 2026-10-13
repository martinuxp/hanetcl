import { AppColors, AppRadii, AppSpacing, AppTouch } from '@/constants/design-tokens';
import { ThemedText } from '@/components/themed-text';
import { HanetButton } from '@/components/ui/hanet-button';
import { getNameFont } from '@/constants/name-fonts';
import { useNameFonts } from '@/hooks/use-name-fonts';
import { getProfilePhotoUrl } from '@/services/profile-service';
import { Blobatar } from '@blobatar/react-native';
import { describeAuthError, getMyProfile, getOnboardingStep, routeForStep, useSession } from '@/services/auth-service';
import type { MyProfile } from '@/services/auth-service';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

const ICONS = {
  logo: require('@/assets/icons/auth/logo-mark.svg'),
  mark: require('@/assets/icons/auth/hanet-icon.svg'),
};

const ROLE_LABELS: Record<string, string> = {
  Estudiante: 'Estudiante',
  Directiva: 'Directiva de curso',
  CEE: 'Centro de estudiantes',
  Admin: 'Administración',
  HNT: 'Equipo HaNet',
};

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  // First name and first surname: "Martín Ignacio Ávila Dalencon" reads "MÁ" when there are four parts.
  const second = parts.length >= 4 ? parts[2] : parts[1];
  return (parts[0][0] + (second?.[0] ?? '')).toLocaleUpperCase('es');
}

export default function ProfileScreen() {
  const router = useRouter();
  const { user, initializing, signOut } = useSession();

  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [loadedUid, setLoadedUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  // Whether we already know if this account has a photo; until then the
  // portrait stays empty instead of flashing the initials first.
  const [photoCheckedUid, setPhotoCheckedUid] = useState<string | null>(null);
  const reducedMotion = useReducedMotion();
  const fontsReady = useNameFonts();

  // Reloaded on every visit: the role or the link may have changed elsewhere.
  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let active = true;
      getMyProfile()
        .then(data => {
          if (!active) return;
          setProfile(data);
          setLoadedUid(user.uid);
          setError(null);
        })
        .catch(loadError => {
          if (active) setError(describeAuthError(loadError, 'No pudimos cargar tu perfil. Revisa tu conexión.'));
        });
      // The photo is optional: failing to load it must not hide the profile.
      getProfilePhotoUrl(user.uid)
        .then(url => { if (active) setPhotoUrl(url); })
        .catch(() => undefined)
        .finally(() => { if (active) setPhotoCheckedUid(user.uid); });
      return () => { active = false; };
    }, [user])
  );

  if (initializing) {
    return (
      <SafeAreaView style={[styles.screen, styles.centered]}>
        <ActivityIndicator size="large" color={AppColors.textSecondary} />
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={[styles.screen, styles.centered]}>
        <Image source={ICONS.logo} style={styles.emptyLogo} contentFit="contain" />
        <ThemedText style={styles.emptyTitle}>Tu HaNet ID</ThemedText>
        <ThemedText style={styles.emptyText}>Inicia sesión para ver tu perfil.</ThemedText>
        <HanetButton label="Iniciar sesión" onPress={() => router.push('/auth')} style={styles.emptyButton} />
      </SafeAreaView>
    );
  }

  // A profile loaded for another account must never be shown for this one.
  const current = loadedUid === user.uid ? profile : null;

  if (!current) {
    return (
      <SafeAreaView style={[styles.screen, styles.centered]}>
        {error ? (
          <>
            <ThemedText style={styles.emptyTitle}>Perfil no disponible</ThemedText>
            <ThemedText accessibilityLiveRegion="polite" style={styles.emptyText}>{error}</ThemedText>
            <HanetButton label="Cerrar sesión" variant="surface" onPress={() => void signOut()} style={styles.emptyButton} />
          </>
        ) : (
          <ActivityIndicator size="large" color={AppColors.textSecondary} />
        )}
      </SafeAreaView>
    );
  }

  const name = current.fullName || user.email || 'HaNet ID';
  const handle = current.username ? `@${current.username}` : null;
  const role = current.role ? ROLE_LABELS[current.role] ?? current.role : null;
  const since = current.memberSince ? new Date(current.memberSince) : null;
  const initials = initialsOf(current.fullName);
  const nameFont = getNameFont(current.nameFont);
  // Until the chosen typeface has loaded, the name shows in the default one.
  const nameFontReady = fontsReady || !nameFont.source;
  const photoChecked = photoCheckedUid === user.uid;
  // The QR and the portrait trade places with a short fade, never a hard cut.
  const swap = reducedMotion ? undefined : FadeIn.duration(150);

  const shareProfile = async () => {
    await Share.share({ message: `Soy ${name}${handle ? ` (${handle})` : ''} en HaNet.` });
  };

  const finishJoining = async () => {
    router.push(routeForStep(await getOnboardingStep(user)));
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.brand} accessible accessibilityRole="header" accessibilityLabel="HaNet ID">
            <Image source={ICONS.logo} style={styles.brandMark} contentFit="contain" />
            <ThemedText style={styles.brandName}>HaNet</ThemedText>
            <ThemedText style={styles.brandId}>ID</ThemedText>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Compartir perfil" hitSlop={6} onPress={shareProfile} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
            <Ionicons name="share-social-outline" size={20} color={AppColors.textPrimary} />
          </Pressable>
        </View>

        <View style={styles.identityCard}>
          <Image source={ICONS.mark} style={styles.cardMark} tintColor={AppColors.textOnLight} contentFit="contain" />

          {showQr ? (
            <Animated.View key="qr" entering={swap} style={styles.qrWrap} accessible accessibilityLabel={`Código QR de tu HaNet ID${handle ? `, ${handle}` : ''}`}>
              <QRCode
                value={`hanet://id/${current.username ?? user.uid}`}
                size={236}
                color={AppColors.surface}
                backgroundColor="transparent"
              />
              <ThemedText style={styles.qrHandle}>{handle ?? 'Tu HaNet ID'}</ThemedText>
            </Animated.View>
          ) : (
            // Without a photo, the account's blobatar stands in for the picture.
            <Animated.View key="portrait" entering={swap} style={styles.portrait} accessible accessibilityLabel={photoUrl ? `Foto de perfil de ${name}` : `Blobatar de ${name}`}>
              {photoUrl ? (
                <Image source={{ uri: photoUrl }} style={styles.portraitPhoto} contentFit="cover" transition={150} />
              ) : photoChecked && current.avatarSeed ? (
                <Blobatar name={current.avatarSeed} size={208} tone={0.5} background={false} normalize={false} />
              ) : photoChecked ? (
                <ThemedText style={styles.initials}>{initials || '·'}</ThemedText>
              ) : null}
            </Animated.View>
          )}

          <View style={styles.identityInfo}>
            <ThemedText
              style={[
                styles.name,
                // The chosen typeface arrives a moment after the screen: the
                // name waits for it rather than showing in one and jumping to another.
                nameFontReady
                  ? { fontFamily: nameFont.fontFamily, fontSize: 34 * nameFont.scale, letterSpacing: nameFont.letterSpacing }
                  : styles.nameWaiting,
              ]}
              numberOfLines={2}
              adjustsFontSizeToFit
            >
              {name}
            </ThemedText>
            {!!current.institutionFullName && <ThemedText style={styles.institution}>{current.institutionFullName}</ThemedText>}
            {!!current.courseId && <ThemedText style={styles.detail}>{current.courseId}</ThemedText>}
            {!!role && <ThemedText style={styles.detail}>{role}{handle ? ` · ${handle}` : ''}</ThemedText>}
            {!role && !!handle && <ThemedText style={styles.detail}>{handle}</ThemedText>}
            {!!since && <ThemedText style={styles.accountAge}>En HaNet desde {MONTHS[since.getMonth()]} de {since.getFullYear()}</ThemedText>}
          </View>
        </View>

        <View style={styles.actionPanel}>
          <ProfileAction label="Compartir" icon="share-outline" onPress={shareProfile} />
          <ProfileAction label="Editar" icon="pencil-outline" onPress={() => router.push('/edit-profile')} />
          <ProfileAction label="Mi HN-QR" icon="qr-code-outline" selected={showQr} onPress={() => setShowQr(value => !value)} />
        </View>

        {current.linked ? (
          <View style={styles.linkCard} accessible accessibilityLabel={`Vinculado a ${current.institutionFullName ?? 'tu institución'}`}>
            <View style={styles.linkBadge}>
              <Ionicons name="school-outline" size={20} color={AppColors.controlOnActive} />
            </View>
            <View style={styles.linkCopy}>
              <ThemedText style={styles.linkEyebrow}>Vinculado a</ThemedText>
              <ThemedText style={styles.linkTitle}>{current.institutionFullName ?? 'Tu institución'}</ThemedText>
            </View>
          </View>
        ) : (
          <Pressable accessibilityRole="button" onPress={finishJoining} style={({ pressed }) => [styles.linkCard, pressed && styles.pressed]}>
            <View style={styles.linkBadge}>
              <Ionicons name="school-outline" size={20} color={AppColors.controlOnActive} />
            </View>
            <View style={styles.linkCopy}>
              <ThemedText style={styles.linkEyebrow}>Aún sin institución</ThemedText>
              <ThemedText style={styles.linkTitle}>Termina de unirte</ThemedText>
            </View>
            <Ionicons name="arrow-forward" size={20} color={AppColors.textSecondary} />
          </Pressable>
        )}

        {!!error && <ThemedText accessibilityLiveRegion="polite" style={styles.staleNote}>No pudimos actualizar tu perfil; puede que veas datos de hace un momento.</ThemedText>}

        <View style={styles.accountActions}>
          <HanetButton
            label="Cerrar sesión"
            variant="surface"
            accessibilityHint={user.email ? `Sesión iniciada como ${user.email}` : undefined}
            onPress={() => void signOut()}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ProfileAction({ label, icon, selected = false, soon = false, onPress }: { label: string; icon: keyof typeof Ionicons.glyphMap; selected?: boolean; soon?: boolean; onPress?: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={soon ? `${label}, próximamente` : label}
      accessibilityState={{ selected, disabled: soon }}
      disabled={soon}
      onPress={onPress}
      style={({ pressed }) => [styles.profileAction, selected && styles.profileActionSelected, soon && styles.profileActionSoon, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={24} color={selected ? AppColors.controlOnActive : AppColors.textPrimary} />
      <ThemedText style={[styles.profileActionText, selected && styles.profileActionTextSelected]}>{label}</ThemedText>
      {soon && <ThemedText style={styles.profileActionSoonText}>Pronto</ThemedText>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: AppColors.canvas },
  centered: { alignItems: 'center', justifyContent: 'center', padding: AppSpacing.xl, gap: AppSpacing.sm },
  page: { width: '100%', maxWidth: 430, alignSelf: 'center', paddingHorizontal: AppSpacing.lg, paddingBottom: 150, gap: AppSpacing.md },

  emptyLogo: { width: 47, height: 43, marginBottom: AppSpacing.sm },
  emptyTitle: { color: AppColors.textPrimary, fontFamily: 'DMSans_700Bold', fontSize: 24, lineHeight: 30, letterSpacing: -0.9 },
  emptyText: { color: AppColors.textSecondary, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  emptyButton: { marginTop: AppSpacing.md, minWidth: 200 },

  header: { minHeight: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center' },
  brandMark: { width: 24, height: 26, marginRight: 8 },
  brandName: { color: AppColors.textPrimary, fontFamily: 'DMSans_500Medium', fontSize: 18, lineHeight: 24 },
  brandId: { color: AppColors.textSecondary, fontFamily: 'DMSans_400Regular', fontSize: 11, lineHeight: 14, marginLeft: 4, alignSelf: 'flex-end', marginBottom: 3 },
  iconButton: { minWidth: 56, height: 40, borderRadius: AppRadii.pill, backgroundColor: AppColors.surface, alignItems: 'center', justifyContent: 'center' },

  identityCard: { minHeight: 570, borderRadius: 30, borderCurve: 'continuous', overflow: 'hidden', backgroundColor: AppColors.surfaceSoft },
  cardMark: { position: 'absolute', right: -18, bottom: -34, width: 190, height: 282, opacity: 0.1 },
  portrait: { height: 356, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, borderCurve: 'continuous', backgroundColor: AppColors.surface, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  portraitPhoto: { width: '100%', height: '100%' },
  initials: { color: AppColors.textPrimary, fontFamily: 'DMSans_700Bold', fontSize: 112, lineHeight: 124, letterSpacing: -5 },
  qrWrap: { height: 356, alignItems: 'center', justifyContent: 'center', gap: AppSpacing.md },
  qrHandle: { color: AppColors.textOnLight, fontFamily: 'DMSans_700Bold', fontSize: 15, lineHeight: 20 },
  identityInfo: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 20, paddingBottom: 24 },
  name: { color: AppColors.textOnLight, fontSize: 34, lineHeight: 41, letterSpacing: -1.7, fontFamily: 'DMSans_500Medium' },
  nameWaiting: { opacity: 0 },
  institution: { color: AppColors.textOnLight, fontSize: 15, lineHeight: 19, fontFamily: 'DMSans_500Medium' },
  detail: { color: AppColors.textOnLight, fontSize: 13, lineHeight: 16, opacity: 0.82 },
  accountAge: { color: AppColors.textOnLight, fontSize: 13, lineHeight: 17, opacity: 0.6, marginTop: 4 },

  actionPanel: { flexDirection: 'row', gap: AppSpacing.sm, padding: AppSpacing.sm, borderRadius: AppRadii.xl, borderCurve: 'continuous', backgroundColor: AppColors.surface },
  profileAction: { flex: 1, minHeight: 118, borderRadius: AppRadii.lg, borderCurve: 'continuous', backgroundColor: AppColors.primary, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 8 },
  profileActionSelected: { backgroundColor: AppColors.controlActive },
  profileActionSoon: { opacity: 0.5 },
  profileActionText: { color: AppColors.textPrimary, fontFamily: 'DMSans_500Medium', fontSize: 14, lineHeight: 18, textAlign: 'center' },
  profileActionTextSelected: { color: AppColors.controlOnActive, fontFamily: 'DMSans_700Bold' },
  profileActionSoonText: { color: AppColors.textPrimary, fontFamily: 'DMSans_500Medium', fontSize: 11, lineHeight: 14, marginTop: -6 },

  linkCard: { minHeight: 88, paddingHorizontal: AppSpacing.lg, flexDirection: 'row', alignItems: 'center', gap: AppSpacing.md, backgroundColor: AppColors.surface, borderRadius: AppRadii.xl, borderCurve: 'continuous' },
  linkBadge: { width: AppTouch.minimum, height: 40, borderRadius: AppRadii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: AppColors.controlActive },
  linkCopy: { flex: 1 },
  linkEyebrow: { color: AppColors.textSecondary, fontSize: 12, lineHeight: 16 },
  linkTitle: { color: AppColors.textPrimary, fontSize: 15, lineHeight: 20, fontFamily: 'DMSans_700Bold' },

  accountActions: { gap: AppSpacing.md, marginTop: AppSpacing.lg },
  staleNote: { color: AppColors.textSecondary, fontSize: 12, lineHeight: 16, textAlign: 'center', opacity: 0.8 },
  pressed: { opacity: 0.72 },
});
