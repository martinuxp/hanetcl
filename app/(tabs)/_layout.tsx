import { withLayoutContext } from 'expo-router';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import React from 'react';
import { StyleSheet, View, ScrollView, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { TouchableRipple } from 'react-native-paper';
import Svg, { Path } from 'react-native-svg';

import { CustomIcon } from '@/components/ui/custom-icon';
import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { NotificationOverlay } from '@/components/ui/notification-overlay';
import { useRouter } from 'expo-router';
import Animated, { useAnimatedStyle, withSpring, withTiming, useSharedValue, interpolate, Easing } from 'react-native-reanimated';

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

function CustomTabBar({ state, descriptors, navigation }: any) {
  const router = useRouter();
  const currentRouteName = state.routes[state.index].name;
  const isCalendar = currentRouteName === 'calendar';

  // Temporary variable to show "isAdmin" effect on TabBar. Usually from Global Context.
  const isAdmin = true;

  // Modal Animation Logic
  const [isCreating, setIsCreating] = React.useState(false);
  const progress = useSharedValue(0);

  const openModal = () => {
    setIsCreating(true);
    progress.value = withTiming(1, { duration: 400, easing: Easing.bezier(0.25, 0.1, 0.25, 1) });
  };

  const closeModal = () => {
    progress.value = withTiming(0, { duration: 300, easing: Easing.bezier(0.25, 0.1, 0.25, 1) });
    setTimeout(() => setIsCreating(false), 300);
  };

  const animatedTabStyle = useAnimatedStyle(() => {
    const height = interpolate(progress.value, [0, 1], [64, 540]); // Expand height
    const width = interpolate(progress.value, [0, 1], [330, 370]); // Slightly wider
    const bottom = interpolate(progress.value, [0, 1], [0, -20]); // Lower final position
    const borderRadius = interpolate(progress.value, [0, 1], [5, 40]);

    return {
      height,
      width,
      borderRadius,
      bottom,
      backgroundColor: `#CECDC1`
    };
  });

  const contentOpacity = useAnimatedStyle(() => {
    return {
      opacity: interpolate(progress.value, [0.3, 1], [0, 1]),
      pointerEvents: progress.value > 0.5 ? 'auto' : 'none',
      transform: [{ translateY: interpolate(progress.value, [0, 1], [60, 0]) }],
    };
  });

  const baseOpacity = useAnimatedStyle(() => {
    return {
      opacity: interpolate(progress.value, [0, 0.3], [1, 0]),
      transform: [{ translateY: interpolate(progress.value, [0, 0.5], [0, 20]) }],
      pointerEvents: progress.value < 0.5 ? 'auto' : 'none',
    };
  });

  const backdropStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(progress.value, [0, 0.6], [0, 1]),
    };
  });

  const notificationsOpacity = useAnimatedStyle(() => {
    return {
      opacity: interpolate(progress.value, [0, 0.2], [1, 0]),
      pointerEvents: progress.value < 0.1 ? 'auto' : 'none',
    };
  });

  return (
    <View style={styles.tabBarWrapper} pointerEvents={isCreating ? "auto" : "box-none"}>
      {/* Background Backdrop for Modal */}
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}
        pointerEvents={isCreating ? 'auto' : 'none'}
      >
        <BlurView 
          intensity={30} 
          tint="dark" 
          blurMethod="dimezisBlurViewSdk31Plus"
          style={StyleSheet.absoluteFill} 
        />
      </Animated.View>

      {/* Notifications live behind the glass bar */}
      <Animated.View style={[{ width: '100%', alignItems: 'center' }, notificationsOpacity]}>
        <NotificationOverlay />
      </Animated.View>

      {/* Base TabBar Content */}
      <Animated.View style={[baseOpacity, { position: 'absolute', bottom: 0, width: '100%', alignItems: 'center' }]} pointerEvents={isCreating ? 'none' : 'auto'}>
        <BlurView
          intensity={Platform.OS === 'android' ? 90 : 70}
          tint="dark"
          blurMethod="dimezisBlurViewSdk31Plus"
          style={styles.tabBarContainer}
        >
          {/* Left Side Tab / Back Button */}
          {isCalendar ? (
            <TouchableRipple
              style={[styles.tabItem, styles.tabItemFocused]}
              onPress={() => router.push('/')}
              rippleColor="rgba(255, 255, 255, 0.3)"
              borderless={false}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <CustomIcon name="chevron-left" size={20} color="#292927" />
              </View>
            </TouchableRipple>
          ) : (
            <TouchableRipple
              key={state.routes[0].key}
              accessibilityRole="button"
              accessibilityState={state.index === 0 ? { selected: true } : {}}
              accessibilityLabel={descriptors[state.routes[0].key].options.tabBarAccessibilityLabel}
              testID={descriptors[state.routes[0].key].options.tabBarTestID}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: state.routes[0].key, canPreventDefault: true });
                if (state.index !== 0 && !event.defaultPrevented) navigation.navigate(state.routes[0].name);
              }}
              rippleColor="rgba(255, 255, 255, 0.3)"
              underlayColor="rgba(255, 255, 255, 0.1)"
              borderless={false}
              style={[styles.tabItem, state.index === 0 && styles.tabItemFocused]}
            >
              <CustomIcon name="home" size={24} color={state.index === 0 ? '#292927' : '#E2E1DA'} />
            </TouchableRipple>
          )}

          {/* Center Logo or Create Button */}
          <View style={styles.centerLogoContainer}>
            {isCalendar && isAdmin ? (
              <TouchableRipple
                style={[styles.tabItem, styles.tabItemFocused, { width: 100, flexDirection: 'row', gap: 6 }]}
                onPress={openModal}
                rippleColor="rgba(255, 255, 255, 0.3)"
                borderless={false}
              >
                <>
                  <CustomIcon name="calendar" size={18} color="#292927" />
                  <ThemedText style={{ color: '#292927', fontFamily: 'DMSans_700Bold', fontSize: 14 }}>Crear</ThemedText>
                </>
              </TouchableRipple>
            ) : (
              <Svg width="75" height="29" viewBox="0 0 75 29" fill="none">
                <Path d="M0 0L6.87688 6.43605V13.1403L10.3153 13.5425V8.98366L19.3082 9.78816V19.1741L10.3153 19.9786V15.4197L6.87688 15.822V22.5262L0 28.9622V0Z" fill="#D9D9D9" />
                <Path d="M0 0L6.87688 6.43605V13.1403L10.3153 13.5425V8.98366L19.3082 9.78816V19.1741L10.3153 19.9786V15.4197L6.87688 15.822V22.5262L0 28.9622V0Z" fill="#FF6A5F" />
                <Path d="M35.8767 20.9172V7.40146H37.8075V20.9172H35.8767ZM27.2846 20.9172V7.40146H29.2154V20.9172H27.2846ZM28.8871 14.8158V13.2325H36.2822V14.8158H28.8871Z" fill="#FAFAF9" />
                <Path d="M42.0633 21.1489C41.291 21.1489 40.6474 21.0201 40.1325 20.7627C39.6305 20.4924 39.2507 20.132 38.9933 19.6814C38.7487 19.2309 38.6265 18.7418 38.6265 18.214C38.6265 17.5833 38.7874 17.0427 39.1092 16.5921C39.4438 16.1416 39.9201 15.7941 40.538 15.5495C41.1687 15.3049 41.9217 15.1826 42.797 15.1826H45.3264C45.3264 14.6034 45.2363 14.1271 45.0561 13.7538C44.8887 13.3806 44.6377 13.1038 44.3031 12.9236C43.9684 12.7305 43.5629 12.634 43.0866 12.634C42.4945 12.634 41.9796 12.782 41.542 13.0781C41.1172 13.3612 40.8598 13.8053 40.7697 14.4103H38.8388C38.9161 13.7024 39.1478 13.1102 39.5339 12.634C39.9201 12.1448 40.4221 11.7715 41.04 11.5141C41.6578 11.2438 42.3401 11.1086 43.0866 11.1086C44.0006 11.1086 44.7664 11.2695 45.3843 11.5913C46.0022 11.9131 46.4656 12.3701 46.7745 12.9622C47.0963 13.5415 47.2572 14.2301 47.2572 15.0282V20.9172H45.6353L45.4422 19.3146H45.3843C45.217 19.6107 45.0175 19.8745 44.7858 20.1062C44.5669 20.3251 44.3159 20.5117 44.0327 20.6662C43.7495 20.8206 43.4406 20.9365 43.1059 21.0137C42.7841 21.1038 42.4366 21.1489 42.0633 21.1489ZM42.5074 19.5849C42.945 19.5849 43.3312 19.5012 43.6659 19.3339C44.0134 19.1666 44.3031 18.9413 44.5347 18.6581C44.7793 18.3621 44.9595 18.0338 45.0754 17.6734C45.2041 17.313 45.2749 16.9397 45.2878 16.5535H42.9901C42.4237 16.5535 41.9668 16.6179 41.6192 16.7466C41.2845 16.8753 41.04 17.0555 40.8855 17.2872C40.731 17.5189 40.6538 17.7892 40.6538 18.0982C40.6538 18.3942 40.7246 18.6581 40.8662 18.8898C41.0207 19.1086 41.2331 19.2824 41.5034 19.4111C41.7866 19.527 42.1212 19.5849 42.5074 19.5849Z" fill="#FAFAF9" />
                <Path d="M48.1924 20.9172V7.40146H50.6253L56.9583 18.3685H57.0163V7.40146H58.9471V20.9172H56.5143L50.1812 9.95014H50.1233V20.9172H48.1924Z" fill="#FAFAF9" />
                <Path d="M64.4722 21.1489C63.5326 21.1489 62.7023 20.9429 61.9815 20.531C61.2606 20.1062 60.6943 19.5205 60.2824 18.774C59.8705 18.0274 59.6645 17.1521 59.6645 16.1481C59.6645 15.144 59.864 14.2687 60.2631 13.5221C60.675 12.7627 61.2413 12.1706 61.9622 11.7458C62.6959 11.321 63.539 11.1086 64.4915 11.1086C65.4312 11.1086 66.2421 11.321 66.9244 11.7458C67.6195 12.1577 68.1536 12.7048 68.5269 13.387C68.9131 14.0692 69.1062 14.8287 69.1062 15.6654C69.1062 15.7941 69.0998 15.9357 69.0869 16.0901C69.0869 16.2446 69.0804 16.4055 69.0676 16.5728H61.074V15.2213H67.1754C67.1367 14.4103 66.86 13.7796 66.3451 13.3291C65.8431 12.8657 65.2188 12.634 64.4722 12.634C63.9445 12.634 63.4553 12.7498 63.0048 12.9815C62.5672 13.2132 62.2132 13.5608 61.9429 14.0242C61.6854 14.4747 61.5567 15.0539 61.5567 15.7619V16.3025C61.5567 17.0105 61.6854 17.609 61.9429 18.0982C62.2132 18.5744 62.5736 18.9349 63.0241 19.1794C63.4746 19.424 63.9509 19.5463 64.4529 19.5463C65.0579 19.5463 65.5664 19.4111 65.9783 19.1408C66.3902 18.8576 66.6927 18.4779 66.8857 18.0016H68.8166C68.6492 18.6066 68.366 19.1473 67.967 19.6235C67.568 20.0869 67.0724 20.4602 66.4803 20.7434C65.901 21.0137 65.2317 21.1489 64.4722 21.1489Z" fill="#FAFAF9" />
                <Path d="M73.3395 20.9172C72.7216 20.9172 72.1874 20.8206 71.7369 20.6275C71.2864 20.4345 70.9389 20.1127 70.6943 19.6621C70.4497 19.2116 70.3274 18.6002 70.3274 17.8279V12.8271H68.6862V11.3403H70.3274L70.5591 8.94611H72.2582V11.3403H75V12.8271H72.2582V17.8472C72.2582 18.4393 72.3741 18.8383 72.6058 19.0443C72.8375 19.2502 73.2365 19.3532 73.8029 19.3532H74.8841V20.9172H73.3395Z" fill="#FAFAF9" />
              </Svg>
            )}
          </View>

          {/* Profile Tab */}
          {state.routes.length > 1 && (
            <TouchableRipple
              key={state.routes[1].key}
              accessibilityRole="button"
              accessibilityState={state.index === 1 ? { selected: true } : {}}
              accessibilityLabel={descriptors[state.routes[1].key].options.tabBarAccessibilityLabel}
              testID={descriptors[state.routes[1].key].options.tabBarTestID}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: state.routes[1].key, canPreventDefault: true });
                if (state.index !== 1 && !event.defaultPrevented) navigation.navigate(state.routes[1].name);
              }}
              rippleColor="rgba(255, 255, 255, 0.3)"
              underlayColor="rgba(255, 255, 255, 0.1)"
              borderless={false}
              style={[styles.tabItem, state.index === 1 && styles.tabItemFocused]}
            >
              <CustomIcon name="user" size={24} color={state.index === 1 ? '#292927' : '#E2E1DA'} />
            </TouchableRipple>
          )}
        </BlurView>
      </Animated.View>

      {/* Expanded Modal Content outside Base TabBar */}
      <Animated.View
        pointerEvents={isCreating ? 'auto' : 'none'}
        style={[styles.modalExpandedContainer, contentOpacity, animatedTabStyle, { alignSelf: 'center' }]}
      >
        <View style={styles.modalHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Svg width="118" height="28" viewBox="0 0 148 36" fill="none">
              <Path d="M0 0L8.53743 8V16.3333L12.8061 16.8333V11.1667L23.9705 12.1667V23.8333L12.8061 24.8333V19.1667L8.53743 19.6667V28L0 36V0Z" fill="#FF6A5F" />
              <Path d="M44.5398 26V9.2H46.9369V26H44.5398ZM33.8729 26V9.2H36.27V26H33.8729ZM35.8625 18.416V16.448H45.0432V18.416H35.8625Z" fill="#3E3E3A" />
              <Path d="M52.2203 26.288C51.2615 26.288 50.4624 26.128 49.8232 25.808C49.2 25.472 48.7286 25.024 48.409 24.464C48.1054 23.904 47.9535 23.296 47.9535 22.64C47.9535 21.856 48.1533 21.184 48.5528 20.624C48.9683 20.064 49.5596 19.632 50.3266 19.328C51.1097 19.024 52.0445 18.872 53.1312 18.872H56.2713C56.2713 18.152 56.1594 17.56 55.9357 17.096C55.728 16.632 55.4163 16.288 55.0009 16.064C54.5854 15.824 54.082 15.704 53.4907 15.704C52.7556 15.704 52.1164 15.888 51.5731 16.256C51.0457 16.608 50.7261 17.16 50.6143 17.912H48.2172C48.3131 17.032 48.6007 16.296 49.0802 15.704C49.5596 15.096 50.1828 14.632 50.9498 14.312C51.7169 13.976 52.5639 13.808 53.4907 13.808C54.6253 13.808 55.5762 14.008 56.3432 14.408C57.1103 14.808 57.6856 15.376 58.0691 16.112C58.4686 16.832 58.6683 17.688 58.6683 18.68V26H56.6548L56.4151 24.008H56.3432C56.1355 24.376 55.8878 24.704 55.6001 24.992C55.3285 25.264 55.0168 25.496 54.6653 25.688C54.3137 25.88 53.9302 26.024 53.5147 26.12C53.1152 26.232 52.6837 26.288 52.2203 26.288ZM52.7716 24.344C53.3149 24.344 53.7943 24.24 54.2098 24.032C54.6413 23.824 55.0009 23.544 55.2885 23.192C55.5921 22.824 55.8159 22.416 55.9597 21.968C56.1195 21.52 56.2074 21.056 56.2234 20.576H53.3709C52.6677 20.576 52.1004 20.656 51.669 20.816C51.2535 20.976 50.9498 21.2 50.7581 21.488C50.5663 21.776 50.4704 22.112 50.4704 22.496C50.4704 22.864 50.5583 23.192 50.7341 23.48C50.9259 23.752 51.1896 23.968 51.5251 24.128C51.8767 24.272 52.2922 24.344 52.7716 24.344Z" fill="#3E3E3A" />
              <Path d="M59.8294 26V9.2H62.8497L70.712 22.832H70.7839V9.2H73.181V26H70.1607L62.2984 12.368H62.2265V26H59.8294Z" fill="#3E3E3A" />
              <Path d="M80.0403 26.288C78.8737 26.288 77.843 26.032 76.9481 25.52C76.0532 24.992 75.35 24.264 74.8387 23.336C74.3273 22.408 74.0716 21.32 74.0716 20.072C74.0716 18.824 74.3193 17.736 74.8147 16.808C75.3261 15.864 76.0292 15.128 76.9241 14.6C77.835 14.072 78.8817 13.808 80.0642 13.808C81.2308 13.808 82.2376 14.072 83.0845 14.6C83.9474 15.112 84.6106 15.792 85.0741 16.64C85.5535 17.488 85.7932 18.432 85.7932 19.472C85.7932 19.632 85.7852 19.808 85.7692 20C85.7692 20.192 85.7612 20.392 85.7452 20.6H75.8215V18.92H83.3961C83.3482 17.912 83.0046 17.128 82.3654 16.568C81.7422 15.992 80.9671 15.704 80.0403 15.704C79.3851 15.704 78.7778 15.848 78.2185 16.136C77.6752 16.424 77.2357 16.856 76.9001 17.432C76.5805 17.992 76.4207 18.712 76.4207 19.592V20.264C76.4207 21.144 76.5805 21.888 76.9001 22.496C77.2357 23.088 77.6832 23.536 78.2425 23.84C78.8018 24.144 79.3931 24.296 80.0163 24.296C80.7674 24.296 81.3986 24.128 81.91 23.792C82.4213 23.44 82.7969 22.968 83.0366 22.376H85.4336C85.2259 23.128 84.8743 23.8 84.3789 24.392C83.8835 24.968 83.2683 25.432 82.5332 25.784C81.8141 26.12 80.9831 26.288 80.0403 26.288Z" fill="#3E3E3A" />
              <Path d="M91.0487 26C90.2816 26 89.6185 25.88 89.0592 25.64C88.4998 25.4 88.0684 25 87.7648 24.44C87.4611 23.88 87.3093 23.12 87.3093 22.16V15.944H85.2718V14.096H87.3093L87.597 11.12H89.7064V14.096H93.1102V15.944H89.7064V22.184C89.7064 22.92 89.8502 23.416 90.1378 23.672C90.4255 23.928 90.9209 24.056 91.624 24.056H92.9663V26H91.0487Z" fill="#3E3E3A" />
              <Path d="M102.466 26.2819C101.463 26.2819 100.594 26.0582 99.8588 25.6107C99.1238 25.1533 98.5577 24.5219 98.1605 23.7164C97.7632 22.901 97.5646 21.9563 97.5646 20.8824C97.5646 19.8084 97.7632 18.8687 98.1605 18.0632C98.5577 17.2478 99.1238 16.6164 99.8588 16.1689C100.604 15.7115 101.473 15.4828 102.466 15.4828C103.638 15.4828 104.586 15.7612 105.311 16.3181C106.046 16.865 106.518 17.6406 106.727 18.645H105.579C105.421 17.9688 105.083 17.4268 104.566 17.0191C104.05 16.6015 103.35 16.3927 102.466 16.3927C101.701 16.3927 101.031 16.5716 100.455 16.9296C99.8787 17.2876 99.4317 17.8047 99.1139 18.4809C98.7961 19.1471 98.6372 19.9476 98.6372 20.8824C98.6372 21.8171 98.7961 22.6226 99.1139 23.2988C99.4317 23.965 99.8787 24.4771 100.455 24.8351C101.031 25.1931 101.701 25.3721 102.466 25.3721C103.35 25.3721 104.045 25.1682 104.552 24.7605C105.068 24.3528 105.411 23.8158 105.579 23.1496H106.727C106.508 24.1341 106.036 24.9047 105.311 25.4616C104.596 26.0085 103.648 26.2819 102.466 26.2819Z" fill="#3E3E3A" />
              <Path d="M109.57 26.2819C108.965 26.2819 108.458 26.1726 108.051 25.9538C107.654 25.735 107.356 25.4516 107.157 25.1036C106.968 24.7555 106.874 24.3727 106.874 23.9551C106.874 23.438 107.003 23.0004 107.261 22.6425C107.529 22.2845 107.902 22.016 108.379 21.837C108.855 21.658 109.412 21.5685 110.047 21.5685H112.073C112.073 21.0812 111.999 20.6686 111.85 20.3305C111.701 19.9924 111.482 19.7388 111.194 19.5698C110.906 19.3908 110.544 19.3013 110.107 19.3013C109.6 19.3013 109.163 19.4305 108.796 19.6891C108.428 19.9476 108.2 20.3255 108.11 20.8227H107.023C107.083 20.2957 107.261 19.8532 107.559 19.4952C107.867 19.1372 108.245 18.8687 108.691 18.6897C109.138 18.5008 109.61 18.4063 110.107 18.4063C110.802 18.4063 111.368 18.5406 111.805 18.809C112.242 19.0676 112.57 19.4256 112.788 19.883C113.007 20.3404 113.116 20.8675 113.116 21.4641V26.103H112.163L112.103 24.7307C112.014 24.9395 111.889 25.1384 111.731 25.3273C111.582 25.5163 111.403 25.6803 111.194 25.8196C110.996 25.9588 110.762 26.0682 110.494 26.1477C110.226 26.2372 109.918 26.2819 109.57 26.2819ZM109.69 25.3721C110.057 25.3721 110.385 25.2975 110.673 25.1483C110.971 24.9892 111.224 24.7854 111.433 24.5368C111.641 24.2882 111.8 24.0098 111.909 23.7015C112.019 23.3833 112.073 23.0551 112.073 22.717V22.4485H110.122C109.595 22.4485 109.173 22.5132 108.855 22.6425C108.538 22.7717 108.309 22.9457 108.17 23.1645C108.031 23.3833 107.961 23.6368 107.961 23.9252C107.961 24.2136 108.026 24.4672 108.155 24.6859C108.284 24.8948 108.478 25.0638 108.736 25.1931C109.004 25.3124 109.322 25.3721 109.69 25.3721Z" fill="#3E3E3A" />
              <Path d="M113.745 26.103V15.3635H114.788V26.103H113.745Z" fill="#3E3E3A" />
              <Path d="M118.78 26.2819C118.084 26.2819 117.469 26.1179 116.932 25.7897C116.406 25.4616 115.989 25.0041 115.681 24.4175C115.383 23.8208 115.234 23.1247 115.234 22.3292C115.234 21.5337 115.383 20.8426 115.681 20.2559C115.979 19.6692 116.396 19.2167 116.932 18.8985C117.479 18.5704 118.104 18.4063 118.809 18.4063C119.534 18.4063 120.145 18.5704 120.642 18.8985C121.148 19.2267 121.531 19.6543 121.789 20.1813C122.057 20.7083 122.191 21.2851 122.191 21.9116C122.191 22.011 122.191 22.1154 122.191 22.2248C122.191 22.3242 122.186 22.4436 122.176 22.5828H116.024V21.7027H121.178C121.158 20.9371 120.92 20.3454 120.463 19.9277C120.016 19.5101 119.45 19.3013 118.765 19.3013C118.318 19.3013 117.901 19.4057 117.513 19.6145C117.136 19.8134 116.828 20.1117 116.59 20.5095C116.361 20.8973 116.247 21.3895 116.247 21.9861V22.374C116.247 23.0502 116.366 23.612 116.605 24.0595C116.843 24.5069 117.156 24.8401 117.543 25.0588C117.94 25.2776 118.353 25.387 118.78 25.387C119.346 25.387 119.812 25.2627 120.18 25.0141C120.547 24.7555 120.811 24.4025 120.97 23.9551H121.997C121.868 24.3926 121.66 24.7904 121.372 25.1483C121.094 25.5063 120.736 25.7847 120.299 25.9836C119.862 26.1825 119.356 26.2819 118.78 26.2819Z" fill="#3E3E3A" />
              <Path d="M122.557 26.103V18.5853H123.511L123.57 19.9277C123.809 19.4504 124.151 19.0775 124.598 18.809C125.055 18.5406 125.562 18.4063 126.118 18.4063C126.694 18.4063 127.195 18.5207 127.622 18.7494C128.049 18.9781 128.382 19.3261 128.621 19.7935C128.859 20.2509 128.978 20.8376 128.978 21.5536V26.103H127.935V21.6729C127.935 20.8774 127.761 20.2857 127.414 19.8979C127.066 19.5101 126.57 19.3162 125.924 19.3162C125.487 19.3162 125.09 19.4256 124.732 19.6443C124.385 19.8532 124.107 20.1614 123.898 20.5691C123.699 20.9768 123.6 21.479 123.6 22.0756V26.103H122.557Z" fill="#3E3E3A" />
              <Path d="M132.888 26.2819C132.163 26.2819 131.528 26.1129 130.981 25.7748C130.445 25.4268 130.028 24.9544 129.73 24.3578C129.432 23.7612 129.283 23.085 129.283 22.3292C129.283 21.5735 129.432 20.9023 129.73 20.3156C130.028 19.7189 130.45 19.2516 130.996 18.9135C131.543 18.5754 132.178 18.4063 132.903 18.4063C133.539 18.4063 134.095 18.5455 134.572 18.824C135.058 19.0924 135.431 19.4753 135.689 19.9725V15.3635H136.732V26.103H135.778L135.689 24.7456C135.53 25.0041 135.322 25.2527 135.063 25.4914C134.815 25.7301 134.507 25.924 134.14 26.0731C133.782 26.2123 133.365 26.2819 132.888 26.2819ZM132.978 25.3721C133.504 25.3721 133.961 25.2478 134.348 24.9992C134.746 24.7506 135.053 24.3976 135.272 23.9401C135.5 23.4827 135.615 22.9507 135.615 22.3441C135.615 21.7375 135.5 21.2055 135.272 20.7481C135.053 20.2907 134.746 19.9377 134.348 19.6891C133.961 19.4405 133.504 19.3162 132.978 19.3162C132.461 19.3162 132.004 19.4405 131.607 19.6891C131.21 19.9377 130.897 20.2907 130.669 20.7481C130.45 21.1956 130.341 21.7276 130.341 22.3441C130.341 22.9607 130.455 23.4976 130.684 23.9551C130.912 24.4025 131.225 24.7506 131.622 24.9992C132.019 25.2478 132.471 25.3721 132.978 25.3721Z" fill="#3E3E3A" />
              <Path d="M139.907 26.2819C139.301 26.2819 138.795 26.1726 138.387 25.9538C137.99 25.735 137.692 25.4516 137.493 25.1036C137.305 24.7555 137.21 24.3727 137.21 23.9551C137.21 23.438 137.34 23.0004 137.598 22.6425C137.866 22.2845 138.238 22.016 138.715 21.837C139.192 21.658 139.748 21.5685 140.384 21.5685H142.41C142.41 21.0812 142.335 20.6686 142.186 20.3305C142.037 19.9924 141.819 19.7388 141.531 19.5698C141.243 19.3908 140.88 19.3013 140.443 19.3013C139.937 19.3013 139.5 19.4305 139.132 19.6891C138.765 19.9476 138.536 20.3255 138.447 20.8227H137.359C137.419 20.2957 137.598 19.8532 137.896 19.4952C138.204 19.1372 138.245 18.8687 139.028 18.6897C139.475 18.5008 139.947 18.4063 140.443 18.4063C141.138 18.4063 141.705 18.5406 142.142 18.809C142.579 19.0676 142.906 19.4256 143.125 19.883C143.343 20.3404 143.453 20.8675 143.453 21.4641V26.103H142.499L142.439 24.7307C142.35 24.9395 142.226 25.1384 142.067 25.3273C141.918 25.5163 141.739 25.6803 141.531 25.8196C141.332 25.9588 141.099 26.0682 140.831 26.1477C140.562 26.2372 140.254 26.2819 139.907 26.2819ZM140.026 25.3721C140.394 25.3721 140.721 25.2975 141.009 25.1483C141.307 24.9892 141.561 24.7854 141.769 24.5368C141.978 24.2882 142.137 24.0098 142.246 23.7015C142.355 23.3833 142.41 23.0551 142.41 22.717V22.4485H140.458C139.932 22.4485 139.51 22.5132 139.192 22.6425C138.874 22.7717 138.646 22.9457 138.507 23.1645C138.367 23.3833 138.298 23.6368 138.298 23.9252C138.298 24.2136 138.362 24.4672 138.492 24.6859C138.621 24.8948 138.814 25.0638 139.073 25.1931C139.341 25.3124 139.659 25.3721 140.026 25.3721Z" fill="#3E3E3A" />
              <Path d="M144.082 26.103V18.5853H145.035L145.11 20.0322C145.269 19.6841 145.482 19.3908 145.75 19.1521C146.019 18.9135 146.341 18.7295 146.719 18.6002C147.096 18.4709 147.523 18.4063 148 18.4063V19.4952H147.598C147.28 19.4952 146.972 19.5399 146.674 19.6294C146.376 19.709 146.113 19.8482 145.885 20.0471C145.656 20.246 145.472 20.5144 145.333 20.8525C145.194 21.1906 145.125 21.6132 145.125 22.1204V26.103H144.082Z" fill="#3E3E3A" />
            </Svg>
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} style={styles.modalScroll}>
          <TextInput
            placeholder="Añade un titulo"
            placeholderTextColor="rgba(62, 62, 58, 1)"
            style={styles.modalTitleInput}
          />
          <View style={styles.separator} />

          <View style={styles.modalSection}>
            <ThemedText style={styles.modalLabel}>Fecha y hora</ThemedText>
            <TouchableRipple style={styles.datePickerBtn} onPress={() => { }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <ThemedText style={styles.datePickerText}>12/03/26, 13:45 - 16:30</ThemedText>
                <CustomIcon name="calendar" size={20} color="#E2E1DA" />
              </View>
            </TouchableRipple>
          </View>

          <View style={styles.modalSection}>
            <ThemedText style={styles.modalLabel}>Clase relacionada</ThemedText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
              <View style={[styles.chip, styles.chipSelected]}><ThemedText style={styles.chipTextSelected}>Lengua y Literatura</ThemedText></View>
              <View style={styles.chip}><ThemedText style={styles.chipText}>Matemáticas</ThemedText></View>
              <View style={styles.chip}><ThemedText style={styles.chipText}>Inglés</ThemedText></View>
            </ScrollView>
          </View>

          <View style={styles.modalSection}>
            <ThemedText style={styles.modalLabel}>Tipo de evento</ThemedText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
              <View style={[styles.chip, styles.chipSelected]}><ThemedText style={styles.chipTextSelected}>Evaluación sumativa</ThemedText></View>
              <View style={styles.chip}><ThemedText style={styles.chipText}>Evaluación formativa</ThemedText></View>
              <View style={styles.chip}><ThemedText style={styles.chipText}>Taller</ThemedText></View>
            </ScrollView>
          </View>

          <View style={styles.modalSection}>
            <ThemedText style={styles.modalLabel}>Añadir descripción</ThemedText>
            <TextInput
              placeholder="La información que publiques podrá ser verificada por tu profesor..."
              placeholderTextColor="rgba(226, 225, 218, 0.4)"
              style={styles.modalDescInput}
              multiline
              numberOfLines={4}
            />
          </View>
        </ScrollView>

        <BlurView 
          intensity={Platform.OS === 'android' ? 90 : 80} 
          tint="light" 
          blurMethod="dimezisBlurViewSdk31Plus"
          style={styles.modalFooterBlur}
        >
          <View style={styles.modalFooter}>
            <TouchableRipple style={styles.modalCancelBtn} onPress={closeModal}>
              <ThemedText style={styles.modalCancelText}>Cancelar</ThemedText>
            </TouchableRipple>
            <TouchableRipple style={styles.modalSubmitBtn} onPress={closeModal}>
              <ThemedText style={styles.modalSubmitText}>Agregar</ThemedText>
            </TouchableRipple>
          </View>
        </BlurView>
      </Animated.View>
    </View>
  );
}

const { Navigator } = createMaterialTopTabNavigator();
const SwipeTabs = withLayoutContext<any, typeof Navigator, any, any>(Navigator);

export default function TabLayout() {
  return (
    <SwipeTabs
      tabBar={(props: any) => <CustomTabBar {...props} />}
      tabBarPosition="bottom"
      screenOptions={{
        lazy: true,
      }}>
      <SwipeTabs.Screen
        name="index"
        options={{ title: 'Home' }}
      />
      <SwipeTabs.Screen
        name="explore"
        options={{ title: 'Profile' }}
      />
      <SwipeTabs.Screen
        name="calendar"
        options={{ title: 'Calendar' }}
      />
    </SwipeTabs>
  );
}

const styles = StyleSheet.create({
  tabBarWrapper: {
    position: 'absolute',
    bottom: 30,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
    zIndex: 999,
    elevation: 20,
  },
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    // Position it to cover screen by large offsets since wrapper is small
    top: -1000,
    left: -1000,
    right: -1000,
    bottom: -1000,
  },
  tabBarContainer: {
    position: 'absolute',
    bottom: 0, // Pegado a la base del Wrapper para animar bien
    width: 330,
    height: 64,
    borderRadius: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    overflow: 'hidden',
    // Subtly frosted glass look
    backgroundColor: 'rgba(52, 52, 45, 0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    boxShadow: '0px 10px 20px rgba(0, 0, 0, 0.3)',
    elevation: 8,
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
    backgroundColor: '#CECDC1',
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
    backgroundColor: '#CECDC1', // Light pill when active
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
    color: '#292927',
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
    color: '#292927',
    paddingVertical: 10,
    outlineStyle: 'none' as any,
  },
  separator: {
    height: 2,
    backgroundColor: '#292927',
    marginBottom: 20,
  },
  modalSection: {
    marginBottom: 16,
  },
  modalLabel: {
    color: '#292927',
    fontFamily: 'DMSans_700Bold',
    fontSize: 14,
    marginBottom: 8,
  },
  datePickerBtn: {
    backgroundColor: '#3E3E3A',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  datePickerText: {
    fontFamily: 'DMSans_700Bold',
    color: '#E2E1DA',
    fontSize: 14,
  },
  chipScroll: {
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 60,
    backgroundColor: '#42564F',
  },
  chipSelected: {
    backgroundColor: '#3E3E3A',
  },
  chipText: {
    fontFamily: 'DMSans_500Medium',
    color: '#E2E1DA',
  },
  chipTextSelected: {
    fontFamily: 'DMSans_700Bold',
    color: '#E2E1DA',
  },
  modalDescInput: {
    fontSize: 14,
    fontFamily: 'DMSans_400Regular',
    color: '#3E3E3A',
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
    backgroundColor: '#CECDC1',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  modalSubmitBtn: {
    flex: 1,
    height: 50,
    borderRadius: 24,
    backgroundColor: '#CECDC1',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  modalCancelText: {
    color: '#292927',
    fontFamily: 'DMSans_500Medium',
    fontSize: 16,
  },
  modalSubmitText: {
    color: '#292927',
    fontFamily: 'DMSans_700Bold',
    fontSize: 16,
  },
});
