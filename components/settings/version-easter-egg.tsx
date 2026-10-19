import { ThemedText } from '@/components/themed-text';
import { AppColors, AppSpacing, AppType } from '@/constants/design-tokens';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useRef } from 'react';
import { Modal, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

const TAPS = 5;
const TAP_WINDOW_MS = 1600;
const EXIT_MS = 220;

// The H of HaNet (assets/onboarding/logotype.svg), drawn here so it can spin.
const H_PATH = 'M6 88.3657V6.63426V2L28.0822 22.2222V43.287L39.1233 44.5509V30.2269L68 32.7546V37.3889V57.6111V62.2454L39.1233 64.7731V50.4491L28.0822 51.713V72.7778L6 93V88.3657Z';
const LOGO_WIDTH = 168;
const LOGO_HEIGHT = LOGO_WIDTH * (96 / 74);
const GLOW = 340;

const haptic = (run: () => Promise<void>) => {
  if (Platform.OS !== 'web') void run();
};

/**
 * Counts quick taps; the fifth inside the window unlocks. From the third on
 * each tap ticks, so whoever found it feels it coming.
 */
export function useSecretTaps(onUnlock: () => void) {
  const taps = useRef<number[]>([]);
  return useCallback(() => {
    const now = Date.now();
    taps.current = [...taps.current.filter(at => now - at < TAP_WINDOW_MS), now];
    if (taps.current.length >= TAPS) {
      taps.current = [];
      onUnlock();
    } else if (taps.current.length >= 3) {
      haptic(() => Haptics.selectionAsync());
    }
  }, [onUnlock]);
}

/** The HaNet logo spinning over its version. Tap anywhere to close. */
export function VersionEasterEgg({ visible, version, onClose }: { visible: boolean; version: string; onClose: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      {visible && <EggScene version={version} onClose={onClose} />}
    </Modal>
  );
}

function EggScene({ version, onClose }: { version: string; onClose: () => void }) {
  const reduceMotion = useReducedMotion();
  const { width } = useWindowDimensions();
  const closing = useRef(false);

  const backdrop = useSharedValue(0);
  const pop = useSharedValue(reduceMotion ? 1 : 0);
  const spin = useSharedValue(0);
  const float = useSharedValue(0);
  const glow = useSharedValue(0);
  const back = useSharedValue(0);

  useEffect(() => {
    haptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
    backdrop.set(withTiming(1, { duration: 180, easing: Easing.out(Easing.cubic) }));
    back.set(withDelay(80, withTiming(1, { duration: 520, easing: Easing.out(Easing.exp) })));
    if (reduceMotion) return;
    pop.set(withSpring(1, { damping: 9, stiffness: 140, mass: 0.8 }));
    // A full turn on the way in, then a slow coin spin with a rest each lap.
    spin.set(withSequence(
      withTiming(360, { duration: 900, easing: Easing.out(Easing.cubic) }),
      withRepeat(withSequence(
        withDelay(1400, withTiming(720, { duration: 1100, easing: Easing.inOut(Easing.cubic) })),
        withTiming(360, { duration: 0 }),
      ), -1),
    ));
    float.set(withRepeat(withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.sin) }), -1, true));
    glow.set(withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [back, backdrop, float, glow, pop, reduceMotion, spin]);

  const close = () => {
    if (closing.current) return;
    closing.current = true;
    haptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
    backdrop.set(withTiming(0, { duration: EXIT_MS, easing: Easing.in(Easing.cubic) }, finished => {
      if (finished) scheduleOnRN(onClose);
    }));
  };

  const sceneStyle = useAnimatedStyle(() => ({ opacity: backdrop.get() }));

  const logoStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 900 },
      { translateY: -10 * float.get() + 5 },
      { scale: pop.get() * (1 + 0.15 * (1 - backdrop.get())) },
      { rotateY: `${spin.get()}deg` },
    ],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: (0.35 + 0.25 * glow.get()) * pop.get(),
    transform: [{ scale: 0.9 + 0.12 * glow.get() }],
  }));

  const backStyle = useAnimatedStyle(() => ({
    opacity: 0.9 * back.get(),
    transform: [{ scale: 0.7 + 0.3 * back.get() }, { translateY: 8 * float.get() - 4 }],
  }));

  return (
    <Animated.View style={[styles.scene, sceneStyle]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`HaNet versión ${version}. Toca para cerrar.`}
        onPress={close}
        style={styles.fill}
      >
        <View style={styles.center}>
          <Animated.View pointerEvents="none" style={[styles.back, backStyle]}>
            <ThemedText
              numberOfLines={1}
              adjustsFontSizeToFit
              style={[styles.backVersion, { width: width - AppSpacing.lg * 2, fontSize: Math.min(160, width * 0.34), lineHeight: Math.min(170, width * 0.36) }]}
            >
              {version}
            </ThemedText>
            <ThemedText style={styles.backBeta}>BETA</ThemedText>
          </Animated.View>

          <Animated.View pointerEvents="none" style={[styles.glow, glowStyle]}>
            <Svg width={GLOW} height={GLOW}>
              <Defs>
                <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
                  <Stop offset="0" stopColor={AppColors.accent} stopOpacity={1} />
                  <Stop offset="1" stopColor={AppColors.accent} stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Circle cx={GLOW / 2} cy={GLOW / 2} r={GLOW / 2} fill="url(#glow)" />
            </Svg>
          </Animated.View>

          <Animated.View pointerEvents="none" style={[styles.logo, logoStyle]}>
            <Svg width={LOGO_WIDTH} height={LOGO_HEIGHT} viewBox="0 0 74 96">
              <Path d={H_PATH} fill={AppColors.accent} />
            </Svg>
          </Animated.View>
        </View>

        <ThemedText style={styles.hint}>Toca para cerrar</ThemedText>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  scene: { flex: 1, backgroundColor: AppColors.canvas },
  fill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center' },
  back: { position: 'absolute', alignItems: 'center' },
  backVersion: { fontFamily: 'DMSans_700Bold', letterSpacing: -6, textAlign: 'center', color: AppColors.surface },
  backBeta: { ...AppType.headline, letterSpacing: 6, color: AppColors.surfaceMuted },
  glow: { position: 'absolute' },
  logo: {
    shadowColor: AppColors.accent,
    shadowOpacity: 0.6,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 0 },
  },
  hint: { ...AppType.caption, position: 'absolute', bottom: 64, color: AppColors.textSecondary, opacity: 0.7 },
});
