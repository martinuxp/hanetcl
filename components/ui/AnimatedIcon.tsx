import React, { useEffect } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  useReducedMotion,
  cancelAnimation,
} from 'react-native-reanimated';
import { CustomIcon } from './custom-icon';

type AnimatedIconProps = {
  name: string;
  size: number;
  color: string;
  animationType?: 'pulse' | 'float' | 'spin' | 'bounce' | 'wiggle' | 'none';
  loop?: boolean;
};

export function AnimatedIcon({ name, size, color, animationType = 'none', loop = false }: AnimatedIconProps) {
  const reduceMotion = useReducedMotion();
  const rotation = useSharedValue(0);
  const scale = useSharedValue(1);
  const translateY = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(rotation);
    cancelAnimation(scale);
    cancelAnimation(translateY);
    rotation.value = 0;
    scale.value = 1;
    translateY.value = 0;

    if (reduceMotion || animationType === 'none') return;

    const repetitions = loop ? -1 : 1;

    if (animationType === 'float') {
      translateY.value = withRepeat(
          withSequence(
            withTiming(-5, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
            withTiming(5, { duration: 1500, easing: Easing.inOut(Easing.ease) })
          ),
          repetitions,
          true
      );
    } else if (animationType === 'pulse') {
      scale.value = withRepeat(
          withSequence(
            withTiming(1.15, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
            withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) })
          ),
          repetitions,
          true
      );
    } else if (animationType === 'spin') {
      rotation.value = withRepeat(
          withTiming(360, { duration: 8000, easing: Easing.linear }),
          repetitions,
          false
      );
    } else if (animationType === 'bounce') {
      translateY.value = withRepeat(
          withSequence(
            withTiming(-10, { duration: 600, easing: Easing.out(Easing.ease) }),
            withTiming(0, { duration: 600, easing: Easing.bounce })
          ),
          repetitions,
          true
      );
    } else if (animationType === 'wiggle') {
      rotation.value = withRepeat(
          withSequence(
            withTiming(-10, { duration: 200 }),
            withTiming(10, { duration: 200 }),
            withTiming(-10, { duration: 200 }),
            withTiming(0, { duration: 200 }),
            withTiming(0, { duration: 2000 })
          ),
          repetitions,
          true
      );
    }

    return () => {
      cancelAnimation(rotation);
      cancelAnimation(scale);
      cancelAnimation(translateY);
    };
  }, [animationType, loop, reduceMotion, rotation, scale, translateY]);

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
