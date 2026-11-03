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
import { KeyboardScroll } from '@/components/ui/keyboard';
import { t } from '@/i18n';

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
  couponCode: string;
  couponDescription: string;
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

const YES_NO = [{ value: 'no', label: t('classhall.taskForm.no') }, { value: 'yes', label: t('eventForm.si') }];
const JORNADA_OPTIONS = [{ value: 'ambas', label: t('eventForm.ambas') }, { value: 'manana', label: t('common.manana') }, { value: 'tarde', label: t('eventForm.tarde') }];
const SIGNUP_OPTIONS = [{ value: 'list', label: t('eventForm.conLista') }, { value: 'count', label: t('eventForm.soloContador') }, { value: 'none', label: t('eventForm.sinInscripcion') }];

function Field({ label, optional, children }: { label: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <ThemedText style={styles.label}>{label}{optional ? <ThemedText style={styles.optional}>{' '}{t('common.opcional')}</ThemedText> : null}</ThemedText>
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
      couponCode: event?.coupon?.code ?? '',
      couponDescription: event?.coupon?.description ?? '',
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
      setImportNote(missing.length ? t('eventForm.listoRevisaYCompletaJoin', { join: missing.join(', ') }) : t('eventForm.listoRevisaLosDatosAntes'));
    } catch (importError) {
      setImportNote(describeAuthError(importError, t('eventForm.noPudimosLeerEsaPagina')));
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
      setError(describeAuthError(pickError, t('eventForm.noPudimosSubirLaImagen')));
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
      setError(describeAuthError(pickError, t('eventForm.noPudimosSubirLaFoto')));
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
        setWiki({ busy: false, note: t('eventForm.noEncontramosUnArticuloCon') });
        return;
      }
      update({ editorialSummary: found.summary, editorialSourceName: 'Wikipedia', editorialSourceUrl: found.url });
      setWiki({ busy: false, note: t('eventForm.traidoDeTitleRevisaQue', { title: found.title }) });
    } catch {
      setWiki({ busy: false, note: t('eventForm.wikipediaNoRespondeIntentaloNuevamente') });
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
            coupon: form.couponCode.trim() ? { code: form.couponCode.trim(), description: form.couponDescription.trim() } : null,
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
      setError(describeAuthError(saveError, t('eventForm.noPudimosPublicarElEvento')));
      setSubmitting(false);
    }
  };

  const label = params.id ? t('common.guardarCambios') : t('eventForm.publicarEvento');
  const { allowLeave, dialog } = useUnsavedChangesGuard({
    dirty: dirty && !submitting,
    onSave: submit,
    saveLabel: label,
    canSave: ready,
    title: params.id ? t('common.descartarLosCambios') : t('eventForm.descartarEsteEvento'),
    message: params.id ? t('eventForm.elEventoQuedaraComoEstaba') : t('classhall.announce.todaviaNoLoHasPublicado'),
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
    <KeyboardScroll
      style={styles.sheet}
      contentContainerStyle={[styles.content, { paddingTop: (Platform.OS === 'android' ? 0 : insets.top) + AppSpacing.xxl, paddingBottom: insets.bottom + AppSpacing.xl }]}
      keyboardShouldPersistTaps="handled"
    >
      <ThemedText accessibilityRole="header" style={styles.title}>
        {params.id ? t('eventForm.editarEvento') : regional ? t('eventForm.eventoDeLaCiudad') : t('eventForm.eventoDelLiceo')}
      </ThemedText>
      <ThemedText style={styles.lead}>
        {regional
          ? t('eventForm.apareceEnCercaDeMi')
          : t('eventForm.apareceEnEnMiInstitucion')}
      </ThemedText>

      {regional && !params.id && (
        <View style={local.importCard}>
          <ThemedText style={styles.label}>{t('eventForm.importarDesdeLink')}</ThemedText>
          <ThemedText style={styles.hint}>{t('eventForm.tuaccesoPortalTicketsTicketplusO')}</ThemedText>
          <View style={local.importRow}>
            <TextInput
              accessibilityLabel={t('eventForm.linkDelEventoEnLa')}
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
              {importing ? <ActivityIndicator color={AppColors.textPrimary} /> : <ThemedText style={local.pillText}>{t('eventForm.importar')}</ThemedText>}
            </Pressable>
          </View>
          {!!importNote && <ThemedText accessibilityLiveRegion="polite" style={styles.hint}>{importNote}</ThemedText>}
          {importWarnings.map((warning, index) => (
            <ThemedText key={index} accessibilityLiveRegion="assertive" style={styles.error}>⚠ {warning}</ThemedText>
          ))}
        </View>
      )}

      <Field label={t('eventForm.imagen')}>
        <Pressable accessibilityRole="button" accessibilityLabel={shownCover ? t('eventForm.cambiarLaImagen') : t('eventForm.elegirUnaImagen')} disabled={uploading || submitting} onPress={() => void chooseCover()} style={({ pressed }) => [local.cover, pressed && styles.pressed]}>
          {shownCover ? <Image source={{ uri: shownCover }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
          <View style={local.coverLabel}>
            {uploading ? <ActivityIndicator color={AppColors.textPrimary} /> : <ThemedText style={local.pillText}>{shownCover ? t('eventForm.cambiarImagen') : t('eventForm.elegirImagen')}</ThemedText>}
          </View>
        </Pressable>
        {regional && !!form.imageUrl && !cover && <ThemedText style={styles.hint}>{t('eventForm.imagenDeLaTicketeraSi')}</ThemedText>}
      </Field>

      <Field label={t('eventForm.fotos')} optional>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={local.gallery}>
          {gallery.map((item, index) => (
            <View key={item.uri} style={local.thumb}>
              <Image source={{ uri: item.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
              <Pressable accessibilityRole="button" accessibilityLabel={t('eventForm.quitarLaFotoNumber', { number: index + 1 })} hitSlop={8} disabled={submitting} onPress={() => setGallery(current => current.filter(other => other.uri !== item.uri))} style={({ pressed }) => [local.thumbRemove, pressed && styles.pressed]}>
                <ThemedText style={local.thumbRemoveText}>✕</ThemedText>
              </Pressable>
            </View>
          ))}
          {gallery.length < MAX_EVENT_GALLERY && (
            <Pressable accessibilityRole="button" accessibilityLabel={t('eventForm.agregarFoto')} disabled={addingPhoto || submitting} onPress={() => void addPhoto()} style={({ pressed }) => [local.thumb, local.thumbAdd, pressed && styles.pressed]}>
              {addingPhoto ? <ActivityIndicator color={AppColors.textPrimary} /> : <ThemedText style={local.pillText}>{t('eventForm.foto')}</ThemedText>}
            </Pressable>
          )}
        </ScrollView>
        <ThemedText style={styles.hint}>{t('eventForm.hastaMaxeventgalleryFotosDelEvento', { maxEventGallery: MAX_EVENT_GALLERY })}</ThemedText>
      </Field>

      <Field label={t('common.nombre')}>{input('title', regional ? t('eventForm.candelabroTourChile') : t('eventForm.fiestaDeAniversario2026'), { maxLength: 120, accessibilityLabel: t('eventForm.nombreDelEvento') })}</Field>
      <Field label={t('eventForm.tipo')}>
        <HanetSelect label={t('common.tipoDeEvento')} options={EVENT_CATEGORIES.map(item => ({ value: item.value, label: item.label }))} value={form.category} onChange={category => update({ category })} disabled={submitting} />
      </Field>

      <Field label={t('common.empieza')}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('eventForm.empiezaHalllongdateCambiar', { hallLongDate: hallLongDate(form.startsAt) })} disabled={submitting} onPress={() => setPicking('start')} style={({ pressed }) => [styles.input, local.dateButton, pressed && styles.pressed]}>
          <ThemedText numberOfLines={1} style={local.dateText}>{hallLongDate(form.startsAt)}</ThemedText>
          <ThemedText style={local.dateAction}>{t('common.cambiar')}</ThemedText>
        </Pressable>
      </Field>
      <Field label={t('common.termina')} optional>
        <Pressable accessibilityRole="button" accessibilityLabel={form.endsAt ? t('eventForm.terminaHalllongdateCambiar', { hallLongDate: hallLongDate(form.endsAt) }) : t('eventForm.agregarTermino')} disabled={submitting} onPress={() => setPicking('end')} style={({ pressed }) => [styles.input, local.dateButton, pressed && styles.pressed]}>
          <ThemedText numberOfLines={1} style={local.dateText}>{form.endsAt ? hallLongDate(form.endsAt) : t('eventForm.sinTerminoDuraUnDia')}</ThemedText>
          <ThemedText style={local.dateAction}>{form.endsAt ? t('common.cambiar') : t('common.agregar')}</ThemedText>
        </Pressable>
        {!!form.endsAt && (
          <Pressable accessibilityRole="button" hitSlop={10} onPress={() => update({ endsAt: null })} style={({ pressed }) => pressed && styles.pressed}><ThemedText style={styles.hint}>{t('eventForm.quitarElTermino')}</ThemedText></Pressable>
        )}
      </Field>

      <Field label={t('anniversary.activity.lugar')}>{input('venueName', regional ? t('eventForm.parqueArenaTemuco') : t('eventForm.hallCentral'), { maxLength: 120, accessibilityLabel: t('anniversary.activity.lugar') })}</Field>
      {regional && <Field label={t('eventForm.direccion')} optional>{input('address', t('eventForm.avRudecindoOrtega02351'), { maxLength: 160, accessibilityLabel: t('eventForm.direccion') })}</Field>}
      {regional && <Field label={t('events.ciudad')}>{input('city', 'Temuco', { maxLength: 60, accessibilityLabel: t('events.ciudad') })}</Field>}

      <Field label={t('common.descripcion')} optional>
        {input('description', regional ? t('eventForm.loQueDiceLaTicketera') : t('eventForm.queEsAQueHora'), { multiline: true, maxLength: 4000, style: [styles.input, styles.multiline], accessibilityLabel: t('common.descripcion') })}
      </Field>

      {regional ? (
        <>
          <Field label={t('eventForm.esGratis')}>
            <HanetChoice label={t('eventForm.esGratis')} options={YES_NO} value={form.isFree ? 'yes' : 'no'} onChange={value => update({ isFree: value === 'yes' })} disabled={submitting} />
          </Field>
          {!form.isFree && <Field label={t('eventForm.precioDesdeClp')} optional>{input('priceFrom', '20000', { keyboardType: 'number-pad', maxLength: 8, accessibilityLabel: t('eventForm.precioDesde') })}</Field>}
          <Field label={t('eventForm.linkDeCompra')} optional>{input('ticketUrl', 'https://…', { autoCapitalize: 'none', keyboardType: 'url', accessibilityLabel: t('eventForm.linkDeCompra') })}</Field>
          <Field label={t('eventForm.fuente')}>{input('sourceName', 'Ticketplus', { maxLength: 60, accessibilityLabel: t('eventForm.nombreDeLaFuente') })}</Field>
          <Field label={t('eventForm.beneficioDeLaTicketera')} optional>{input('perk', t('eventForm.descuentoEstudiantilDisponible'), { maxLength: 80, accessibilityLabel: t('eventForm.beneficio') })}</Field>
          <Field label={t('common.cuponHanet')} optional>
            {input('couponCode', 'HANET10', { maxLength: 40, autoCapitalize: 'characters', autoCorrect: false, accessibilityLabel: t('eventForm.codigoDelCuponHanet') })}
            {!!form.couponCode.trim() && input('couponDescription', t('eventForm.n10DeDescuentoEnEntrada'), { maxLength: 120, accessibilityLabel: t('eventForm.queDaElCupon') })}
            <ThemedText style={styles.hint}>{t('eventForm.soloSiLaTicketeraLe')}</ThemedText>
          </Field>
          <Field label={t('eventForm.patrocinado')}>
            <HanetChoice label={t('eventForm.patrocinado')} options={YES_NO} value={form.sponsored ? 'yes' : 'no'} onChange={value => update({ sponsored: value === 'yes' })} disabled={submitting} />
            <ThemedText style={styles.hint}>{t('eventForm.seMarcaPatrocinadoYAparece')}</ThemedText>
          </Field>
          <Field label={t('eventForm.sobreElArtistaOEl')} optional>
            {input('editorialSubject', 'Candelabro', { maxLength: 80, accessibilityLabel: t('eventForm.sobreQuien') })}
            {!!form.editorialSubject.trim() && (
              <>
                <Pressable accessibilityRole="button" disabled={wiki.busy || submitting} onPress={() => void fillFromWikipedia()} style={({ pressed }) => [local.pill, local.wikiButton, wiki.busy && styles.submitDisabled, pressed && styles.pressed]}>
                  {wiki.busy ? <ActivityIndicator color={AppColors.textPrimary} /> : <ThemedText style={local.pillText}>{t('eventForm.traerDeWikipedia')}</ThemedText>}
                </Pressable>
                {!!wiki.note && <ThemedText accessibilityLiveRegion="polite" style={styles.hint}>{wiki.note}</ThemedText>}
                {input('editorialSummary', t('eventForm.unParrafoBreveConTus'), { multiline: true, maxLength: 2000, style: [styles.input, styles.multiline], accessibilityLabel: t('eventForm.resumen') })}
                {input('editorialSourceName', 'Wikipedia', { maxLength: 60, accessibilityLabel: t('eventForm.fuenteDelResumen') })}
                {input('editorialSourceUrl', 'https://es.wikipedia.org/wiki/…', { autoCapitalize: 'none', keyboardType: 'url', accessibilityLabel: t('eventForm.linkDeLaFuenteDel') })}
              </>
            )}
          </Field>
        </>
      ) : (
        <>
          <Field label={t('eventForm.jornada')}>
            <HanetChoice label={t('eventForm.jornada')} options={JORNADA_OPTIONS} value={form.jornada} onChange={value => update({ jornada: value as EventJornada })} disabled={submitting} />
          </Field>
          <Field label={t('eventForm.inscripcion')}>
            <HanetChoice label={t('eventForm.inscripcion')} options={SIGNUP_OPTIONS} value={form.signupMode} onChange={value => update({ signupMode: value as SignupMode })} disabled={submitting} />
            <ThemedText style={styles.hint}>
              {form.signupMode === 'list'
                ? t('eventForm.losEstudiantesSeInscribenY')
                : form.signupMode === 'count'
                  ? t('eventForm.losEstudiantesMarcanParticipoY')
                  : t('eventForm.elEventoSoloInforma')}
            </ThemedText>
          </Field>
          {form.signupMode === 'list' && <Field label={t('eventForm.cupos')} optional>{input('capacity', t('eventForm.sinLimite'), { keyboardType: 'number-pad', maxLength: 5, accessibilityLabel: t('eventForm.cupos') })}</Field>}
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
        <ThemedText style={styles.submitText}>{submitting ? t('common.publicando') : label}</ThemedText>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}>
        <ThemedText style={styles.cancelText}>{t('common.cancelar')}</ThemedText>
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
    </KeyboardScroll>
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
