import { useNavigation } from 'expo-router';
// expo-router bundles its own React Navigation; this is the copy its stack
// listens to (it also stops the iOS sheet from being swiped away).
import { usePreventRemove } from 'expo-router/build/react-navigation/core/usePreventRemove';
import React, { useEffect, useRef, useState } from 'react';

import { HanetButton } from '@/components/ui/hanet-button';
import { HanetDialog } from '@/components/ui/hanet-dialog';
import { useSheetGuard } from '@/components/ui/sheet-frame';

// A little over AlertModal's 100 ms close.
const DIALOG_CLOSE_MS = 140;

type Options = {
  /** Something was typed or chosen that has not been saved. */
  dirty: boolean;
  /** Saves from the confirmation. It should call `allowLeave()` before going back. */
  onSave: () => void;
  /** Label of the save button ("Guardar", "Crear Hall"…). */
  saveLabel?: string;
  /** Whether the form can be saved as it is; when not, only discard or keep editing. */
  canSave?: boolean;
  title?: string;
  message?: string;
};

/**
 * Asks before a form with unsaved changes is closed by swiping the sheet down,
 * tapping outside it, the back button or "Cancelar": save, discard, or keep
 * editing, in HaNet's own dialog. Render the returned `dialog` in the screen
 * and call `allowLeave()` right before leaving on purpose.
 */
export function useUnsavedChangesGuard({ dirty, onSave, saveLabel = 'Guardar', canSave = true, title = '¿Descartar los cambios?', message = 'Lo que escribiste todavía no se ha guardado.' }: Options) {
  const navigation = useNavigation();
  const sheet = useSheetGuard();
  const leaving = useRef(false);
  // What "Descartar" does once chosen; the dialog is open while it is set.
  const [pendingDiscard, setPendingDiscard] = useState<(() => void) | null>(null);

  const ask = (discard: () => void) => setPendingDiscard(() => discard);

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

  const keepEditing = () => setPendingDiscard(null);

  const dialog = (
    <HanetDialog visible={!!pendingDiscard} onRequestClose={keepEditing} dismissOnBackdrop title={title} body={message}>
      {canSave && (
        <HanetButton
          label={saveLabel}
          onPress={() => {
            setPendingDiscard(null);
            onSave();
          }}
        />
      )}
      <HanetButton
        label="Descartar"
        variant="accent"
        onPress={() => {
          const discard = pendingDiscard;
          setPendingDiscard(null);
          leaving.current = true;
          // The dialog is its own modal on top of the sheet: let it finish
          // closing before the sheet goes, or iOS can refuse the dismissal.
          setTimeout(() => discard?.(), DIALOG_CLOSE_MS);
        }}
      />
      <HanetButton label="Seguir editando" variant="surface" onPress={keepEditing} />
    </HanetDialog>
  );

  return {
    dialog,
    allowLeave: () => {
      leaving.current = true;
      sheet?.setBlocked(false);
    },
  };
}
