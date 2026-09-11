import { AppColors } from '@/constants/design-tokens';
import React, { useEffect } from 'react';
import { View } from 'react-native';
import Svg, { Path, Rect, Circle } from 'react-native-svg';
import Animated, {
    useSharedValue,
    useAnimatedProps,
    withSequence,
    withRepeat,
    withTiming,
    withDelay,
    Easing,
    useReducedMotion,
} from 'react-native-reanimated';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface AnimatedIconProps {
    size?: number;
    color?: string;
    style?: any;
}

const DOTS = [
    { cx: 8, cy: 14 },
    { cx: 12, cy: 14 },
    { cx: 16, cy: 14 },
    { cx: 8, cy: 18 },
    { cx: 12, cy: 18 },
    { cx: 16, cy: 18 },
];

export function CalendarDaysIcon({ size = 28, color = AppColors.textOnLight, style }: AnimatedIconProps) {
    const reduceMotion = useReducedMotion();
    // Array of shared values for each dot's opacity
    const opacities = DOTS.map(() => useSharedValue(1));

    useEffect(() => {
        if (reduceMotion) return;
        // Staggered blinking animation for dots
        DOTS.forEach((_, i) => {
            opacities[i].value = withDelay(
                i * 100, // delay staggered by 0.1s
                withRepeat(
                    withSequence(
                        withTiming(0.3, { duration: 200, easing: Easing.inOut(Easing.ease) }),
                        withTiming(1, { duration: 200, easing: Easing.inOut(Easing.ease) }),
                        withTiming(1, { duration: 2000 }) // Hold state before next blink cycle
                    ),
                    -1,
                    true
                )
            );
        });
    }, [reduceMotion]);

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
                <Path d="M8 2v4" />
                <Path d="M16 2v4" />
                <Rect height="18" rx="2" width="18" x="3" y="4" />
                <Path d="M3 10h18" />

                {DOTS.map((dot, index) => {
                    // React Native Reanimated hook must be called at top level or inside a component.
                    // Since we are mapping, we use an inline custom component wrapper for the animated props!
                    return <AnimatedDot key={index} dot={dot} opacityVal={opacities[index]} />;
                })}
            </Svg>
        </View>
    );
}

// Inner component to safely useAnimatedProps in a map
function AnimatedDot({ dot, opacityVal }: { dot: any, opacityVal: any }) {
    const animatedProps = useAnimatedProps(() => ({
        opacity: opacityVal.value
    }));

    return (
        <AnimatedCircle
            cx={dot.cx}
            cy={dot.cy}
            r="1"
            fill="currentColor"
            stroke="none"
            animatedProps={animatedProps}
        />
    );
}
