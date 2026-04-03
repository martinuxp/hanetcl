import React, { useEffect } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  withDelay,
  Easing,
  withSpring,
} from 'react-native-reanimated';
import { CustomIcon } from './custom-icon';

type AnimatedIconProps = {
  name: string;
  size: number;
  color: string;
  animationType?: 'pulse' | 'float' | 'spin' | 'bounce' | 'wiggle' | 'none';
};

export function AnimatedIcon({ name, size, color, animationType = 'none' }: AnimatedIconProps) {
  const rotation = useSharedValue(0);
  const scale = useSharedValue(1);
  const translateY = useSharedValue(0);

  useEffect(() => {
    // Random delay so icons don't animate exactly synchronously, looking more natural
    const delay = Math.random() * 500;

    if (animationType === 'float') {
      translateY.value = withDelay(
        delay,
        withRepeat(
          withSequence(
            withTiming(-5, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
            withTiming(5, { duration: 1500, easing: Easing.inOut(Easing.ease) })
          ),
          -1,
          true
        )
      );
    } else if (animationType === 'pulse') {
      scale.value = withDelay(
        delay,
        withRepeat(
          withSequence(
            withTiming(1.15, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
            withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) })
          ),
          -1,
          true
        )
      );
    } else if (animationType === 'spin') {
      rotation.value = withDelay(
        delay,
        withRepeat(
          withTiming(360, { duration: 8000, easing: Easing.linear }),
          -1,
          false
        )
      );
    } else if (animationType === 'bounce') {
      translateY.value = withDelay(
        delay,
        withRepeat(
          withSequence(
            withTiming(-10, { duration: 600, easing: Easing.out(Easing.ease) }),
            withTiming(0, { duration: 600, easing: Easing.bounce })
          ),
          -1,
          true
        )
      );
    } else if (animationType === 'wiggle') {
      rotation.value = withDelay(
        delay,
        withRepeat(
          withSequence(
            withTiming(-10, { duration: 200 }),
            withTiming(10, { duration: 200 }),
            withTiming(-10, { duration: 200 }),
            withTiming(0, { duration: 200 }),
            withTiming(0, { duration: 2000 }) // pause
          ),
          -1,
          true
        )
      );
    }
  }, [animationType]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateY: translateY.value },
        { scale: scale.value },
        { rotate: `${rotation.value}deg` },
      ],
    };
  });

  return (
    <Animated.View style={animatedStyle}>
      <CustomIcon name={name as any} size={size} color={color} />
    </Animated.View>
  );
}
