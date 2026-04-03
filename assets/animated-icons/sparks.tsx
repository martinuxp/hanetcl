import React, { useEffect } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    useAnimatedProps,
    withTiming,
    withSequence,
    withRepeat,
    withDelay,
    Easing,
} from 'react-native-reanimated';

const AnimatedPath = Animated.createAnimatedComponent(Path);

export interface AnimatedIconProps {
    size?: number;
    color?: string;
    style?: any;
}

export function SparklesIcon({ size = 28, color = "#292927", style }: AnimatedIconProps) {
    // We have 3 paths. We'll animate opacity and scale.
    const path0Scale = useSharedValue(1);
    const path0Opacity = useSharedValue(1);
    const path1Scale = useSharedValue(1);
    const path1Opacity = useSharedValue(1);
    const path2Scale = useSharedValue(1);
    const path2Opacity = useSharedValue(1);

    const startAnimation = (scaleObj: any, opacityObj: any, delay: number) => {
        const timingConfig = { duration: 300, easing: Easing.inOut(Easing.ease) };

        scaleObj.value = withDelay(
            delay,
            withRepeat(
                withSequence(
                    withTiming(1.2, timingConfig),
                    withTiming(1, timingConfig),
                    withTiming(1.1, timingConfig),
                    withTiming(1, timingConfig),
                    withTiming(1, { duration: 300 }) // pause
                ),
                -1,
                true
            )
        );

        opacityObj.value = withDelay(
            delay,
            withRepeat(
                withSequence(
                    withTiming(0.3, timingConfig),
                    withTiming(1, timingConfig),
                    withTiming(0.3, timingConfig),
                    withTiming(1, timingConfig),
                    withTiming(1, { duration: 300 }) // pause
                ),
                -1,
                true
            )
        );
    };

    useEffect(() => {
        startAnimation(path0Scale, path0Opacity, 0);
        startAnimation(path1Scale, path1Opacity, 150);
        startAnimation(path2Scale, path2Opacity, 300);
    }, []);

    const getAnimatedProps = (scaleObj: any, opacityObj: any) => useAnimatedProps(() => ({
        opacity: opacityObj.value,
        transform: `scale(${scaleObj.value})`
    } as any));

    return (
        <View style={style}>
            <Svg
                width={size}
                height={size}
                viewBox="0 0 24 24"
                fill="none"
                stroke={color}
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <AnimatedPath
                    animatedProps={getAnimatedProps(path0Scale, path0Opacity)}
                    d="M9.8132 15.9038L9 18.75L8.1868 15.9038C7.75968 14.4089 6.59112 13.2403 5.09619 12.8132L2.25 12L5.09619 11.1868C6.59113 10.7597 7.75968 9.59112 8.1868 8.09619L9 5.25L9.8132 8.09619C10.2403 9.59113 11.4089 10.7597 12.9038 11.1868L15.75 12L12.9038 12.8132C11.4089 13.2403 10.2403 14.4089 9.8132 15.9038Z"
                />
                <AnimatedPath
                    animatedProps={getAnimatedProps(path1Scale, path1Opacity)}
                    d="M18.2589 8.71454L18 9.75L17.7411 8.71454C17.4388 7.50533 16.4947 6.56117 15.2855 6.25887L14.25 6L15.2855 5.74113C16.4947 5.43883 17.4388 4.49467 17.7411 3.28546L18 2.25L18.2589 3.28546C18.5612 4.49467 19.5053 5.43883 20.7145 5.74113L21.75 6L20.7145 6.25887C19.5053 6.56117 18.5612 7.50533 18.2589 8.71454Z"
                />
                <AnimatedPath
                    animatedProps={getAnimatedProps(path2Scale, path2Opacity)}
                    d="M16.8942 20.5673L16.5 21.75L16.1058 20.5673C15.8818 19.8954 15.3546 19.3682 14.6827 19.1442L13.5 18.75L14.6827 18.3558C15.3546 18.1318 15.8818 17.6046 16.1058 16.9327L16.5 15.75L16.8942 16.9327C17.1182 17.6046 17.6454 18.1318 18.3173 18.3558L19.5 18.75L18.3173 19.1442C17.6454 19.3682 17.1182 19.8954 16.8942 20.5673Z"
                />
            </Svg>
        </View>
    );
}
