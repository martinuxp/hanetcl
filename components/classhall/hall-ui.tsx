import { ThemedText } from '@/components/themed-text';
import { AppColors, AppPressed, AppRadii, AppSpacing, AppTouch } from '@/constants/design-tokens';
import { hallThemeImage } from '@/services/classhall-service';
import type { Hall } from '@/services/classhall-service';
import { Image } from 'expo-image';
import type { ImageSource } from 'expo-image';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

export const HALL_ICONS = {
  back: require('@/assets/icons/event/arrow-left-long.svg'),
  calendar: require('@/assets/icons/classhall/calendar.svg'),
  tasks: require('@/assets/icons/classhall/task-list.svg'),
  warning: require('@/assets/icons/classhall/warning-triangle.svg'),
  verified: require('@/assets/icons/classhall/verified.svg'),
  badge: require('@/assets/icons/classhall/badge-check.svg'),
  document: require('@/assets/icons/classhall/submit-document.svg'),
  logotype: require('@/assets/icons/classhall/logotype-classhall.svg'),
} as const;

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function capitalize(text: string) {
  return text.charAt(0).toLocaleUpperCase('es') + text.slice(1);
}

/** "27 Abril", as the Hall writes its dates. */
export function hallDay(ms: number) {
  const date = new Date(ms);
  return `${date.getDate()} ${capitalize(MONTHS[date.getMonth()])}`;
}

/** "27/04/26". */
export function hallShortDate(ms: number) {
  const date = new Date(ms);
  const two = (value: number) => String(value).padStart(2, '0');
  return `${two(date.getDate())}/${two(date.getMonth() + 1)}/${two(date.getFullYear() % 100)}`;
}

/** "lunes 27 de abril, 10:15". */
export function hallLongDate(ms: number) {
  const date = new Date(ms);
  const weekday = date.toLocaleDateString('es-CL', { weekday: 'long' });
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return `${weekday} ${date.getDate()} de ${MONTHS[date.getMonth()]}, ${time}`;
}

/** Whole days from today to that date (0 = today). */
export function daysUntil(ms: number) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const day = new Date(ms);
  day.setHours(0, 0, 0, 0);
  return Math.round((day.getTime() - start.getTime()) / 86_400_000);
}

export function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.getTime();
}

/** Round grey button of the top bar (back, calendar). */
export function TopBarButton({ icon, label, onPress, wide }: { icon: ImageSource; label: string; onPress: () => void; wide?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [styles.topButton, wide && styles.topButtonWide, pressed && AppPressed]}
    >
      <Image source={icon} style={wide ? styles.icon20 : styles.icon24} contentFit="contain" tintColor={AppColors.textSecondary} />
    </Pressable>
  );
}

/** The Hall's illustrated header: subject, course and teacher. */
export function HallHero({ hall }: { hall: Pick<Hall, 'subject' | 'courseId' | 'teacherName' | 'theme'> }) {
  return (
    <View style={styles.hero} accessible accessibilityRole="header" accessibilityLabel={`${hall.subject}, ${hall.courseId}, ${hall.teacherName}`}>
      <Image source={hallThemeImage(hall.theme)} style={StyleSheet.absoluteFill} contentFit="cover" />
      <View style={styles.heroShade} />
      <View style={styles.heroText}>
        <ThemedText numberOfLines={1} style={styles.heroSubject}>{hall.subject}</ThemedText>
        <ThemedText numberOfLines={1} style={styles.heroCourse}>{hall.courseId}</ThemedText>
      </View>
      <ThemedText numberOfLines={1} style={styles.heroTeacher}>{hall.teacherName.toLocaleUpperCase('es')}</ThemedText>
    </View>
  );
}

type TileProps = {
  icon: ImageSource;
  title: string;
  subtitle?: string;
  /** Accent (pink) or primary (slate). */
  tone: 'accent' | 'primary';
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  iconSize?: number;
  /** Smaller second line, for narrow tiles. */
  compact?: boolean;
};

/** Square call to action with an icon over one or two lines, as in the Hall's cards. */
export function HallTile({ icon, title, subtitle, tone, onPress, accessibilityLabel, style, iconSize = 24, compact }: TileProps) {
  const color = tone === 'accent' ? AppColors.textOnLight : AppColors.textPrimary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? [title, subtitle].filter(Boolean).join(', ')}
      accessibilityState={{ disabled: !onPress }}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, tone === 'accent' ? styles.tileAccent : styles.tilePrimary, pressed && AppPressed, style]}
    >
      <View style={styles.tileIcon}>
        <Image source={icon} style={{ width: iconSize, height: iconSize }} contentFit="contain" tintColor={color} />
      </View>
      <ThemedText numberOfLines={2} style={[styles.tileTitle, { color }]}>{title}</ThemedText>
      {!!subtitle && <ThemedText numberOfLines={1} style={[styles.tileSubtitle, compact && styles.tileSubtitleCompact, { color }]}>{subtitle}</ThemedText>}
    </Pressable>
  );
}

/** Small pill for the teacher's actions on what they published. */
export function HallPill({ label, onPress, tone = 'surface', disabled }: { label: string; onPress: () => void; tone?: 'surface' | 'light'; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [styles.pill, tone === 'light' && styles.pillLight, disabled && styles.pillDisabled, pressed && AppPressed]}
    >
      <ThemedText style={[styles.pillText, tone === 'light' && styles.pillTextLight]}>{label}</ThemedText>
    </Pressable>
  );
}

export const hallStyles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
    paddingVertical: AppSpacing.md,
  },
  logotype: {
    flex: 1,
    height: 17.5627,
    maxWidth: 232,
  },
});

const styles = StyleSheet.create({
  topButton: {
    height: 40,
    minWidth: 56,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: AppSpacing.lg,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.surface,
  },
  topButtonWide: {
    width: 57,
  },
  icon24: {
    width: 24,
    height: 24,
  },
  icon20: {
    width: 20,
    height: 20,
  },
  hero: {
    height: 144,
    justifyContent: 'space-between',
    padding: AppSpacing.xxl,
    overflow: 'hidden',
    borderRadius: AppRadii.xl,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  heroShade: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.18)',
  },
  // The subject runs over the illustration, as in Figma, and is cut with an ellipsis.
  heroText: {
    paddingRight: '8%',
  },
  heroSubject: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 24,
    lineHeight: 28,
    letterSpacing: -0.96,
    color: AppColors.textPrimary,
  },
  heroCourse: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: -0.56,
    color: AppColors.textPrimary,
  },
  heroTeacher: {
    paddingRight: '30%',
    fontFamily: 'DMSans_400Regular',
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: -0.44,
    color: AppColors.textPrimary,
  },
  tile: {
    minHeight: 98,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: AppSpacing.sm,
    paddingBottom: AppSpacing.lg,
    paddingHorizontal: AppSpacing.sm,
    borderRadius: AppRadii.lg,
    borderCurve: 'continuous',
  },
  tileAccent: {
    backgroundColor: AppColors.accent,
  },
  tilePrimary: {
    backgroundColor: AppColors.primary,
  },
  tileIcon: {
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileTitle: {
    textAlign: 'center',
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 16,
    lineHeight: 18,
    letterSpacing: -0.4,
  },
  tileSubtitle: {
    textAlign: 'center',
    opacity: 0.7,
    fontFamily: 'DMSans_500Medium',
    fontSize: 16,
    lineHeight: 18,
    letterSpacing: -0.4,
  },
  tileSubtitleCompact: {
    fontSize: 12,
    lineHeight: 18,
    letterSpacing: -0.2,
  },
  pill: {
    minHeight: AppTouch.minimum - 8,
    justifyContent: 'center',
    paddingHorizontal: AppSpacing.lg,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.surfaceMuted,
  },
  pillLight: {
    backgroundColor: AppColors.controlActive,
  },
  pillDisabled: {
    opacity: 0.5,
  },
  pillText: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: -0.35,
    color: AppColors.textPrimary,
  },
  pillTextLight: {
    color: AppColors.controlOnActive,
  },
});
