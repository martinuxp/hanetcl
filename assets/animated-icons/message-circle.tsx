import { AppColors } from '@/constants/design-tokens';
import React, { useEffect } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Animated, {
    useSharedValue,
    useAnimatedProps,
    withSpring,
    withSequence,
    withRepeat,
    withTiming,
    Easing,
    useReducedMotion,
} from 'react-native-reanimated';

const AnimatedSvg = Animated.createAnimatedComponent(Svg);

export interface AnimatedIconProps {
    size?: number;
    color?: string;
    style?: any;
}

export function MessageCircleIcon({ size = 28, color = AppColors.textOnLight, style }: AnimatedIconProps) {
    const reduceMotion = useReducedMotion();
    const rotation = useSharedValue(0);
    const scale = useSharedValue(1);

    useEffect(() => {
        if (reduceMotion) return;
        // Wiggle rotation and bounce scale indefinitely
        const startWiggle = () => {
            rotation.value = withRepeat(
                withSequence(
                    withTiming(-7, { duration: 150, easing: Easing.inOut(Easing.ease) }),
                    withTiming(7, { duration: 150, easing: Easing.inOut(Easing.ease) }),
                    withTiming(0, { duration: 150, easing: Easing.inOut(Easing.ease) }),
                    withTiming(0, { duration: 3000 })
                ),
                -1,
                true
            );

            scale.value = withRepeat(
                withSequence(
                    withSpring(1.05, { stiffness: 400, damping: 10 }),
                    withSpring(1, { stiffness: 400, damping: 10 }),
                    withTiming(1, { duration: 3000 })
                ),
                -1,
                true
            );
        };

        startWiggle();
    }, [reduceMotion]);

    const svgProps = useAnimatedProps(() => ({
        // Setting transform origins directly on SVG isn't simple, so we rotate about center
        transform: [
            { translateX: size / 2 },
            { translateY: size / 2 },
            { scale: scale.value },
            { rotate: `${rotation.value}deg` },
            { translateX: -size / 2 },
            { translateY: -size / 2 }
        ] as any
    }));

    return (
        <View style={style}>
            <AnimatedSvg
                animatedProps={svgProps}
                width={size}
                height={size}
                viewBox="0 0 24 24"
                fill="none"
                stroke={color}
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <Path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
            </AnimatedSvg>
        </View>
    );
}
