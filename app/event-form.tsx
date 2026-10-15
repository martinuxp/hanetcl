import { hallFormStyles as styles } from '@/components/classhall/hall-form';
import { hallLongDate } from '@/components/classhall/hall-ui';
import { ThemedText } from '@/components/themed-text';
import { HanetDateTimePickerModal } from '@/components/ui/hanet-date-time-picker';
import { HanetChoice, HanetSelect } from '@/components/ui/hanet-select';
import { withSheetFrame } from '@/components/ui/sheet-frame';
import { AppColors, AppRadii, AppSpacing, AppTouch } from '@/constants/design-tokens';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { describeAuthError } from '@/services/auth-service';
import { EVENT_CATEGORIES, MAX_EVENT_GALLERY, fetchWikipediaSummary, getLoadedEvent, importEventFromUrl, pickEventCover, saveEvent } from '@/services/events-service';
import type { EventJornada, EventKind, SignupMode } from '@/services/events-service';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type GalleryItem = { type: 'keep' | 'url'; uri: string } | { type: 'upload'; uri: string; uploadPath: string };

type Form = {
  title: string;
  category: string;
  description: string;
  startsAt: number;
  endsAt: number | null;
  venueName: string;
  address: string;
  city: string;
  imageUrl: string;
  // Regional
  priceFrom: string;
  isFree: boolean;
  ticketUrl: string;
  sourceName: string;
  sourceUrl: string;
  sponsored: boolean;
  perk: string;
  editorialSubject: string;
  editorialSummary: string;
  editorialSourceName: string;
  editorialSourceUrl: string;
  // Institution
  jornada: EventJornada;
  signupMode: SignupMode;
  capacity: string;
};

// Next Friday at 19:00, a usual evening for an event.
function defaultStart() {
  const date = new Date();
  date.setDate(date.getDate() + ((5 - date.getDay() + 7) % 7 || 7));
  date.setHours(19, 0, 0, 0);
  return date.getTime();
}

const YES_NO = [{ value: 'no', label: 'No' }, { value: 'yes', label: 'Sí' }];
const JORNADA_OPTIONS = [{ value: 'ambas', label: 'Ambas' }, { value: 'manana', label: 'Mañana' }, { value: 'tarde', label: 'Tarde' }];
const SIGNUP_OPTIONS = [{ value: 'list', label: 'Con lista' }, { value: 'count', label: 'Solo contador' }, { value: 'none', label: 'Sin inscripción' }];

function Field({ label, optional, children }: { label: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <ThemedText style={styles.label}>{label}{optional ? <ThemedText style={styles.optional}> (opcional)</ThemedText> : null}</ThemedText>
      {children}
    </View>
  );
}

/** Publishes or edits an event: of the city (HaNet team) or of the institution (CEE, Admin). */
function EventFormScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ kind: EventKind; id?: string }>();
  const kind: EventKind = params.kind === 'institution' ? 'institution' : 'regional';
  const regional = kind === 'regional';

  const [initial] = useState<Form>(() => {
    const event = params.id ? getLoadedEvent(params.id) : null;
    return {
      title: event?.title ?? '',
      category: event?.category ?? (regional ? 'concert' : 'community'),
      description: event?.description ?? '',
      startsAt: event?.startsAt ?? defaultStart(),
      endsAt: event?.endsAt ?? null,
      venueName: event?.venueName ?? '',
      address: event?.address ?? '',
      city: event?.city ?? (regional ? 'Temuco' : ''),
      imageUrl: event?.imageUrl ?? '',
      priceFrom: event?.priceFrom ? String(event.priceFrom) : '',
      isFree: event?.isFree ?? false,
      ticketUrl: event?.ticketUrl ?? '',
      sourceName: event?.sourceName ?? '',
      sourceUrl: event?.sourceUrl ?? '',
      sponsored: event?.sponsored ?? false,
      perk: event?.perk ?? '',
      editorialSubject: event?.editorial?.subject ?? '',
      editorialSummary: event?.editorial?.summary ?? '',
      editorialSourceName: event?.editorial?.sourceName ?? '',
      editorialSourceUrl: event?.editorial?.sourceUrl ?? '',
      jornada: event?.jornada ?? 'ambas',
      signupMode: event?.signupMode ?? 'list',
      capacity: event?.capacity ? String(event.capacity) : '',
    };
  });
  const [form, setForm] = useState<Form>(initial);
  const [initialGallery] = useState<GalleryItem[]>(() => (getLoadedEvent(params.id ?? '')?.gallery ?? []).map(uri => ({ type: 'keep', uri })));
  const [gallery, setGallery] = useState<GalleryItem[]>(initialGallery);
  const [addingPhoto, setAddingPhoto] = useState(false);
  const [wiki, setWiki] = useState<{ busy: boolean; note: string | null }>({ busy: false, note: null });
  const [cover, setCover] = useState<{ uploadPath: string; localUri: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [picking, setPicking] = useState<'start' | 'end' | null>(null);
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [importNote, setImportNote] = useState<string | null>(null);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (changes: Partial<Form>) => {
    setForm(current => ({ ...current, ...changes }));
    setError(null);
  };

  const dirty = JSON.stringify(form) !== JSON.stringify(initial) || !!cover || JSON.stringify(gallery) !== JSON.stringify(initialGallery);
  const ready = form.title.trim().length >= 3 && dirty;

  const runImport = async () => {
    if (!importUrl.trim() || importing) return;
    setImporting(true);
    setImportNote(null);
    setImportWarnings([]);
    setError(null);
    try {
      const draft = await importEventFromUrl(importUrl.trim());
      // The page's own kind of event, when it matches one of ours.
      const type = draft.typeLabel.toLocaleLowerCase('es');
      const category = /concierto/.test(type) ? 'concert' : /m[uú]sica/.test(type) ? 'music' : /teatro|danza|comedia|humor/.test(type) ? 'theatre'
        : /deporte/.test(type) ? 'sports' : /familia|infantil/.test(type) ? 'family' : /exposici|arte|museo/.test(type) ? 'exhibition' : null;
      update({
        title: draft.title || form.title,
        description: draft.description || form.description,
        startsAt: draft.startsAt ?? form.startsAt,
        endsAt: draft.endsAt ?? form.endsAt,
        venueName: draft.venueName || form.venueName,
        address: draft.address || form.address,
        city: draft.city || form.city,
        imageUrl: draft.imageUrl || form.imageUrl,
        priceFrom: draft.priceFrom ? String(draft.priceFrom) : form.priceFrom,
        ticketUrl: draft.ticketUrl || form.ticketUrl,
        sourceName: draft.sourceName,
        sourceUrl: draft.sourceUrl,
        ...(category ? { category } : {}),
      });
      setGallery(current => [
        ...current,
        ...draft.images.filter(uri => !current.some(item => item.uri === uri)).map(uri => ({ type: 'url' as const, uri })),
      ].slice(0, MAX_EVENT_GALLERY));
      setImportWarnings(draft.warnings);
      const missing = [!draft.startsAt && 'la fecha', !draft.venueName && 'el lugar', !draft.priceFrom && 'el precio'].filter(Boolean);
      setImportNote(missing.length ? `Listo. Revisa y completa ${missing.join(', ')}.` : 'Listo. Revisa los datos antes de publicar.');
    } catch (importError) {
      setImportNote(describeAuthError(importError, 'No pudimos leer esa página. Carga el evento a mano.'));
    } finally {
      setImporting(false);
    }
  };

  const chooseCover = async () => {
    setUploading(true);
    setError(null);
    try {
      const picked = await pickEventCover();
      if (picked) setCover(picked);
    } catch (pickError) {
      setError(describeAuthError(pickError, 'No pudimos subir la imagen.'));
    } finally {
      setUploading(false);
    }
  };

  const addPhoto = async () => {
    setAddingPhoto(true);
    setError(null);
    try {
      const picked = await pickEventCover('gallery');
      if (picked) setGallery(current => [...current, { type: 'upload' as const, uri: picked.localUri, uploadPath: picked.uploadPath }].slice(0, MAX_EVENT_GALLERY));
    } catch (pickError) {
      setError(describeAuthError(pickError, 'No pudimos subir la foto.'));
    } finally {
      setAddingPhoto(false);
    }
  };

  const fillFromWikipedia = async () => {
    if (!form.editorialSubject.trim() || wiki.busy) return;
    setWiki({ busy: true, note: null });
    try {
      const found = await fetchWikipediaSummary(form.editorialSubject);
      if (!found) {
        setWiki({ busy: false, note: 'No encontramos un artículo con ese nombre. Prueba con el nombre completo.' });
        return;
      }
      update({ editorialSummary: found.summary, editorialSourceName: 'Wikipedia', editorialSourceUrl: found.url });
      setWiki({ busy: false, note: `Traído de «${found.title}». Revisa que sea la persona o el lugar correcto.` });
    } catch {
      setWiki({ busy: false, note: 'Wikipedia no responde. Inténtalo de nuevo.' });
    }
  };

  const submit = async () => {
    if (!ready || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await saveEvent({
        kind,
        id: params.id,
        title: form.title,
        category: form.category,
        description: form.description,
        startsAt: form.startsAt,
        endsAt: form.endsAt,
        venueName: form.venueName,
        address: form.address,
        city: form.city,
        uploadPath: cover?.uploadPath,
        galleryKeep: gallery.filter(item => item.type === 'keep').map(item => item.uri),
        galleryUploads: gallery.flatMap(item => (item.type === 'upload' ? [item.uploadPath] : [])),
        galleryUrls: gallery.filter(item => item.type === 'url').map(item => item.uri),
        ...(regional
          ? {
            imageUrl: cover ? '' : form.imageUrl,
            priceFrom: Number(form.priceFrom) || null,
            isFree: form.isFree,
            ticketUrl: form.ticketUrl,
            sourceName: form.sourceName,
            sourceUrl: form.sourceUrl,
            sponsored: form.sponsored,
            perk: form.perk,
            editorial: form.editorialSubject.trim()
              ? { subject: form.editorialSubject, summary: form.editorialSummary, sourceName: form.editorialSourceName, sourceUrl: form.editorialSourceUrl }
              : null,
          }
          : { jornada: form.jornada, signupMode: form.signupMode, capacity: Number(form.capacity) || null }),
      });
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      allowLeave();
      router.back();
    } catch (saveError) {
      setError(describeAuthError(saveError, 'No pudimos publicar el evento. Inténtalo nuevamente.'));
      setSubmitting(false);
    }
  };

  const label = params.id ? 'Guardar cambios' : 'Publicar evento';
  const { allowLeave, dialog } = useUnsavedChangesGuard({
    dirty: dirty && !submitting,
    onSave: submit,
    saveLabel: label,
    canSave: ready,
    title: params.id ? '¿Descartar los cambios?' : '¿Descartar este evento?',
    message: params.id ? 'El evento quedará como estaba.' : 'Todavía no lo has publicado.',
  });

  const input = (key: keyof Form, placeholder: string, extra: Partial<React.ComponentProps<typeof TextInput>> = {}) => (
    <TextInput
      value={String(form[key] ?? '')}
      onChangeText={text => update({ [key]: text } as Partial<Form>)}
      placeholder={placeholder}
      placeholderTextColor={AppColors.surfaceMuted}
      editable={!submitting}
      selectionColor={AppColors.accent}
      style={styles.input}
      {...extra}
    />
  );

  const shownCover = cover?.localUri || form.imageUrl;

  return (
    <ScrollView
      style={styles.sheet}
      contentContainerStyle={[styles.content, { paddingTop: (Platform.OS === 'android' ? 0 : insets.top) + AppSpacing.xxl, paddingBottom: insets.bottom + AppSpacing.xl }]}
      keyboardShouldPersistTaps="handled"
    >
      <ThemedText accessibilityRole="header" style={styles.title}>
        {params.id ? 'Editar evento' : regional ? 'Evento de la ciudad' : 'Evento del liceo'}
      </ThemedText>
      <ThemedText style={styles.lead}>
        {regional
          ? 'Aparece en "Cerca de mí" para toda la comunidad HaNet de la ciudad.'
          : 'Aparece en "En mi institución" para los estudiantes de la jornada que elijas.'}
      </ThemedText>

      {regional && !params.id && (
        <View style={local.importCard}>
          <ThemedText style={styles.label}>Importar desde link</ThemedText>
          <ThemedText style={styles.hint}>TuAcceso, Portal Tickets, Ticketplus o Passline (y Vamoh, solo en prueba). Leemos los datos públicos de la página y llenamos el formulario; revisa todo antes de publicar.</ThemedText>
          <View style={local.importRow}>
            <TextInput
              accessibilityLabel="Link del evento en la ticketera"
              value={importUrl}
              onChangeText={setImportUrl}
              placeholder="https://ticketplus.cl/events/…"
              placeholderTextColor={AppColors.surfaceMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              selectionColor={AppColors.accent}
              style={[styles.input, local.importInput]}
            />
            <Pressable accessibilityRole="button" disabled={importing || !importUrl.trim()} onPress={() => void runImport()} style={({ pressed }) => [local.pill, (importing || !importUrl.trim()) && styles.submitDisabled, pressed && styles.pressed]}>
              {importing ? <ActivityIndicator color={AppColors.textPrimary} /> : <ThemedText style={local.pillText}>Importar</ThemedText>}
            </Pressable>
          </View>
          {!!importNote && <ThemedText accessibilityLiveRegion="polite" style={styles.hint}>{importNote}</ThemedText>}
          {importWarnings.map((warning, index) => (
            <ThemedText key={index} accessibilityLiveRegion="assertive" style={styles.error}>⚠ {warning}</ThemedText>
          ))}
        </View>
      )}

      <Field label="Imagen">
        <Pressable accessibilityRole="button" accessibilityLabel={shownCover ? 'Cambiar la imagen' : 'Elegir una imagen'} disabled={uploading || submitting} onPress={() => void chooseCover()} style={({ pressed }) => [local.cover, pressed && styles.pressed]}>
          {shownCover ? <Image source={{ uri: shownCover }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
          <View style={local.coverLabel}>
            {uploading ? <ActivityIndicator color={AppColors.textPrimary} /> : <ThemedText style={local.pillText}>{shownCover ? 'Cambiar imagen' : 'Elegir imagen'}</ThemedText>}
          </View>
        </Pressable>
        {regional && !!form.imageUrl && !cover && <ThemedText style={styles.hint}>Imagen de la ticketera. Si tienes una propia, súbela.</ThemedText>}
      </Field>

      <Field label="Fotos" optional>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={local.gallery}>
          {gallery.map((item, index) => (
            <View key={item.uri} style={local.thumb}>
              <Image source={{ uri: item.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
              <Pressable accessibilityRole="button" accessibilityLabel={`Quitar la foto ${index + 1}`} hitSlop={8} disabled={submitting} onPress={() => setGallery(current => current.filter(other => other.uri !== item.uri))} style={({ pressed }) => [local.thumbRemove, pressed && styles.pressed]}>
                <ThemedText style={local.thumbRemoveText}>✕</ThemedText>
              </Pressable>
            </View>
          ))}
          {gallery.length < MAX_EVENT_GALLERY && (
            <Pressable accessibilityRole="button" accessibilityLabel="Agregar foto" disabled={addingPhoto || submitting} onPress={() => void addPhoto()} style={({ pressed }) => [local.thumb, local.thumbAdd, pressed && styles.pressed]}>
              {addingPhoto ? <ActivityIndicator color={AppColors.textPrimary} /> : <ThemedText style={local.pillText}>+ Foto</ThemedText>}
            </Pressable>
          )}
        </ScrollView>
        <ThemedText style={styles.hint}>Hasta {MAX_EVENT_GALLERY} fotos del evento o del lugar. Aparecen bajo el botón de compra.</ThemedText>
      </Field>

      <Field label="Nombre">{input('title', regional ? 'Candelabro - Tour Chile' : 'Fiesta de aniversario 2026', { maxLength: 120, accessibilityLabel: 'Nombre del evento' })}</Field>
      <Field label="Tipo">
        <HanetSelect label="Tipo de evento" options={EVENT_CATEGORIES.map(item => ({ value: item.value, label: item.label }))} value={form.category} onChange={category => update({ category })} disabled={submitting} />
      </Field>

      <Field label="Empieza">
        <Pressable accessibilityRole="button" accessibilityLabel={`Empieza: ${hallLongDate(form.startsAt)}. Cambiar`} disabled={submitting} onPress={() => setPicking('start')} style={({ pressed }) => [styles.input, local.dateButton, pressed && styles.pressed]}>
          <ThemedText numberOfLines={1} style={local.dateText}>{hallLongDate(form.startsAt)}</ThemedText>
          <ThemedText style={local.dateAction}>Cambiar</ThemedText>
        </Pressable>
      </Field>
      <Field label="Termina" optional>
        <Pressable accessibilityRole="button" accessibilityLabel={form.endsAt ? `Termina: ${hallLongDate(form.endsAt)}. Cambiar` : 'Agregar término'} disabled={submitting} onPress={() => setPicking('end')} style={({ pressed }) => [styles.input, local.dateButton, pressed && styles.pressed]}>
          <ThemedText numberOfLines={1} style={local.dateText}>{form.endsAt ? hallLongDate(form.endsAt) : 'Sin término (dura un día)'}</ThemedText>
          <ThemedText style={local.dateAction}>{form.endsAt ? 'Cambiar' : 'Agregar'}</ThemedText>
        </Pressable>
        {!!form.endsAt && (
          <Pressable accessibilityRole="button" onPress={() => update({ endsAt: null })}><ThemedText style={styles.hint}>Quitar el término</ThemedText></Pressable>
        )}
      </Field>

      <Field label="Lugar">{input('venueName', regional ? 'Parque Arena Temuco' : 'Hall central', { maxLength: 120, accessibilityLabel: 'Lugar' })}</Field>
      {regional && <Field label="Dirección" optional>{input('address', 'Av. Rudecindo Ortega 02351', { maxLength: 160, accessibilityLabel: 'Dirección' })}</Field>}
      {regional && <Field label="Ciudad">{input('city', 'Temuco', { maxLength: 60, accessibilityLabel: 'Ciudad' })}</Field>}

      <Field label="Descripción" optional>
        {input('description', regional ? 'Lo que dice la ticketera del evento.' : 'Qué es, a qué hora y qué hay que traer.', { multiline: true, maxLength: 4000, style: [styles.input, styles.multiline], accessibilityLabel: 'Descripción' })}
      </Field>

      {regional ? (
        <>
          <Field label="¿Es gratis?">
            <HanetChoice label="¿Es gratis?" options={YES_NO} value={form.isFree ? 'yes' : 'no'} onChange={value => update({ isFree: value === 'yes' })} disabled={submitting} />
          </Field>
          {!form.isFree && <Field label="Precio desde (CLP)" optional>{input('priceFrom', '20000', { keyboardType: 'number-pad', maxLength: 8, accessibilityLabel: 'Precio desde' })}</Field>}
          <Field label="Link de compra" optional>{input('ticketUrl', 'https://…', { autoCapitalize: 'none', keyboardType: 'url', accessibilityLabel: 'Link de compra' })}</Field>
          <Field label="Fuente">{input('sourceName', 'Ticketplus', { maxLength: 60, accessibilityLabel: 'Nombre de la fuente' })}</Field>
          <Field label="Beneficio de la ticketera" optional>{input('perk', 'Descuento estudiantil disponible', { maxLength: 80, accessibilityLabel: 'Beneficio' })}</Field>
          <Field label="¿Patrocinado?">
            <HanetChoice label="¿Patrocinado?" options={YES_NO} value={form.sponsored ? 'yes' : 'no'} onChange={value => update({ sponsored: value === 'yes' })} disabled={submitting} />
            <ThemedText style={styles.hint}>Se marca «[Patrocinado]» y aparece primero en los destacados.</ThemedText>
          </Field>
          <Field label="Sobre el artista o el lugar" optional>
            {input('editorialSubject', 'Candelabro', { maxLength: 80, accessibilityLabel: 'Sobre quién' })}
            {!!form.editorialSubject.trim() && (
              <>
                <Pressable accessibilityRole="button" disabled={wiki.busy || submitting} onPress={() => void fillFromWikipedia()} style={({ pressed }) => [local.pill, local.wikiButton, wiki.busy && styles.submitDisabled, pressed && styles.pressed]}>
                  {wiki.busy ? <ActivityIndicator color={AppColors.textPrimary} /> : <ThemedText style={local.pillText}>Traer de Wikipedia</ThemedText>}
                </Pressable>
                {!!wiki.note && <ThemedText accessibilityLiveRegion="polite" style={styles.hint}>{wiki.note}</ThemedText>}
                {input('editorialSummary', 'Un párrafo breve, con tus palabras o citado.', { multiline: true, maxLength: 2000, style: [styles.input, styles.multiline], accessibilityLabel: 'Resumen' })}
                {input('editorialSourceName', 'Wikipedia', { maxLength: 60, accessibilityLabel: 'Fuente del resumen' })}
                {input('editorialSourceUrl', 'https://es.wikipedia.org/wiki/…', { autoCapitalize: 'none', keyboardType: 'url', accessibilityLabel: 'Link de la fuente del resumen' })}
              </>
            )}
          </Field>
        </>
      ) : (
        <>
          <Field label="Jornada">
            <HanetChoice label="Jornada" options={JORNADA_OPTIONS} value={form.jornada} onChange={value => update({ jornada: value as EventJornada })} disabled={submitting} />
          </Field>
          <Field label="Inscripción">
            <HanetChoice label="Inscripción" options={SIGNUP_OPTIONS} value={form.signupMode} onChange={value => update({ signupMode: value as SignupMode })} disabled={submitting} />
            <ThemedText style={styles.hint}>
              {form.signupMode === 'list'
                ? 'Los estudiantes se inscriben y tú ves la lista con nombre y curso.'
                : form.signupMode === 'count'
                  ? 'Los estudiantes marcan «¡Participo!» y solo ves cuántos van.'
                  : 'El evento solo informa.'}
            </ThemedText>
          </Field>
          {form.signupMode === 'list' && <Field label="Cupos" optional>{input('capacity', 'Sin límite', { keyboardType: 'number-pad', maxLength: 5, accessibilityLabel: 'Cupos' })}</Field>}
        </>
      )}

      {!!error && <ThemedText accessibilityLiveRegion="assertive" style={styles.error}>{error}</ThemedText>}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !ready || submitting, busy: submitting }}
        disabled={!ready || submitting}
        onPress={() => void submit()}
        style={({ pressed }) => [styles.submit, (!ready || submitting) && styles.submitDisabled, pressed && styles.pressed]}
      >
        <ThemedText style={styles.submitText}>{submitting ? 'Publicando…' : label}</ThemedText>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}>
        <ThemedText style={styles.cancelText}>Cancelar</ThemedText>
      </Pressable>

      <HanetDateTimePickerModal
        visible={!!picking}
        value={new Date(picking === 'end' ? form.endsAt ?? form.startsAt + 2 * 3_600_000 : form.startsAt)}
        onCancel={() => setPicking(null)}
        onConfirm={date => {
          const which = picking;
          setPicking(null);
          if (which === 'end') update({ endsAt: date.getTime() });
          else update({ startsAt: date.getTime(), endsAt: form.endsAt && form.endsAt < date.getTime() ? null : form.endsAt });
        }}
      />
      {dialog}
    </ScrollView>
  );
}

const local = StyleSheet.create({
  importCard: {
    gap: AppSpacing.sm,
    padding: AppSpacing.lg,
    borderRadius: AppRadii.lg,
    borderCurve: 'continuous',
    backgroundColor: AppColors.canvas,
  },
  importRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.sm,
  },
  importInput: {
    flex: 1,
  },
  pill: {
    minHeight: AppTouch.minimum,
    minWidth: 96,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: AppSpacing.lg,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.surfaceMuted,
  },
  pillText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.textPrimary,
  },
  cover: {
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: AppRadii.lg,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surfaceMuted,
  },
  coverLabel: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: AppSpacing.lg,
    borderRadius: AppRadii.pill,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  gallery: {
    gap: AppSpacing.sm,
  },
  thumb: {
    width: 96,
    height: 96,
    overflow: 'hidden',
    borderRadius: AppRadii.md,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surfaceMuted,
  },
  thumbAdd: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: AppRadii.pill,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  thumbRemoveText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 12,
    lineHeight: 16,
    color: AppColors.textPrimary,
  },
  wikiButton: {
    alignSelf: 'flex-start',
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: AppSpacing.md,
  },
  dateText: {
    flex: 1,
    fontFamily: 'DMSans_500Medium',
    fontSize: 15,
    lineHeight: 20,
    color: AppColors.textPrimary,
  },
  dateAction: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.textSecondary,
  },
});

export default withSheetFrame(EventFormScreen, AppColors.surface);
