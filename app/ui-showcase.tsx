import { AppColors, AppRadii, AppSpacing } from '@/constants/design-tokens';
import { ThemedText } from '@/components/themed-text';
import { AnimatedIcon } from '@/components/ui/AnimatedIcon';
import { CustomIcon } from '@/components/ui/custom-icon';
import { HanetButton } from '@/components/ui/hanet-button';
import { HanetChip } from '@/components/ui/hanet-chip';
import { NotificationCard, NotificationInfo } from '@/components/ui/notification-card';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeInRight, FadeOutLeft, useReducedMotion } from 'react-native-reanimated';

type PreviewMode = 'Inicio' | 'Eventos' | 'Calendario';

const previewNotifications: Record<PreviewMode, NotificationInfo> = {
  Inicio: {
    id: 'inicio',
    type: 'success',
    title: 'Todo en orden',
    description: 'Este es el estado base de una notificación positiva.',
  },
  Eventos: {
    id: 'eventos',
    type: 'warning',
    title: 'Evento próximo',
    description: 'Las alertas de actividades usan este tratamiento visual.',
  },
  Calendario: {
    id: 'calendario',
    type: 'danger',
    title: 'Evaluación pendiente',
    description: 'Los avisos importantes conservan contraste en el tema oscuro.',
  },
};

const previewIcon: Record<PreviewMode, React.ComponentProps<typeof CustomIcon>['name']> = {
  Inicio: 'home',
  Eventos: 'search',
  Calendario: 'calendar',
};

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText style={styles.sectionTitle}>{title}</ThemedText>
      <ThemedText style={styles.sectionDescription}>{description}</ThemedText>
      {children}
    </View>
  );
}

export default function UiShowcaseScreen() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const [selectedFilter, setSelectedFilter] = useState('Todos');
  const [previewMode, setPreviewMode] = useState<PreviewMode>('Inicio');
  const [disabled, setDisabled] = useState(false);

  const entering = reducedMotion ? undefined : FadeInRight.duration(220).easing(Easing.out(Easing.cubic));
  const exiting = reducedMotion ? undefined : FadeOutLeft.duration(130).easing(Easing.out(Easing.cubic));
  const notification = previewNotifications[previewMode];

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Volver a Inicio"
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <CustomIcon name="chevron-left" size={20} color={AppColors.controlOnActive} />
          </Pressable>
          <View style={styles.headerCopy}>
            <ThemedText style={styles.title}>Sistema UI</ThemedText>
            <ThemedText style={styles.subtitle}>Componentes y estados reales de HaNet</ThemedText>
          </View>
        </View>

        <Section title="Acciones" description="Botones largos, con radio completo y variantes del tema.">
          <View style={styles.buttonStack}>
            <HanetButton label="Acción principal" variant="primary" onPress={() => setDisabled(false)} icon={<CustomIcon name="check-circle" size={20} />} style={styles.fullButton} />
            <HanetButton label="Acción destacada" variant="accent" onPress={() => setDisabled((value) => !value)} icon={<CustomIcon name="notification" size={20} color={AppColors.textOnLight} />} style={styles.fullButton} />
            <HanetButton label={disabled ? 'Botón desactivado' : 'Desactivar ejemplo'} variant="surface" disabled={disabled} onPress={() => setDisabled(true)} icon={<CustomIcon name="star" size={20} />} style={styles.fullButton} />
          </View>
        </Section>

        <Section title="Chips" description="Selecciona un filtro para revisar el estado activo y su contraste.">
          <View style={styles.chipWrap}>
            {['Todos', 'Música', 'Conciertos', 'Expos'].map((label) => (
              <HanetChip
                key={label}
                label={label}
                selected={selectedFilter === label}
                onPress={() => setSelectedFilter(label)}
                compact={label === 'Expos'}
              />
            ))}
          </View>
        </Section>

        <Section title="Navegación contextual" description="La previsualización usa la misma transición que cambia los controles de la tab bar.">
          <View style={styles.chipWrap}>
            {(Object.keys(previewNotifications) as PreviewMode[]).map((mode) => (
              <HanetChip key={mode} label={mode} selected={previewMode === mode} onPress={() => setPreviewMode(mode)} />
            ))}
          </View>
          <View style={styles.previewSurface}>
            <Animated.View key={previewMode} entering={entering} exiting={exiting} style={styles.previewContent}>
              <View style={styles.previewIcon}>
                <CustomIcon name={previewIcon[previewMode]} size={22} color={AppColors.controlOnActive} />
              </View>
              <View>
                <ThemedText style={styles.previewTitle}>{previewMode}</ThemedText>
                <ThemedText style={styles.previewDescription}>
                  {previewMode === 'Eventos' ? 'Atrás · Buscar · Perfil' : previewMode === 'Calendario' ? 'Atrás · Crear · Perfil' : 'Inicio · HaNet · Perfil'}
                </ThemedText>
              </View>
            </Animated.View>
          </View>
        </Section>

        <Section title="Iconos en movimiento" description="Estados de atención: pulso, flotación y aviso. Se pueden observar sin alterar datos.">
          <View style={styles.iconRow}>
            <View style={styles.iconExample}><AnimatedIcon name="notification" size={26} color={AppColors.accent} animationType="wiggle" /><ThemedText style={styles.iconLabel}>Aviso</ThemedText></View>
            <View style={styles.iconExample}><AnimatedIcon name="calendar" size={26} color={AppColors.textPrimary} animationType="float" /><ThemedText style={styles.iconLabel}>Flotar</ThemedText></View>
            <View style={styles.iconExample}><AnimatedIcon name="star" size={26} color={AppColors.controlActive} animationType="pulse" /><ThemedText style={styles.iconLabel}>Pulso</ThemedText></View>
          </View>
        </Section>

        <Section title="Aviso" description="La misma tarjeta que aparece desde la píldora de notificaciones de la barra.">
          <View style={styles.notificationPreview}>
            <Animated.View key={notification.id} entering={entering} exiting={exiting}>
              <NotificationCard notification={notification} />
            </Animated.View>
          </View>
        </Section>

        <Section title="Tokens base" description="Colores semánticos que sostienen el tema oscuro actual.">
          <View style={styles.tokenRow}>
            <View style={[styles.swatch, { backgroundColor: AppColors.canvas }]}><ThemedText style={styles.swatchText}>Canvas</ThemedText></View>
            <View style={[styles.swatch, { backgroundColor: AppColors.surface }]}><ThemedText style={styles.swatchText}>Surface</ThemedText></View>
            <View style={[styles.swatch, { backgroundColor: AppColors.controlActive }]}><ThemedText style={[styles.swatchText, styles.swatchTextDark]}>Activo</ThemedText></View>
            <View style={[styles.swatch, { backgroundColor: AppColors.accent }]}><ThemedText style={[styles.swatchText, styles.swatchTextDark]}>Accent</ThemedText></View>
          </View>
        </Section>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: AppColors.canvas },
  content: { padding: AppSpacing.lg, paddingBottom: 150, gap: AppSpacing.xxl },
  header: { flexDirection: 'row', alignItems: 'center', gap: AppSpacing.md, paddingTop: AppSpacing.sm },
  backButton: { width: 44, height: 44, borderRadius: AppRadii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: AppColors.controlActive },
  headerCopy: { flex: 1 },
  title: { color: AppColors.textPrimary, fontFamily: 'DMSans_700Bold', fontSize: 28, lineHeight: 34, letterSpacing: -0.7 },
  subtitle: { color: AppColors.textSecondary, fontFamily: 'DMSans_500Medium', fontSize: 14, lineHeight: 20 },
  section: { gap: AppSpacing.md },
  sectionTitle: { color: AppColors.textPrimary, fontFamily: 'DMSans_700Bold', fontSize: 20, lineHeight: 26, letterSpacing: -0.4 },
  sectionDescription: { color: AppColors.textSecondary, fontFamily: 'DMSans_400Regular', fontSize: 14, lineHeight: 20 },
  buttonStack: { gap: AppSpacing.sm },
  fullButton: { width: '100%' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: AppSpacing.sm },
  previewSurface: { minHeight: 88, borderRadius: AppRadii.lg, overflow: 'hidden', backgroundColor: AppColors.surface, justifyContent: 'center', padding: AppSpacing.lg },
  previewContent: { flexDirection: 'row', alignItems: 'center', gap: AppSpacing.md },
  previewIcon: { width: 44, height: 44, borderRadius: AppRadii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: AppColors.controlActive },
  previewTitle: { color: AppColors.textPrimary, fontFamily: 'DMSans_700Bold', fontSize: 16, lineHeight: 22 },
  previewDescription: { color: AppColors.textSecondary, fontFamily: 'DMSans_500Medium', fontSize: 13, lineHeight: 18 },
  iconRow: { flexDirection: 'row', gap: AppSpacing.sm },
  iconExample: { flex: 1, minHeight: 96, borderRadius: AppRadii.lg, backgroundColor: AppColors.surface, alignItems: 'center', justifyContent: 'center', gap: AppSpacing.sm },
  iconLabel: { color: AppColors.textSecondary, fontFamily: 'DMSans_500Medium', fontSize: 12 },
  notificationPreview: { minHeight: 98, borderRadius: AppRadii.lg, backgroundColor: AppColors.surfaceRaised, overflow: 'hidden', justifyContent: 'center' },
  tokenRow: { flexDirection: 'row', gap: AppSpacing.sm },
  swatch: { flex: 1, height: 76, borderRadius: AppRadii.md, justifyContent: 'flex-end', padding: AppSpacing.sm },
  swatchText: { color: AppColors.textPrimary, fontFamily: 'DMSans_700Bold', fontSize: 11 },
  swatchTextDark: { color: AppColors.controlOnActive },
});
