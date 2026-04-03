import React, { useEffect } from 'react';
import { View } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import Animated, {
    useSharedValue,
    useAnimatedProps,
    withSpring,
    withSequence,
    withRepeat,
    withDelay,
    withTiming,
} from 'react-native-reanimated';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface AnimatedIconProps {
    size?: number;
    color?: string;
    style?: any;
}

export function HandCoinsIcon({ size = 28, color = "#292927", style }: AnimatedIconProps) {
    const coin1Opacity = useSharedValue(0);
    const coin1Y = useSharedValue(-20);

    const coin2Opacity = useSharedValue(0);
    const coin2Y = useSharedValue(-20);

    useEffect(() => {
        const springConfig = { damping: 15, stiffness: 150 };

        // Coin 1 drop
        const dropCoin1 = () => {
            coin1Opacity.value = withRepeat(
                withSequence(
                    withTiming(1, { duration: 200 }),
                    withTiming(1, { duration: 1500 }), // hold
                    withTiming(0, { duration: 200 })
                ),
                -1,
                true
            );

            coin1Y.value = withRepeat(
                withSequence(
                    withSpring(0, springConfig),
                    withTiming(0, { duration: 1500 }),
                    withTiming(-20, { duration: 200 })
                ),
                -1,
                true
            );
        };

        // Coin 2 drop (delayed)
        const dropCoin2 = () => {
            coin2Opacity.value = withDelay(
                150,
                withRepeat(
                    withSequence(
                        withTiming(1, { duration: 200 }),
                        withTiming(1, { duration: 1500 }), // hold
                        withTiming(0, { duration: 200 })
                    ),
                    -1,
                    true
                )
            );

            coin2Y.value = withDelay(
                150,
                withRepeat(
                    withSequence(
                        withSpring(0, springConfig),
                        withTiming(0, { duration: 1500 }),
                        withTiming(-20, { duration: 200 })
                    ),
                    -1,
                    true
                )
            );
        };

        dropCoin1();
        dropCoin2();
    }, []);

    const coin1Props = useAnimatedProps(() => ({
        opacity: coin1Opacity.value,
        transform: [{ translateY: coin1Y.value }] as any
    }));

    const coin2Props = useAnimatedProps(() => ({
        opacity: coin2Opacity.value,
        transform: [{ translateY: coin2Y.value }] as any
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
                <Path d="M11 15h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 17" />
                <Path d="m7 21 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9" />
                <Path d="m2 16 6 6" />
                <AnimatedCircle
                    cx="16"
                    cy="9"
                    r="2.9"
                    animatedProps={coin1Props}
                />
                <AnimatedCircle
                    cx="6"
                    cy="5"
                    r="3"
                    animatedProps={coin2Props}
                />
            </Svg>
        </View>
    );
}
