import { AppColors, AppFlexFonts, AppType } from '@/constants/design-tokens';
import React from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter } from 'expo-router';
import { MarqueeLine } from '@/components/events/event-ui';
import { eventDay } from '@/services/events-service';
import type { HnEvent } from '@/services/events-service';
import type { NextCalendarItem } from '@/hooks/use-home-highlights';

// Premium Native Animated Icons
import { SparklesIcon } from '@/assets/animated-icons/sparks';
import { GraduationCapIcon } from '@/assets/animated-icons/graduation-cap';
import { MessageCircleIcon } from '@/assets/animated-icons/message-circle';
import { CalendarDaysIcon } from '@/assets/animated-icons/calendar';
import { HammerIcon, TrophyIcon } from '@/assets/animated-icons/trophy';
import { allianceColor } from '@/components/anniversary/anniversary-ui';
import { CelebrationTile } from '@/components/anniversary/celebration-tile';
import { anniversaryDay, daysTo, formatPoints, phaseOf, ranking, todaysActivities } from '@/services/anniversary-service';
import { useWelcomeSeen } from '@/services/anniversary-welcome';
import type { AnniversaryState } from '@/services/anniversary-service';

type SideBadge = { main: string; sub: string; label: string; onPress: () => void };

type GridItemProps = {
  title: string;
  IconComponent: React.ComponentType<any>;
  height: number;
  badgeText?: string;
  layout?: 'default' | 'side-badge';
  sideBadge?: SideBadge | null;
  topStrip?: React.ReactNode;
  href?: any;
  iconSize?: number;
};

function GridItem({ title, IconComponent, height, badgeText, layout = 'default', sideBadge, topStrip, href, iconSize }: GridItemProps) {
  const isSideBadge = layout === 'side-badge';
  const router = useRouter();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={href ? `Abrir ${title}` : 'Próximamente'}
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
          {sideBadge && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={sideBadge.label}
              onPress={sideBadge.onPress}
              style={({ pressed }) => [styles.sideBadge, pressed && styles.sideBadgePressed]}
            >
              <ThemedText numberOfLines={1} style={styles.sideBadgeTextMain}>{sideBadge.main}</ThemedText>
              <ThemedText numberOfLines={1} style={styles.sideBadgeTextSub}>{sideBadge.sub}</ThemedText>
            </Pressable>
          )}
        </View>
      ) : (
        <View style={[styles.gridItemInnerDefault, badgeText ? { paddingTop: 36 } : topStrip ? { paddingTop: 41 } : {}]}>
          {topStrip}
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

// Figma "Promo - evento promocionado": the city's featured event slides
// across the top of the Eventos tile, tilted like the strip on Eventos.
function PromoStrip({ event }: { event: HnEvent }) {
  const router = useRouter();
  const [now] = React.useState(() => Date.now());
  const day = eventDay(event.startsAt, now);
  const when = day.charAt(0).toUpperCase() + day.slice(1);
  const main = `¡${when}! - ¡${event.title}! -`;
  const place = `${event.venueName || event.city} -`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${event.sponsored ? 'Evento promocionado' : 'Próximo evento'}: ${event.title}, ${when}, ${event.venueName || event.city}. Abrir`}
      onPress={() => router.push({ pathname: '/event-detail', params: { id: event.id } })}
      style={({ pressed }) => [styles.promoStrip, pressed && styles.sideBadgePressed]}
    >
      <View style={styles.promoTilt}>
        <MarqueeLine text={place} top={-6} color={AppColors.textSecondary} opacity={0.5} duration={20000} reverse />
        <MarqueeLine text={main} top={10} color={AppColors.textPrimary} opacity={1} duration={14000} />
        <MarqueeLine text={place} top={26} color={AppColors.textSecondary} opacity={0.5} duration={20000} reverse />
      </View>
    </Pressable>
  );
}

// The Aniversario tile's band: the countdown before it starts, who leads (or
// what happens today) during it, and the winner once it ends. Its color is
// the leader's, or one's own alianza's.
function anniversaryBand(state: AnniversaryState | null | undefined, now: number) {
  const anniversary = state?.anniversary;
  if (!anniversary) return null;
  const mine = anniversary.alliances.find(alliance => alliance.id === anniversary.myAllianceId) ?? null;
  const [leader] = ranking(anniversary);
  const scored = !!leader && leader.total !== null && leader.total > 0;
  const phase = phaseOf(anniversary, now);
  if (phase === 'before') {
    const days = daysTo(anniversary.startsAt, now);
    const when = days <= 0 ? '¡Empieza hoy!' : days === 1 ? 'Empieza mañana' : `Faltan ${days} días`;
    return { text: mine ? `${mine.name} - ${when}` : when, alliance: mine };
  }
  if (phase === 'after') {
    return scored ? { text: `¡Ganó ${leader.name}!`, alliance: leader } : { text: 'Terminó el aniversario', alliance: mine };
  }
  // The Home's carousel already shows the score: one's alianza and the time left.
  if (mine) {
    const left = daysTo(anniversary.endsAt, now);
    return { text: `${mine.name} - ${left <= 0 ? '¡Último día!' : left === 1 ? 'Queda 1 día' : `Quedan ${left} días`}`, alliance: mine };
  }
  if (scored) return { text: `${leader.name} lidera · ${formatPoints(leader.total ?? 0)}`, alliance: leader };
  const [next] = todaysActivities(anniversary, now).filter(activity => (activity.startsAt ?? 0) >= now - 60 * 60 * 1000);
  if (next?.startsAt) {
    const date = new Date(next.startsAt);
    return { text: `Hoy ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')} · ${next.name}`, alliance: mine };
  }
  return { text: '¡Estamos de aniversario!', alliance: mine };
}

// Tilted and sliding like the Eventos strip, in Google Sans Flex.
function AnniversaryStrip({ text, alliance }: NonNullable<ReturnType<typeof anniversaryBand>>) {
  const color = alliance ? allianceColor(alliance) : null;
  const ink = color?.ink ?? AppColors.textPrimary;
  const main = `${text.toLocaleUpperCase('es')} -`;
  return (
    <View style={[styles.promoStrip, color && { backgroundColor: color.fill }]}>
      <View style={styles.promoTilt}>
        <MarqueeLine text={main} top={-6} color={ink} opacity={0.35} duration={20000} reverse fontFamily={AppFlexFonts.bold} />
        <MarqueeLine text={main} top={10} color={ink} opacity={1} duration={14000} fontFamily={AppFlexFonts.bold} />
        <MarqueeLine text={main} top={26} color={ink} opacity={0.35} duration={20000} reverse fontFamily={AppFlexFonts.bold} />
      </View>
    </View>
  );
}

// Figma "Alerta (próximo evento evaluación)": how many days to the course's
// next evaluation, or to whatever comes next when there is none.
function calendarBadge(item: NextCalendarItem, open: () => void): SideBadge {
  const main = item.days === 0 ? 'Hoy' : item.days === 1 ? 'Mañana' : `${item.days} días`;
  const when = item.days > 1 ? `en ${main}` : main.toLocaleLowerCase('es');
  return {
    main,
    sub: item.isEvaluation ? 'Próx. eval.' : 'Próx.',
    label: `Próxima ${item.isEvaluation ? 'evaluación' : 'actividad'}: ${item.event.title}, ${when}. Abrir`,
    onPress: open,
  };
}

type GridMenuProps = {
  nextCalendarItem?: NextCalendarItem | null;
  promotedEvent?: HnEvent | null;
  anniversary?: AnniversaryState | null;
};

export default function GridMenu({ nextCalendarItem, promotedEvent, anniversary }: GridMenuProps) {
  const router = useRouter();
  const [now] = React.useState(() => Date.now());
  const band = anniversaryBand(anniversary, now);
  // Once it has started, until this device opens it, the tile celebrates.
  const running = anniversary?.anniversary && phaseOf(anniversary.anniversary, now) === 'during' ? anniversary.anniversary : null;
  const welcomeSeen = useWelcomeSeen(running?.id);
  const celebrate = running && welcomeSeen === false ? running : null;
  const openCalendarItem = (item: NextCalendarItem) => router.push({ pathname: '/event-info', params: { id: item.event.id, canEdit: '0' } });
  return (
    <View style={styles.container}>
      {/* Left Column */}
      <View style={styles.column}>
        <GridItem
          title="Eventos"
          IconComponent={SparklesIcon}
          height={148}
          href="/events"
          topStrip={promotedEvent ? <PromoStrip event={promotedEvent} /> : null}
        />
        <GridItem
          title="ClassHall"
          IconComponent={GraduationCapIcon}
          height={102}
          href="/classhall"
        />
        <GridItem
          title="En construcción"
          IconComponent={HammerIcon}
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
          href="/feed"
          iconSize={25}
        />
        <GridItem
          title="Calendario"
          IconComponent={CalendarDaysIcon}
          height={74}
          layout="side-badge"
          sideBadge={nextCalendarItem ? calendarBadge(nextCalendarItem, () => openCalendarItem(nextCalendarItem)) : null}
          href="/calendar"
          iconSize={26}
        />
        {celebrate ? (
          <CelebrationTile
            anniversary={celebrate}
            day={(({ day, total }) => `Día ${day} de ${total}`)(anniversaryDay(celebrate, now))}
            height={133}
          />
        ) : (
          <GridItem
            title="Aniversario"
            IconComponent={TrophyIcon}
            height={133}
            href="/anniversary"
            topStrip={band ? <AnniversaryStrip {...band} /> : null}
            iconSize={28}
          />
        )}
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
  sideBadgePressed: {
    opacity: 0.8,
  },
  sideBadgeTextMain: {
    fontSize: 13,
    lineHeight: 16,
    letterSpacing: -0.325,
    fontFamily: 'DMSans_500Medium',
    color: AppColors.textPrimary,
  },
  sideBadgeTextSub: {
    fontSize: 10,
    lineHeight: 12,
    letterSpacing: -0.25,
    fontFamily: 'DMSans_500Medium',
    color: AppColors.textPrimary,
    opacity: 0.7,
  },
  /* Aniversario band */
  /* Promo strip (Eventos) */
  promoStrip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 37,
    overflow: 'hidden',
    backgroundColor: AppColors.surfaceMuted,
  },
  promoTilt: {
    flex: 1,
    transform: [{ rotate: '-4.19deg' }, { scale: 1.1 }],
  },
});
