import { ThemedText } from '@/components/themed-text';
import { CustomIcon } from '@/components/ui/custom-icon';
import { AppColors } from '@/constants/design-tokens';
import { SPRING_SMOOTH } from '@/constants/motion';
import { eventBar, useEventBar } from '@/components/events/event-bar-store';
import { useEventOptions } from '@/components/events/event-options';
import { calendarBar, useCalendarBar } from '@/components/calendar/calendar-bar-store';
import { CalendarViewMenu, CalendarViewPill } from '@/components/calendar/view-menu';
import { EVENT_EDITOR_ROLES, useRole, useSession } from '@/services/auth-service';
import { BlurView } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import * as Haptics from 'expo-haptics';
import { usePathname, useRouter } from 'expo-router';
import React from 'react';
import { BackHandler, Keyboard, LayoutChangeEvent, Platform, Pressable, StyleSheet, TextInput, View, useWindowDimensions, type TextInputInstance } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  FadeIn,
  FadeOut,
  LinearTransition,
  interpolate,
  interpolateColor,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

type MotionTabIcon = React.ComponentProps<typeof CustomIcon>['name'];

/** Space a scrolling screen leaves at its end so the floating bar covers nothing. */
export const TAB_BAR_CLEARANCE = 112;

// The bar has a fixed height, so its labels grow with the system text size
// only up to a point (as the iOS tab bar does).
const TAB_TEXT_MAX_SCALE = 1.3;

/**
 * Adaptación local del patrón de expo-motion-tabs para el navegador existente.
 * Conserva la interacción de icono a píldora expandida usando Reanimated.
 */
function MotionTab({ active, icon, label, onPress }: { active: boolean; icon: MotionTabIcon; label: string; onPress: () => void }) {
  const [labelWidth, setLabelWidth] = React.useState(0);
  const [focused, setFocused] = React.useState(false);
  const progress = useSharedValue(active ? 1 : 0);
  const reduceMotion = useReducedMotion();

  React.useEffect(() => {
    const destination = active ? 1 : 0;
    progress.value = reduceMotion
      ? withTiming(destination, { duration: 100 })
      : withSpring(destination, { damping: 31, stiffness: 260, mass: 0.9 });
  }, [active, progress, reduceMotion]);

  const pillStyle = useAnimatedStyle(() => ({
    width: 44 + progress.value * (labelWidth + 18),
    backgroundColor: interpolateColor(progress.value, [0, 1], ['rgba(0,0,0,0)', AppColors.controlActive]),
  }));
  const activeIconStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const inactiveIconStyle = useAnimatedStyle(() => ({ opacity: 1 - progress.value }));
  const labelStyle = useAnimatedStyle(() => ({
    width: progress.value * (labelWidth + 18),
    opacity: interpolate(progress.value, [0, 0.25, 1], [0, 0, 1]),
    transform: [{ translateX: -6 * (1 - progress.value) }],
  }));

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      accessibilityHint={active ? undefined : `Cambiar a ${label}`}
      onPress={() => {
        if (!active && Platform.OS === 'ios') void Haptics.selectionAsync();
        onPress();
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [styles.motionPress, focused && styles.motionPressFocused, pressed && styles.motionPressPressed]}
    >
      <ThemedText onLayout={(event: LayoutChangeEvent) => setLabelWidth(Math.ceil(event.nativeEvent.layout.width))} maxFontSizeMultiplier={TAB_TEXT_MAX_SCALE} style={styles.motionMeasure}>{label}</ThemedText>
      <Animated.View style={[styles.motionTab, pillStyle]}>
        <View style={styles.motionIconBox}>
          <Animated.View style={[styles.motionIconLayer, inactiveIconStyle]}><CustomIcon name={icon} size={22} color={AppColors.textSecondary} /></Animated.View>
          <Animated.View style={[styles.motionIconLayer, activeIconStyle]}><CustomIcon name={icon} size={22} color={AppColors.controlOnActive} /></Animated.View>
        </View>
        <Animated.View style={[styles.motionLabelWrap, labelStyle]}>
          <ThemedText numberOfLines={1} maxFontSizeMultiplier={TAB_TEXT_MAX_SCALE} style={styles.motionLabel}>{label}</ThemedText>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

function HanetLogo() {
  return (
    <Svg width="75" height="29" viewBox="0 0 75 29" fill="none">
      <Path d="M0 0L6.87688 6.43605V13.1403L10.3153 13.5425V8.98366L19.3082 9.78816V19.1741L10.3153 19.9786V15.4197L6.87688 15.822V22.5262L0 28.9622V0Z" fill="#D9D9D9" />
      <Path d="M0 0L6.87688 6.43605V13.1403L10.3153 13.5425V8.98366L19.3082 9.78816V19.1741L10.3153 19.9786V15.4197L6.87688 15.822V22.5262L0 28.9622V0Z" fill={AppColors.accent} />
      <Path d="M35.8767 20.9172V7.40146H37.8075V20.9172H35.8767ZM27.2846 20.9172V7.40146H29.2154V20.9172H27.2846ZM28.8871 14.8158V13.2325H36.2822V14.8158H28.8871Z" fill={AppColors.textPrimary} />
      <Path d="M42.0633 21.1489C41.291 21.1489 40.6474 21.0201 40.1325 20.7627C39.6305 20.4924 39.2507 20.132 38.9933 19.6814C38.7487 19.2309 38.6265 18.7418 38.6265 18.214C38.6265 17.5833 38.7874 17.0427 39.1092 16.5921C39.4438 16.1416 39.9201 15.7941 40.538 15.5495C41.1687 15.3049 41.9217 15.1826 42.797 15.1826H45.3264C45.3264 14.6034 45.2363 14.1271 45.0561 13.7538C44.8887 13.3806 44.6377 13.1038 44.3031 12.9236C43.9684 12.7305 43.5629 12.634 43.0866 12.634C42.4945 12.634 41.9796 12.782 41.542 13.0781C41.1172 13.3612 40.8598 13.8053 40.7697 14.4103H38.8388C38.9161 13.7024 39.1478 13.1102 39.5339 12.634C39.9201 12.1448 40.4221 11.7715 41.04 11.5141C41.6578 11.2438 42.3401 11.1086 43.0866 11.1086C44.0006 11.1086 44.7664 11.2695 45.3843 11.5913C46.0022 11.9131 46.4656 12.3701 46.7745 12.9622C47.0963 13.5415 47.2572 14.2301 47.2572 15.0282V20.9172H45.6353L45.4422 19.3146H45.3843C45.217 19.6107 45.0175 19.8745 44.7858 20.1062C44.5669 20.3251 44.3159 20.5117 44.0327 20.6662C43.7495 20.8206 43.4406 20.9365 43.1059 21.0137C42.7841 21.1038 42.4366 21.1489 42.0633 21.1489ZM42.5074 19.5849C42.945 19.5849 43.3312 19.5012 43.6659 19.3339C44.0134 19.1666 44.3031 18.9413 44.5347 18.6581C44.7793 18.3621 44.9595 18.0338 45.0754 17.6734C45.2041 17.313 45.2749 16.9397 45.2878 16.5535H42.9901C42.4237 16.5535 41.9668 16.6179 41.6192 16.7466C41.2845 16.8753 41.04 17.0555 40.8855 17.2872C40.731 17.5189 40.6538 17.7892 40.6538 18.0982C40.6538 18.3942 40.7246 18.6581 40.8662 18.8898C41.0207 19.1086 41.2331 19.2824 41.5034 19.4111C41.7866 19.527 42.1212 19.5849 42.5074 19.5849Z" fill={AppColors.textPrimary} />
      <Path d="M48.1924 20.9172V7.40146H50.6253L56.9583 18.3685H57.0163V7.40146H58.9471V20.9172H56.5143L50.1812 9.95014H50.1233V20.9172H48.1924Z" fill={AppColors.textPrimary} />
      <Path d="M64.4722 21.1489C63.5326 21.1489 62.7023 20.9429 61.9815 20.531C61.2606 20.1062 60.6943 19.5205 60.2824 18.774C59.8705 18.0274 59.6645 17.1521 59.6645 16.1481C59.6645 15.144 59.864 14.2687 60.2631 13.5221C60.675 12.7627 61.2413 12.1706 61.9622 11.7458C62.6959 11.321 63.539 11.1086 64.4915 11.1086C65.4312 11.1086 66.2421 11.321 66.9244 11.7458C67.6195 12.1577 68.1536 12.7048 68.5269 13.387C68.9131 14.0692 69.1062 14.8287 69.1062 15.6654C69.1062 15.7941 69.0998 15.9357 69.0869 16.0901C69.0869 16.2446 69.0804 16.4055 69.0676 16.5728H61.074V15.2213H67.1754C67.1367 14.4103 66.86 13.7796 66.3451 13.3291C65.8431 12.8657 65.2188 12.634 64.4722 12.634C63.9445 12.634 63.4553 12.7498 63.0048 12.9815C62.5672 13.2132 62.2132 13.5608 61.9429 14.0242C61.6854 14.4747 61.5567 15.0539 61.5567 15.7619V16.3025C61.5567 17.0105 61.6854 17.609 61.9429 18.0982C62.2132 18.5744 62.5736 18.9349 63.0241 19.1794C63.4746 19.424 63.9509 19.5463 64.4529 19.5463C65.0579 19.5463 65.5664 19.4111 65.9783 19.1408C66.3902 18.8576 66.6927 18.4779 66.8857 18.0016H68.8166C68.6492 18.6066 68.366 19.1473 67.967 19.6235C67.568 20.0869 67.0724 20.4602 66.4803 20.7434C65.901 21.0137 65.2317 21.1489 64.4722 21.1489Z" fill={AppColors.textPrimary} />
      <Path d="M73.3395 20.9172C72.7216 20.9172 72.1874 20.8206 71.7369 20.6275C71.2864 20.4345 70.9389 20.1127 70.6943 19.6621C70.4497 19.2116 70.3274 18.6002 70.3274 17.8279V12.8271H68.6862V11.3403H70.3274L70.5591 8.94611H72.2582V11.3403H75V12.8271H72.2582V17.8472C72.2582 18.4393 72.3741 18.8383 72.6058 19.0443C72.8375 19.2502 73.2365 19.3532 73.8029 19.3532H74.8841V20.9172H73.3395Z" fill={AppColors.textPrimary} />
    </Svg>
  );
}

/** A search that grows out of the bar's center pill until it fills the bar. */
type BarSearch = {
  open: boolean;
  value: string;
  placeholder: string;
  onChangeText: (text: string) => void;
  onOpen: () => void;
  onClose: () => void;
};

const SEARCH_PILL_WIDTH = 118;
const SEARCH_INSET = 8;

function CloseGlyph() {
  return (
    <Svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <Path d="M1.5 1.5L12.5 12.5M12.5 1.5L1.5 12.5" stroke={AppColors.controlOnActive} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

/** Lifts the bar over the keyboard while `active`; the bar stays put otherwise. */
function useKeyboardLift(active: boolean) {
  const height = useSharedValue(0);
  React.useEffect(() => {
    if (!active) {
      height.value = withTiming(0, { duration: 200 });
      return;
    }
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', event => {
      height.value = withTiming(event.endCoordinates.height, { duration: event.duration || 220, easing: Easing.out(Easing.cubic) });
    });
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', event => {
      height.value = withTiming(0, { duration: event.duration || 200, easing: Easing.out(Easing.cubic) });
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [active, height]);
  return height;
}

/**
 * A panel that grows out of the bar: the same glass card widens and rises to
 * the panel's measured height, so the menu reads as the bar itself opening
 * rather than a popup laid over it.
 */
type BarPanel = {
  open: boolean;
  /** Names the panel for "Cerrar …" on the backdrop. */
  label: string;
  onClose: () => void;
  content: React.ReactNode;
};

const BAR_HEIGHT = 64;
const BAR_MAX_WIDTH = 330;
const PANEL_MAX_WIDTH = 380;
// Response ~0.35 s with damping ratio 0.82: the card settles with a hint of give.
const PANEL_SPRING_OPEN = { stiffness: 320, damping: 29, mass: 1 };
const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

type AppTabBarProps = {
  /** Given on screens reached from another one: the left slot becomes "Volver". */
  onBack?: () => void;
  onHome: () => void;
  onProfile: () => void;
  active?: 'home' | 'profile' | null;
  /** Action of the current section; the HaNet logo when there is none. */
  center?: React.ReactNode;
  /** Changes when the set of controls changes, to crossfade between them. */
  controlsKey?: string;
  /** Replaces `center` with a search pill that expands over the whole bar. */
  search?: BarSearch;
  /** A panel the center pill opens, growing out of the bar. */
  panel?: BarPanel;
};

/** The one floating bar of the app: back or home, the section's action, profile. */
export function AppTabBar({ onBack, onHome, onProfile, active = null, center, controlsKey = 'main', search, panel }: AppTabBarProps) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const useLiquidGlass = Platform.OS === 'ios' && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
  const TabBarSurface: React.ComponentType<any> = useLiquidGlass ? GlassView : BlurView;

  const open = !!search?.open;
  const input = React.useRef<TextInputInstance>(null);
  const { width: windowWidth } = useWindowDimensions();
  // The bar is 90 % of the screen up to a cap; an open panel takes a little more.
  const barWidth = Math.min(windowWidth * 0.9, BAR_MAX_WIDTH);
  const panelWidth = Math.max(barWidth, Math.min(windowWidth - 24, PANEL_MAX_WIDTH));
  const [centerFrame, setCenterFrame] = React.useState({ x: 0, width: 0 });
  const morph = useSharedValue(open ? 1 : 0);
  const keyboard = useKeyboardLift(open);
  const restingBottom = Math.max(insets.bottom, 12) + 12;

  React.useEffect(() => {
    morph.value = reduceMotion
      ? withTiming(open ? 1 : 0, { duration: 120 })
      // A soft spring with a little overshoot, so the pill flows out like liquid.
      : withSpring(open ? 1 : 0, open ? { damping: 17, stiffness: 190, mass: 0.9 } : { damping: 24, stiffness: 260, mass: 0.9 });
    if (open) {
      const focus = setTimeout(() => input.current?.focus(), reduceMotion ? 0 : 140);
      return () => clearTimeout(focus);
    }
    input.current?.blur();
  }, [morph, open, reduceMotion]);

  // Where the pill rests (in the middle slot) and the whole bar it grows to.
  const startLeft = 12 + centerFrame.x + (centerFrame.width - SEARCH_PILL_WIDTH) / 2;
  const fullWidth = Math.max(barWidth - 2 - SEARCH_INSET * 2, SEARCH_PILL_WIDTH);

  const liftStyle = useAnimatedStyle(() => ({ bottom: Math.max(restingBottom, keyboard.value + 10) }));
  const controlsStyle = useAnimatedStyle(() => ({
    opacity: interpolate(morph.value, [0, 0.45], [1, 0], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(morph.value, [0, 1], [1, 0.9], Extrapolation.CLAMP) }],
  }));
  const searchStyle = useAnimatedStyle(() => ({
    left: interpolate(morph.value, [0, 1], [startLeft, SEARCH_INSET]),
    width: interpolate(morph.value, [0, 1], [SEARCH_PILL_WIDTH, fullWidth]),
    // Stretches a touch on the way, like a drop pulled sideways.
    transform: [{ scaleY: interpolate(morph.value, [0, 0.5, 1], [1, 0.94, 1], Extrapolation.CLAMP) }],
    opacity: morph.value > 0.001 ? 1 : 0,
  }));
  const fieldStyle = useAnimatedStyle(() => ({ opacity: interpolate(morph.value, [0.35, 0.8], [0, 1], Extrapolation.CLAMP) }));

  // The panel: `reveal` carries the card's size and the content's travel,
  // `fade` the content's and backdrop's opacity. With reduced motion the card
  // takes its size at once and only the fade runs.
  const panelOpen = !!panel?.open;
  const [panelHeight, setPanelHeight] = React.useState(0);
  const reveal = useSharedValue(0);
  const fade = useSharedValue(0);
  React.useEffect(() => {
    const target = panelOpen ? 1 : 0;
    reveal.value = reduceMotion ? target : withSpring(target, panelOpen ? PANEL_SPRING_OPEN : SPRING_SMOOTH);
    fade.value = withTiming(target, { duration: panelOpen ? 240 : 150, easing: Easing.out(Easing.cubic) });
  }, [fade, panelOpen, reduceMotion, reveal]);

  const onClosePanel = panel?.onClose;
  React.useEffect(() => {
    if (!panelOpen || !onClosePanel) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClosePanel();
      return true;
    });
    return () => sub.remove();
  }, [onClosePanel, panelOpen]);

  // Only plain values go into the worklets; `panel` carries React elements.
  const hasPanel = !!panel;
  const cardStyle = useAnimatedStyle(() => {
    if (!hasPanel) return { width: barWidth, height: BAR_HEIGHT };
    return {
      width: interpolate(reveal.value, [0, 1], [barWidth, panelWidth]),
      height: BAR_HEIGHT + Math.max(0, reveal.value) * panelHeight,
    };
  });
  // Centered on the card while it widens, so the content opens from the middle.
  const panelStyle = useAnimatedStyle(() => ({
    left: (interpolate(reveal.value, [0, 1], [barWidth, panelWidth]) - panelWidth) / 2,
    opacity: interpolate(fade.value, [0.2, 1], [0, 1], Extrapolation.CLAMP),
    transform: [
      { translateY: interpolate(reveal.value, [0, 1], [18, 0]) },
      { scale: interpolate(reveal.value, [0, 1], [0.96, 1]) },
    ],
  }));
  // The content comes into focus as it arrives.
  const panelBlurProps = useAnimatedProps(() => ({
    intensity: interpolate(fade.value, [0, 1], [28, 0], Extrapolation.CLAMP),
  }));
  const dividerStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  const searchPill = search ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={search.placeholder}
      style={({ pressed }) => [styles.centerPill, styles.searchPill, pressed && styles.motionPressPressed]}
      onPress={() => {
        if (Platform.OS === 'ios') void Haptics.selectionAsync();
        search.onOpen();
      }}
    >
      <CustomIcon name="search" size={20} color={AppColors.textOnLight} />
      <ThemedText maxFontSizeMultiplier={TAB_TEXT_MAX_SCALE} style={styles.searchText}>Buscar…</ThemedText>
    </Pressable>
  ) : null;

  return (
    <>
    {panel && (
      <Animated.View pointerEvents={panelOpen ? 'auto' : 'none'} style={[styles.backdrop, backdropStyle]}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Cerrar ${panel.label}`} onPress={panel.onClose} style={StyleSheet.absoluteFill} />
      </Animated.View>
    )}
    <Animated.View
      entering={reduceMotion ? undefined : FadeIn.duration(180)}
      exiting={reduceMotion ? undefined : FadeOut.duration(120)}
      style={[styles.tabBarWrapper, search ? liftStyle : { bottom: restingBottom }]}
    >
      <Animated.View style={[styles.tabBarCard, cardStyle]}>
      <TabBarSurface
        {...(useLiquidGlass
          ? { colorScheme: 'dark', glassEffectStyle: 'regular', isInteractive: true }
          : {
              intensity: 60,
              tint: 'systemUltraThinMaterialDark',
              ...(Platform.OS === 'android' ? { blurMethod: 'dimezisBlurView' } : {}),
            })}
        style={styles.tabBarContainer}
      >
        {panel && (
          <View style={styles.panelArea} pointerEvents={panelOpen ? 'box-none' : 'none'} accessibilityElementsHidden={!panelOpen} importantForAccessibility={panelOpen ? 'auto' : 'no-hide-descendants'}>
            <Animated.View
              style={[styles.panelLayer, { width: panelWidth - 2 }, panelStyle]}
              onLayout={(event: LayoutChangeEvent) => {
                const height = Math.ceil(event.nativeEvent.layout.height);
                if (height > 0 && height !== panelHeight) setPanelHeight(height);
              }}
            >
              {panel.content}
            </Animated.View>
            {Platform.OS === 'ios' && !reduceMotion && (
              <AnimatedBlurView pointerEvents="none" tint="systemUltraThinMaterialDark" animatedProps={panelBlurProps} style={StyleSheet.absoluteFill} />
            )}
          </View>
        )}
        {panel && <Animated.View pointerEvents="none" style={[styles.panelDivider, dividerStyle]} />}
        <View style={[styles.controlsRow, { width: barWidth - 2 }]}>
        <Animated.View style={[styles.controlsLayer, controlsStyle]} pointerEvents={open ? 'none' : 'auto'}>
        <Animated.View
          key={controlsKey}
          entering={reduceMotion ? undefined : FadeIn.duration(180).easing(Easing.out(Easing.cubic))}
          exiting={reduceMotion ? undefined : FadeOut.duration(120).easing(Easing.out(Easing.cubic))}
          layout={reduceMotion ? undefined : LinearTransition.duration(220).easing(Easing.out(Easing.cubic))}
          style={styles.tabControls}
        >
          {onBack ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Volver"
              style={({ pressed }) => [styles.backButton, pressed && styles.motionPressPressed]}
              onPress={onBack}
            >
              <CustomIcon name="chevron-left" size={20} color={AppColors.textOnLight} />
            </Pressable>
          ) : (
            <MotionTab active={active === 'home'} icon="home" label="Inicio" onPress={onHome} />
          )}

          <View style={styles.center} onLayout={(event: LayoutChangeEvent) => setCenterFrame({ x: event.nativeEvent.layout.x, width: event.nativeEvent.layout.width })}>
            {searchPill ?? center ?? <HanetLogo />}
          </View>

          <MotionTab active={active === 'profile'} icon="user" label="Perfil" onPress={onProfile} />
        </Animated.View>
        </Animated.View>

        {search && (
          <Animated.View style={[styles.centerPill, styles.searchOpen, searchStyle]} pointerEvents={open ? 'auto' : 'none'}>
            <CustomIcon name="search" size={20} color={AppColors.textOnLight} />
            <Animated.View style={[styles.searchFieldWrap, fieldStyle]}>
              <TextInput
                ref={input}
                value={search.value}
                onChangeText={search.onChangeText}
                placeholder={search.placeholder}
                placeholderTextColor="rgba(40, 40, 41, 0.6)"
                selectionColor={AppColors.accent}
                returnKeyType="search"
                autoCorrect={false}
                onSubmitEditing={() => Keyboard.dismiss()}
                onKeyPress={event => { if (event.nativeEvent.key === 'Escape') search.onClose(); }}
                maxFontSizeMultiplier={TAB_TEXT_MAX_SCALE}
                accessibilityLabel={search.placeholder}
                style={styles.searchInput}
              />
              {search.value.length > 0 && (
                <Pressable accessibilityRole="button" accessibilityLabel="Borrar la búsqueda" hitSlop={8} onPress={() => search.onChangeText('')} style={({ pressed }) => [styles.clearButton, pressed && styles.motionPressPressed]}>
                  <ThemedText style={styles.clearText}>Borrar</ThemedText>
                </Pressable>
              )}
            </Animated.View>
            <Pressable accessibilityRole="button" accessibilityLabel="Cerrar la búsqueda" hitSlop={6} onPress={search.onClose} style={({ pressed }) => [styles.closeButton, pressed && styles.motionPressPressed]}>
              <CloseGlyph />
            </Pressable>
          </Animated.View>
        )}
        </View>
      </TabBarSurface>
      </Animated.View>
    </Animated.View>
    </>
  );
}

/** Routes that show the bar; everything else (sign-in, onboarding, sheets) has none. */
const TAB_ROOTS = ['/', '/explore'];
const BAR_ROUTES = [...TAB_ROOTS, '/calendar', '/events', '/feed', '/event-info', '/event-detail', '/classhall', '/classhall/hall', '/classhall/evaluation', '/hnt-admin', '/settings', '/licenses'];

/** Screens whose center pill is a search, which they read from the bar store. */
const SEARCH_PLACEHOLDERS: Record<string, string> = { '/events': 'Buscar eventos', '/feed': 'Buscar en el feed' };

/**
 * The app's only bar. It lives in the root layout, above every screen, so it
 * stays in place while screens change underneath and only its controls change.
 */
export function GlobalTabBar() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useSession();
  const role = useRole();
  const bar = useEventBar();
  const options = useEventOptions(bar.actions);
  const calendar = useCalendarBar();

  // The search belongs to the screen it was opened on: changing screen closes it.
  const searchRoute = React.useRef(pathname);
  React.useEffect(() => {
    if (searchRoute.current !== pathname && (bar.searchOpen || bar.query)) eventBar.closeSearch();
    searchRoute.current = pathname;
  }, [bar.query, bar.searchOpen, pathname]);

  // The Calendar's menu belongs to the Calendar too.
  React.useEffect(() => {
    if (pathname !== '/calendar') calendarBar.closeMenu();
  }, [pathname]);

  if (!BAR_ROUTES.includes(pathname)) return null;

  const isTabRoot = TAB_ROOTS.includes(pathname);
  const canAddEvents = !!user && !!role && EVENT_EDITOR_ROLES.includes(role);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));
  // Leaves whatever is stacked over the tabs before switching tab.
  const goToTab = (href: '/' | '/explore') => {
    if (router.canDismiss()) router.dismissAll();
    router.navigate(href);
  };

  // The center action changes by section.
  let center: React.ReactNode;
  if (pathname === '/event-detail') {
    // Always there; it buys, claims the HaNet coupon or asks which, by what the event has.
    const none = options.count === 0;
    center = (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Opciones del evento"
        accessibilityHint={none ? 'Este evento no tiene entradas ni cupones' : options.count === 1 ? options.singleLabel : 'Comprar entradas o reclamar el cupón HaNet'}
        accessibilityState={{ disabled: none }}
        disabled={none}
        style={({ pressed }) => [styles.centerPill, styles.optionsPill, none && styles.pillDisabled, pressed && styles.motionPressPressed]}
        onPress={options.open}
      >
        <CustomIcon name="tag" size={18} color={AppColors.textOnLight} />
        <ThemedText maxFontSizeMultiplier={TAB_TEXT_MAX_SCALE} style={styles.createText}>Opciones</ThemedText>
      </Pressable>
    );
  } else if (pathname === '/calendar') {
    // Names the view on screen; the menu to change it grows out of the bar.
    center = <CalendarViewPill view={calendar.view} open={calendar.menuOpen} onPress={calendarBar.toggleMenu} />;
  }

  return (
    <>
    <AppTabBar
      onBack={isTabRoot ? undefined : goBack}
      onHome={() => goToTab('/')}
      onProfile={() => goToTab('/explore')}
      active={pathname === '/' ? 'home' : pathname === '/explore' ? 'profile' : null}
      center={center}
      controlsKey={isTabRoot ? 'main' : pathname === '/calendar' || pathname === '/events' || pathname === '/feed' || pathname === '/event-detail' ? pathname : 'screen'}
      search={SEARCH_PLACEHOLDERS[pathname]
        ? { open: bar.searchOpen, value: bar.query, placeholder: SEARCH_PLACEHOLDERS[pathname], onChangeText: eventBar.setQuery, onOpen: eventBar.openSearch, onClose: eventBar.closeSearch }
        : undefined}
      panel={pathname === '/calendar'
        ? { open: calendar.menuOpen, label: 'las vistas', onClose: calendarBar.closeMenu, content: <CalendarViewMenu canCreate={canAddEvents} /> }
        : undefined}
    />
    {options.dialog}
    </>
  );
}

const styles = StyleSheet.create({
  tabBarWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 999,
    elevation: 20,
    pointerEvents: 'box-none',
  },
  // Sized by the bar (and its panel, when open); the surface fills it.
  tabBarCard: {
    borderRadius: 32,
  },
  tabBarContainer: {
    flex: 1,
    borderRadius: 32,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'hidden',
    // The BlurView/GlassView owns the translucent material. A fill here would
    // flatten the fallback into an opaque dark surface.
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    boxShadow: '0px 10px 20px rgba(0, 0, 0, 0.3)',
    elevation: 8,
  },
  // Keeps the bar's own width while the card around it widens for a panel.
  controlsRow: {
    height: BAR_HEIGHT - 2,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  panelArea: {
    alignSelf: 'stretch',
    flex: 1,
    overflow: 'hidden',
  },
  panelLayer: {
    position: 'absolute',
    top: 0,
  },
  panelDivider: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: BAR_HEIGHT - 2,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    zIndex: 998,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  tabControls: {
    width: '100%',
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 70,
    height: 45,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 360,
    backgroundColor: AppColors.controlActive,
  },
  centerPill: {
    height: 45,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 360,
    backgroundColor: AppColors.controlActive,
  },
  searchPill: {
    width: 118,
  },
  optionsPill: {
    width: 124,
  },
  pillDisabled: {
    opacity: 0.45,
  },
  controlsLayer: {
    width: '100%',
    height: '100%',
  },
  searchOpen: {
    position: 'absolute',
    top: (64 - 2 - 45) / 2,
    justifyContent: 'flex-start',
    paddingLeft: 14,
    paddingRight: 5,
    gap: 8,
    overflow: 'hidden',
  },
  searchFieldWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  searchInput: {
    flex: 1,
    height: 45,
    paddingVertical: 0,
    color: AppColors.controlOnActive,
    fontFamily: 'DMSans_500Medium',
    fontSize: 15,
    outlineStyle: 'none' as any,
  },
  // As tall as the pill, so the small label still has a full-size target.
  clearButton: {
    height: 45,
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  clearText: {
    color: AppColors.controlOnActive,
    opacity: 0.6,
    fontFamily: 'DMSans_700Bold',
    fontSize: 12,
    lineHeight: 16,
  },
  closeButton: {
    width: 35,
    height: 35,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: 'rgba(40, 40, 41, 0.12)',
  },
  searchText: {
    color: AppColors.controlOnActive,
    opacity: 0.7,
    fontSize: 13,
    fontFamily: 'DMSans_700Bold',
  },
  createText: {
    color: AppColors.textOnLight,
    fontFamily: 'DMSans_700Bold',
    fontSize: 14,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 10,
  },
  motionMeasure: { position: 'absolute', left: -10000, top: -10000, opacity: 0, fontSize: 14, fontFamily: 'DMSans_700Bold' },
  motionPress: { borderRadius: 999, outlineStyle: 'none' as any },
  motionPressFocused: { borderWidth: 1, borderColor: AppColors.accent },
  motionPressPressed: { opacity: 0.82, transform: [{ scale: 0.96 }] },
  motionTab: { height: 45, borderRadius: 999, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  motionIconBox: { width: 44, height: 45 },
  motionIconLayer: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  motionLabelWrap: { height: 45, justifyContent: 'center', overflow: 'hidden', paddingRight: 18 },
  motionLabel: { color: AppColors.controlOnActive, fontSize: 14, lineHeight: 20, fontFamily: 'DMSans_700Bold' },
});
