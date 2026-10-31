import { AppColors, AppPressed, AppRadii, AppSpacing } from '@/constants/design-tokens';
import { WelcomeCelebration } from '@/components/WelcomeCelebration';
import { InstitutionSync } from '@/components/InstitutionSync';
import { FatalScreen } from '@/components/errors/AppErrorScreens';
import { CheckInResultCard } from '@/components/events/checkin-result';
import type { CheckInResult } from '@/components/events/checkin-result';
import { FeedEventCard, FeedPollView } from '@/components/feed/feed-attachments';
import { ReactionChips, ReactionPicker } from '@/components/feed/feed-ui';
import { NowNextCard } from '@/components/schedule/now-next-card';
import { StoryShareSheet, storyShareAvailable } from '@/components/share/story-share';
import type { StoryItem } from '@/components/share/story-share';
import { showAppError } from '@/services/app-error';
import { HanetChoice } from '@/components/ui/hanet-select';
import { SUBJECTS } from '@/constants/subjects';
import { ThemedText } from '@/components/themed-text';
import { AnimatedIcon } from '@/components/ui/AnimatedIcon';
import { CustomIcon } from '@/components/ui/custom-icon';
import { HanetButton } from '@/components/ui/hanet-button';
import { HanetChip } from '@/components/ui/hanet-chip';
import { useRouter } from 'expo-router';
import { getMyProfile } from '@/services/auth-service';
import type { HnEvent } from '@/services/events-service';
import type { FeedEvent, FeedPoll, FeedPost, FeedReaction } from '@/services/feed-service';
import { idQrValue, msToNextCode } from '@/services/hanet-id-service';
import { previewExamActivity, previewExamReminder, previewMorningSummary } from '@/services/exam-reminders';
import type { ScheduleBlock } from '@/services/schedule-service';
import { widgetsAvailable, widgetsShareData } from '@/services/widget-service';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import Animated, { Easing, FadeIn, FadeInRight, FadeOutLeft, useReducedMotion } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

// Sistema HaNet UI (Panel HNT): the app's real components with example data,
// to check how they look and behave. Nothing here reads or writes real data:
// every example says so on screen.

type PreviewMode = 'Inicio' | 'Eventos' | 'Calendario';

const PREVIEW_MODES: PreviewMode[] = ['Inicio', 'Eventos', 'Calendario'];

const previewIcon: Record<PreviewMode, React.ComponentProps<typeof CustomIcon>['name']> = {
  Inicio: 'home',
  Eventos: 'search',
  Calendario: 'calendar',
};

const EMOJIS = ['👍', '❤️', '😂', '🎉', '😮', '🔥', '👏'];
const HOUR = 3_600_000;

// Example data, built once per visit so the dates stay near "now".
function examples(now: number) {
  // Tomorrow at 11:00, like a real school event.
  const tomorrow = new Date(now + 24 * HOUR);
  tomorrow.setHours(11, 0, 0, 0);
  const startsAt = tomorrow.getTime();
  const event: HnEvent = {
    id: 'ejemplo-evento',
    kind: 'institution',
    status: 'published',
    title: 'Feria científica (ejemplo)',
    category: 'Ciencia',
    description: 'Un evento de ejemplo para revisar los componentes.',
    imageUrl: null,
    palette: [AppColors.accent],
    gallery: [],
    startsAt,
    endsAt: startsAt + 3 * HOUR,
    venueName: 'Gimnasio del liceo',
    address: '',
    city: 'Temuco',
    region: '',
    priceFrom: null,
    isFree: true,
    ticketUrl: '',
    sourceName: '',
    sourceUrl: '',
    sponsored: false,
    perk: '',
    editorial: null,
    coupon: null,
    jornada: 'ambas',
    signupMode: 'list',
    capacity: null,
    authorName: 'CEE',
    reactions: [],
  };
  const feedEvent: FeedEvent = {
    id: event.id,
    kind: event.kind,
    title: event.title,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    imageUrl: null,
    venueName: event.venueName,
    city: event.city,
    palette: event.palette,
  };
  const post: FeedPost = {
    id: 'ejemplo-post',
    space: { key: 'cee', name: 'CEE (ejemplo)', initials: 'CE', official: true, kind: 'Centro de estudiantes' },
    body: '**¡Se viene la feria científica!** Inscríbanse en la app antes del viernes.',
    images: [],
    tags: ['ciencia'],
    pinned: false,
    audience: { kind: 'all' },
    createdAt: now,
    edited: false,
    reactions: [],
    event: feedEvent,
    poll: null,
    canEdit: false,
    canPin: false,
  };
  return { event, feedEvent, post };
}

const POLL_OPTIONS = ['Tocata en el patio', 'Feria de comida', 'Campeonato de baby fútbol'];
// The votes "the others" already cast, to see the bars after voting.
const OTHER_VOTES = [14, 9, 5];

const BLOCKS: ScheduleBlock[] = [
  { id: 'b1', day: 1, start: '10:15', end: '11:45', subject: 'Matemática', room: 'Sala 12' },
  { id: 'b2', day: 1, start: '12:00', end: '13:30', subject: 'Historia', room: 'Sala 8' },
];

const CHECKINS: CheckInResult[] = [
  { kind: 'ok', checkIn: { name: 'Camila Rojas', courseId: 'Segundo Medio K', already: false, signedUp: true, count: 18 } },
  { kind: 'ok', checkIn: { name: 'Camila Rojas', courseId: 'Segundo Medio K', already: true, signedUp: true, count: 18 } },
  { kind: 'ok', checkIn: { name: 'Diego Muñoz', courseId: 'Tercero Medio B', already: false, signedUp: false, count: 19 } },
  { kind: 'error', message: 'Ese HN-QR ya cambió. Pídele que lo vuelva a mostrar.' },
];
const CHECKIN_LABELS = ['Llegó', 'Repetido', 'Sin inscripción', 'Error'];

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText accessibilityRole="header" style={styles.sectionTitle}>{title}</ThemedText>
      <ThemedText style={styles.sectionDescription}>{description}</ThemedText>
      {children}
    </View>
  );
}

function GroupTitle({ children }: { children: string }) {
  return <ThemedText accessibilityRole="header" style={styles.groupTitle}>{children}</ThemedText>;
}

/** A line under a test button: what happened, or why it cannot run here. */
function Note({ children }: { children: string | null }) {
  if (!children) return null;
  return <ThemedText style={styles.note} accessibilityLiveRegion="polite">{children}</ThemedText>;
}

/** The HN-QR with an example key: it changes every 30 seconds, like the real one. */
function RotatingQr() {
  const [value, setValue] = useState<string | null>(null);
  const [left, setLeft] = useState(30);
  useEffect(() => {
    let active = true;
    let step: number | null = null;
    const tick = () => {
      const now = Date.now();
      setLeft(Math.ceil(msToNextCode(now) / 1000));
      const current = Math.floor(now / 30_000);
      if (current === step) return;
      step = current;
      void idQrValue('ejemplo', 'clave-de-ejemplo', now).then(next => { if (active) setValue(next); });
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  return (
    <View style={styles.qrCard}>
      <View style={styles.qrBox} accessible accessibilityLabel="Código QR de ejemplo">
        {value && <QRCode value={value} size={148} color={AppColors.surface} backgroundColor="transparent" />}
      </View>
      <View style={styles.qrCopy}>
        <ThemedText style={styles.qrCode} numberOfLines={1}>{value?.split('?c=')[1] ?? '…'}</ThemedText>
        <ThemedText style={styles.qrNote}>Cambia en {left} s</ThemedText>
        <View style={styles.qrTrack}><View style={[styles.qrFill, { width: `${(left / 30) * 100}%` }]} /></View>
      </View>
    </View>
  );
}

export default function UiShowcaseScreen() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const [selectedFilter, setSelectedFilter] = useState('Todos');
  const [previewMode, setPreviewMode] = useState<PreviewMode>('Inicio');
  const [disabled, setDisabled] = useState(false);
  const [welcomeVisible, setWelcomeVisible] = useState(false);
  const [syncVisible, setSyncVisible] = useState(false);
  const [fatalVisible, setFatalVisible] = useState(false);
  const [shift, setShift] = useState<string | null>('Mañana');
  const [subjectId, setSubjectId] = useState<string | null>(null);
  // The preview shows the shield of the viewer's own institution, as the real link does.
  const [syncLogoUrl, setSyncLogoUrl] = useState<string | null>(null);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [now] = useState(() => Date.now());
  const [sample] = useState(() => examples(now));
  const [pollResults, setPollResults] = useState<FeedPoll['results']>('live');
  const [vote, setVote] = useState<string | null>(null);
  const [reactions, setReactions] = useState<FeedReaction[]>([{ emoji: '🎉', count: 12, mine: false }, { emoji: '🔥', count: 4, mine: false }]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [story, setStory] = useState<StoryItem | null>(null);
  const [checkin, setCheckin] = useState(0);
  const [notice, setNotice] = useState<{ key: string; text: string } | null>(null);
  const stopActivity = useRef<(() => void) | null>(null);

  useEffect(() => {
    let active = true;
    getMyProfile()
      .then(profile => {
        if (!active || !profile.institutionLogoUrl) return;
        void Image.prefetch(profile.institutionLogoUrl);
        setSyncLogoUrl(profile.institutionLogoUrl);
      })
      .catch(() => {});
    return () => {
      active = false;
      if (syncTimer.current) clearTimeout(syncTimer.current);
      stopActivity.current?.();
    };
  }, []);

  const poll: FeedPoll = {
    options: POLL_OPTIONS.map((text, index) => ({ id: `o${index + 1}`, text, count: vote ? OTHER_VOTES[index] + (vote === `o${index + 1}` ? 1 : 0) : null })),
    total: vote && pollResults === 'live' ? OTHER_VOTES.reduce((sum, count) => sum + count, 1) : null,
    closesAt: now + 3 * 86_400_000,
    closed: false,
    results: pollResults,
    voted: !!vote,
  };
  // With results "al cierre" nobody sees the counts until then.
  if (pollResults === 'closed') poll.options = poll.options.map(option => ({ ...option, count: null }));

  const react = (emoji: string) => {
    setReactions(list => {
      const found = list.find(item => item.emoji === emoji);
      if (!found) return [...list, { emoji, count: 1, mine: true }];
      return list
        .map(item => (item.emoji === emoji ? { ...item, mine: !item.mine, count: item.count + (item.mine ? -1 : 1) } : item))
        .filter(item => item.count > 0);
    });
    setPickerOpen(false);
    if (Platform.OS !== 'web') void Haptics.selectionAsync();
  };

  const say = (key: string, text: string) => setNotice({ key, text });

  const testReminder = async (key: string, run: () => Promise<boolean>) => {
    const ok = await run().catch(() => false);
    say(key, ok ? 'Llega en 5 segundos. Bloquea el teléfono o sal de la app para verla.' : 'Sin permiso de notificaciones: actívalo en Configuraciones.');
  };

  const testActivity = () => {
    stopActivity.current?.();
    stopActivity.current = null;
    try {
      const stop = previewExamActivity();
      if (!stop) return;
      stopActivity.current = stop;
      say('live', 'Lista: mira la pantalla bloqueada o la Dynamic Island. Se quita al salir de esta pantalla.');
    } catch {
      say('live', 'iOS no dejó iniciarla. Revisa que las Actividades en vivo estén activadas para HaNet.');
    }
  };

  const entering = reducedMotion ? undefined : FadeInRight.duration(220).easing(Easing.out(Easing.cubic));
  const exiting = reducedMotion ? undefined : FadeOutLeft.duration(130).easing(Easing.out(Easing.cubic));
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Volver al Panel HNT"
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backButton, pressed && AppPressed]}
          >
            <CustomIcon name="chevron-left" size={20} color={AppColors.controlOnActive} />
          </Pressable>
          <View style={styles.headerCopy}>
            <ThemedText accessibilityRole="header" style={styles.title}>Sistema HaNet UI</ThemedText>
            <ThemedText style={styles.subtitle}>Componentes reales con datos de ejemplo</ThemedText>
          </View>
        </View>

        <GroupTitle>Feed</GroupTitle>

        <Section title="Votación anónima" description="Elige una opción y vota. Con resultados “al cierre” nadie ve los conteos hasta que termina.">
          <View style={styles.chipWrap}>
            <HanetChip label="Resultados en vivo" selected={pollResults === 'live'} onPress={() => setPollResults('live')} />
            <HanetChip label="Al cierre" selected={pollResults === 'closed'} onPress={() => setPollResults('closed')} />
          </View>
          <View style={styles.card}>
            <ThemedText style={styles.cardTitle}>¿Qué hacemos para el aniversario?</ThemedText>
            <FeedPollView key={pollResults} poll={poll} now={now} busy={false} onVote={option => { setVote(option); if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); }} />
          </View>
          {!!vote && <HanetButton label="Votar de nuevo" variant="surface" onPress={() => setVote(null)} />}
        </Section>

        <Section title="Evento en una publicación" description="La tarjeta que lleva un post cuando comparte un evento. Al tocarla se abre el evento.">
          <View style={styles.bleed}>
            <FeedEventCard event={sample.feedEvent} onPress={() => say('event', 'En el Feed esto abre el evento.')} />
          </View>
          <Note>{notice?.key === 'event' ? notice.text : null}</Note>
        </Section>

        <GroupTitle>Eventos</GroupTitle>

        <Section title="Reacciones" description="Las mismas del Feed. Toca una para sumarte o quitarte, o abre la lista con el botón de la carita.">
          <View style={styles.reactionRow}>
            <ReactionChips reactions={reactions} open={pickerOpen} onToggleOpen={() => setPickerOpen(open => !open)} onReact={react} />
          </View>
          {pickerOpen && <ReactionPicker emojis={EMOJIS} reactions={reactions} onReact={react} />}
        </Section>

        <Section title="Compartir como historia" description="La imagen vertical para Instagram y otras apps. Solo eventos y publicaciones de la institución y del CEE.">
          <View style={styles.buttonRow}>
            <HanetButton label="Evento" variant="surface" disabled={!storyShareAvailable} onPress={() => setStory({ kind: 'event', event: sample.event })} style={styles.flexButton} />
            <HanetButton label="Publicación" variant="surface" disabled={!storyShareAvailable} onPress={() => setStory({ kind: 'post', post: sample.post })} style={styles.flexButton} />
          </View>
          {!storyShareAvailable && <Note>En la web no se puede compartir una imagen: pruébalo en el teléfono.</Note>}
        </Section>

        <Section title="HN-QR" description="El código del perfil cambia cada 30 segundos, así que una captura de pantalla no sirve en la puerta. Este usa una clave de ejemplo.">
          <RotatingQr />
        </Section>

        <Section title="Pasar lista" description="Lo que ve quien organiza después de escanear cada HN-QR.">
          <View style={styles.chipWrap}>
            {CHECKIN_LABELS.map((label, index) => (
              <HanetChip key={label} label={label} selected={checkin === index} onPress={() => setCheckin(index)} />
            ))}
          </View>
          <CheckInResultCard result={CHECKINS[checkin]} />
        </Section>

        <GroupTitle>Tu día</GroupTitle>

        <Section title="Horario: ahora y después" description="La tarjeta de arriba del Horario, con la clase en curso y la siguiente.">
          <NowNextCard current={BLOCKS[0]} next={BLOCKS[1]} />
          <HanetButton label="Abrir mi horario" variant="surface" onPress={() => router.push('/schedule')} icon={<CustomIcon name="calendar" size={20} />} />
        </Section>

        <Section title="Avisos" description="Avisos de ejemplo que llegan en 5 segundos a este teléfono. Los reales salen 24 h y 4 h antes de cada prueba, y el resumen a las 7:00.">
          <View style={styles.buttonStack}>
            <HanetButton label="Prueba mañana (24 h)" variant="surface" disabled={Platform.OS === 'web'} onPress={() => void testReminder('exam', () => previewExamReminder(24))} />
            <HanetButton label="Prueba en 4 horas" variant="surface" disabled={Platform.OS === 'web'} onPress={() => void testReminder('exam', () => previewExamReminder(4))} />
            <HanetButton label="Resumen de las 7:00" variant="surface" disabled={Platform.OS === 'web'} onPress={() => void testReminder('exam', previewMorningSummary)} />
          </View>
          <Note>{notice?.key === 'exam' ? notice.text : Platform.OS === 'web' ? 'Las notificaciones se prueban en el teléfono.' : null}</Note>
        </Section>

        <Section title="Live Activity y widget" description="Cuenta regresiva de una prueba en la pantalla bloqueada y en la Dynamic Island. El widget “HaNet hoy” se agrega desde la pantalla de inicio del iPhone.">
          <HanetButton label="Iniciar Live Activity" variant="surface" disabled={!widgetsAvailable} onPress={testActivity} />
          <Note>{notice?.key === 'live'
            ? notice.text
            : !widgetsAvailable
              ? 'Solo en la app instalada en un iPhone: en Expo Go, Android y la web no existen.'
              : widgetsShareData
                ? null
                : 'Esta build no llega a su App Group, así que el widget no se actualiza y la Live Activity sale vacía. Fírmala con un certificado que tenga App Groups.'}</Note>
        </Section>

        <GroupTitle>Base</GroupTitle>

        <Section title="Acciones" description="Botones largos, con radio completo y variantes del tema.">
          <View style={styles.buttonStack}>
            <HanetButton label="Acción principal" variant="primary" onPress={() => setDisabled(false)} icon={<CustomIcon name="check-circle" size={20} />} style={styles.fullButton} />
            <HanetButton label="Acción destacada" variant="accent" onPress={() => setDisabled((value) => !value)} icon={<CustomIcon name="notification" size={20} color={AppColors.textOnLight} />} style={styles.fullButton} />
            <HanetButton label={disabled ? 'Botón desactivado' : 'Desactivar ejemplo'} variant="surface" disabled={disabled} onPress={() => setDisabled(true)} icon={<CustomIcon name="star" size={20} />} style={styles.fullButton} />
          </View>
        </Section>

        <Section title="Chips" description="Selecciona un filtro para revisar el estado activo y su contraste.">
          <View style={styles.chipWrap}>
            {['Todos', 'Música', 'Conciertos', 'Expos'].map((label) => (
              <HanetChip
                key={label}
                label={label}
                selected={selectedFilter === label}
                onPress={() => setSelectedFilter(label)}
                compact={label === 'Expos'}
              />
            ))}
          </View>
        </Section>

        <Section title="Navegación contextual" description="La previsualización usa la misma transición que cambia los controles de la tab bar.">
          <View style={styles.chipWrap}>
            {PREVIEW_MODES.map((mode) => (
              <HanetChip key={mode} label={mode} selected={previewMode === mode} onPress={() => setPreviewMode(mode)} />
            ))}
          </View>
          <View style={styles.previewSurface}>
            <Animated.View key={previewMode} entering={entering} exiting={exiting} style={styles.previewContent}>
              <View style={styles.previewIcon}>
                <CustomIcon name={previewIcon[previewMode]} size={22} color={AppColors.controlOnActive} />
              </View>
              <View>
                <ThemedText style={styles.previewTitle}>{previewMode}</ThemedText>
                <ThemedText style={styles.previewDescription}>
                  {previewMode === 'Eventos' ? 'Atrás · Buscar · Perfil' : previewMode === 'Calendario' ? 'Atrás · Crear · Perfil' : 'Inicio · HaNet · Perfil'}
                </ThemedText>
              </View>
            </Animated.View>
          </View>
        </Section>

        <Section title="Bienvenida" description="La celebración que ve una cuenta al terminar de unirse a su institución.">
          <HanetButton label="Ver bienvenida" onPress={() => setWelcomeVisible(true)} />
        </Section>

        <Section title="Vínculo con la institución" description="Lo que se ve mientras se completa el vínculo, después de confirmar los datos. Se cierra solo.">
          <HanetButton
            label="Ver vínculo"
            onPress={() => {
              setSyncVisible(true);
              if (syncTimer.current) clearTimeout(syncTimer.current);
              syncTimer.current = setTimeout(() => setSyncVisible(false), 3200);
            }}
          />
        </Section>

        <Section title="Pantallas de error" description="Bloqueo, servidores, sin conexión y error fatal. En la vista previa los botones solo cierran la pantalla.">
          <View style={styles.buttonStack}>
            <HanetButton label="Cuenta bloqueada" variant="surface" onPress={() => showAppError('blocked', true)} />
            <HanetButton label="Servidores" variant="surface" onPress={() => showAppError('server', true)} />
            <HanetButton label="Sin conexión" variant="surface" onPress={() => showAppError('offline', true)} />
            <HanetButton label="Error fatal" variant="surface" onPress={() => setFatalVisible(true)} />
          </View>
        </Section>

        <Section title="Selección" description="Hasta 5 opciones van como chips; con más, un campo que abre la lista en un diálogo (con buscador desde 10).">
          <HanetChoice
            label="Turno"
            options={['Mañana', 'Tarde', 'Vespertino'].map(name => ({ value: name, label: name }))}
            value={shift}
            onChange={setShift}
          />
          <HanetChoice
            label="Asignatura"
            options={SUBJECTS.map(item => ({ value: item.id, label: item.name }))}
            value={subjectId}
            onChange={setSubjectId}
            placeholder="Elegir asignatura"
            style={{ backgroundColor: AppColors.surface }}
          />
        </Section>

        <Section title="Iconos en movimiento" description="Estados de atención: pulso, flotación y aviso. Con “Reducir movimiento” quedan quietos.">
          <View style={styles.iconRow}>
            <View style={styles.iconExample}><AnimatedIcon name="notification" size={26} color={AppColors.accent} animationType="wiggle" loop /><ThemedText style={styles.iconLabel}>Aviso</ThemedText></View>
            <View style={styles.iconExample}><AnimatedIcon name="calendar" size={26} color={AppColors.textPrimary} animationType="float" loop /><ThemedText style={styles.iconLabel}>Flotar</ThemedText></View>
            <View style={styles.iconExample}><AnimatedIcon name="star" size={26} color={AppColors.controlActive} animationType="pulse" loop /><ThemedText style={styles.iconLabel}>Pulso</ThemedText></View>
          </View>
        </Section>

        <Section title="Tokens base" description="Colores semánticos que sostienen el tema oscuro actual.">
          <View style={styles.tokenRow}>
            <View style={[styles.swatch, { backgroundColor: AppColors.canvas }]}><ThemedText style={styles.swatchText}>Canvas</ThemedText></View>
            <View style={[styles.swatch, { backgroundColor: AppColors.surface }]}><ThemedText style={styles.swatchText}>Surface</ThemedText></View>
            <View style={[styles.swatch, { backgroundColor: AppColors.controlActive }]}><ThemedText style={[styles.swatchText, styles.swatchTextDark]}>Activo</ThemedText></View>
            <View style={[styles.swatch, { backgroundColor: AppColors.accent }]}><ThemedText style={[styles.swatchText, styles.swatchTextDark]}>Accent</ThemedText></View>
          </View>
        </Section>
      </ScrollView>

      <StoryShareSheet item={story} onClose={() => setStory(null)} />
      <WelcomeCelebration
        visible={welcomeVisible}
        firstName="Martín"
        treatment="el"
        institutionName="LCH Temuco"
        onDone={() => setWelcomeVisible(false)}
      />
      {syncVisible && <InstitutionSync logoUrl={syncLogoUrl} />}
      {fatalVisible && (
        <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(120)} style={styles.fatalPreview}>
          <FatalScreen preview onDismiss={() => setFatalVisible(false)} />
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fatalPreview: {
    ...StyleSheet.absoluteFill,
    zIndex: 100,
  },
  container: { flex: 1, backgroundColor: AppColors.canvas },
  content: { padding: AppSpacing.lg, paddingBottom: 150, gap: AppSpacing.xxl },
  header: { flexDirection: 'row', alignItems: 'center', gap: AppSpacing.md, paddingTop: AppSpacing.sm },
  backButton: { width: 44, height: 44, borderRadius: AppRadii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: AppColors.controlActive },
  headerCopy: { flex: 1 },
  title: { color: AppColors.textPrimary, fontFamily: 'DMSans_700Bold', fontSize: 28, lineHeight: 34, letterSpacing: -0.7 },
  subtitle: { color: AppColors.textSecondary, fontFamily: 'DMSans_500Medium', fontSize: 14, lineHeight: 20 },
  groupTitle: { marginBottom: -AppSpacing.md, color: AppColors.accent, fontFamily: 'DMSans_700Bold', fontSize: 13, lineHeight: 18, letterSpacing: 0.4, textTransform: 'uppercase' },
  section: { gap: AppSpacing.md },
  sectionTitle: { color: AppColors.textPrimary, fontFamily: 'DMSans_700Bold', fontSize: 20, lineHeight: 26, letterSpacing: -0.4 },
  sectionDescription: { color: AppColors.textSecondary, fontFamily: 'DMSans_400Regular', fontSize: 14, lineHeight: 20 },
  note: { color: AppColors.textSecondary, fontFamily: 'DMSans_500Medium', fontSize: 13, lineHeight: 18 },
  card: { gap: AppSpacing.md, paddingVertical: AppSpacing.lg, borderRadius: AppRadii.lg, borderCurve: 'continuous', backgroundColor: AppColors.surface },
  cardTitle: { paddingHorizontal: AppSpacing.lg, color: AppColors.textPrimary, fontFamily: 'DMSans_700Bold', fontSize: 17, lineHeight: 23 },
  // The feed's components keep their own side margins; here they sit flush.
  bleed: { marginHorizontal: -AppSpacing.lg },
  reactionRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: AppSpacing.sm },
  buttonStack: { gap: AppSpacing.sm },
  buttonRow: { flexDirection: 'row', gap: AppSpacing.sm },
  flexButton: { flex: 1 },
  fullButton: { width: '100%' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: AppSpacing.sm },
  qrCard: { flexDirection: 'row', alignItems: 'center', gap: AppSpacing.lg, padding: AppSpacing.lg, borderRadius: AppRadii.lg, borderCurve: 'continuous', backgroundColor: AppColors.controlActive },
  qrBox: { width: 148, height: 148 },
  qrCopy: { flex: 1, gap: AppSpacing.sm },
  qrCode: { color: AppColors.controlOnActive, fontFamily: 'DMSans_700Bold', fontSize: 17, lineHeight: 22, fontVariant: ['tabular-nums'], letterSpacing: 0.5 },
  qrNote: { color: AppColors.controlOnActive, opacity: 0.7, fontFamily: 'DMSans_500Medium', fontSize: 13, lineHeight: 18, fontVariant: ['tabular-nums'] },
  qrTrack: { height: 4, borderRadius: AppRadii.pill, overflow: 'hidden', backgroundColor: AppColors.surfaceMuted },
  qrFill: { height: 4, borderRadius: AppRadii.pill, backgroundColor: AppColors.accent },
  previewSurface: { minHeight: 88, borderRadius: AppRadii.lg, overflow: 'hidden', backgroundColor: AppColors.surface, justifyContent: 'center', padding: AppSpacing.lg },
  previewContent: { flexDirection: 'row', alignItems: 'center', gap: AppSpacing.md },
  previewIcon: { width: 44, height: 44, borderRadius: AppRadii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: AppColors.controlActive },
  previewTitle: { color: AppColors.textPrimary, fontFamily: 'DMSans_700Bold', fontSize: 16, lineHeight: 22 },
  previewDescription: { color: AppColors.textSecondary, fontFamily: 'DMSans_500Medium', fontSize: 13, lineHeight: 18 },
  iconRow: { flexDirection: 'row', gap: AppSpacing.sm },
  iconExample: { flex: 1, minHeight: 96, borderRadius: AppRadii.lg, backgroundColor: AppColors.surface, alignItems: 'center', justifyContent: 'center', gap: AppSpacing.sm },
  iconLabel: { color: AppColors.textSecondary, fontFamily: 'DMSans_500Medium', fontSize: 12 },
  tokenRow: { flexDirection: 'row', gap: AppSpacing.sm },
  swatch: { flex: 1, height: 76, borderRadius: AppRadii.md, justifyContent: 'flex-end', padding: AppSpacing.sm },
  swatchText: { color: AppColors.textPrimary, fontFamily: 'DMSans_700Bold', fontSize: 11 },
  swatchTextDark: { color: AppColors.controlOnActive },
});
