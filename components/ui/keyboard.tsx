import { ThemedText } from '@/components/themed-text';
import { AppColors, AppPressed, AppSpacing } from '@/constants/design-tokens';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import type { KeyboardEvent, NativeScrollEvent, NativeSyntheticEvent, ScrollViewProps, ViewStyle, StyleProp } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

// The keyboard covers the bottom of the screen without moving anything: on
// iOS the form sheet stays where it is, and on Android (edge to edge) the
// window doesn't shrink either. So each sheet and dialog measures how much of
// it the keyboard covers, keeps its content above that, scrolls the field
// being typed into back into view, and offers a button to put the keyboard away.

const IOS = Platform.OS === 'ios';
const SHOW = IOS ? 'keyboardWillShow' : 'keyboardDidShow';
const HIDE = IOS ? 'keyboardWillHide' : 'keyboardDidHide';
// Room between the field being typed into and the keyboard (the button fits there).
const FIELD_MARGIN = 64;

/**
 * How many points of `target` the keyboard covers, and whether it is up.
 * Measured again a moment later, when an Android sheet has finished rising.
 */
export function useKeyboardOverlap(target: React.RefObject<React.ComponentRef<typeof View> | null>) {
  const [state, setState] = useState({ shown: false, overlap: 0 });
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const measure = (top: number) => {
      const node = target.current;
      if (!node) {
        setState({ shown: true, overlap: 0 });
        return;
      }
      node.measureInWindow((_x, y, _width, height) => {
        setState({ shown: true, overlap: Math.max(0, Math.round(y + height - top)) });
      });
    };
    const onShow = (event: KeyboardEvent) => {
      const top = event.endCoordinates.screenY;
      measure(top);
      clearTimeout(timer);
      timer = setTimeout(() => measure(top), 400);
    };
    const subscriptions = [
      Keyboard.addListener(SHOW, onShow),
      Keyboard.addListener(HIDE, () => {
        clearTimeout(timer);
        setState({ shown: false, overlap: 0 });
      }),
    ];
    return () => {
      clearTimeout(timer);
      subscriptions.forEach(subscription => subscription.remove());
    };
  }, [target]);
  return state;
}

/** A pill over the keyboard that puts it away. */
export function KeyboardDismissButton({ bottom }: { bottom: number }) {
  return (
    <Animated.View entering={FadeIn.duration(120)} exiting={FadeOut.duration(100)} pointerEvents="box-none" style={[styles.dismissLayer, { bottom: bottom + AppSpacing.sm }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Bajar el teclado"
        hitSlop={8}
        onPress={() => Keyboard.dismiss()}
        style={({ pressed }) => [styles.dismiss, pressed && AppPressed]}
      >
        <Ionicons name="chevron-down" size={16} color={AppColors.controlOnActive} />
        <ThemedText style={styles.dismissText}>Bajar teclado</ThemedText>
      </Pressable>
    </Animated.View>
  );
}

type ScrollHandle = React.ComponentRef<typeof ScrollView>;

type KeyboardScrollProps = ScrollViewProps & {
  ref?: React.Ref<ScrollHandle>;
  /** Style of the box around the scroll view (it fills its parent by default). */
  containerStyle?: StyleProp<ViewStyle>;
};

/**
 * A ScrollView for forms in sheets: it ends where the keyboard begins, brings
 * the field being typed into above it, and shows "Bajar teclado" meanwhile.
 * On the web it is a plain ScrollView (the browser takes care of it).
 */
export function KeyboardScroll({ ref, containerStyle, onScroll, onLayout, children, ...props }: KeyboardScrollProps) {
  const box = useRef<React.ComponentRef<typeof View>>(null);
  const scroll = useRef<ScrollHandle | null>(null);
  const offset = useRef(0);
  const { shown, overlap } = useKeyboardOverlap(box);

  const setRefs = useCallback((node: ScrollHandle | null) => {
    scroll.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) (ref as React.RefObject<ScrollHandle | null>).current = node;
  }, [ref]);

  // The field being typed into, scrolled up until it clears the keyboard.
  const reveal = useCallback(() => {
    const input = TextInput.State.currentlyFocusedInput();
    const view = scroll.current;
    if (!input || !view) return;
    view.measureInWindow((_x, viewY, _width, viewHeight) => {
      input.measureInWindow((_ix, inputY, _iw, inputHeight) => {
        const visibleBottom = viewY + viewHeight;
        // A tall field only needs its first lines in sight.
        const fieldBottom = inputY + Math.min(inputHeight, 120);
        const hidden = fieldBottom + FIELD_MARGIN - visibleBottom;
        if (hidden > 0 && inputY > viewY) view.scrollTo({ y: offset.current + hidden, animated: true });
      });
    });
  }, []);

  useEffect(() => {
    if (!shown) return;
    const timer = setTimeout(reveal, 60);
    return () => clearTimeout(timer);
  }, [overlap, reveal, shown]);

  if (Platform.OS === 'web') {
    return <ScrollView ref={ref} onScroll={onScroll} onLayout={onLayout} {...props}>{children}</ScrollView>;
  }

  return (
    <View ref={box} style={[styles.box, containerStyle]}>
      <View style={[styles.box, { paddingBottom: overlap }]}>
        <ScrollView
          ref={setRefs}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={IOS ? 'interactive' : 'on-drag'}
          scrollEventThrottle={16}
          {...props}
          onScroll={event => {
            offset.current = event.nativeEvent.contentOffset.y;
            onScroll?.(event as NativeSyntheticEvent<NativeScrollEvent>);
          }}
          onLayout={event => {
            onLayout?.(event);
            if (shown) reveal();
          }}
        >
          {children}
        </ScrollView>
      </View>
      {shown && <KeyboardDismissButton bottom={overlap} />}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flex: 1,
  },
  dismissLayer: {
    position: 'absolute',
    right: AppSpacing.lg,
  },
  dismiss: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: AppColors.controlActive,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  dismissText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 14,
    lineHeight: 18,
    color: AppColors.controlOnActive,
  },
});
