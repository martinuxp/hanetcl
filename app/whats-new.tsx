import { ThemedText } from '@/components/themed-text';
import { APP_VERSION_LABEL } from '@/constants/app-version';
import CHANGELOG from '@/constants/changelog.json';
import { AppColors, AppRadii, AppSpacing, AppType } from '@/constants/design-tokens';
import React from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Every PR adds its release on top (scripts/version.js keeps it in step with app.json).
type Release = (typeof CHANGELOG.releases)[number];

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function formatDate(iso: string) {
  const [year, month, day] = iso.split('-').map(Number);
  return month ? `${day} ${MONTHS[month - 1]} ${year}` : iso;
}

export default function WhatsNewScreen() {
  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <FlatList
        data={CHANGELOG.releases}
        keyExtractor={item => item.version}
        contentContainerStyle={styles.page}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.header}>
            <ThemedText style={styles.eyebrow}>Configuraciones</ThemedText>
            <ThemedText accessibilityRole="header" style={styles.title}>Novedades</ThemedText>
            <ThemedText style={styles.intro}>Tienes HaNet {APP_VERSION_LABEL}. Esto es lo que cambió en cada versión.</ThemedText>
          </View>
        }
        ItemSeparatorComponent={Separator}
        renderItem={({ item, index }) => <ReleaseCard release={item} current={index === 0} />}
      />
    </SafeAreaView>
  );
}

function ReleaseCard({ release, current }: { release: Release; current: boolean }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <ThemedText style={styles.version}>v{release.version}</ThemedText>
        {current && (
          <View style={styles.badge}>
            <ThemedText style={styles.badgeText}>Actual</ThemedText>
          </View>
        )}
        <ThemedText style={styles.date}>{formatDate(release.date)}</ThemedText>
      </View>
      {!!release.title && <ThemedText style={styles.releaseTitle}>{release.title}</ThemedText>}
      <View style={styles.items}>
        {release.items.map(item => (
          <View key={item} style={styles.item}>
            <View style={styles.dot} />
            <ThemedText style={styles.itemText}>{item}</ThemedText>
          </View>
        ))}
      </View>
    </View>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: AppColors.canvas },
  page: { width: '100%', maxWidth: 430, alignSelf: 'center', paddingHorizontal: AppSpacing.lg, paddingBottom: 150 },

  header: { paddingTop: AppSpacing.lg, paddingBottom: AppSpacing.xl, gap: AppSpacing.xs },
  eyebrow: { ...AppType.caption, color: AppColors.textSecondary },
  title: { ...AppType.title1, color: AppColors.textPrimary },
  intro: { ...AppType.footnote, color: AppColors.textSecondary, marginTop: AppSpacing.sm },

  card: { gap: AppSpacing.md, padding: AppSpacing.lg, borderRadius: AppRadii.xl, borderCurve: 'continuous', backgroundColor: AppColors.surface },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: AppSpacing.sm },
  version: { ...AppType.headline, color: AppColors.textPrimary },
  badge: { paddingHorizontal: AppSpacing.sm, paddingVertical: 2, borderRadius: AppRadii.pill, backgroundColor: AppColors.accent },
  badgeText: { ...AppType.caption, fontFamily: 'DMSans_700Bold', color: AppColors.controlOnActive },
  date: { ...AppType.caption, color: AppColors.textSecondary, marginLeft: 'auto' },
  releaseTitle: { ...AppType.callout, fontFamily: 'DMSans_700Bold', color: AppColors.textPrimary },
  items: { gap: AppSpacing.sm },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: AppSpacing.sm },
  dot: { width: 6, height: 6, marginTop: 8, borderRadius: AppRadii.pill, backgroundColor: AppColors.accent },
  itemText: { ...AppType.footnote, flex: 1, color: AppColors.textPrimary },
  separator: { height: AppSpacing.md },
});
