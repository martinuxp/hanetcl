import { AppColors } from '@/constants/design-tokens';
import React, { useEffect } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Animated, {
    useSharedValue,
    useAnimatedProps,
    withSequence,
    withRepeat,
    withTiming,
    Easing,
    useReducedMotion,
} from 'react-native-reanimated';

const AnimatedPath = Animated.createAnimatedComponent(Path);

export interface AnimatedIconProps {
    size?: number;
    color?: string;
    style?: any;
}

export function Square2StackIcon({ size = 28, color = AppColors.textOnLight, style }: AnimatedIconProps) {
    const reduceMotion = useReducedMotion();
    const frontX = useSharedValue(0);
    const frontY = useSharedValue(0);

    const backX = useSharedValue(0);
    const backY = useSharedValue(0);
    const backOpacity = useSharedValue(1);

    useEffect(() => {
        if (reduceMotion) return;
        // Front layer animation: x & y bounces up (+1) and back
        frontX.value = withRepeat(
            withSequence(
                withTiming(1, { duration: 300, easing: Easing.inOut(Easing.ease) }),
                withTiming(0, { duration: 300, easing: Easing.inOut(Easing.ease) }),
                withTiming(0, { duration: 2500 }) // Hold
            ),
            -1,
            true
        );
        frontY.value = withRepeat(
            withSequence(
                withTiming(1, { duration: 300, easing: Easing.inOut(Easing.ease) }),
                withTiming(0, { duration: 300, easing: Easing.inOut(Easing.ease) }),
                withTiming(0, { duration: 2500 })
            ),
            -1,
            true
        );

        // Back layer animation: x & y goes to -4 then back, opacity 0 to 1
        backX.value = withRepeat(
            withSequence(
                withTiming(-4, { duration: 300, easing: Easing.out(Easing.ease) }),
                withTiming(0, { duration: 300, easing: Easing.out(Easing.ease) }),
                withTiming(0, { duration: 2500 })
            ),
            -1,
            true
        );
        backY.value = withRepeat(
            withSequence(
                withTiming(-4, { duration: 300, easing: Easing.out(Easing.ease) }),
                withTiming(0, { duration: 300, easing: Easing.out(Easing.ease) }),
                withTiming(0, { duration: 2500 })
            ),
            -1,
            true
        );
        backOpacity.value = withRepeat(
            withSequence(
                withTiming(0, { duration: 300, easing: Easing.out(Easing.ease) }),
                withTiming(1, { duration: 300, easing: Easing.out(Easing.ease) }),
                withTiming(1, { duration: 2500 })
            ),
            -1,
            true
        );
    }, [reduceMotion]);

    const frontProps = useAnimatedProps(() => ({
        transform: [{ translateX: frontX.value }, { translateY: frontY.value }] as any
    }));

    const backProps = useAnimatedProps(() => ({
        opacity: backOpacity.value,
        transform: [{ translateX: backX.value }, { translateY: backY.value }] as any
    }));

    return (
        <View style={style}>
            <Svg
                width={size}
                height={size}
                viewBox="0 0 24 24"
                fill="none"
                stroke={color}
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <AnimatedPath
                    d="M16.5 8.25V6a2.25 2.25 0 0 0-2.25-2.25H6A2.25 2.25 0 0 0 3.75 6v8.25A2.25 2.25 0 0 0 6 16.5h2.25"
                    animatedProps={backProps}
                />
                <AnimatedPath
                    d="M16.5 8.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-7.5A2.25 2.25 0 0 1 8.25 18v-1.5m8.25-8.25h-6a2.25 2.25 0 0 0-2.25 2.25v6"
                    animatedProps={frontProps}
                />
            </Svg>
        </View>
    );
}
