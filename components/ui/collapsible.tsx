import { PropsWithChildren, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { AppColors } from '@/constants/design-tokens';

export function Collapsible({ children, title }: PropsWithChildren & { title: string }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <ThemedView>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        accessibilityLabel={title}
        style={({ pressed }) => [styles.heading, pressed && styles.pressed]}
        onPress={() => setIsOpen((value) => !value)}
      >
        <IconSymbol
          name="chevron.right"
          size={18}
          weight="medium"
          color={AppColors.textSecondary}
          style={{ transform: [{ rotate: isOpen ? '90deg' : '0deg' }] }}
        />

        <ThemedText type="defaultSemiBold">{title}</ThemedText>
      </Pressable>
      {isOpen && <ThemedView style={styles.content}>{children}</ThemedView>}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
  },
  pressed: { opacity: 0.8 },
  content: {
    marginTop: 6,
    marginLeft: 24,
  },
});
