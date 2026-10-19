import { withSheetFrame } from '@/components/ui/sheet-frame';
import { ThemedText } from '@/components/themed-text';
import { HanetAvatar } from '@/components/ui/hanet-avatar';
import { HanetButton } from '@/components/ui/hanet-button';
import { AppColors, AppRadii, AppSpacing } from '@/constants/design-tokens';
import { NAME_FONTS } from '@/constants/name-fonts';
import type { NameFontId } from '@/constants/name-fonts';
import { useNameFonts } from '@/hooks/use-name-fonts';
import { describeAuthError, getMyProfile, useSession } from '@/services/auth-service';
import {
  describePhotoError,
  getProfilePhotoUrl,
  newAvatar,
  pickProfilePhoto,
  removeProfilePhoto,
  saveNameFont,
  uploadProfilePhoto,
} from '@/services/profile-service';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  const second = parts.length >= 4 ? parts[2] : parts[1];
  return (parts[0][0] + (second?.[0] ?? '')).toLocaleUpperCase('es');
}

function EditProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, initializing } = useSession();
  const fontsReady = useNameFonts();

  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState<'uploading' | 'removing' | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [avatarSeed, setAvatarSeed] = useState<string | null>(null);
  const [rerolling, setRerolling] = useState(false);

  const [font, setFont] = useState<NameFontId>('dm-sans');
  const [savingFont, setSavingFont] = useState<NameFontId | null>(null);
  const [fontError, setFontError] = useState<string | null>(null);

  useEffect(() => {
    if (initializing) return;
    if (!user) {
      router.replace('/onboarding');
      return;
    }
    let active = true;
    (async () => {
      try {
        const [profile, photo] = await Promise.all([getMyProfile(), getProfilePhotoUrl(user.uid).catch(() => null)]);
        if (!active) return;
        setName(profile.fullName || user.email || '');
        setFont(NAME_FONTS.some(option => option.id === profile.nameFont) ? (profile.nameFont as NameFontId) : 'dm-sans');
        setPhotoUrl(photo);
        setAvatarSeed(profile.avatarSeed);
      } catch (error) {
        if (active) setLoadError(describeAuthError(error, 'No pudimos cargar tu perfil. Revisa tu conexión.'));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [initializing, router, user]);

  const success = () => {
    if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const changePhoto = async () => {
    if (!user || photoBusy) return;
    setPhotoError(null);
    try {
      const uri = await pickProfilePhoto();
      if (!uri) return;
      setPhotoBusy('uploading');
      setPhotoUrl(await uploadProfilePhoto(user.uid, uri));
      success();
    } catch (error) {
      console.error(error);
      setPhotoError(describePhotoError(error));
    } finally {
      setPhotoBusy(null);
    }
  };

  const rerollAvatar = async () => {
    if (rerolling) return;
    setPhotoError(null);
    setRerolling(true);
    try {
      setAvatarSeed(await newAvatar());
      success();
    } catch (error) {
      setPhotoError(describeAuthError(error, 'No pudimos cambiar tu blobatar. Inténtalo nuevamente.'));
    } finally {
      setRerolling(false);
    }
  };

  const removePhoto = async () => {
    if (!user || photoBusy) return;
    setPhotoError(null);
    setPhotoBusy('removing');
    try {
      await removeProfilePhoto(user.uid);
      setPhotoUrl(null);
    } catch (error) {
      console.error(error);
      setPhotoError(describePhotoError(error));
    } finally {
      setPhotoBusy(null);
    }
  };

  // The choice shows at once and is rolled back if saving fails.
  const chooseFont = async (next: NameFontId) => {
    if (next === font || savingFont) return;
    const previous = font;
    setFont(next);
    setSavingFont(next);
    setFontError(null);
    // The tick belongs to the tap, on the same frame as the visual change.
    if (Platform.OS === 'ios') void Haptics.selectionAsync();
    try {
      await saveNameFont(next);
    } catch (error) {
      setFont(previous);
      setFontError(describeAuthError(error, 'No pudimos guardar la letra. Inténtalo nuevamente.'));
    } finally {
      setSavingFont(null);
    }
  };

  if (initializing || loading) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={AppColors.textOnLight} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 20) + AppSpacing.lg }]}
      >
        <ThemedText style={styles.eyebrow}>HaNet ID</ThemedText>
        <ThemedText accessibilityRole="header" style={styles.title}>Editar perfil</ThemedText>
        <View style={styles.separator} />

        {!!loadError && <ThemedText accessibilityLiveRegion="assertive" style={styles.error}>{loadError}</ThemedText>}

        <View style={styles.section}>
          <ThemedText style={styles.label}>Foto de perfil</ThemedText>
          <View style={styles.photoRow}>
            <View style={styles.photo}>
              {/* Without a photo, the account's blobatar stands in for it. */}
              <HanetAvatar
                photoUrl={photoUrl}
                seed={avatarSeed}
                fallback={initialsOf(name) || '·'}
                width={116}
                radius={AppRadii.lg}
                accessibilityLabel={photoUrl ? 'Tu foto de perfil' : 'Tu blobatar'}
              />
              {!!photoBusy && (
                <View style={styles.photoBusy}>
                  <ActivityIndicator color={AppColors.textPrimary} />
                </View>
              )}
            </View>

            <View style={styles.photoActions}>
              <HanetButton
                label={photoBusy === 'uploading' ? 'Subiendo…' : photoUrl ? 'Cambiar foto' : 'Elegir foto'}
                onPress={changePhoto}
                disabled={!!photoBusy}
              />
              {photoUrl ? (
                <HanetButton
                  label={photoBusy === 'removing' ? 'Quitando…' : 'Quitar foto'}
                  variant="surface"
                  onPress={removePhoto}
                  disabled={!!photoBusy}
                />
              ) : (
                <HanetButton
                  label={rerolling ? 'Cambiando…' : 'Otro blobatar'}
                  variant="surface"
                  onPress={rerollAvatar}
                  disabled={rerolling || !avatarSeed}
                  accessibilityHint="Cambia tu personaje por otro al azar"
                />
              )}
            </View>
          </View>
          {!!photoError && <ThemedText accessibilityLiveRegion="assertive" style={styles.error}>{photoError}</ThemedText>}
          <ThemedText style={styles.note}>
            {photoUrl
              ? 'Por ahora tu foto solo la ves tú, en tu perfil. Los demás ven tu blobatar.'
              : 'Sin foto, los demás te ven con tu blobatar, un personaje al azar.'}
          </ThemedText>
        </View>

        <View style={styles.section}>
          <ThemedText style={styles.label}>Letra de tu nombre</ThemedText>
          <View accessibilityRole="radiogroup" style={styles.fonts}>
            {NAME_FONTS.map(option => {
              const selected = option.id === font;
              return (
                <Pressable
                  key={option.id}
                  accessibilityRole="radio"
                  accessibilityLabel={`Letra ${option.label}`}
                  accessibilityState={{ checked: selected, busy: savingFont === option.id }}
                  onPress={() => chooseFont(option.id)}
                  style={({ pressed }) => [styles.fontOption, selected && styles.fontOptionSelected, pressed && !selected && styles.pressed]}
                >
                  <ThemedText
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.6}
                    style={[
                      styles.fontSample,
                      {
                        // Until the typefaces finish loading, every sample falls back to the default one.
                        fontFamily: fontsReady || !option.source ? option.fontFamily : 'DMSans_500Medium',
                        fontSize: 24 * option.scale,
                      },
                      selected && styles.fontSampleSelected,
                    ]}
                  >
                    {name || 'Tu nombre'}
                  </ThemedText>
                  <ThemedText style={[styles.fontLabel, selected && styles.fontLabelSelected]}>{option.label}</ThemedText>
                </Pressable>
              );
            })}
          </View>
          {!!fontError && <ThemedText accessibilityLiveRegion="assertive" style={styles.error}>{fontError}</ThemedText>}
          <ThemedText style={styles.note}>Se guarda al elegirla y cambia cómo se ve tu nombre en tu perfil.</ThemedText>
        </View>

        <HanetButton label="Listo" onPress={() => router.back()} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AppColors.neutral2,
    borderTopLeftRadius: Platform.OS === 'android' ? 50 : 0,
    borderTopRightRadius: Platform.OS === 'android' ? 50 : 0,
    overflow: 'hidden',
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 30,
  },
  eyebrow: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.textOnLight,
    opacity: 0.7,
  },
  title: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -1.2,
    color: AppColors.textOnLight,
    paddingBottom: 10,
  },
  separator: {
    height: 2,
    backgroundColor: AppColors.textOnLight,
    marginBottom: 25,
  },
  section: {
    marginBottom: 28,
    gap: AppSpacing.md,
  },
  label: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 15,
    lineHeight: 20,
    color: AppColors.textOnLight,
  },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.lg,
  },
  photo: {
    width: 116,
    height: 116,
    borderRadius: AppRadii.lg,
    borderCurve: 'continuous',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AppColors.surface,
  },
  photoBusy: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(40,40,41,0.6)',
  },
  photoActions: {
    flex: 1,
    gap: AppSpacing.sm,
  },
  fonts: {
    gap: AppSpacing.sm,
  },
  fontOption: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
    paddingHorizontal: AppSpacing.xl,
    paddingVertical: AppSpacing.md,
    borderRadius: AppRadii.lg,
    borderCurve: 'continuous',
    borderWidth: 2,
    borderColor: AppColors.surface,
    backgroundColor: AppColors.surface,
  },
  fontOptionSelected: {
    borderColor: AppColors.textOnLight,
    backgroundColor: AppColors.surfaceSoft,
  },
  fontSample: {
    flex: 1,
    lineHeight: 34,
    color: AppColors.textPrimary,
  },
  fontSampleSelected: {
    color: AppColors.textOnLight,
  },
  fontLabel: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 12,
    lineHeight: 16,
    color: AppColors.textSecondary,
  },
  fontLabelSelected: {
    color: AppColors.textOnLight,
  },
  note: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 12,
    lineHeight: 16,
    color: AppColors.textOnLight,
    opacity: 0.7,
  },
  error: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.errorTextOnLight,
  },
  pressed: {
    opacity: 0.75,
  },
});

export default withSheetFrame(EditProfileScreen, AppColors.neutral2);
