import { BoltIcon, CrownIcon } from '@/assets/animated-icons/crown';
import { AllianceBadge, allianceColor, allianceFills, dayText } from '@/components/anniversary/anniversary-ui';
import { Confetti } from '@/components/anniversary/confetti';
import { FlexText } from '@/components/anniversary/flex-text';
import { GradientCard } from '@/components/anniversary/gradient-card';
import { ThemedText } from '@/components/themed-text';
import { HanetButton } from '@/components/ui/hanet-button';
import { AppColors, AppDisplay, AppFlexFonts, AppPressed, AppSpacing, AppType } from '@/constants/design-tokens';
import { anniversaryDay, daysTo, phaseOf, ranking, useAnniversaryState } from '@/services/anniversary-service';
import type { Alliance, Anniversary } from '@/services/anniversary-service';
import { markWelcomeSeen } from '@/services/anniversary-welcome';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// The Aniversario's welcome, the first time this device opens it (before or
// during the week): a few pages in the manner of Spotify Wrapped, each lit by
// its own colors, that say what the week is and how the page works. Swiped
// with the finger (the content follows it) or with "Siguiente".

type Page = {
  key: string;
  colors: string[];
  render: (active: boolean) => React.ReactNode;
};

// The big number grows in weight on a narrow cut, so it stays a number.
// Titles end on the Expanded cut: the widest one breaks long words at this size.
const TITLE_STEPS = AppFlexFonts.ramp.slice(0, 4);
const NUMBER_STEPS = ['GoogleSansFlex_300Light_ExtraCondensed', 'GoogleSansFlex_500Medium_Condensed', AppFlexFonts.numbers] as const;

const tick = () => {
  if (Platform.OS === 'ios') void Haptics.selectionAsync();
};

/** Bars that run to their share when the page comes in: the marcador, in small. */
function RaceBars({ alliances, active }: { alliances: Alliance[]; active: boolean }) {
  const shown = alliances.slice(0, 4);
  const top = Math.max(1, ...shown.map(alliance => alliance.total ?? 0));
  const hidden = shown.some(alliance => alliance.total === null) || top <= 1;
  return (
    <View style={styles.race} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {shown.map((alliance, index) => (
        <RaceRow
          key={alliance.id}
          alliance={alliance}
          share={hidden ? [0.92, 0.74, 0.6, 0.45][index] : Math.max(0.12, (alliance.total ?? 0) / top)}
          delay={index * 120}
          active={active}
          leader={index === 0 && !hidden}
        />
      ))}
    </View>
  );
}

function RaceRow({ alliance, share, delay, active, leader }: { alliance: Alliance; share: number; delay: number; active: boolean; leader: boolean }) {
  const reduceMotion = useReducedMotion();
  const grow = useSharedValue(reduceMotion ? share : 0.04);
  useEffect(() => {
    if (reduceMotion) { grow.value = share; return; }
    grow.value = active ? withDelay(delay + 150, withTiming(share, { duration: 800, easing: Easing.out(Easing.cubic) })) : 0.04;
  }, [active, delay, grow, reduceMotion, share]);
  const style = useAnimatedStyle(() => ({ width: `${grow.value * 100}%` }));
  return (
    <View style={styles.raceRow}>
      <AllianceBadge alliance={alliance} size={34} />
      <View style={styles.raceTrack}>
        <Animated.View style={[styles.raceBar, { backgroundColor: allianceColor(alliance).fill }, style]} />
      </View>
      {leader && <CrownIcon size={20} color={AppColors.accentYellow} animated={active} />}
    </View>
  );
}

function Feature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <View style={styles.feature}>
      <View style={styles.featureIcon}>{icon}</View>
      <View style={styles.featureText}>
        <ThemedText style={styles.featureTitle}>{title}</ThemedText>
        <ThemedText style={styles.featureBody}>{text}</ThemedText>
      </View>
    </View>
  );
}

function pagesFor(anniversary: Anniversary, organizer: boolean, now: number): Page[] {
  const mine = anniversary.alliances.find(alliance => alliance.id === anniversary.myAllianceId) ?? null;
  const all = allianceFills([...(mine ? [mine] : []), ...anniversary.alliances.filter(alliance => alliance.id !== mine?.id)]);
  const during = phaseOf(anniversary, now) === 'during';
  const { day, total } = anniversaryDay(anniversary, now);
  const days = daysTo(anniversary.startsAt, now);
  const hidden = anniversary.alliances.some(alliance => alliance.total === null);
  const pages: Page[] = [];

  pages.push({
    key: 'intro',
    colors: all,
    render: active => (
      <>
        {active && during && <Confetti colors={all} count={48} />}
        <ThemedText style={styles.kicker}>{dayText(anniversary.startsAt)} al {dayText(anniversary.endsAt)}</ThemedText>
        <FlexText key={`intro-${active}`} accessibilityRole="header" steps={TITLE_STEPS} style={styles.hero}>
          {during ? '¡Empezó el aniversario!' : 'Se viene el aniversario'}
        </FlexText>
        <View style={styles.bigRow}>
          <FlexText key={`n-${active}`} delay={200} steps={NUMBER_STEPS} style={styles.bigNumber}>
            {during ? String(day) : String(Math.max(0, days))}
          </FlexText>
          <ThemedText style={styles.bigLabel}>
            {during ? `de ${total} días\n¡de aniversario!` : days === 1 ? 'día para\nempezar' : 'días para\nempezar'}
          </ThemedText>
        </View>
      </>
    ),
  });

  if (mine) {
    const color = allianceColor(mine);
    pages.push({
      key: 'mine',
      colors: [color.fill],
      render: active => (
        <>
          <ThemedText style={styles.kicker}>Tu alianza</ThemedText>
          <View style={styles.badgeWrap}>
            <AllianceBadge alliance={mine} size={128} />
          </View>
          <FlexText key={`mine-${active}`} accessibilityRole="header" steps={TITLE_STEPS} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6} style={styles.hero}>{mine.name}</FlexText>
          {!!mine.theme && <ThemedText style={styles.lead}>{mine.theme}</ThemedText>}
          {!!mine.motto && <ThemedText style={styles.motto}>“{mine.motto}”</ThemedText>}
          {anniversary.isLead && (
            <View style={styles.leadPill}>
              <CrownIcon size={16} color={AppColors.textOnLight} />
              <ThemedText style={styles.leadPillText}>Eres jefe de alianza</ThemedText>
            </View>
          )}
        </>
      ),
    });
  } else {
    pages.push({
      key: 'alliances',
      colors: all,
      render: active => (
        <>
          <ThemedText style={styles.kicker}>{anniversary.alliances.length} alianzas</ThemedText>
          <FlexText key={`all-${active}`} accessibilityRole="header" steps={TITLE_STEPS} style={styles.hero}>Las alianzas</FlexText>
          <View style={styles.badges}>
            {anniversary.alliances.map(alliance => (
              <View key={alliance.id} style={styles.badgeItem}>
                <AllianceBadge alliance={alliance} size={56} />
                <ThemedText numberOfLines={1} style={styles.badgeName}>{alliance.name}</ThemedText>
              </View>
            ))}
          </View>
          <ThemedText style={styles.lead}>Cada estudiante juega por la de su curso.</ThemedText>
        </>
      ),
    });
  }

  pages.push({
    key: 'score',
    colors: all.slice(0, 2).reverse(),
    render: active => (
      <>
        <ThemedText style={styles.kicker}>El marcador</ThemedText>
        <FlexText key={`score-${active}`} accessibilityRole="header" steps={TITLE_STEPS} style={styles.hero}>Una carrera de puntos</FlexText>
        <RaceBars alliances={ranking(anniversary)} active={active} />
        <ThemedText style={styles.lead}>
          {hidden
            ? 'Cada actividad suma según el lugar. Esta vez el marcador está oculto: la ganadora se revela en la premiación.'
            : 'Cada actividad suma según el lugar, y cada descuento lleva su motivo. Todo queda en Movimientos de puntos.'}
        </ThemedText>
      </>
    ),
  });

  pages.push({
    key: 'how',
    colors: [mine ? allianceColor(mine).fill : AppColors.accent, AppColors.accentYellow],
    render: active => (
      <>
        <ThemedText style={styles.kicker}>Qué pasa aquí</ThemedText>
        <FlexText key={`how-${active}`} accessibilityRole="header" steps={TITLE_STEPS} style={styles.hero}>Atento a todo</FlexText>
        <View style={styles.features}>
          <Feature icon={<Ionicons name="today-outline" size={22} color={AppColors.textPrimary} />} title="Lo de hoy, arriba" text="Las actividades del día, con su hora y lugar. Toca una para ver su podio." />
          <Feature icon={<BoltIcon size={22} color={AppColors.textPrimary} animated={active} />} title="Pruebas flash" text="Llegan por notificación y gana la alianza más rápida." />
          <Feature icon={<Ionicons name="megaphone-outline" size={22} color={AppColors.textPrimary} />} title="Avisos del CEE" text="Cambios de horario y lo que tengas que saber." />
          <Feature icon={<Ionicons name="alarm-outline" size={22} color={AppColors.textPrimary} />} title="Plazos" text="Te avisamos 24 h y 2 h antes de cada uno." />
        </View>
      </>
    ),
  });

  if (organizer) {
    pages.push({
      key: 'organize',
      colors: [AppColors.surfaceRaised, AppColors.accent],
      render: active => (
        <>
          <ThemedText style={styles.kicker}>Tú organizas</ThemedText>
          <FlexText key={`org-${active}`} accessibilityRole="header" steps={TITLE_STEPS} style={styles.hero}>Todo está en la barra</FlexText>
          <View style={styles.organizePill}>
            <Ionicons name="options-outline" size={18} color={AppColors.textOnLight} />
            <ThemedText style={styles.organizePillText}>Organizar</ThemedText>
          </View>
          <ThemedText style={styles.lead}>Al centro de la barra: avisos, pruebas flash, sumar o descontar, actividades, plazos y jefes de alianza.</ThemedText>
        </>
      ),
    });
  }

  pages.push({
    key: 'go',
    colors: all,
    render: active => (
      <>
        {mine && <View style={styles.badgeWrap}><AllianceBadge alliance={mine} size={96} /></View>}
        <FlexText key={`go-${active}`} accessibilityRole="header" steps={TITLE_STEPS} style={styles.hero}>¡A darlo todo{mine ? `, ${mine.name}` : ''}!</FlexText>
        <ThemedText style={styles.lead}>Fotos y videos, en el Instagram de cada alianza. Aquí, los puntos.</ThemedText>
      </>
    ),
  });

  return pages;
}

/** One page's light, shown as the finger brings it in. */
function Backdrop({ colors, index, width, scrollX }: { colors: string[]; index: number; width: number; scrollX: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(scrollX.value, [(index - 1) * width, index * width, (index + 1) * width], [0, 1, 0], Extrapolation.CLAMP),
  }));
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <GradientCard colors={colors} style={styles.backdrop}><View /></GradientCard>
    </Animated.View>
  );
}

/** The page's content drifts a little behind the finger, so the light leads. */
function PageBody({ index, width, scrollX, children }: { index: number; width: number; scrollX: SharedValue<number>; children: React.ReactNode }) {
  const style = useAnimatedStyle(() => {
    const offset = scrollX.value - index * width;
    return {
      opacity: interpolate(Math.abs(offset), [0, width * 0.7], [1, 0], Extrapolation.CLAMP),
      transform: [{ translateX: offset * 0.3 }],
    };
  });
  return <Animated.View style={[styles.pageBody, style]}>{children}</Animated.View>;
}

function Dot({ index, width, scrollX }: { index: number; width: number; scrollX: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const near = interpolate(Math.abs(scrollX.value - index * width), [0, width], [1, 0], Extrapolation.CLAMP);
    return { width: 8 + near * 16, opacity: 0.4 + near * 0.6 };
  });
  return <Animated.View style={[styles.dot, style]} />;
}

export default function AnniversaryWelcome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const state = useAnniversaryState();
  const anniversary = state?.anniversary ?? null;
  const [now] = useState(() => Date.now());
  const [page, setPage] = useState(0);
  const scroller = useAnimatedRef<Animated.ScrollView>();
  const scrollX = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler(event => { scrollX.value = event.contentOffset.x; });
  const marked = useRef(false);

  // Seen once shown: the Home tile stops calling for it.
  useEffect(() => {
    if (anniversary && !marked.current) {
      marked.current = true;
      markWelcomeSeen(anniversary.id);
    }
  }, [anniversary]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/anniversary'));

  if (!anniversary) {
    return (
      <View style={[styles.container, styles.center]}>
        <HanetButton label="Entrar" variant="accent" onPress={close} />
      </View>
    );
  }

  const pages = pagesFor(anniversary, !!state?.canOrganize, now);
  const last = page >= pages.length - 1;

  const settle = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(event.nativeEvent.contentOffset.x / width);
    if (next !== page) {
      tick();
      setPage(next);
    }
  };

  const advance = () => {
    if (last) {
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      close();
      return;
    }
    tick();
    scroller.current?.scrollTo({ x: (page + 1) * width, animated: true });
    setPage(page + 1);
  };

  return (
    <View style={styles.container}>
      {pages.map((item, index) => <Backdrop key={item.key} colors={item.colors} index={index} width={width} scrollX={scrollX} />)}

      <Animated.ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={settle}
        style={StyleSheet.absoluteFill}
      >
        {pages.map((item, index) => (
          <View
            key={item.key}
            accessibilityElementsHidden={index !== page}
            importantForAccessibility={index === page ? 'auto' : 'no-hide-descendants'}
            style={[styles.page, { width, paddingTop: insets.top + 72, paddingBottom: insets.bottom + 140 }]}
          >
            <PageBody index={index} width={width} scrollX={scrollX}>{item.render(index === page)}</PageBody>
          </View>
        ))}
      </Animated.ScrollView>

      <View style={[styles.top, { top: insets.top + AppSpacing.md }]} pointerEvents="box-none">
        {!last && (
          <Pressable accessibilityRole="button" onPress={close} hitSlop={10} style={({ pressed }) => [styles.skip, pressed && AppPressed]}>
            <ThemedText style={styles.skipText}>Saltar</ThemedText>
          </Pressable>
        )}
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + AppSpacing.lg }]} pointerEvents="box-none">
        <View style={styles.dots} accessibilityLabel={`Página ${page + 1} de ${pages.length}`}>
          {pages.map((item, index) => <Dot key={item.key} index={index} width={width} scrollX={scrollX} />)}
        </View>
        <Pressable accessibilityRole="button" onPress={advance} style={({ pressed }) => [styles.next, pressed && AppPressed]}>
          <ThemedText style={styles.nextText}>{last ? 'Entrar' : 'Siguiente'}</ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AppColors.canvas,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: {
    flex: 1,
    padding: 0,
    borderRadius: 0,
  },
  page: {
    height: '100%',
    paddingHorizontal: AppSpacing.xl,
  },
  pageBody: {
    flex: 1,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    justifyContent: 'center',
    gap: AppSpacing.lg,
  },
  kicker: {
    ...AppType.caption,
    fontFamily: 'DMSans_700Bold',
    fontSize: 13,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: AppColors.textPrimary,
  },
  hero: {
    ...AppDisplay.hero,
    fontSize: 44,
    lineHeight: 46,
    color: AppColors.textPrimary,
  },
  lead: {
    ...AppType.body,
    fontSize: 18,
    lineHeight: 26,
    color: AppColors.textPrimary,
  },
  motto: {
    ...AppType.body,
    fontFamily: 'DMSans_400Regular_Italic',
    fontSize: 18,
    lineHeight: 26,
    color: AppColors.textSecondary,
  },
  bigRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
  },
  bigNumber: {
    ...AppDisplay.number,
    fontSize: 120,
    lineHeight: 120,
    color: AppColors.textPrimary,
  },
  bigLabel: {
    flex: 1,
    ...AppDisplay.name,
    fontSize: 20,
    lineHeight: 25,
    color: AppColors.textPrimary,
  },
  badgeWrap: {
    alignSelf: 'flex-start',
  },
  leadPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.xs,
    paddingHorizontal: AppSpacing.md,
    paddingVertical: AppSpacing.sm,
    borderRadius: 999,
    backgroundColor: AppColors.accentYellow,
  },
  leadPillText: {
    ...AppType.callout,
    fontFamily: 'DMSans_700Bold',
    color: AppColors.textOnLight,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing.lg,
  },
  badgeItem: {
    width: 72,
    alignItems: 'center',
    gap: AppSpacing.xs,
  },
  badgeName: {
    ...AppType.caption,
    fontFamily: 'DMSans_700Bold',
    color: AppColors.textPrimary,
  },
  race: {
    gap: AppSpacing.md,
  },
  raceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
  },
  raceTrack: {
    flex: 1,
    height: 14,
    borderRadius: 7,
    overflow: 'hidden',
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
  },
  raceBar: {
    height: '100%',
    borderRadius: 7,
  },
  features: {
    gap: AppSpacing.lg,
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: AppSpacing.md,
  },
  featureIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
  },
  featureText: {
    flex: 1,
    gap: 2,
  },
  featureTitle: {
    ...AppType.headline,
    fontSize: 17,
    color: AppColors.textPrimary,
  },
  featureBody: {
    ...AppType.callout,
    fontFamily: 'DMSans_400Regular',
    color: AppColors.textSecondary,
  },
  organizePill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 45,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: AppColors.controlActive,
  },
  organizePillText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 15,
    color: AppColors.textOnLight,
  },
  top: {
    position: 'absolute',
    right: AppSpacing.lg,
    left: AppSpacing.lg,
    alignItems: 'flex-end',
  },
  skip: {
    paddingHorizontal: AppSpacing.md,
    paddingVertical: AppSpacing.sm,
    borderRadius: 999,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
  },
  skipText: {
    ...AppType.callout,
    fontFamily: 'DMSans_700Bold',
    color: AppColors.textPrimary,
  },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    gap: AppSpacing.lg,
    paddingHorizontal: AppSpacing.xl,
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    height: 8,
    borderRadius: 4,
    backgroundColor: AppColors.textPrimary,
  },
  // White on any page's color, as Wrapped's button.
  next: {
    width: '100%',
    maxWidth: 520,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: AppColors.textPrimary,
  },
  nextText: {
    ...AppType.headline,
    fontSize: 17,
    color: AppColors.textOnLight,
  },
});
