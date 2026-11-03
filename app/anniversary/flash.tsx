import { BoltIcon } from '@/assets/animated-icons/crown';
import { AUDIENCE_OPTIONS, PointsFields, SheetActions, SheetBody, TextField, formStyles as styles } from '@/components/anniversary/anniversary-form';
import { ThemedText } from '@/components/themed-text';
import { HanetButton } from '@/components/ui/hanet-button';
import { HanetDialog } from '@/components/ui/hanet-dialog';
import { HanetChoice } from '@/components/ui/hanet-select';
import { withSheetFrame } from '@/components/ui/sheet-frame';
import { AppColors } from '@/constants/design-tokens';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { describeAuthError } from '@/services/auth-service';
import { launchFlashTest, peekAnniversary } from '@/services/anniversary-service';
import type { Audience } from '@/services/anniversary-service';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Platform } from 'react-native';
import { t } from '@/i18n';

/**
 * A flash test: a push to the leads (or to everyone in the alianzas) that a
 * test starts now. Its podium goes in afterwards, like any activity's.
 */
function FlashScreen() {
  const router = useRouter();
  const anniversary = peekAnniversary()?.anniversary;
  const places = Math.max(2, anniversary?.alliances.length ?? 4);
  const leads = anniversary?.alliances.reduce((sum, alliance) => sum + alliance.leadCount, 0) ?? 0;

  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [points, setPoints] = useState<string[]>(['3000', '2000', '1000', '500'].slice(0, places));
  const [audience, setAudience] = useState<Audience>(leads ? 'leads' : 'all');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<number | null>(null);

  const numbers = Array.from({ length: places }, (_, index) => Number(points[index] || 0));
  const ready = name.trim().length > 0 && text.trim().length > 0 && numbers.some(value => value > 0) && !(audience === 'leads' && !leads);

  const submit = async () => {
    if (!ready || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const count = await launchFlashTest({ name: name.trim(), text: text.trim(), points: numbers, audience });
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      allowLeave();
      setSent(count);
    } catch (saveError) {
      setError(describeAuthError(saveError, t('anniversary.flash.noPudimosLanzarLaPrueba')));
      setSubmitting(false);
    }
  };

  const { allowLeave, dialog } = useUnsavedChangesGuard({
    dirty: (!!name.trim() || !!text.trim()) && !submitting && sent === null,
    onSave: submit,
    saveLabel: t('anniversary.flash.lanzar'),
    canSave: ready,
    title: t('anniversary.flash.descartarLaPrueba'),
    message: t('anniversary.flash.todaviaNoLaHasLanzado'),
  });

  return (
    <SheetBody title={t('common.pruebaFlash')} icon={<BoltIcon size={26} color={AppColors.accentYellow} animated />} lead={t('anniversary.flash.llegaAlInstanteComoNotificacion')}>
      <TextField label={t('common.nombre')} value={name} onChange={value => { setName(value); setError(null); }} placeholder={t('anniversary.flash.traiganUnParaguasAmarillo')} disabled={submitting} autoFocus />
      <TextField label={t('anniversary.flash.queHayQueHacer')} value={text} onChange={value => { setText(value); setError(null); }} placeholder={t('anniversary.flash.laPrimeraAlianzaQueLlegue')} multiline maxLength={500} disabled={submitting} />
      <PointsFields label={t('anniversary.activity.puntosPorLugar')} points={points} count={places} onChange={setPoints} disabled={submitting} />
      <ThemedText style={styles.label}>{t('anniversary.flash.leLlegaA')}</ThemedText>
      <HanetChoice label={t('anniversary.deadline.aQuienLeLlega')} options={AUDIENCE_OPTIONS} value={audience} onChange={value => setAudience(value as Audience)} disabled={submitting} />
      {audience === 'leads' && !leads && <ThemedText style={styles.hint}>{t('anniversary.flash.todaviaNoHayJefesDe')}</ThemedText>}
      <SheetActions label={t('anniversary.flash.lanzarLaPrueba')} busyLabel={t('anniversary.flash.lanzando')} ready={ready} busy={submitting} onSubmit={submit} error={error} />
      <HanetDialog
        visible={sent !== null}
        onRequestClose={() => router.back()}
        title={t('anniversary.flash.pruebaLanzada')}
        body={sent ? t('anniversary.flash.laNotificacionLlegoACount', { count: sent }) : t('anniversary.flash.quedoEnElAniversarioPero')}
      >
        <HanetButton label={t('common.listo')} onPress={() => router.back()} />
      </HanetDialog>
      {dialog}
    </SheetBody>
  );
}

export default withSheetFrame(FlashScreen, AppColors.surface);
