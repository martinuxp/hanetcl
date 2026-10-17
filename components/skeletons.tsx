import { Skeleton, SkeletonGroup, SkeletonLines } from '@/components/ui/skeleton';
import { AppRadii, AppSpacing } from '@/constants/design-tokens';
import React from 'react';
import { StyleSheet, View } from 'react-native';

// What each screen looks like while it loads: the same blocks in the same
// places as the content, so nothing jumps when it arrives.

/** Home: the institution banner and the tiles (GridMenu's heights). */
export function HomeSkeleton({ grid = true }: { grid?: boolean }) {
  return (
    <SkeletonGroup>
      <View style={styles.homeBanner}>
        <Skeleton height={105} radius={AppRadii.xl} />
      </View>
      {grid && (
        <View style={styles.homeGrid}>
          <View style={styles.homeColumn}>
            {[148, 102, 82].map(height => <Skeleton key={height} height={height} radius={24} />)}
          </View>
          <View style={styles.homeColumn}>
            {[125, 74, 133].map(height => <Skeleton key={height} height={height} radius={24} />)}
          </View>
        </View>
      )}
    </SkeletonGroup>
  );
}

function EventCardSkeleton() {
  return (
    <View style={styles.eventCard}>
      <Skeleton height={208} radius={AppRadii.lg} />
      <View style={styles.eventInfo}>
        <View style={styles.eventText}>
          <Skeleton height={18} width="70%" radius={9} />
          <Skeleton height={13} width="50%" radius={7} />
        </View>
        <Skeleton height={32} width={84} radius={AppRadii.pill} />
      </View>
    </View>
  );
}

/** HaNet Eventos: the featured card (city events only) and a couple of events. */
export function EventsSkeleton({ featured }: { featured: boolean }) {
  return (
    <SkeletonGroup label="Cargando eventos" style={styles.events}>
      {featured && <Skeleton height={220} radius={AppRadii.xl} style={styles.eventsFeatured} />}
      <EventCardSkeleton />
      <EventCardSkeleton />
    </SkeletonGroup>
  );
}

/** A day of the Calendar: time badges beside event cards. */
export function CalendarDaySkeleton() {
  return (
    <SkeletonGroup label="Cargando eventos" style={styles.day}>
      {[132, 104, 132].map((height, index) => (
        <View key={index} style={styles.dayRow}>
          <View style={styles.dayTime}>
            <Skeleton width={52} height={30} radius={8} />
          </View>
          <Skeleton height={height} radius={24} style={styles.flex} tone="raised" />
        </View>
      ))}
    </SkeletonGroup>
  );
}

/** The HaNet ID: the identity card, the three actions and the link card. */
export function ProfileSkeleton() {
  return (
    <SkeletonGroup label="Cargando tu perfil" style={styles.profile}>
      <View style={styles.profileHeader}>
        <Skeleton width={96} height={24} radius={12} />
        <Skeleton width={56} height={40} radius={AppRadii.pill} />
      </View>
      <Skeleton height={570} radius={30}>
        <Skeleton height={356} radius={30} tone="muted" style={styles.profilePortrait} />
        <View style={styles.profileInfo}>
          <Skeleton height={34} width="75%" radius={12} tone="muted" />
          <Skeleton height={15} width="55%" radius={8} tone="muted" />
          <Skeleton height={13} width="35%" radius={7} tone="muted" />
        </View>
      </Skeleton>
      <View style={styles.profileActions}>
        {[0, 1, 2].map(index => <Skeleton key={index} height={118} radius={AppRadii.lg} style={styles.flex} />)}
      </View>
      <Skeleton height={88} radius={AppRadii.xl} />
    </SkeletonGroup>
  );
}

/** "Mis clases": a few Hall cards. */
export function HallListSkeleton() {
  return (
    <SkeletonGroup label="Cargando tus clases" style={styles.list}>
      {[0, 1, 2].map(index => (
        <Skeleton key={index} height={172} radius={AppRadii.lg}>
          <Skeleton height={116} radius={0} tone="muted" />
          <View style={styles.hallFooter}>
            <Skeleton height={14} width="45%" radius={7} tone="muted" />
          </View>
        </Skeleton>
      ))}
    </SkeletonGroup>
  );
}

/** Inside a Hall (and its tasks or evaluations): the hero card and tiles below it. */
export function HallSkeleton({ hero = true }: { hero?: boolean }) {
  return (
    <SkeletonGroup style={styles.list}>
      {hero && <Skeleton height={144} radius={AppRadii.xl} tone="raised" />}
      <View style={styles.row}>
        <Skeleton height={98} radius={AppRadii.lg} style={styles.flex} tone="raised" />
        <Skeleton height={98} radius={AppRadii.lg} style={styles.flex} />
      </View>
      {[0, 1].map(index => (
        <Skeleton key={index} height={98} radius={AppRadii.lg} style={styles.card}>
          <SkeletonLines lines={2} tone="muted" />
        </Skeleton>
      ))}
    </SkeletonGroup>
  );
}

/** An event's page: the photo, its name and when, and the main button. */
export function EventDetailSkeleton() {
  return (
    <SkeletonGroup label="Cargando evento" style={styles.detail}>
      <Skeleton height={208} radius={AppRadii.lg} tone="raised" />
      <View style={styles.detailHeading}>
        <Skeleton height={34} width="80%" radius={12} />
        <Skeleton height={16} width="55%" radius={8} />
      </View>
      <Skeleton height={48} radius={AppRadii.pill} />
      <Skeleton height={120} radius={AppRadii.lg} style={styles.card}>
        <SkeletonLines lines={3} tone="muted" />
      </Skeleton>
    </SkeletonGroup>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    gap: AppSpacing.md,
  },
  card: {
    justifyContent: 'center',
    padding: AppSpacing.lg,
  },
  homeBanner: {
    paddingHorizontal: 20,
    marginTop: 10,
    marginBottom: 24,
  },
  homeGrid: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  homeColumn: {
    flex: 1,
    gap: 12,
    marginHorizontal: 4,
  },
  events: {
    gap: AppSpacing.lg,
  },
  eventsFeatured: {
    marginBottom: AppSpacing.xxl,
  },
  eventCard: {
    gap: 5,
  },
  eventInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
    paddingHorizontal: AppSpacing.sm,
    paddingVertical: AppSpacing.xs,
  },
  eventText: {
    flex: 1,
    gap: 6,
  },
  day: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingTop: AppSpacing.sm,
  },
  dayRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  dayTime: {
    width: 60,
    alignItems: 'center',
    marginRight: 10,
  },
  profile: {
    gap: AppSpacing.md,
  },
  profileHeader: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  profilePortrait: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  profileInfo: {
    flex: 1,
    justifyContent: 'flex-end',
    gap: AppSpacing.sm,
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  profileActions: {
    flexDirection: 'row',
    gap: AppSpacing.sm,
  },
  list: {
    gap: AppSpacing.md,
  },
  hallFooter: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: AppSpacing.lg,
  },
  detail: {
    gap: AppSpacing.lg,
  },
  detailHeading: {
    gap: AppSpacing.sm,
  },
});
