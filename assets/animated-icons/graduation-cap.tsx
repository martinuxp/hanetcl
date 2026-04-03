import React, { useEffect } from 'react';
import { View } from 'react-native';
import Svg, { Path, G } from 'react-native-svg';
import Animated, {
    useSharedValue,
    useAnimatedProps,
    withTiming,
    withSequence,
    withRepeat,
    withDelay,
    Easing,
} from 'react-native-reanimated';

const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedPath = Animated.createAnimatedComponent(Path);

export interface AnimatedIconProps {
    size?: number;
    color?: string;
    style?: any;
}

export function GraduationCapIcon({ size = 28, color = "#292927", style }: AnimatedIconProps) {
    const capY = useSharedValue(0);
    const capRotate = useSharedValue(0);
    const tasselRotate = useSharedValue(0);

    useEffect(() => {
        // We recreate the Framer motion variants behavior using useSharedValue and withSequence

        // Cap animation: y: [0, -2, 0], rotate: [0, -2, 2, 0], duration: 0.6
        capY.value = withRepeat(
            withSequence(
                withTiming(-2, { duration: 300, easing: Easing.inOut(Easing.ease) }),
                withTiming(0, { duration: 300, easing: Easing.inOut(Easing.ease) }),
                withTiming(0, { duration: 2000 }) // Sleep before loop
            ),
            -1,
            true
        );

        capRotate.value = withRepeat(
            withSequence(
                withTiming(-2, { duration: 200, easing: Easing.inOut(Easing.ease) }),
                withTiming(2, { duration: 200, easing: Easing.inOut(Easing.ease) }),
                withTiming(0, { duration: 200, easing: Easing.inOut(Easing.ease) }),
                withTiming(0, { duration: 2000 })
            ),
            -1,
            true
        );

        // Tassel animation: rotate: [0, 15, -10, 5, 0], duration: 0.8, delay: 0.1
        tasselRotate.value = withDelay(
            100,
            withRepeat(
                withSequence(
                    withTiming(15, { duration: 200, easing: Easing.inOut(Easing.ease) }),
                    withTiming(-10, { duration: 200, easing: Easing.inOut(Easing.ease) }),
                    withTiming(5, { duration: 200, easing: Easing.inOut(Easing.ease) }),
                    withTiming(0, { duration: 200, easing: Easing.inOut(Easing.ease) }),
                    withTiming(0, { duration: 1900 })
                ),
                -1,
                true
            )
        );
    }, []);

    const capProps = useAnimatedProps(() => {
        // Translate origin to center (12, 12), rotate, translate back
        return {
            transform: [
                { translateX: 12 },
                { translateY: 12 },
                { translateY: capY.value },
                { rotate: `${capRotate.value}deg` },
                { translateX: -12 },
                { translateY: -12 }
            ]
        } as any;
    });

    const tasselProps = useAnimatedProps(() => {
        // Transform origin is "top center". Tassel path goes roughly x=22, y=10 to y=16.
        // So origin is around (22, 10).
        return {
            transform: [
                { translateX: 22 },
                { translateY: 10 },
                { rotate: `${tasselRotate.value}deg` },
                { translateX: -22 },
                { translateY: -10 }
            ]
        } as any;
    });

    return (
        <View style={style}>
            <Svg
                width={size}
                height={size}
                viewBox="0 0 24 24"
                fill="none"
                stroke={color}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <AnimatedG animatedProps={capProps}>
                    <Path d="M2 10l10-5 10 5-10 5z" />
                    <Path d="M6 12v5c3 3 9 3 12 0v-5" />
                    <AnimatedPath d="M22 10v6" animatedProps={tasselProps} />
                </AnimatedG>
            </Svg>
        </View>
    );
}
