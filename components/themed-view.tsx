import { View, type ViewProps } from 'react-native';

import { useThemeColor } from '@/hooks/use-theme-color';
import { AppColors } from '@/constants/design-tokens';

export type ThemedViewProps = ViewProps & {
  lightColor?: string;
  darkColor?: string;
};

export function ThemedView({ style, lightColor, darkColor, ...otherProps }: ThemedViewProps) {
  const backgroundColor = useThemeColor(
    { light: lightColor || AppColors.surfaceSoft, dark: darkColor || AppColors.canvas },
    'background'
  );

  return <View style={[{ backgroundColor }, style]} {...otherProps} />;
}
