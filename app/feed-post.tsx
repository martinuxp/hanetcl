import { SpaceAvatar } from '@/components/feed/feed-ui';
import { ThemedText } from '@/components/themed-text';
import { CustomIcon } from '@/components/ui/custom-icon';
import { HanetButton } from '@/components/ui/hanet-button';
import { HanetDialog } from '@/components/ui/hanet-dialog';
import { withSheetFrame } from '@/components/ui/sheet-frame';
import { AppColors, AppPressed, AppRadii, AppSpacing, AppTouch } from '@/constants/design-tokens';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { describeAuthError, useRole } from '@/services/auth-service';
import {
  AUDIENCE_LABELS,
  FeedImageError,
  MAX_FEED_BODY,
  MAX_FEED_IMAGES,
  MAX_FEED_TAGS,
  audienceLabel,
  getLoadedFeed,
  listFeed,
  pickFeedImages,
  saveFeedPost,
  spaceGroup,
  uploadFeedImage,
} from '@/services/feed-service';
import type { Feed, FeedAudience, FeedPost } from '@/services/feed-service';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Publishing in the feed, after Substack's compose screen: the Espacio on top,
// large text, the images as cards and the options as tiles at the bottom.

type Picture = { kind: 'kept'; url: string } | { kind: 'new'; uri: string };

const AUDIENCES: { value: FeedAudience; label: string }[] = [
  { value: { kind: 'all' }, label: AUDIENCE_LABELS.all },
  { value: { kind: 'jornada', jornada: 'manana' }, label: AUDIENCE_LABELS.manana },
  { value: { kind: 'jornada', jornada: 'tarde' }, label: AUDIENCE_LABELS.tarde },
];

function sameAudience(a: FeedAudience, b: FeedAudience) {
  return audienceLabel(a) === audienceLabel(b) && a.kind === b.kind;
}

function FeedPostScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const role = useRole();

  const [feed, setFeed] = useState<Feed | null>(() => getLoadedFeed());
  const [loadError, setLoadError] = useState<string | null>(null);
  const original = useMemo<FeedPost | null>(() => (id ? feed?.posts.find(post => post.id === id) ?? null : null), [feed, id]);

  useEffect(() => {
    if (feed) return;
    listFeed().then(setFeed).catch(error => setLoadError(describeAuthError(error, 'No pudimos abrir el feed.')));
  }, [feed]);

  const [spaceKey, setSpaceKey] = useState<string | null>(null);
  const [body, setBody] = useState<string | null>(null);
  const [tags, setTags] = useState<string[] | null>(null);
  const [pictures, setPictures] = useState<Picture[] | null>(null);
  const [audience, setAudience] = useState<FeedAudience | null>(null);
  const [pinned, setPinned] = useState<boolean | null>(null);

  // Until something is touched, the form shows the post being edited (or a blank one).
  const space = original?.space ?? feed?.publishAs.find(item => item.key === spaceKey) ?? feed?.publishAs[0] ?? null;
  const currentBody = body ?? original?.body ?? '';
  const currentTags = tags ?? original?.tags ?? [];
  const currentPictures = pictures ?? (original?.images ?? []).map(url => ({ kind: 'kept', url }) as Picture);
  const currentAudience = audience ?? original?.audience ?? { kind: 'all' };
  const currentPinned = pinned ?? original?.pinned ?? false;
  const canPin = original ? original.canPin : role === 'HNT' || (role === 'Admin' && !!space && space.key !== 'hanet');
  const isSchool = !!space && spaceGroup(space.key) === 'school';

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'space' | 'audience' | 'tags' | null>(null);

  const dirty = body !== null || tags !== null || pictures !== null || audience !== null || pinned !== null || spaceKey !== null;
  const ready = !!space && (currentBody.trim().length > 0 || currentPictures.length > 0) && (!original || dirty);

  const addPictures = async (source: 'camera' | 'library') => {
    setError(null);
    try {
      const uris = await pickFeedImages(source, MAX_FEED_IMAGES - currentPictures.length);
      if (uris.length) setPictures([...currentPictures, ...uris.map(uri => ({ kind: 'new', uri }) as Picture)]);
    } catch (pickError) {
      setError(pickError instanceof FeedImageError ? pickError.message : 'No pudimos abrir las imágenes.');
    }
  };

  const toggleTag = (tag: string) => {
    if (currentTags.includes(tag)) setTags(currentTags.filter(item => item !== tag));
    else if (currentTags.length < MAX_FEED_TAGS) setTags([...currentTags, tag]);
  };

  const submit = async () => {
    if (!ready || submitting || !space) return;
    setSubmitting(true);
    setError(null);
    try {
      const uploadPaths: string[] = [];
      for (const picture of currentPictures) if (picture.kind === 'new') uploadPaths.push(await uploadFeedImage(picture.uri));
      await saveFeedPost({
        id: original?.id,
        space: original ? undefined : spaceGroup(space.key),
        body: currentBody,
        tags: currentTags,
        keepImages: currentPictures.flatMap(picture => (picture.kind === 'kept' ? [picture.url] : [])),
        uploadPaths,
        audience: isSchool ? currentAudience : undefined,
        pinned: canPin ? currentPinned : undefined,
      });
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      allowLeave();
      router.back();
    } catch (saveError) {
      setError(saveError instanceof FeedImageError ? saveError.message : describeAuthError(saveError, 'No pudimos publicar. Inténtalo nuevamente.'));
      setSubmitting(false);
    }
  };

  const label = original ? 'Guardar' : 'Publicar';
  const { allowLeave, dialog: guardDialog } = useUnsavedChangesGuard({
    dirty: dirty && !submitting,
    onSave: submit,
    saveLabel: label,
    canSave: ready,
    title: original ? '¿Descartar los cambios?' : '¿Descartar esta publicación?',
    message: original ? 'La publicación quedará como estaba.' : 'Todavía no la has publicado.',
  });

  const options = [
    isSchool && { key: 'audience', label: 'Le llega a', value: audienceLabel(currentAudience), onPress: () => setDialog('audience') },
    { key: 'tags', label: 'Tags', value: currentTags.length ? currentTags.map(tag => `#${tag}`).join(' ') : 'Sin tags', onPress: () => setDialog('tags') },
    canPin && { key: 'pin', label: 'Fijar arriba', value: currentPinned ? 'Sí' : 'No', onPress: () => setPinned(!currentPinned) },
  ].filter((option): option is { key: string; label: string; value: string; onPress: () => void } => !!option);

  const top = (Platform.OS === 'android' ? 0 : insets.top) + AppSpacing.lg;

  if (!feed || (id && !original)) {
    return (
      <View style={[styles.sheet, styles.center, { paddingTop: top }]}>
        {loadError || (feed && id && !original)
          ? <ThemedText style={styles.error}>{loadError ?? 'Esa publicación ya no está disponible.'}</ThemedText>
          : <ActivityIndicator color={AppColors.textSecondary} />}
      </View>
    );
  }

  if (!space) {
    return (
      <View style={[styles.sheet, styles.center, { paddingTop: top }]}>
        <ThemedText style={styles.error}>Tu rol no publica en el feed.</ThemedText>
        <HanetButton label="Volver" variant="surface" onPress={() => router.back()} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.sheet}
      contentContainerStyle={[styles.content, { paddingTop: top, paddingBottom: insets.bottom + AppSpacing.xl }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.topRow}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={({ pressed }) => [styles.cancel, pressed && AppPressed]}>
          <ThemedText style={styles.cancelText}>Cancelar</ThemedText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !ready || submitting, busy: submitting }}
          disabled={!ready || submitting}
          onPress={submit}
          style={({ pressed }) => [styles.publish, (!ready || submitting) && styles.publishDisabled, pressed && AppPressed]}
        >
          <ThemedText style={styles.publishText}>{submitting ? (currentPictures.some(picture => picture.kind === 'new') ? 'Subiendo…' : 'Publicando…') : label}</ThemedText>
        </Pressable>
      </View>

      <Pressable
        accessibilityRole={!original && feed.publishAs.length > 1 ? 'button' : undefined}
        accessibilityLabel={`Publicas como ${space.name}`}
        accessibilityHint={!original && feed.publishAs.length > 1 ? 'Elegir otro Espacio' : undefined}
        disabled={!!original || feed.publishAs.length < 2 || submitting}
        onPress={() => setDialog('space')}
        style={({ pressed }) => [styles.author, pressed && AppPressed]}
      >
        <SpaceAvatar space={space} size={44} />
        <View style={styles.authorText}>
          <ThemedText numberOfLines={1} style={styles.authorName}>{space.name}</ThemedText>
          <ThemedText numberOfLines={1} style={styles.authorHint}>
            {original ? 'Editando una publicación' : feed.publishAs.length > 1 ? 'Toca para elegir otro Espacio' : space.official ? 'Publicas como el Espacio oficial' : `Publicas como ${space.kind.toLocaleLowerCase('es')}`}
          </ThemedText>
        </View>
        {!original && feed.publishAs.length > 1 && <CustomIcon name="chevron-right" size={20} color={AppColors.textSecondary} />}
      </Pressable>

      <TextInput
        accessibilityLabel="Mensaje"
        value={currentBody}
        onChangeText={text => { setBody(text); setError(null); }}
        placeholder={spaceGroup(space.key) === 'course' ? '¿Qué quieres contarle a tu curso?' : '¿Qué quieres contarle a tu liceo?'}
        placeholderTextColor="rgba(221, 221, 226, 0.4)"
        multiline
        maxLength={MAX_FEED_BODY}
        editable={!submitting}
        autoFocus={!original}
        selectionColor={AppColors.accent}
        style={styles.input}
      />
      {currentBody.length > MAX_FEED_BODY - 200 && (
        <ThemedText style={styles.hint}>{MAX_FEED_BODY - currentBody.length} caracteres disponibles</ThemedText>
      )}

      {currentPictures.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pictures}>
          {currentPictures.map((picture, index) => (
            <View key={picture.kind === 'kept' ? picture.url : picture.uri} style={styles.picture}>
              <Image source={{ uri: picture.kind === 'kept' ? picture.url : picture.uri }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel={`Imagen ${index + 1}`} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Quitar la imagen ${index + 1}`}
                disabled={submitting}
                hitSlop={6}
                onPress={() => setPictures(currentPictures.filter((_, position) => position !== index))}
                style={({ pressed }) => [styles.removePicture, pressed && AppPressed]}
              >
                <CustomIcon name="close" size={14} color={AppColors.textPrimary} />
              </Pressable>
            </View>
          ))}
          {currentPictures.length < MAX_FEED_IMAGES && (
            <Pressable accessibilityRole="button" accessibilityLabel="Agregar otra imagen" disabled={submitting} onPress={() => void addPictures('library')} style={({ pressed }) => [styles.addPicture, pressed && AppPressed]}>
              <CustomIcon name="plus" size={26} color={AppColors.textSecondary} />
            </Pressable>
          )}
        </ScrollView>
      )}

      <View style={styles.tools}>
        <Pressable accessibilityRole="button" accessibilityLabel="Elegir imágenes de la galería" disabled={submitting || currentPictures.length >= MAX_FEED_IMAGES} onPress={() => void addPictures('library')} style={({ pressed }) => [styles.tool, currentPictures.length >= MAX_FEED_IMAGES && styles.toolDisabled, pressed && AppPressed]}>
          <CustomIcon name="image" size={26} color={AppColors.textPrimary} />
        </Pressable>
        {Platform.OS !== 'web' && (
          <Pressable accessibilityRole="button" accessibilityLabel="Tomar una foto" disabled={submitting || currentPictures.length >= MAX_FEED_IMAGES} onPress={() => void addPictures('camera')} style={({ pressed }) => [styles.tool, currentPictures.length >= MAX_FEED_IMAGES && styles.toolDisabled, pressed && AppPressed]}>
            <CustomIcon name="camera" size={26} color={AppColors.textPrimary} />
          </Pressable>
        )}
        <Pressable accessibilityRole="button" accessibilityLabel="Elegir tags" disabled={submitting} onPress={() => setDialog('tags')} style={({ pressed }) => [styles.tool, pressed && AppPressed]}>
          <CustomIcon name="tag" size={24} color={AppColors.textPrimary} />
        </Pressable>
        <ThemedText style={styles.toolsHint}>Hasta {MAX_FEED_IMAGES} imágenes</ThemedText>
      </View>

      {!!error && <ThemedText accessibilityLiveRegion="assertive" style={styles.error}>{error}</ThemedText>}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.options}>
        {options.map(option => (
          <Pressable key={option.key} accessibilityRole="button" accessibilityLabel={`${option.label}: ${option.value}`} disabled={submitting} onPress={option.onPress} style={({ pressed }) => [styles.option, pressed && AppPressed]}>
            <ThemedText style={styles.optionLabel}>{option.label}</ThemedText>
            <ThemedText numberOfLines={2} style={styles.optionValue}>{option.value}</ThemedText>
          </Pressable>
        ))}
      </ScrollView>

      <HanetDialog visible={dialog === 'space'} onRequestClose={() => setDialog(null)} dismissOnBackdrop title="¿En qué Espacio publicas?">
        <View style={styles.dialogButtons}>
          {feed.publishAs.map(item => (
            <HanetButton key={item.key} label={item.name} variant={item.key === space.key ? 'primary' : 'surface'} onPress={() => { setSpaceKey(item.key); setDialog(null); }} />
          ))}
        </View>
      </HanetDialog>

      <HanetDialog visible={dialog === 'audience'} onRequestClose={() => setDialog(null)} dismissOnBackdrop title="¿A quién le llega?" body="Administración y el equipo HaNet ven todas las publicaciones.">
        <View style={styles.dialogButtons}>
          {AUDIENCES.map(item => (
            <HanetButton key={item.label} label={item.label} variant={sameAudience(item.value, currentAudience) ? 'primary' : 'surface'} onPress={() => { setAudience(item.value); setDialog(null); }} />
          ))}
        </View>
      </HanetDialog>

      <HanetDialog visible={dialog === 'tags'} onRequestClose={() => setDialog(null)} dismissOnBackdrop title="Tags" body={`Elige hasta ${MAX_FEED_TAGS}. Ayudan a encontrar la publicación en el buscador.`}>
        <View style={styles.chips}>
          {feed.tags.map(tag => {
            const on = currentTags.includes(tag);
            const full = !on && currentTags.length >= MAX_FEED_TAGS;
            return (
              <Pressable
                key={tag}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on, disabled: full }}
                disabled={full}
                onPress={() => toggleTag(tag)}
                style={({ pressed }) => [styles.chip, on && styles.chipOn, full && styles.toolDisabled, pressed && AppPressed]}
              >
                <ThemedText style={[styles.chipText, on && styles.chipTextOn]}>#{tag}</ThemedText>
              </Pressable>
            );
          })}
        </View>
        <HanetButton label="Listo" variant="surface" onPress={() => setDialog(null)} />
      </HanetDialog>

      {guardDialog}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: AppColors.canvas,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: AppSpacing.lg,
    padding: AppSpacing.xl,
  },
  content: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    gap: 20,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: AppSpacing.lg,
  },
  cancel: {
    height: 48,
    justifyContent: 'center',
    paddingHorizontal: 20,
    borderRadius: AppRadii.pill,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    backgroundColor: 'rgba(60, 59, 62, 0.72)',
  },
  cancelText: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 16,
    lineHeight: 22,
    color: AppColors.textSecondary,
  },
  publish: {
    height: 48,
    justifyContent: 'center',
    paddingHorizontal: 22,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.accent,
  },
  publishDisabled: {
    opacity: 0.45,
  },
  publishText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 16,
    lineHeight: 22,
    color: AppColors.textPrimary,
  },
  author: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
    paddingHorizontal: AppSpacing.lg,
  },
  authorText: {
    flex: 1,
    gap: 1,
  },
  authorName: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 17,
    lineHeight: 22,
    color: AppColors.textPrimary,
  },
  authorHint: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.textSecondary,
  },
  input: {
    minHeight: 112,
    marginHorizontal: AppSpacing.lg,
    padding: 0,
    fontFamily: 'DMSans_400Regular',
    fontSize: 20,
    lineHeight: 28,
    color: AppColors.textPrimary,
    textAlignVertical: 'top',
    outlineStyle: 'none' as never,
  },
  hint: {
    marginTop: -AppSpacing.md,
    paddingHorizontal: AppSpacing.lg,
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.textSecondary,
  },
  pictures: {
    gap: AppSpacing.sm,
    paddingHorizontal: AppSpacing.lg,
  },
  picture: {
    width: 120,
    height: 150,
    overflow: 'hidden',
    borderRadius: AppRadii.md,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  removePicture: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: AppRadii.pill,
    backgroundColor: 'rgba(40, 40, 41, 0.8)',
  },
  addPicture: {
    width: 120,
    height: 150,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: AppRadii.md,
    borderCurve: 'continuous',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: AppColors.surfaceMuted,
  },
  tools: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.xs,
    paddingHorizontal: 6,
  },
  tool: {
    width: AppTouch.comfortable,
    height: AppTouch.comfortable,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: AppRadii.pill,
  },
  toolDisabled: {
    opacity: 0.4,
  },
  toolsHint: {
    flex: 1,
    textAlign: 'right',
    paddingRight: AppSpacing.md,
    fontFamily: 'DMSans_500Medium',
    fontSize: 12,
    lineHeight: 16,
    color: AppColors.textSecondary,
  },
  options: {
    gap: 10,
    paddingHorizontal: AppSpacing.lg,
  },
  option: {
    width: 168,
    height: 104,
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: AppSpacing.lg,
    borderRadius: AppRadii.lg,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  optionLabel: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.textSecondary,
  },
  optionValue: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 17,
    lineHeight: 22,
    color: AppColors.textPrimary,
  },
  error: {
    paddingHorizontal: AppSpacing.lg,
    textAlign: 'center',
    fontFamily: 'DMSans_700Bold',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.errorText,
  },
  dialogButtons: {
    gap: AppSpacing.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing.sm,
    marginBottom: AppSpacing.md,
  },
  chip: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: AppSpacing.lg,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.surfaceMuted,
  },
  chipOn: {
    backgroundColor: AppColors.controlActive,
  },
  chipText: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.textPrimary,
  },
  chipTextOn: {
    color: AppColors.controlOnActive,
  },
});

export default withSheetFrame(FeedPostScreen, AppColors.canvas);
