import { AppColors, AppType } from '@/constants/design-tokens';
import React from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter } from 'expo-router';

// Premium Native Animated Icons
import { SparklesIcon } from '@/assets/animated-icons/sparks';
import { GraduationCapIcon } from '@/assets/animated-icons/graduation-cap';
import { HandCoinsIcon } from '@/assets/animated-icons/hand-coins';
import { MessageCircleIcon } from '@/assets/animated-icons/message-circle';
import { CalendarDaysIcon } from '@/assets/animated-icons/calendar';
import { Square2StackIcon } from '@/assets/animated-icons/tasks';

type GridItemProps = {
  title: string;
  IconComponent: React.ComponentType<any>;
  height: number;
  badgeText?: string;
  layout?: 'default' | 'side-badge';
  href?: any;
  iconSize?: number;
};

function GridItem({ title, IconComponent, height, badgeText, layout = 'default', href, iconSize }: GridItemProps) {
  const isSideBadge = layout === 'side-badge';
  const router = useRouter();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={href ? `Abrir ${title}` : 'Próximamente disponible'}
      accessibilityState={{ disabled: !href }}
      disabled={!href}
      style={({ pressed }) => [styles.gridItem, { minHeight: height }, pressed && styles.gridItemPressed, !href && styles.gridItemUnavailable]}
      onPress={() => {
        if (href) router.push(href);
      }}
    >
      {isSideBadge ? (
        <View style={styles.gridItemInnerSide}>
          <View style={styles.sideContent}>
            <View style={styles.iconContainerSide}>
              <IconComponent size={iconSize || 28} color={AppColors.textOnLight} />
            </View>
            <ThemedText style={styles.itemTitleSide}>{title}</ThemedText>
          </View>
          {badgeText && (
            <View style={styles.sideBadge}>
              <ThemedText style={styles.sideBadgeTextMain}>{badgeText}</ThemedText>
            </View>
          )}
        </View>
      ) : (
        <View style={[styles.gridItemInnerDefault, badgeText ? { paddingTop: 36 } : {}]}>
          {badgeText && (
            <View style={styles.topBadge}>
              <ThemedText style={styles.topBadgeText}>{badgeText}</ThemedText>
            </View>
          )}
          <View style={styles.iconContainerDefault}>
            <IconComponent size={iconSize || 32} color={AppColors.textOnLight} />
          </View>
          <ThemedText style={styles.itemTitleDefault}>{title}</ThemedText>
        </View>
      )}
    </Pressable>
  );
}

export default function GridMenu() {
  return (
    <View style={styles.container}>
      {/* Left Column */}
      <View style={styles.column}>
        <GridItem
          title="Eventos"
          IconComponent={SparklesIcon}
          height={148}
          href="/events"
        />
        <GridItem
          title="ClassHall"
          IconComponent={GraduationCapIcon}
          height={102}
          href="/classhall"
        />
        <GridItem
          title="HaNet Wallet"
          IconComponent={HandCoinsIcon}
          height={82}
          iconSize={26}
        />
      </View>

      {/* Right Column */}
      <View style={styles.column}>
        <GridItem
          title="Feed y comunidad"
          IconComponent={MessageCircleIcon}
          height={125}
          badgeText="¡Pronto disponible!"
          iconSize={25}
        />
        <GridItem
          title="Calendario"
          IconComponent={CalendarDaysIcon}
          height={74}
          layout="side-badge"
          href="/calendar"
          iconSize={26}
        />
        <GridItem
          title="Calificaciones y asistencias"
          IconComponent={Square2StackIcon}
          height={133}
          badgeText="¡Pronto disponible!"
          iconSize={28}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  column: {
    flex: 1,
    gap: 12,
    marginHorizontal: 4,
  },
  gridItem: {
    backgroundColor: AppColors.surfaceSoft,
    borderRadius: 24,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  gridItemPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.985 }],
  },
  gridItemUnavailable: {
    opacity: 0.82,
  },
  /* Default Layout Styles */
  gridItemInnerDefault: {
    flex: 1,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBadge: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 32,
    backgroundColor: AppColors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBadgeText: {
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: -0.2,
    fontFamily: 'DMSans_700Bold',
    color: AppColors.textSecondary,
  },
  iconContainerDefault: {
    marginBottom: 8,
  },
  itemTitleDefault: {
    color: AppColors.textOnLight,
    ...AppType.headline,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  /* Side Layout Styles */
  gridItemInnerSide: {
    flex: 1,
    flexDirection: 'row',
  },
  sideContent: {
    flex: 1,
    paddingLeft: 16,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  iconContainerSide: {
    marginBottom: 4,
  },
  itemTitleSide: {
    color: AppColors.textOnLight,
    ...AppType.headline,
    textAlign: 'left',
  },
  sideBadge: {
    width: 62,
    backgroundColor: AppColors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideBadgeTextMain: {
    fontSize: 13,
    lineHeight: 12.87,
    letterSpacing: -0.325,
    fontFamily: 'DMSans_700Bold',
    color: AppColors.textPrimary,
    marginBottom: 2,
  },
});
