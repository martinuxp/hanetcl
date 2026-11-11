import { ThemedText } from '@/components/themed-text';
import { AppColors, AppPressed, AppSpacing } from '@/constants/design-tokens';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, Keyboard, LayoutAnimation, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import type { KeyboardEvent, NativeScrollEvent, NativeSyntheticEvent, ScrollViewProps, ViewStyle, StyleProp } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { t } from '@/i18n';

// The keyboard covers the bottom of the screen without moving anything: on
// iOS the form sheet stays where it is, and on Android (edge to edge) the
// window doesn't shrink either. Sheets and dialogs reach the bottom of the
// screen, so what the keyboard covers of them is its top measured from the
// screen's bottom. (Measuring the sheet itself doesn't work: on iOS the
// layout doesn't know where the native sheet sits.) Each one keeps its content
// above that, scrolls the field being typed into back into view, and offers a
// button to put the keyboard away.

const IOS = Platform.OS === 'ios';
const SHOW = IOS ? 'keyboardWillChangeFrame' : 'keyboardDidShow';
const HIDE = IOS ? 'keyboardWillHide' : 'keyboardDidHide';
// Room between the field being typed into and the keyboard (the button fits there).
const FIELD_MARGIN = 64;

/** How many points of the screen's bottom the keyboard covers, and whether it is up. */
export function useKeyboardOverlap() {
  const [state, setState] = useState({ shown: false, overlap: 0 });
  useEffect(() => {
    if (Platform.OS === 'web') return;
    // On iOS the space follows the keyboard with its own curve and time,
    // so the content rises with it instead of jumping ahead of it.
    const followKeyboard = (event: KeyboardEvent) => {
      if (!IOS || !event.duration) return;
      LayoutAnimation.configureNext({ duration: event.duration, update: { duration: event.duration, type: LayoutAnimation.Types.keyboard } });
    };
    const onShow = (event: KeyboardEvent) => {
      const overlap = Math.max(0, Math.round(Dimensions.get('screen').height - event.endCoordinates.screenY));
      followKeyboard(event);
      setState({ shown: overlap > 0, overlap });
    };
    const subscriptions = [
      Keyboard.addListener(SHOW, onShow),
      Keyboard.addListener(HIDE, event => {
        followKeyboard(event);
        setState({ shown: false, overlap: 0 });
      }),
    ];
    return () => subscriptions.forEach(subscription => subscription.remove());
  }, []);
  return state;
}

/** A pill over the keyboard that puts it away. */
export function KeyboardDismissButton({ bottom }: { bottom: number }) {
  return (
    <Animated.View entering={FadeIn.duration(120)} exiting={FadeOut.duration(100)} pointerEvents="box-none" style={[styles.dismissLayer, { bottom: bottom + AppSpacing.sm }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('components.ui.keyboard.bajarElTeclado')}
        hitSlop={8}
        onPress={() => Keyboard.dismiss()}
        style={({ pressed }) => [styles.dismiss, pressed && AppPressed]}
      >
        <Ionicons name="chevron-down" size={16} color={AppColors.controlOnActive} />
        <ThemedText style={styles.dismissText}>{t('components.ui.keyboard.bajarTeclado')}</ThemedText>
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
export function KeyboardScroll({ ref, containerStyle, onScroll, onLayout, onContentSizeChange, children, ...props }: KeyboardScrollProps) {
  const scroll = useRef<ScrollHandle | null>(null);
  const offset = useRef(0);
  const contentHeight = useRef(0);
  const { shown, overlap } = useKeyboardOverlap();

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
        // As much of the field as fits, without pushing its top out of sight.
        const fieldBottom = inputY + Math.min(inputHeight, Math.max(120, viewHeight - FIELD_MARGIN - AppSpacing.lg));
        const hidden = Math.min(fieldBottom + FIELD_MARGIN - visibleBottom, inputY - viewY - AppSpacing.lg);
        if (hidden > 0) view.scrollTo({ y: offset.current + hidden, animated: true });
      });
    });
  }, []);

  // Typing new lines makes a field (and the form) taller: while the field's
  // end is under the keyboard, the form scrolls by as much as it grew, so the
  // line being written stays where it was instead of sliding under it.
  const follow = useCallback((grew: number) => {
    const input = TextInput.State.currentlyFocusedInput();
    const view = scroll.current;
    if (!input || !view || grew <= 0) return;
    view.measureInWindow((_x, viewY, _width, viewHeight) => {
      input.measureInWindow((_ix, inputY, _iw, inputHeight) => {
        const visibleBottom = viewY + viewHeight - FIELD_MARGIN;
        if (inputY + inputHeight > visibleBottom) view.scrollTo({ y: offset.current + grew, animated: false });
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
    <View style={[styles.box, containerStyle]}>
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
          onContentSizeChange={(width, height) => {
            onContentSizeChange?.(width, height);
            const grew = height - contentHeight.current;
            contentHeight.current = height;
            if (shown) follow(grew);
          }}
        >
          {children}
          {/* With the keyboard up, room to scroll the end of the form above "Bajar teclado". */}
          {shown && <View style={styles.keyboardRoom} />}
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
  keyboardRoom: {
    height: FIELD_MARGIN + AppSpacing.lg,
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
