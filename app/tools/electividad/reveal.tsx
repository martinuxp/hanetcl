import { ThemedText } from '@/components/themed-text';
import { AreaIcon } from '@/components/tools/area-icon';
import { HanetButton } from '@/components/ui/hanet-button';
import { AppColors, AppPressed, AppRadii, AppSpacing, AppType } from '@/constants/design-tokens';
import { currentResult, leaningField } from '@/services/electividad-service';
import type { AreaId, AreaScore, ElectividadResult } from '@/services/electividad-service';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';
import { EASE_OUT_CUBIC } from '@/constants/motion';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '@/i18n';

// After the test (or from the result, to see it again): "calculating" over the
// nine areas, then the top three one by one, from third to first, and a short
// podium before the full result. With reduced motion it opens on the podium.

const GRID: AreaId[] = ['bio', 'qui', 'mat', 'fis', 'soc', 'len', 'mus', 'vis', 'mov'];
const TINT = 'rgba(239,34,116,0.18)';

/** When each phase starts (ms): 0 calculating, 1 top three lit, 2–4 third to first, 5 podium. */
const PHASES = [0, 1900, 3000, 5200, 7400, 10000];

const ORDINAL = [t('tools.electividad.reveal.tuAreaDeMayorInteres'), t('tools.electividad.reveal.tuSegundaAreaDeMayor'), t('tools.electividad.reveal.tuTerceraAreaDeMayor')];

function podiumTitle(result: ElectividadResult) {
  const field = leaningField(result);
  return field ? t('tools.electividad.reveal.loTuyoSonLasName', { name: field.name }) : t('tools.electividad.reveal.tienesInteresesVariados');
}

function haptic(strong = false) {
  if (Platform.OS !== 'ios') return;
  void Haptics.impactAsync(strong ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
}

function CalcTile({ area, index, lit, top, size }: { area: AreaId; index: number; lit: boolean; top: boolean; size: number }) {
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(reduceMotion ? 1 : 0.35);

  useEffect(() => {
    cancelAnimation(opacity);
    if (lit) {
      opacity.value = withTiming(top ? 1 : 0.3, { duration: 400 });
    } else if (!reduceMotion) {
      opacity.value = withDelay(
        (index % 3) * 120 + Math.floor(index / 3) * 180,
        withRepeat(withSequence(withTiming(1, { duration: 550 }), withTiming(0.35, { duration: 550 })), -1),
      );
    }
  }, [index, lit, opacity, reduceMotion, top]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View style={[styles.calcTile, { width: size, height: size, borderRadius: Math.round(size * 0.24) }, lit && top && styles.calcTileLit, style]}>
      <AreaIcon area={area} size={Math.round(size * 0.36)} color={lit && top ? AppColors.accent : AppColors.textPrimary} />
    </Animated.View>
  );
}

function useCountUp(target: number, run: boolean) {
  // Its component is keyed by area, so the target never changes under it.
  const [value, setValue] = useState(run ? 0 : target);
  useEffect(() => {
    if (!run) return;
    const start = Date.now();
    const timer = setInterval(() => {
      const progress = Math.min(1, (Date.now() - start) / 900);
      setValue(Math.round(target * (1 - Math.pow(1 - progress, 3))));
      if (progress >= 1) clearInterval(timer);
    }, 30);
    return () => clearInterval(timer);
  }, [run, target]);
  return value;
}

function RevealArea({ area, place, animate }: { area: AreaScore; place: number; animate: boolean }) {
  const first = place === 0;
  const percent = useCountUp(area.percent, animate);
  const enter = (delay: number) => (animate ? FadeInDown.delay(delay).duration(420).easing(EASE_OUT_CUBIC) : undefined);

  return (
    <View
      style={styles.reveal}
      accessible
      accessibilityLabel={t('tools.electividad.reveal.ordinalNamePercentPorCiento', { ordinal: ORDINAL[place], name: area.name, percent: area.percent, wins: area.wins, of: area.of })}
      accessibilityLiveRegion="polite"
    >
      <Animated.View entering={enter(0)}>
        <ThemedText style={[styles.ordinal, first && styles.ordinalFirst]}>{ORDINAL[place]}</ThemedText>
      </Animated.View>
      <Animated.View
        entering={animate ? ZoomIn.delay(150).springify().damping(13).stiffness(160) : undefined}
        style={[styles.revealTile, first && styles.revealTileFirst]}
      >
        <AreaIcon area={area.id} size={first ? 84 : 64} color={first ? AppColors.textPrimary : AppColors.accent} />
      </Animated.View>
      <Animated.View entering={enter(350)}>
        <ThemedText style={[styles.revealName, first && styles.revealNameFirst]}>{area.name}</ThemedText>
      </Animated.View>
      <Animated.View entering={enter(500)}>
        <ThemedText style={styles.revealPercent}>{percent}%</ThemedText>
      </Animated.View>
      <Animated.View entering={enter(600)}>
        <ThemedText style={styles.revealWins}>{t('tools.electividad.reveal.winsDeOfElecciones', { wins: area.wins, of: area.of })}</ThemedText>
      </Animated.View>
    </View>
  );
}

export default function ElectividadRevealScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const { width } = useWindowDimensions();
  const [result] = useState(() => currentResult());
  const [phase, setPhase] = useState(reduceMotion ? 5 : 0);
  const [run, setRun] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const stop = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  useEffect(() => {
    if (!result) return;
    stop();
    if (reduceMotion) return;
    PHASES.forEach((at, next) => {
      if (next === 0) return;
      timers.current.push(setTimeout(() => {
        setPhase(next);
        if (next >= 2 && next <= 4) haptic(next === 4);
        if (next === 5 && Platform.OS === 'ios') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }, at));
    });
    return stop;
  }, [reduceMotion, result, run, stop]);

  const openResult = () => {
    stop();
    router.replace('/tools/electividad/result');
  };

  if (!result) {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <ThemedText style={styles.calcHint}>{t('tools.electividad.reveal.noEncontramosTuResultado')}</ThemedText>
        <HanetButton label={t('common.volver')} variant="surface" onPress={() => router.back()} />
      </View>
    );
  }

  const top = result.areas.slice(0, 3);
  // Square tiles with a fixed size: a percentage width with aspectRatio laid
  // them out flat on iOS, with the icon off center.
  const tile = Math.min(92, Math.floor((Math.min(width, 430) - AppSpacing.lg * 2 - 24 - 48) / 3));
  const topIds = new Set(top.map(area => area.id));
  const revealing = phase >= 2 && phase <= 4 ? top[4 - phase] : null;
  const animate = !reduceMotion;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + AppSpacing.sm, paddingBottom: insets.bottom + AppSpacing.lg }]}>
      <View style={styles.topBar}>
        <ThemedText style={styles.topTitle}>{t('tools.electividad.reveal.testDeIntereses')}</ThemedText>
        {phase < 5 && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('tools.electividad.reveal.saltarLaAnimacion')}
            onPress={() => { stop(); setPhase(5); }}
            style={({ pressed }) => [styles.skip, pressed && AppPressed]}
          >
            <ThemedText style={styles.skipText}>{t('anniversary.welcome.saltar')}</ThemedText>
          </Pressable>
        )}
      </View>

      <View style={styles.stage}>
        {phase <= 1 && (
          <View style={styles.calc}>
            <View style={styles.calcGrid} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              {[0, 1, 2].map(row => (
                <View key={row} style={styles.calcRow}>
                  {GRID.slice(row * 3, row * 3 + 3).map((area, column) => (
                    <CalcTile key={area} area={area} index={row * 3 + column} lit={phase >= 1} top={topIds.has(area)} size={tile} />
                  ))}
                </View>
              ))}
            </View>
            <View style={styles.calcText} accessibilityLiveRegion="polite">
              <ThemedText accessibilityRole="header" style={styles.calcTitle}>{phase >= 1 ? t('common.listo') : t('tools.electividad.reveal.calculandoTusResultados')}</ThemedText>
              <ThemedText style={styles.calcHint}>{t('tools.electividad.reveal.comparandoTus72Elecciones')}</ThemedText>
              <CalcBar key={run} animate={animate} />
            </View>
          </View>
        )}

        {revealing && <RevealArea key={revealing.id} area={revealing} place={4 - phase} animate={animate} />}

        {phase === 5 && (
          <View style={styles.podium}>
            <Animated.View entering={animate ? FadeIn.duration(300) : undefined}>
              <ThemedText style={styles.podiumEyebrow}>{t('common.tusAreasDeMayorInteres')}</ThemedText>
              <ThemedText accessibilityRole="header" style={styles.podiumTitle}>{podiumTitle(result)}</ThemedText>
            </Animated.View>
            {top.map((area, place) => (
              <Animated.View
                key={area.id}
                entering={animate ? FadeInDown.delay(120 + place * 110).duration(380) : undefined}
                style={[styles.podiumRow, place === 0 && styles.podiumRowFirst]}
                accessible
                accessibilityLabel={t('tools.electividad.reveal.numberNamePercentPorCiento', { number: place + 1, name: area.name, percent: area.percent })}
              >
                <ThemedText style={styles.podiumRank}>{place + 1}</ThemedText>
                <View style={styles.podiumIcon}>
                  <AreaIcon area={area.id} size={26} color={AppColors.accent} />
                </View>
                <ThemedText style={styles.podiumName}>{area.name}</ThemedText>
                <ThemedText style={styles.podiumPercent}>{area.percent}%</ThemedText>
              </Animated.View>
            ))}
            <Animated.View entering={animate ? FadeIn.delay(600).duration(300) : undefined} style={styles.actions}>
              <HanetButton label={t('tools.electividad.reveal.verResultadoCompleto')} variant="accent" onPress={openResult} />
              {!reduceMotion && <HanetButton label={t('tools.electividad.reveal.repetirAnimacion')} variant="surface" onPress={() => { setPhase(0); setRun(value => value + 1); }} />}
            </Animated.View>
          </View>
        )}
      </View>
    </View>
  );
}

function CalcBar({ animate }: { animate: boolean }) {
  const width = useSharedValue(animate ? 0 : 1);
  useEffect(() => {
    if (animate) width.value = withTiming(1, { duration: PHASES[1], easing: Easing.bezier(0.4, 0, 0.2, 1) });
  }, [animate, width]);
  const style = useAnimatedStyle(() => ({ width: `${width.value * 100}%` }));
  return (
    <View style={styles.calcTrack}>
      <Animated.View style={[styles.calcFill, style]} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: AppColors.canvas, paddingHorizontal: AppSpacing.lg },
  center: { alignItems: 'center', justifyContent: 'center', gap: AppSpacing.lg },
  topBar: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', maxWidth: 430, alignSelf: 'center' },
  topTitle: { ...AppType.headline, color: AppColors.textPrimary },
  skip: { height: 44, paddingHorizontal: 16, borderRadius: AppRadii.pill, backgroundColor: AppColors.surface, justifyContent: 'center' },
  skipText: { ...AppType.callout, color: AppColors.textPrimary },
  stage: { flex: 1, width: '100%', maxWidth: 430, alignSelf: 'center', justifyContent: 'center' },
  calc: { gap: AppSpacing.xxl },
  calcGrid: { alignSelf: 'center', gap: 12 },
  calcRow: { flexDirection: 'row', gap: 12 },
  calcTile: { backgroundColor: AppColors.surface, alignItems: 'center', justifyContent: 'center' },
  calcTileLit: { backgroundColor: TINT },
  calcText: { alignItems: 'center', gap: AppSpacing.md },
  calcTitle: { ...AppType.title1, color: AppColors.textPrimary, textAlign: 'center' },
  calcHint: { ...AppType.callout, fontFamily: 'DMSans_400Regular', color: AppColors.textSecondary, textAlign: 'center' },
  calcTrack: { width: 200, height: 6, borderRadius: AppRadii.pill, backgroundColor: AppColors.surface, overflow: 'hidden' },
  calcFill: { height: 6, borderRadius: AppRadii.pill, backgroundColor: AppColors.accent },
  reveal: { alignItems: 'center', gap: 20 },
  ordinal: { ...AppType.callout, color: AppColors.textSecondary, textAlign: 'center' },
  ordinalFirst: { fontFamily: 'DMSans_700Bold', color: AppColors.textPrimary },
  revealTile: { width: 132, height: 132, borderRadius: 40, backgroundColor: TINT, alignItems: 'center', justifyContent: 'center' },
  revealTileFirst: { width: 168, height: 168, borderRadius: 48, backgroundColor: AppColors.accent },
  revealName: { fontFamily: 'DMSans_700Bold', fontSize: 40, lineHeight: 46, letterSpacing: -2, color: AppColors.textPrimary, textAlign: 'center' },
  revealNameFirst: { fontSize: 48, lineHeight: 54, letterSpacing: -2.4 },
  revealPercent: { fontFamily: 'DMSans_700Bold', fontSize: 64, lineHeight: 70, letterSpacing: -3, color: AppColors.accent, fontVariant: ['tabular-nums'], textAlign: 'center' },
  revealWins: { ...AppType.callout, fontFamily: 'DMSans_400Regular', color: AppColors.textSecondary, textAlign: 'center' },
  podium: { gap: AppSpacing.md },
  podiumEyebrow: { ...AppType.callout, color: AppColors.textSecondary },
  podiumTitle: { ...AppType.largeTitle, fontFamily: 'DMSans_700Bold', color: AppColors.textPrimary, marginBottom: AppSpacing.sm },
  podiumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: AppRadii.lg,
    backgroundColor: AppColors.surface,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  podiumRowFirst: { borderColor: AppColors.accent },
  podiumRank: { width: 28, ...AppType.title3, color: AppColors.surfaceSoft, textAlign: 'center', fontVariant: ['tabular-nums'] },
  podiumIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: TINT, alignItems: 'center', justifyContent: 'center' },
  podiumName: { ...AppType.title3, color: AppColors.textPrimary, flex: 1 },
  podiumPercent: { ...AppType.title3, color: AppColors.accent, fontVariant: ['tabular-nums'] },
  actions: { gap: 10, marginTop: AppSpacing.xl },
});
