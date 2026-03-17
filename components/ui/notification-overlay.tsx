import React, { useState } from 'react';
import { View, StyleSheet, TouchableWithoutFeedback } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
  interpolate,
  Extrapolation,
  interpolateColor,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { NotificationCard, NotificationInfo, NotificationType } from './notification-card';
import { ThemedText } from '@/components/themed-text';

// Expressive, cinematic "Ease In Out" Configuration
const TIMING_CONFIG = {
  duration: 550,
  easing: Easing.inOut(Easing.cubic),
};

// Mock data matching the screenshot
const MOCK_NOTIFICATIONS: NotificationInfo[] = [
  {
    id: '1',
    type: 'warning',
    title: '¡Evaluación aproximándose!',
    description: 'Matemáticas, en 3 días a las 14:30 en la sala 304.'
  },
  {
    id: '2',
    type: 'danger',
    title: '¡Tienes pagos pendientes!',
    description: 'Manten tus pagos al día revisándolos en "Pagos".'
  },
  {
    id: '3',
    type: 'success',
    title: '¡Tienes 3 calificaciones nuevas!',
    description: 'Revísalas en "Calificaciones y asistencias".'
  }
];

const getColorForType = (type: NotificationType) => {
  'worklet';
  switch (type) {
    case 'warning': return '#FF8D28';  // Figma Orange
    case 'danger': return '#FF383C';   // Red
    case 'success': return '#34C759';  // Green
    default: return '#8E8E93';
  }
};

export function NotificationOverlay() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Real active notifications
  // In a real app this would come from a context/store.
  const unreadCount = MOCK_NOTIFICATIONS.length - currentIndex;
  const currentNotification = MOCK_NOTIFICATIONS[currentIndex];

  // 0 = Collapsed Pill, 1 = Fully Expanded Plaque
  const progress = useSharedValue(0);

  // Used for slight physical drag elasticity
  const dragY = useSharedValue(0);

  const collapse = () => {
    setIsExpanded(false);
    progress.value = withTiming(0, TIMING_CONFIG);
    dragY.value = withTiming(0, { duration: 400, easing: Easing.out(Easing.cubic) });
  };

  const clearAndCollapse = () => {
    setIsExpanded(false);
    progress.value = withTiming(0, TIMING_CONFIG);
    dragY.value = withTiming(0, { duration: 400, easing: Easing.out(Easing.cubic) });

    // Reset to standard empty state after collapsing
    setTimeout(() => {
      setCurrentIndex(0);
    }, 400);
  }

  const expand = () => {
    if (unreadCount <= 0) return; // Nothing mapping to show
    setIsExpanded(true);
    progress.value = withTiming(1, TIMING_CONFIG);
    dragY.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.cubic) });
  };

  const handleTap = () => {
    if (!isExpanded) {
      expand();
    } else {
      // Tap-to-advance logic
      if (currentIndex < MOCK_NOTIFICATIONS.length - 1) {
        // Fade to next
        setCurrentIndex(prev => prev + 1);
      } else {
        // Reached the end, collapse and reset
        clearAndCollapse();
      }
    }
  };

  const gesture = Gesture.Pan()
    .onUpdate((event) => {
      // Allow drag down to dismiss if expanded
      if (isExpanded && event.translationY > 0) {
        dragY.value = event.translationY;
      }
    })
    .onEnd((event) => {
      const velocityY = event.velocityY;
      const translationY = event.translationY;

      if (isExpanded) {
        // Did they flick down or drag low enough?
        if (velocityY > 500 || translationY > 40) {
          runOnJS(collapse)();
        } else {
          // Snap back up smoothly
          dragY.value = withTiming(0, { duration: 400, easing: Easing.out(Easing.cubic) });
        }
      }
    });

  const animatedContainerStyle = useAnimatedStyle(() => {
    // Height morphing: 
    // Collapsed: Taller so it extends comfortably above the tab bar (90px).
    // Expanded: Auto sizing is ideal, but with animations we use a more constrained max height that fits the text securely sans excessive padding.
    const height = interpolate(progress.value, [0, 1], [90, 120], Extrapolation.CLAMP);

    // Width morphing: Pill (e.g. 100px) -> Full Width (width of TabBar: 330px)
    const width = interpolate(progress.value, [0, 1], [100, 330], Extrapolation.CLAMP);

    // Border Radius: Top edges super rounded when expanded, fully round when pill
    const borderTopRadius = interpolate(progress.value, [0, 1], [40, 32], Extrapolation.CLAMP);

    const targetColor = currentNotification ? getColorForType(currentNotification.type) : '#34C759';

    const morphedColor = interpolateColor(
      progress.value,
      [0, 1],
      ['#34C759', targetColor]
    );

    return {
      width,
      height,
      backgroundColor: morphedColor,
      borderTopLeftRadius: borderTopRadius,
      borderTopRightRadius: borderTopRadius,
      // Apply a bottom border radius matching the TabBar (32px) so the square corners
      // don't stick out behind the rounded pill of the TabBar.
      borderBottomLeftRadius: 32,
      borderBottomRightRadius: 32,
      transform: [
        { translateY: Math.max(0, dragY.value) },
      ]
    };
  }, [currentNotification]);

  const badgeOpacityStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(progress.value, [0, 0.5], [1, 0], Extrapolation.CLAMP),
      transform: [
        { scale: interpolate(progress.value, [0, 0.5], [1, 0.5], Extrapolation.CLAMP) }
      ]
    }
  });

  const contentOpacityStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(progress.value, [0.5, 1], [0, 1], Extrapolation.CLAMP),
      transform: [
        { translateY: interpolate(progress.value, [0.5, 1], [10, 0], Extrapolation.CLAMP) }
      ]
    }
  });

  // If there are no unread notifications, don't mount the badge at all
  if (unreadCount <= 0 && !isExpanded) {
    return null;
  }

  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      <GestureDetector gesture={gesture}>
        <TouchableWithoutFeedback onPress={handleTap}>
          {/* Main Morphing Bubble */}
          <Animated.View style={[styles.bubble, animatedContainerStyle]}>

            {/* The Badge Number (Visible only when collapsed) */}
            <Animated.View style={[StyleSheet.absoluteFill, styles.badgeCenter, badgeOpacityStyle]} pointerEvents="none">
              <View style={styles.circleOutline}>
                <ThemedText style={styles.badgeText}>{unreadCount}</ThemedText>
              </View>
            </Animated.View>

            {/* The Notification Card Content (Visible only when expanded) */}
            {currentNotification && (
              <Animated.View style={[StyleSheet.absoluteFill, contentOpacityStyle]} pointerEvents="none">
                {/* We use key={currentIndex} below to force Remounting and trigger the FadeIn/FadeOut transitions in NotificationCard */}
                <NotificationCard key={currentNotification.id} notification={currentNotification} />
              </Animated.View>
            )}

          </Animated.View>
        </TouchableWithoutFeedback>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 10, // Buried deeply behind the Tab Bar so it emerges from the middle
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
    zIndex: 0,
    elevation: 0,
  },
  bubble: {
    justifyContent: 'flex-start',
    alignItems: 'center',
    overflow: 'hidden',
    // Shadow for depth on the top edge
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 1,
  },
  badgeCenter: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 0,
  },
  circleOutline: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    // Push the icon higher since the bottom 49px is hidden behind the tab bar
    transform: [{ translateY: -25 }]
  },
  badgeText: {
    color: '#E2E1DA',
    fontSize: 12,
    fontWeight: 'bold',
  }
});
