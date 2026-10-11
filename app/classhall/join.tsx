import { withSheetFrame } from '@/components/ui/sheet-frame';
import { ThemedText } from '@/components/themed-text';
import { AppColors, AppRadii, AppSpacing } from '@/constants/design-tokens';
import { describeAuthError } from '@/services/auth-service';
import { HALL_CODE_LENGTH, checkHallCode, hallErrorCode, joinHall } from '@/services/classhall-service';
import type { HallPreview } from '@/services/classhall-service';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const LOGO = require('@/assets/images/ClassHall.svg');
const BOXES = Array.from({ length: HALL_CODE_LENGTH }, (_, index) => index);

type Status =
  | { kind: 'typing' }
  | { kind: 'checking' }
  | { kind: 'found'; hall: HallPreview }
  | { kind: 'invalid' }
  | { kind: 'rejected' }
  | { kind: 'failed'; message: string };

function JoinHallScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const input = useRef<TextInput>(null);

  const [code, setCode] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'typing' });
  const [joining, setJoining] = useState(false);

  // A full code is looked up right away, so the button can name the Hall.
  useEffect(() => {
    if (code.length !== HALL_CODE_LENGTH) return;
    let active = true;
    checkHallCode(code)
      .then(hall => { if (active) setStatus({ kind: 'found', hall }); })
      .catch(error => {
        if (!active) return;
        const reason = hallErrorCode(error);
        if (reason === 'not-found') setStatus({ kind: 'invalid' });
        else if (reason === 'permission-denied') setStatus({ kind: 'rejected' });
        else setStatus({ kind: 'failed', message: describeAuthError(error, 'No pudimos comprobar el código. Inténtalo nuevamente.') });
        if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      });
    return () => { active = false; };
  }, [code]);

  const changeCode = (text: string) => {
    const next = text.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, HALL_CODE_LENGTH);
    setCode(next);
    setStatus(next.length === HALL_CODE_LENGTH ? { kind: 'checking' } : { kind: 'typing' });
  };

  const join = async () => {
    if (status.kind !== 'found' || joining) return;
    if (status.hall.alreadyMember) {
      allowLeave();
      router.back();
      return;
    }
    setJoining(true);
    try {
      await joinHall(code);
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      allowLeave();
      router.back();
    } catch (error) {
      setStatus({ kind: 'failed', message: describeAuthError(error, 'No pudimos unirte al Hall. Inténtalo nuevamente.') });
      setJoining(false);
    }
  };

  const wrong = status.kind === 'invalid' || status.kind === 'rejected';
  const found = status.kind === 'found';
  let buttonLabel = 'Unirse';
  if (status.kind === 'checking') buttonLabel = 'Comprobando…';
  else if (joining) buttonLabel = 'Uniéndote…';
  else if (status.kind === 'invalid') buttonLabel = 'Código inválido';
  else if (status.kind === 'rejected') buttonLabel = 'No puedes entrar a este Hall';
  else if (found) buttonLabel = status.hall.alreadyMember ? `Ya estás en “${status.hall.subject}”` : `Unirse a “${status.hall.subject} - ${status.hall.courseId}”`;

  // Closing with a code typed asks first; a found Hall can be joined from there.
  const canJoin = status.kind === 'found' && !status.hall.alreadyMember;
  const { allowLeave, dialog } = useUnsavedChangesGuard({
    dirty: code.length > 0 && !joining,
    onSave: join,
    saveLabel: 'Unirse',
    canSave: canJoin,
    title: '¿Salir sin unirte?',
    message: canJoin ? 'El código es válido, pero todavía no te unes al Hall.' : 'El código que escribiste se perderá.',
  });

  return (
    <ScrollView
      style={styles.sheet}
      contentContainerStyle={[styles.content, { paddingTop: (Platform.OS === 'android' ? 0 : insets.top) + AppSpacing.xxl, paddingBottom: insets.bottom + AppSpacing.xl }]}
      keyboardShouldPersistTaps="handled"
    >
      <Image source={LOGO} style={styles.logo} contentFit="contain" accessibilityLabel="HaNet ClassHall" />
      <ThemedText accessibilityRole="header" style={styles.title}>Unirse a un Hall</ThemedText>
      <ThemedText style={styles.lead}>
        Pide a tu profesor el código del Hall (o clase) y, luego, ingrésalo aquí abajo.
      </ThemedText>

      <View style={styles.divider} />

      <ThemedText style={styles.label}>Código del Hall (clase)</ThemedText>
      <Pressable accessible={false} onPress={() => input.current?.focus()} style={styles.boxes}>
        {BOXES.map(index => (
          <View key={index} style={[styles.box, index === code.length && styles.boxCurrent]}>
            <ThemedText style={[styles.boxText, found && styles.boxTextFound, wrong && styles.boxTextWrong]}>
              {code[index] ?? ''}
            </ThemedText>
          </View>
        ))}
        {/* One real field under the boxes: typing, pasting and deleting just work. */}
        <TextInput
          ref={input}
          accessibilityLabel="Código del Hall, 6 letras o números"
          value={code}
          onChangeText={changeCode}
          onSubmitEditing={join}
          autoFocus
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          spellCheck={false}
          maxLength={HALL_CODE_LENGTH}
          editable={!joining}
          caretHidden
          style={styles.hiddenInput}
        />
      </Pressable>

      <View style={styles.requirements}>
        <ThemedText style={styles.label}>Para acceder al Hall necesitas</ThemedText>
        <ThemedText style={styles.requirement}>•  Una cuenta vinculada al curso del Hall</ThemedText>
        <ThemedText style={styles.requirement}>•  Un código de Hall que tenga 6 letras o números, sin espacios ni símbolos</ThemedText>
      </View>

      <View style={styles.divider} />

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !found || joining, busy: status.kind === 'checking' || joining }}
        disabled={!found || joining}
        onPress={join}
        style={({ pressed }) => [styles.button, found && styles.buttonReady, wrong && styles.buttonWrong, pressed && styles.pressed]}
      >
        <ThemedText numberOfLines={1} style={[styles.buttonText, (found || wrong) && styles.buttonTextStrong]}>{buttonLabel}</ThemedText>
      </Pressable>

      {status.kind === 'rejected' && (
        <ThemedText accessibilityLiveRegion="assertive" style={styles.footnote}>
          Este Hall es de otro curso. Solo pueden entrar las cuentas vinculadas al curso del Hall.
        </ThemedText>
      )}
      {status.kind === 'invalid' && (
        <ThemedText accessibilityLiveRegion="assertive" style={styles.footnote}>
          Ese código no corresponde a ningún Hall. Revísalo con tu profesor.
        </ThemedText>
      )}
      {status.kind === 'failed' && (
        <ThemedText accessibilityLiveRegion="assertive" style={styles.footnote}>{status.message}</ThemedText>
      )}
      <Pressable
        accessibilityRole="button"
        onPress={() => router.back()}
        style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}
      >
        <ThemedText style={styles.cancelText}>Cancelar</ThemedText>
      </Pressable>
      {dialog}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: AppColors.surfaceSoft,
  },
  content: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    padding: AppSpacing.xl,
    gap: AppSpacing.md,
  },
  logo: {
    width: 102,
    height: 24,
  },
  title: {
    marginTop: AppSpacing.sm,
    fontFamily: 'DMSans_700Bold',
    fontSize: 24,
    lineHeight: 29,
    letterSpacing: -1.08,
    color: AppColors.textOnLight,
  },
  lead: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: -0.3,
    color: AppColors.textOnLight,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: AppColors.textOnLight,
    opacity: 0.4,
  },
  label: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: -0.3,
    color: AppColors.textOnLight,
  },
  boxes: {
    flexDirection: 'row',
    gap: AppSpacing.xs,
  },
  box: {
    flex: 1,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: AppRadii.md,
    borderCurve: 'continuous',
    borderWidth: 2,
    borderColor: AppColors.canvas,
    backgroundColor: AppColors.canvas,
  },
  boxCurrent: {
    borderColor: AppColors.primary,
  },
  boxText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 22,
    lineHeight: 28,
    color: AppColors.textPrimary,
  },
  boxTextFound: {
    color: '#7BE0A0',
  },
  boxTextWrong: {
    color: AppColors.errorText,
  },
  hiddenInput: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    opacity: 0,
  },
  requirements: {
    gap: AppSpacing.xs,
  },
  requirement: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: -0.3,
    color: AppColors.textOnLight,
  },
  button: {
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: AppSpacing.xl,
    borderRadius: AppRadii.pill,
    backgroundColor: '#8C97A8',
  },
  buttonReady: {
    backgroundColor: AppColors.primary,
  },
  buttonWrong: {
    backgroundColor: AppColors.accent,
  },
  buttonText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 15,
    lineHeight: 22,
    letterSpacing: -0.3,
    color: AppColors.textOnLight,
  },
  buttonTextStrong: {
    color: AppColors.textPrimary,
  },
  footnote: {
    textAlign: 'center',
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: -0.3,
    color: AppColors.errorTextOnLight,
  },
  cancel: {
    minHeight: 44,
    alignSelf: 'center',
    justifyContent: 'center',
    paddingHorizontal: AppSpacing.lg,
  },
  cancelText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.textOnLight,
  },
  pressed: {
    opacity: 0.7,
  },
});

export default withSheetFrame(JoinHallScreen, AppColors.surfaceSoft);
