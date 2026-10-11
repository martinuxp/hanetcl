import { useNavigation } from 'expo-router';
// expo-router bundles its own React Navigation; this is the copy its stack
// listens to (it also stops the iOS sheet from being swiped away).
import { usePreventRemove } from 'expo-router/build/react-navigation/core/usePreventRemove';
import { useEffect, useRef } from 'react';
import { Alert, Platform } from 'react-native';

import { useSheetGuard } from '@/components/ui/sheet-frame';

type Options = {
  /** Something was typed or chosen that has not been saved. */
  dirty: boolean;
  /** Saves from the confirmation. It should call `allowLeave()` before going back. */
  onSave: () => void;
  title?: string;
  message?: string;
};

/**
 * Asks before a form with unsaved changes is closed by swiping the sheet down,
 * tapping outside it, the back button or "Cancelar": keep editing, discard,
 * or save. Returns `allowLeave`, to call right before leaving on purpose.
 */
export function useUnsavedChangesGuard({ dirty, onSave, title = '¿Descartar los cambios?', message = 'Lo que escribiste todavía no se ha guardado.' }: Options) {
  const navigation = useNavigation();
  const sheet = useSheetGuard();
  const leaving = useRef(false);
  const saveRef = useRef(onSave);

  useEffect(() => {
    saveRef.current = onSave;
  }, [onSave]);

  const ask = (discard: () => void) => {
    const leave = () => {
      leaving.current = true;
      discard();
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n${message}`)) leave();
      return;
    }
    Alert.alert(title, message, [
      { text: 'Guardar', onPress: () => saveRef.current() },
      { text: 'Descartar', style: 'destructive', onPress: leave },
      { text: 'Seguir editando', style: 'cancel' },
    ]);
  };

  // The Android sheet stays open while there are changes, and each close it
  // held back is asked about here.
  const setSheetBlocked = sheet?.setBlocked;
  useEffect(() => {
    if (!setSheetBlocked) return;
    setSheetBlocked(dirty);
    return () => setSheetBlocked(false);
  }, [dirty, setSheetBlocked]);

  const attempts = sheet?.blockedAttempts ?? 0;
  const handledAttempts = useRef(0);
  useEffect(() => {
    if (!sheet || attempts <= handledAttempts.current) return;
    handledAttempts.current = attempts;
    ask(sheet.close);
  });

  usePreventRemove(dirty, ({ data }) => {
    if (leaving.current) {
      navigation.dispatch(data.action);
      return;
    }
    // On Android the sheet slides away first and then leaves.
    ask(() => (sheet ? sheet.close() : navigation.dispatch(data.action)));
  });

  return {
    allowLeave: () => {
      leaving.current = true;
      sheet?.setBlocked(false);
    },
  };
}
