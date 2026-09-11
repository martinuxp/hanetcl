import { AppColors } from '@/constants/design-tokens';
import { Tabs, useRouter } from 'expo-router';
import React from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, View, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { CustomIcon } from '@/components/ui/custom-icon';
import { ThemedText } from '@/components/themed-text';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSession } from '@/services/auth-service';
import { db } from '@/services/firebase';
import { doc, getDoc } from 'firebase/firestore';

type MotionTabIcon = React.ComponentProps<typeof CustomIcon>['name'];

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
      : withSpring(destination, { damping: 24, stiffness: 260, mass: 0.9 });
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
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPress={() => {
        if (Platform.OS === 'ios') void Haptics.selectionAsync();
        onPress();
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [styles.motionPress, focused && styles.motionPressFocused, pressed && styles.motionPressPressed]}
    >
      <ThemedText onLayout={(event: LayoutChangeEvent) => setLabelWidth(Math.ceil(event.nativeEvent.layout.width))} style={styles.motionMeasure}>{label}</ThemedText>
      <Animated.View style={[styles.motionTab, pillStyle]}>
        <View style={styles.motionIconBox}>
          <Animated.View style={[styles.motionIconLayer, inactiveIconStyle]}><CustomIcon name={icon} size={22} color={AppColors.textSecondary} /></Animated.View>
          <Animated.View style={[styles.motionIconLayer, activeIconStyle]}><CustomIcon name={icon} size={22} color={AppColors.controlOnActive} /></Animated.View>
        </View>
        <Animated.View style={[styles.motionLabelWrap, labelStyle]}>
          <ThemedText numberOfLines={1} style={styles.motionLabel}>{label}</ThemedText>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

function CustomTabBar({ state, descriptors, navigation }: any) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const currentRouteName = state.routes[state.index].name;
  const isCalendar = currentRouteName === 'calendar';
  const isEvents = currentRouteName === 'events';
  const reduceMotion = useReducedMotion();
  const useLiquidGlass = Platform.OS === 'ios' && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
  const TabBarSurface: React.ComponentType<any> = useLiquidGlass ? GlassView : BlurView;
  const controlsKey = isEvents ? 'events' : isCalendar ? 'calendar' : 'main';
  const controlsEntering = reduceMotion
    ? undefined
    : FadeIn.duration(180).easing(Easing.out(Easing.cubic));
  const controlsExiting = reduceMotion
    ? undefined
    : FadeOut.duration(120).easing(Easing.out(Easing.cubic));
  const controlsLayout = reduceMotion
    ? undefined
    : LinearTransition.duration(220).easing(Easing.out(Easing.cubic));

  const { user } = useSession();
  const allowedRoles = ['HNT', 'Admin', 'CEE', 'Directiva'];
  const [userRole, setUserRole] = React.useState<string | null>(null);

  React.useEffect(() => {
    const fetchRole = async () => {
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          const role = userDoc.data()?.role || 'Estudiante';
          setUserRole(role);
        } catch (e) {
          console.error("Error fetching role:", e);
        }
      }
    };
    fetchRole();
  }, [user]);

  const canAddEvents = userRole ? allowedRoles.includes(userRole) : false;

  const openModal = () => {
    router.navigate('/create-event');
  };

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const navigateTab = (index: number) => {
    const route = state.routes[index];
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (state.index !== index && !event.defaultPrevented) navigation.navigate(route.name);
  };

  return (
    <View style={[styles.tabBarWrapper, { bottom: Math.max(insets.bottom, 12) + 12 }]}>
      {/* Base TabBar Content */}
      <View style={{ position: 'absolute', bottom: 0, width: '100%', alignItems: 'center' }}>
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
          <Animated.View
            key={controlsKey}
            entering={controlsEntering}
            exiting={controlsExiting}
            layout={controlsLayout}
            style={styles.tabControls}
          >
            {/* Left side changes with the active section. */}
            {isCalendar || isEvents ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Volver"
                style={[styles.tabItem, styles.tabItemFocused, isEvents && styles.eventsBackButton]}
                onPress={goBack}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <CustomIcon name="chevron-left" size={20} color={AppColors.textOnLight} />
                </View>
              </Pressable>
            ) : (
              <MotionTab active={state.index === 0} icon="home" label="Inicio" onPress={() => navigateTab(0)} />
            )}

            {/* Center action changes by section. */}
            <View style={styles.centerLogoContainer}>
              {isEvents ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Buscar eventos"
                  style={[styles.tabItem, styles.eventsSearchButton]}
                  onPress={() => router.push({ pathname: '/events', params: { mode: 'search' } })}
                >
                  <View style={styles.eventsSearchContent}>
                    <CustomIcon name="search" size={20} color={AppColors.textOnLight} />
                    <ThemedText style={styles.eventsSearchText}>Buscar...</ThemedText>
                  </View>
                </Pressable>
              ) : isCalendar && canAddEvents ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Crear evento"
                  style={[styles.tabItem, styles.tabItemFocused, { width: 100, flexDirection: 'row', gap: 6 }]}
                  onPress={openModal}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <CustomIcon name="calendar" size={18} color={AppColors.textOnLight} />
                    <ThemedText style={{ color: AppColors.textOnLight, fontFamily: 'DMSans_700Bold', fontSize: 14 }}>Crear</ThemedText>
                  </View>
                </Pressable>
              ) : (
                <Svg width="75" height="29" viewBox="0 0 75 29" fill="none">
                <Path d="M0 0L6.87688 6.43605V13.1403L10.3153 13.5425V8.98366L19.3082 9.78816V19.1741L10.3153 19.9786V15.4197L6.87688 15.822V22.5262L0 28.9622V0Z" fill="#D9D9D9" />
                <Path d="M0 0L6.87688 6.43605V13.1403L10.3153 13.5425V8.98366L19.3082 9.78816V19.1741L10.3153 19.9786V15.4197L6.87688 15.822V22.5262L0 28.9622V0Z" fill={AppColors.accent} />
                <Path d="M35.8767 20.9172V7.40146H37.8075V20.9172H35.8767ZM27.2846 20.9172V7.40146H29.2154V20.9172H27.2846ZM28.8871 14.8158V13.2325H36.2822V14.8158H28.8871Z" fill={AppColors.textPrimary} />
                <Path d="M42.0633 21.1489C41.291 21.1489 40.6474 21.0201 40.1325 20.7627C39.6305 20.4924 39.2507 20.132 38.9933 19.6814C38.7487 19.2309 38.6265 18.7418 38.6265 18.214C38.6265 17.5833 38.7874 17.0427 39.1092 16.5921C39.4438 16.1416 39.9201 15.7941 40.538 15.5495C41.1687 15.3049 41.9217 15.1826 42.797 15.1826H45.3264C45.3264 14.6034 45.2363 14.1271 45.0561 13.7538C44.8887 13.3806 44.6377 13.1038 44.3031 12.9236C43.9684 12.7305 43.5629 12.634 43.0866 12.634C42.4945 12.634 41.9796 12.782 41.542 13.0781C41.1172 13.3612 40.8598 13.8053 40.7697 14.4103H38.8388C38.9161 13.7024 39.1478 13.1102 39.5339 12.634C39.9201 12.1448 40.4221 11.7715 41.04 11.5141C41.6578 11.2438 42.3401 11.1086 43.0866 11.1086C44.0006 11.1086 44.7664 11.2695 45.3843 11.5913C46.0022 11.9131 46.4656 12.3701 46.7745 12.9622C47.0963 13.5415 47.2572 14.2301 47.2572 15.0282V20.9172H45.6353L45.4422 19.3146H45.3843C45.217 19.6107 45.0175 19.8745 44.7858 20.1062C44.5669 20.3251 44.3159 20.5117 44.0327 20.6662C43.7495 20.8206 43.4406 20.9365 43.1059 21.0137C42.7841 21.1038 42.4366 21.1489 42.0633 21.1489ZM42.5074 19.5849C42.945 19.5849 43.3312 19.5012 43.6659 19.3339C44.0134 19.1666 44.3031 18.9413 44.5347 18.6581C44.7793 18.3621 44.9595 18.0338 45.0754 17.6734C45.2041 17.313 45.2749 16.9397 45.2878 16.5535H42.9901C42.4237 16.5535 41.9668 16.6179 41.6192 16.7466C41.2845 16.8753 41.04 17.0555 40.8855 17.2872C40.731 17.5189 40.6538 17.7892 40.6538 18.0982C40.6538 18.3942 40.7246 18.6581 40.8662 18.8898C41.0207 19.1086 41.2331 19.2824 41.5034 19.4111C41.7866 19.527 42.1212 19.5849 42.5074 19.5849Z" fill={AppColors.textPrimary} />
                <Path d="M48.1924 20.9172V7.40146H50.6253L56.9583 18.3685H57.0163V7.40146H58.9471V20.9172H56.5143L50.1812 9.95014H50.1233V20.9172H48.1924Z" fill={AppColors.textPrimary} />
                <Path d="M64.4722 21.1489C63.5326 21.1489 62.7023 20.9429 61.9815 20.531C61.2606 20.1062 60.6943 19.5205 60.2824 18.774C59.8705 18.0274 59.6645 17.1521 59.6645 16.1481C59.6645 15.144 59.864 14.2687 60.2631 13.5221C60.675 12.7627 61.2413 12.1706 61.9622 11.7458C62.6959 11.321 63.539 11.1086 64.4915 11.1086C65.4312 11.1086 66.2421 11.321 66.9244 11.7458C67.6195 12.1577 68.1536 12.7048 68.5269 13.387C68.9131 14.0692 69.1062 14.8287 69.1062 15.6654C69.1062 15.7941 69.0998 15.9357 69.0869 16.0901C69.0869 16.2446 69.0804 16.4055 69.0676 16.5728H61.074V15.2213H67.1754C67.1367 14.4103 66.86 13.7796 66.3451 13.3291C65.8431 12.8657 65.2188 12.634 64.4722 12.634C63.9445 12.634 63.4553 12.7498 63.0048 12.9815C62.5672 13.2132 62.2132 13.5608 61.9429 14.0242C61.6854 14.4747 61.5567 15.0539 61.5567 15.7619V16.3025C61.5567 17.0105 61.6854 17.609 61.9429 18.0982C62.2132 18.5744 62.5736 18.9349 63.0241 19.1794C63.4746 19.424 63.9509 19.5463 64.4529 19.5463C65.0579 19.5463 65.5664 19.4111 65.9783 19.1408C66.3902 18.8576 66.6927 18.4779 66.8857 18.0016H68.8166C68.6492 18.6066 68.366 19.1473 67.967 19.6235C67.568 20.0869 67.0724 20.4602 66.4803 20.7434C65.901 21.0137 65.2317 21.1489 64.4722 21.1489Z" fill={AppColors.textPrimary} />
                <Path d="M73.3395 20.9172C72.7216 20.9172 72.1874 20.8206 71.7369 20.6275C71.2864 20.4345 70.9389 20.1127 70.6943 19.6621C70.4497 19.2116 70.3274 18.6002 70.3274 17.8279V12.8271H68.6862V11.3403H70.3274L70.5591 8.94611H72.2582V11.3403H75V12.8271H72.2582V17.8472C72.2582 18.4393 72.3741 18.8383 72.6058 19.0443C72.8375 19.2502 73.2365 19.3532 73.8029 19.3532H74.8841V20.9172H73.3395Z" fill={AppColors.textPrimary} />
                </Svg>
              )}
            </View>

            {/* Profile tab. */}
            {state.routes.length > 1 && (
              <MotionTab active={state.index === 1} icon="user" label="Perfil" onPress={() => navigateTab(1)} />
            )}
          </Animated.View>
        </TabBarSurface>
      </View>


    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props: any) => <CustomTabBar {...props} />}
      screenOptions={{
        lazy: true,
        headerShown: false,
      }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Home' }}
      />
      <Tabs.Screen
        name="explore"
        options={{ title: 'Profile' }}
      />
      <Tabs.Screen
        name="calendar"
        options={{ title: 'Calendar', href: null }}
      />
      <Tabs.Screen
        name="events"
        options={{ title: 'Eventos', href: null }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBarWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
    zIndex: 999,
    elevation: 20,
    pointerEvents: 'box-none',
  },
  tabBarContainer: {
    position: 'absolute',
    bottom: 0, // Pegado a la base del Wrapper para animar bien
    width: '90%',
    maxWidth: 330,
    height: 64,
    borderRadius: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    overflow: 'hidden',
    // The BlurView/GlassView owns the translucent material. A fill here would
    // flatten the fallback into an opaque dark surface.
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    boxShadow: '0px 10px 20px rgba(0, 0, 0, 0.3)',
    elevation: 8,
  },
  tabControls: {
    width: '100%',
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalExpandedContainer: {
    position: 'absolute',
    bottom: -10,
    width: '94%',
    height: 540,
    borderRadius: 40,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 100,
    backgroundColor: AppColors.surfaceSoft,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    boxShadow: '0px 10px 20px rgba(0, 0, 0, 0.3)',
    elevation: 8,
  },
  tabItem: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    width: 70, // Fixed width based on user balanced tests
    height: 45, // Match container accurately inside padding
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 360,
    overflow: 'hidden', // Forces the ripple to remain inside the rounded pill
  },
  tabItemFocused: {
    backgroundColor: AppColors.surfaceSoft, // Light pill when active
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
  eventsBackButton: {
    backgroundColor: AppColors.controlActive,
  },
  eventsSearchButton: {
    width: 118,
    backgroundColor: AppColors.controlActive,
  },
  eventsSearchContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  eventsSearchText: {
    color: AppColors.controlOnActive,
    opacity: 0.7,
    fontSize: 13,
    fontFamily: 'DMSans_700Bold',
  },
  centerLogoContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 10,
  },
  baseTabBarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    width: '100%',
    height: 64,
  },
  modalContent: {
    flex: 1,
  },
  modalHeader: {
    marginBottom: 20,
  },
  modalLogoText: {
    color: AppColors.textOnLight,
    fontSize: 18,
    fontFamily: 'DMSans_700Bold',
    marginLeft: 8,
  },
  modalScroll: {
    flex: 1,
  },
  modalTitleInput: {
    fontSize: 32,
    fontFamily: 'DMSans_700Bold',
    letterSpacing: -2,
    color: AppColors.textOnLight,
    paddingVertical: 10,
    outlineStyle: 'none' as any,
  },
  separator: {
    height: 2,
    backgroundColor: AppColors.textOnLight,
    marginBottom: 20,
  },
  modalSection: {
    marginBottom: 16,
  },
  modalLabel: {
    color: AppColors.textOnLight,
    fontFamily: 'DMSans_700Bold',
    fontSize: 14,
    marginBottom: 8,
  },
  datePickerBtn: {
    backgroundColor: AppColors.surface,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  datePickerText: {
    fontFamily: 'DMSans_700Bold',
    color: AppColors.textSecondary,
    fontSize: 14,
  },
  chipScroll: {
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 60,
    backgroundColor: AppColors.primary,
  },
  chipSelected: {
    backgroundColor: AppColors.surface,
  },
  chipText: {
    fontFamily: 'DMSans_500Medium',
    color: AppColors.textSecondary,
  },
  chipTextSelected: {
    fontFamily: 'DMSans_700Bold',
    color: AppColors.textSecondary,
  },
  modalDescInput: {
    fontSize: 14,
    fontFamily: 'DMSans_400Regular',
    color: AppColors.surface,
    textAlignVertical: 'top',
    outlineStyle: 'none' as any,
  },
  modalFooterBlur: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
    overflow: 'hidden',
    paddingTop: 20,
    paddingBottom: 24,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(82, 82, 77, 0.4)', // Slightly transparent to show blur
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalCancelBtn: {
    flex: 1,
    height: 50,
    borderRadius: 24,
    backgroundColor: AppColors.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  modalSubmitBtn: {
    flex: 1,
    height: 50,
    borderRadius: 24,
    backgroundColor: AppColors.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  modalCancelText: {
    color: AppColors.textOnLight,
    fontFamily: 'DMSans_500Medium',
    fontSize: 16,
  },
  modalSubmitText: {
    color: AppColors.textOnLight,
    fontFamily: 'DMSans_700Bold',
    fontSize: 16,
  },
});
