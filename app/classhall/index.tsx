import { TAB_BAR_CLEARANCE } from '@/components/AppTabBar';
import { daysUntil } from '@/components/classhall/hall-ui';
import { ThemedText } from '@/components/themed-text';
import { AppColors, AppRadii, AppSpacing, AppTouch } from '@/constants/design-tokens';
import { describeAuthError, useSession } from '@/services/auth-service';
import { hallThemeImage, listMyHalls } from '@/services/classhall-service';
import type { Hall } from '@/services/classhall-service';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function evaluationNotice(date: number) {
  const days = daysUntil(date);
  if (days <= 0) return 'Tienes una evaluación programada hoy';
  if (days === 1) return 'Tienes una evaluación programada mañana';
  return `Tienes una evaluación programada en ${days} días`;
}

function HallCard({ hall, onOpen }: { hall: Hall; onOpen: () => void }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const copyCode = async () => {
    if (!hall.code) return;
    await Clipboard.setStringAsync(hall.code);
    if (Platform.OS !== 'web') void Haptics.selectionAsync();
    setCopied(true);
  };

  const students = hall.memberCount === 1 ? '1 estudiante' : `${hall.memberCount ?? 0} estudiantes`;

  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${hall.subject}, ${hall.courseId}, ${hall.teacherName}`}
        accessibilityHint="Abre el Hall"
        onPress={onOpen}
        style={({ pressed }) => [styles.cardArt, pressed && styles.pressed]}
      >
        <Image source={hallThemeImage(hall.theme)} style={styles.cardImage} contentFit="cover" />
        {/* Keeps the text legible over any illustration. */}
        <View style={styles.cardShade} />
        <View style={styles.cardText}>
          <ThemedText numberOfLines={1} style={styles.cardSubject}>{hall.subject}</ThemedText>
          <ThemedText numberOfLines={1} style={styles.cardCourse}>{hall.courseId}</ThemedText>
          <ThemedText numberOfLines={1} style={styles.cardTeacher}>{hall.teacherName.toLocaleUpperCase('es')}</ThemedText>
        </View>
      </Pressable>
      {!hall.isTeacher && !!hall.nextEvaluation && daysUntil(hall.nextEvaluation.date) <= 7 && (
        <Pressable
          accessibilityRole="button"
          onPress={onOpen}
          style={({ pressed }) => [styles.cardStrip, pressed && styles.pressed]}
        >
          <ThemedText numberOfLines={1} style={styles.stripText}>{evaluationNotice(hall.nextEvaluation.date)}</ThemedText>
        </Pressable>
      )}
      {hall.isTeacher && hall.plan === 'comun' && (
        <View style={styles.cardStrip}>
          <ThemedText style={styles.stripText}>Plan común · todo el curso · {students}</ThemedText>
        </View>
      )}
      {hall.isTeacher && hall.plan !== 'comun' && hall.code && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Copiar el código del Hall, ${hall.code.split('').join(' ')}`}
          onPress={copyCode}
          style={({ pressed }) => [styles.cardStrip, pressed && styles.pressed]}
        >
          <ThemedText style={styles.stripText}>
            Código <ThemedText style={styles.stripCode}>{hall.code}</ThemedText> · {students}
          </ThemedText>
          <ThemedText style={styles.stripAction}>{copied ? 'Copiado' : 'Copiar'}</ThemedText>
        </Pressable>
      )}
    </View>
  );
}

export default function ClassHallScreen() {
  const router = useRouter();
  const { user, initializing } = useSession();

  const [halls, setHalls] = useState<Hall[] | null>(null);
  const [canCreate, setCanCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!initializing && !user) router.replace('/onboarding');
  }, [initializing, router, user]);

  // Reloads when coming back from the sheets that join or create a Hall.
  useFocusEffect(useCallback(() => {
    if (!user) return;
    let active = true;
    listMyHalls()
      .then(result => {
        if (!active) return;
        setHalls(result.halls);
        setCanCreate(result.canCreate);
        setError(null);
      })
      .catch(loadError => {
        if (active) setError(describeAuthError(loadError, 'No pudimos cargar tus clases. Inténtalo nuevamente.'));
      });
    return () => { active = false; };
    // `attempt` re-runs the load from the retry button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, attempt]));

  const loading = halls === null && !error;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <ThemedText style={styles.brand}>HaNet <ThemedText style={styles.brandSmall}>ClassHall</ThemedText></ThemedText>
        </View>

        <View style={styles.heading}>
          <ThemedText accessibilityRole="header" style={styles.title}>ClassHall</ThemedText>
          <ThemedText style={styles.subtitle}>Mis clases y asignaturas</ThemedText>
        </View>

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/classhall/join')}
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}
          >
            <ThemedText style={styles.actionText}>Unirse a un Hall</ThemedText>
          </Pressable>
          {canCreate && (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/classhall/create')}
              style={({ pressed }) => [styles.action, pressed && styles.pressed]}
            >
              <ThemedText style={styles.actionText}>Crear un Hall</ThemedText>
            </Pressable>
          )}
        </View>

        {loading && <ActivityIndicator style={styles.loader} size="large" color={AppColors.textSecondary} />}

        {!!error && (
          <View style={styles.notice}>
            <ThemedText accessibilityLiveRegion="polite" style={styles.noticeText}>{error}</ThemedText>
            <Pressable
              accessibilityRole="button"
              onPress={() => { setError(null); setAttempt(count => count + 1); }}
              style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
            >
              <ThemedText style={styles.retryText}>Reintentar</ThemedText>
            </Pressable>
          </View>
        )}

        {halls?.length === 0 && !error && (
          <View style={styles.notice}>
            <ThemedText style={styles.noticeTitle}>Todavía no tienes clases</ThemedText>
            <ThemedText style={styles.noticeText}>
              {canCreate
                ? 'Crea un Hall para tu asignatura. Si es de plan común, todo el curso entra solo.'
                : 'Las asignaturas de tu curso aparecen aquí solas cuando tus profesores crean su Hall. Para un electivo o dominio, usa el código en "Unirse a un Hall".'}
            </ThemedText>
          </View>
        )}

        {halls?.map(hall => (
          <HallCard key={hall.id} hall={hall} onOpen={() => router.push({ pathname: '/classhall/hall', params: { id: hall.id } })} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AppColors.canvas,
  },
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    padding: AppSpacing.md,
    paddingBottom: TAB_BAR_CLEARANCE,
    gap: AppSpacing.md,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
    paddingVertical: AppSpacing.sm,
  },
  brand: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 20,
    lineHeight: 28,
    letterSpacing: -0.8,
    color: AppColors.textPrimary,
  },
  brandSmall: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
    letterSpacing: -0.3,
    color: AppColors.textPrimary,
  },
  heading: {
    paddingHorizontal: AppSpacing.xs,
    paddingVertical: AppSpacing.sm,
  },
  title: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 26,
    lineHeight: 30,
    letterSpacing: -1.1,
    color: AppColors.textPrimary,
  },
  subtitle: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -1.1,
    color: AppColors.textPrimary,
  },
  actions: {
    flexDirection: 'row',
    gap: AppSpacing.sm,
    padding: AppSpacing.sm,
    borderRadius: AppRadii.lg,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  action: {
    flex: 1,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: AppSpacing.md,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.primary,
  },
  actionText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: -0.3,
    color: AppColors.textPrimary,
  },
  loader: {
    marginTop: AppSpacing.xxl,
  },
  notice: {
    padding: AppSpacing.xl,
    gap: AppSpacing.sm,
    borderRadius: AppRadii.lg,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  noticeTitle: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: -0.5,
    color: AppColors.textPrimary,
  },
  noticeText: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 15,
    lineHeight: 21,
    letterSpacing: -0.3,
    color: AppColors.textSecondary,
  },
  retry: {
    minHeight: AppTouch.minimum,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: AppSpacing.xl,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.controlActive,
  },
  retryText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.controlOnActive,
  },
  card: {
    overflow: 'hidden',
    borderRadius: AppRadii.lg,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  cardArt: {
    height: 116,
    justifyContent: 'center',
  },
  cardImage: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  cardShade: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.18)',
  },
  cardText: {
    paddingHorizontal: AppSpacing.xl,
    paddingRight: '35%',
  },
  cardSubject: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 19,
    lineHeight: 24,
    letterSpacing: -0.6,
    color: AppColors.textPrimary,
  },
  cardCourse: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 12,
    lineHeight: 16,
    color: AppColors.textPrimary,
  },
  cardTeacher: {
    marginTop: AppSpacing.md,
    fontFamily: 'DMSans_500Medium',
    fontSize: 12,
    lineHeight: 16,
    color: AppColors.textPrimary,
  },
  cardStrip: {
    minHeight: AppTouch.minimum,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: AppSpacing.md,
    paddingHorizontal: AppSpacing.xl,
    backgroundColor: AppColors.surfaceSoft,
  },
  stripText: {
    flex: 1,
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.textOnLight,
  },
  stripCode: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 13,
    letterSpacing: 1.5,
    color: AppColors.textOnLight,
  },
  stripAction: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.textOnLight,
  },
  pressed: {
    opacity: 0.6,
  },
});
