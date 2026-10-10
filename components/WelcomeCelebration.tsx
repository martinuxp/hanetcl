import { AppColors, AppSpacing } from '@/constants/design-tokens';
import { ThemedText } from '@/components/themed-text';
import React, { useEffect, useMemo, useRef } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';

export type WelcomeTreatment = 'ella' | 'el' | 'neutro';

type Props = {
  visible: boolean;
  firstName: string;
  treatment?: WelcomeTreatment;
  institutionName?: string;
  onDone: () => void;
};

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

// Confetti flight, in seconds and px/s: launched upward from the middle of
// the screen, slowed by drag, pulled back down by gravity.
const FLIGHT_SECONDS = 3.2;
const DRAG = 1.7;
const GRAVITY = 1500;
const PARTICLES = 72;
const HOLD_MS = 3400;
const FADE_MS = 280;

// Pink carries the brand; the neutrals keep it from turning into a rainbow.
const COLORS = [AppColors.accent, AppColors.accent, '#FF7FB0', AppColors.textPrimary, AppColors.controlActive, AppColors.primary];

type Particle = {
  vx: number;
  vy: number;
  spin: number;
  flutter: number;
  delay: number;
  width: number;
  height: number;
  radius: number;
  color: string;
};

function makeParticles(): Particle[] {
  return Array.from({ length: PARTICLES }, (_, index) => {
    const angle = (25 + Math.random() * 130) * (Math.PI / 180);
    const speed = 520 + Math.random() * 900;
    const size = 7 + Math.random() * 6;
    const shape = index % 3;
    return {
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      spin: (Math.random() - 0.5) * 14,
      flutter: 5 + Math.random() * 9,
      delay: Math.random() * 0.18,
      width: shape === 0 ? size * 0.6 : size,
      height: shape === 0 ? size * 1.6 : size,
      radius: shape === 2 ? size : 2,
      color: COLORS[index % COLORS.length],
    };
  });
}

function greeting(treatment: WelcomeTreatment) {
  if (treatment === 'ella') return 'Bienvenida a HaNet';
  if (treatment === 'el') return 'Bienvenido a HaNet';
  return 'Te damos la bienvenida a HaNet';
}

function Confetti({ particle, flight, originX, originY }: { particle: Particle; flight: SharedValue<number>; originX: number; originY: number }) {
  const style = useAnimatedStyle(() => {
    const t = Math.max(0, flight.get() * FLIGHT_SECONDS - particle.delay);
    const travelled = (1 - Math.exp(-DRAG * t)) / DRAG;
    const x = originX + particle.vx * travelled;
    const y = originY - particle.vy * travelled + 0.5 * GRAVITY * 0.5 * t * t;

    return {
      opacity: t <= 0 ? 0 : interpolate(flight.get(), [0, 0.7, 1], [1, 1, 0]),
      transform: [
        { translateX: x },
        { translateY: y },
        { rotate: `${particle.spin * t}rad` },
        // Squashing one axis reads as the paper tumbling toward the viewer.
        { scaleY: Math.cos(particle.flutter * t) },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        styles.particle,
        { width: particle.width, height: particle.height, borderRadius: particle.radius, backgroundColor: particle.color },
        style,
      ]}
    />
  );
}

/** One-time celebration shown when an account finishes joining its institution. */
export function WelcomeCelebration({ visible, firstName, treatment = 'neutro', institutionName, onDone }: Props) {
  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onDone}>
      {visible && <Celebration firstName={firstName} treatment={treatment} institutionName={institutionName} onDone={onDone} />}
    </Modal>
  );
}

function Celebration({ firstName, treatment, institutionName, onDone }: Omit<Props, 'visible'> & { treatment: WelcomeTreatment }) {
  const { width, height } = useWindowDimensions();
  const reduced = useReducedMotion();
  const particles = useMemo(() => (reduced ? [] : makeParticles()), [reduced]);

  const backdrop = useSharedValue(0);
  const intro = useSharedValue(0);
  const flight = useSharedValue(0);
  const closing = useRef(false);
  const doneRef = useRef(onDone);

  useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);

  const close = () => {
    if (closing.current) return;
    closing.current = true;
    backdrop.set(withTiming(0, { duration: FADE_MS, easing: EASE_OUT }));
    setTimeout(() => doneRef.current(), FADE_MS);
  };

  useEffect(() => {
    backdrop.set(withTiming(1, { duration: 200, easing: EASE_OUT }));
    intro.set(withDelay(120, withTiming(1, { duration: reduced ? 200 : 900, easing: EASE_OUT })));
    if (!reduced) flight.set(withDelay(160, withTiming(1, { duration: FLIGHT_SECONDS * 1000, easing: Easing.linear })));

    const timer = setTimeout(close, HOLD_MS);
    return () => clearTimeout(timer);
    // Plays once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.get() }));

  // The three lines arrive one after another off the same clock.
  const nameStyle = useAnimatedStyle(() => {
    const p = interpolate(intro.get(), [0, 0.55], [0, 1], 'clamp');
    return { opacity: p, transform: reduced ? [] : [{ translateY: (1 - p) * 14 }, { scale: 0.92 + 0.08 * p }] };
  });
  const greetingStyle = useAnimatedStyle(() => {
    const p = interpolate(intro.get(), [0.3, 0.8], [0, 1], 'clamp');
    return { opacity: p, transform: reduced ? [] : [{ translateY: (1 - p) * 12 }] };
  });
  const detailStyle = useAnimatedStyle(() => {
    const p = interpolate(intro.get(), [0.55, 1], [0, 1], 'clamp');
    return { opacity: p, transform: reduced ? [] : [{ translateY: (1 - p) * 10 }] };
  });

  return (
    <Animated.View style={[styles.backdrop, backdropStyle]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${firstName ? `${firstName}, ` : ''}${greeting(treatment)}. Toca para continuar.`}
        onPress={close}
        style={styles.content}
      >
        {particles.map((particle, index) => (
          <Confetti key={index} particle={particle} flight={flight} originX={width / 2} originY={height * 0.46} />
        ))}

        {!!firstName && (
          <Animated.View style={nameStyle}>
            <ThemedText style={styles.name} numberOfLines={1} adjustsFontSizeToFit>¡{firstName}!</ThemedText>
          </Animated.View>
        )}
        <Animated.View style={greetingStyle}>
          <ThemedText style={styles.greeting}>{greeting(treatment)}</ThemedText>
        </Animated.View>
        {!!institutionName && (
          <Animated.View style={detailStyle}>
            <ThemedText style={styles.detail}>Ya eres parte de {institutionName}.</ThemedText>
          </Animated.View>
        )}
        <Animated.View style={[styles.hintWrap, detailStyle]}>
          <ThemedText style={styles.hint}>Toca para continuar</ThemedText>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(40, 40, 41, 0.94)',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: AppSpacing.xl,
    gap: AppSpacing.sm,
    overflow: 'hidden',
  },
  particle: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  name: {
    textAlign: 'center',
    fontFamily: 'DMSans_700Bold',
    fontSize: 56,
    lineHeight: 62,
    letterSpacing: -2.4,
    color: AppColors.accent,
  },
  greeting: {
    textAlign: 'center',
    fontFamily: 'DMSans_700Bold',
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -1,
    color: AppColors.textPrimary,
  },
  hintWrap: {
    position: 'absolute',
    bottom: 56,
    left: 0,
    right: 0,
  },
  hint: {
    textAlign: 'center',
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.textSecondary,
    opacity: 0.7,
  },
  detail: {
    textAlign: 'center',
    fontFamily: 'DMSans_500Medium',
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: -0.4,
    color: AppColors.textSecondary,
  },
});
