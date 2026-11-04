import { ThemedText } from '@/components/themed-text';
import { AreaIcon, FIELD_AREA, KnowledgeIcon } from '@/components/tools/area-icon';
import { FrostedScreen, withTopInset } from '@/components/ui/frosted-screen';
import { HanetButton } from '@/components/ui/hanet-button';
import { AppColors, AppPressed, AppRadii, AppSpacing, AppType } from '@/constants/design-tokens';
import { allAttempts, currentResult, formatDuration, getElectividad, headline, peekElectividad } from '@/services/electividad-service';
import type { AreaScore, ElectividadAttempt, ElectividadResult } from '@/services/electividad-service';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '@/i18n';

// The full result of HaNet Electividad: the top three, how the answers split,
// every area by group, related careers and the most telling comparisons.

const TINT = 'rgba(239,34,116,0.18)';
const FIELD_COLORS = ['#EF2274', '#DDDDE2', '#7D7C82'];
const GROUPS: { id: AreaScore['group']; label: string; color: string }[] = [
  { id: 'alto', label: t('tools.electividad.result.mayorInteres'), color: '#EF2274' },
  { id: 'medio', label: t('tools.electividad.result.interesIntermedio'), color: '#DDDDE2' },
  { id: 'bajo', label: t('tools.electividad.result.menorInteres'), color: '#7D7C82' },
];
const MIFUTURO_URL = 'https://www.mifuturo.cl/buscador-de-empleabilidad-e-ingresos/';

function list(names: string[]) {
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}` : names.join('');
}

function answeredText(at: number | null) {
  if (!at) return t('anniversary.detail.resultado');
  try {
    return t('tools.electividad.result.respondidoElLocaledatestring', { localeDateString: new Date(at).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' }) });
  } catch {
    return t('anniversary.detail.resultado');
  }
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <ThemedText accessibilityRole="header" style={styles.sectionTitle}>{title}</ThemedText>
        {!!subtitle && <ThemedText style={styles.sectionSubtitle}>{subtitle}</ThemedText>}
      </View>
      {children}
    </View>
  );
}

function Stats({ result }: { result: ElectividadResult }) {
  const perQuestion = result.durationSec ? Math.round(result.durationSec / 72) : 0;
  const stats = [
    { label: t('tools.electividad.result.consistencia'), value: `${result.consistency.percent}%`, sub: t('tools.electividad.result.sameDeOfPares', { same: result.consistency.same, of: result.consistency.of }) },
    { label: t('eventInfo.duracion'), value: formatDuration(result.durationSec), sub: perQuestion ? t('tools.electividad.result.perquestionSPorPregunta', { perQuestion }) : t('tools.electividad.result.sinRegistro') },
    { label: t('layout.perfil'), value: result.profile === 'definido' ? 'Definido' : 'Amplio', sub: result.profile === 'definido' ? t('tools.electividad.result.top3Destacado') : t('tools.electividad.result.interesesRepartidos') },
  ];
  return (
    <View style={styles.stats}>
      {stats.map(stat => (
        <View key={stat.label} style={styles.stat} accessible accessibilityLabel={`${stat.label}: ${stat.value}. ${stat.sub}`}>
          <ThemedText style={styles.statLabel}>{stat.label}</ThemedText>
          <ThemedText style={styles.statValue}>{stat.value}</ThemedText>
          <ThemedText style={styles.statSub}>{stat.sub}</ThemedText>
        </View>
      ))}
    </View>
  );
}

function Distribution({ result }: { result: ElectividadResult }) {
  return (
    <Section title={t('tools.electividad.result.distribucionPorAmbito')} subtitle={t('tools.electividad.result.porcentajeDeTus72Elecciones')}>
      <View style={styles.card}>
        <View style={styles.stack} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {result.fields.map((field, index) => (
            <View key={field.id} style={{ flex: Math.max(field.percent, 1), backgroundColor: FIELD_COLORS[index] }} />
          ))}
        </View>
        {result.fields.map((field, index) => (
          <View key={field.id} style={styles.legendRow} accessible accessibilityLabel={t('tools.electividad.result.namePercentPorCientoList', { name: field.name, percent: field.percent, list: list(field.areas) })}>
            <View style={[styles.legendIcon, index === 0 && styles.legendIconTop]}>
              <AreaIcon area={FIELD_AREA[field.id]} size={20} color={index === 0 ? AppColors.accent : AppColors.textPrimary} />
            </View>
            <View style={styles.legendText}>
              <View style={styles.legendHead}>
                <View style={[styles.dot, { backgroundColor: FIELD_COLORS[index] }]} />
                <ThemedText style={styles.legendName}>{field.name}</ThemedText>
                <ThemedText style={styles.legendPercent}>{field.percent}%</ThemedText>
              </View>
              <ThemedText style={styles.legendAreas}>{list(field.areas)}</ThemedText>
            </View>
          </View>
        ))}
      </View>
    </Section>
  );
}

function Change({ delta }: { delta: number }) {
  if (!delta) return null;
  const up = delta > 0;
  return (
    <View style={[styles.change, up && styles.changeUp]}>
      <Ionicons name={up ? 'caret-up' : 'caret-down'} size={10} color={AppColors.textPrimary} />
      <ThemedText style={styles.changeText}>{Math.abs(delta)}</ThemedText>
    </View>
  );
}

function Groups({ result, previous }: { result: ElectividadResult; previous?: ElectividadResult }) {
  const before = new Map(previous?.areas.map(area => [area.id, area.wins]) ?? []);
  return (
    <Section
      title={t('tools.electividad.result.todasLasAreas')}
      subtitle={previous ? t('tools.electividad.result.eleccionesAFavorDeCada2') : t('tools.electividad.result.eleccionesAFavorDeCada')}
    >
      <View style={styles.card}>
        {GROUPS.map(group => {
          const rows = result.areas.filter(area => area.group === group.id);
          if (!rows.length) return null;
          const top = group.id === 'alto';
          return (
            <View key={group.id} style={styles.group}>
              <View style={styles.groupHead}>
                <View style={[styles.dot, { backgroundColor: group.color }]} />
                <ThemedText style={styles.groupLabel}>{group.label}</ThemedText>
              </View>
              {rows.map(area => (
                <View key={area.id} style={styles.areaRow} accessible accessibilityLabel={t('tools.electividad.result.nameWinsDeOfPercent', { name: area.name, wins: area.wins, of: area.of, percent: area.percent })}>
                  <View style={[styles.areaIcon, top && styles.areaIconTop]}>
                    <AreaIcon area={area.id} size={20} color={top ? AppColors.accent : AppColors.textPrimary} />
                  </View>
                  <View style={styles.areaBody}>
                    <View style={styles.areaHead}>
                      <ThemedText style={styles.areaName}>{area.name}</ThemedText>
                      {previous && <Change delta={area.wins - (before.get(area.id) ?? area.wins)} />}
                      <ThemedText style={styles.areaWins}>{t('tools.electividad.result.winsDeOf', { wins: area.wins, of: area.of })}</ThemedText>
                    </View>
                    <View style={styles.areaTrack}>
                      <View style={[styles.areaFill, { width: `${(area.wins / area.of) * 100}%`, backgroundColor: group.color }]} />
                    </View>
                  </View>
                </View>
              ))}
            </View>
          );
        })}
      </View>
    </Section>
  );
}

function Careers({ result }: { result: ElectividadResult }) {
  const [tab, setTab] = useState(result.careers[0]?.areaId);
  const current = result.careers.find(group => group.areaId === tab) ?? result.careers[0];
  if (!current) return null;
  return (
    <Section title={t('tools.electividad.result.carrerasRelacionadas')} subtitle={t('tools.electividad.result.segunTusAreasDeMayor')}>
      <View style={styles.tabs} accessibilityRole="tablist">
        {result.careers.map(group => {
          const selected = group.areaId === current.areaId;
          return (
            <Pressable
              key={group.areaId}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => setTab(group.areaId)}
              style={({ pressed }) => [styles.tab, selected && styles.tabSelected, pressed && AppPressed]}
            >
              <AreaIcon area={group.areaId} size={16} color={selected ? AppColors.controlOnActive : AppColors.textPrimary} />
              <ThemedText style={[styles.tabText, selected && styles.tabTextSelected]}>{group.areaName}</ThemedText>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.card}>
        {current.careers.map((career, index) => (
          <View key={career.name} style={[styles.careerRow, index > 0 && styles.careerDivider]}>
            <View style={styles.careerIcon}>
              <KnowledgeIcon area={career.knowledgeArea} size={20} color={AppColors.textPrimary} />
            </View>
            <View style={styles.careerBody}>
              <ThemedText style={styles.careerName}>{career.name}</ThemedText>
              <View style={styles.chip}>
                <ThemedText style={styles.chipText}>{career.knowledgeArea}</ThemedText>
              </View>
            </View>
          </View>
        ))}
        <ThemedText style={styles.soon}>{t('tools.electividad.result.duracionArancelEInstitucionesDe')}</ThemedText>
      </View>
      <HanetButton
        label={t('tools.electividad.result.verEmpleabilidadEIngresosEn')}
        variant="surface"
        icon={<Ionicons name="open-outline" size={18} color={AppColors.textPrimary} />}
        onPress={() => void WebBrowser.openBrowserAsync(MIFUTURO_URL)}
      />
      <ThemedText style={styles.source}>{t('tools.electividad.result.fuenteWwwMifuturoClDe')}</ThemedText>
    </Section>
  );
}

function Duels({ result }: { result: ElectividadResult }) {
  if (!result.duels.length) return null;
  return (
    <Section title={t('tools.electividad.result.comparacionesDestacadas')} subtitle={t('tools.electividad.result.cadaParDeAreasAparecio')}>
      <View style={styles.card}>
        {result.duels.map((duel, index) => {
          const clear = duel.kind === 'clara';
          return (
            <View
              key={`${duel.aId}-${duel.bId}`}
              style={[styles.duelRow, index > 0 && styles.careerDivider]}
              accessible
              accessibilityLabel={t('tools.electividad.result.aContraBReplaceValue', { a: duel.a, b: duel.b, replace: duel.score.replace('–', ' a '), value: clear ? t('tools.electividad.result.preferenciaClara') : t('tools.electividad.result.laComparacionMasPareja') })}
            >
              <View style={styles.duelIcons}>
                <AreaIcon area={duel.aId} size={18} color={AppColors.accent} />
                <AreaIcon area={duel.bId} size={18} color={AppColors.textSecondary} />
              </View>
              <View style={styles.careerBody}>
                <ThemedText style={styles.duelTitle}>{t('tools.electividad.result.aVsB', { a: duel.a, b: duel.b })}</ThemedText>
                <ThemedText style={styles.duelNote}>{clear ? t('tools.electividad.result.preferenciaClara') : t('tools.electividad.result.laComparacionMasPareja')}</ThemedText>
              </View>
              <View style={[styles.score, clear && styles.scoreClear]}>
                <ThemedText style={styles.scoreText}>{duel.score}</ThemedText>
              </View>
            </View>
          );
        })}
      </View>
    </Section>
  );
}

export default function ElectividadResultScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // Without `attempt` it shows the current result; with it, an earlier one.
  const { attempt } = useLocalSearchParams<{ attempt?: string }>();
  const [attempts, setAttempts] = useState<ElectividadAttempt[] | null | undefined>(() => {
    const cached = allAttempts(peekElectividad());
    return cached.length ? cached : undefined;
  });

  useEffect(() => {
    let alive = true;
    getElectividad()
      .then(data => { if (alive) setAttempts(allAttempts(data)); })
      .catch(() => { if (alive) setAttempts(current => current ?? null); });
    return () => { alive = false; };
  }, []);

  const index = attempts ? (attempt ? attempts.findIndex(item => item.id === attempt) : 0) : -1;
  const result: ElectividadResult | null | undefined = index >= 0 && attempts
    ? attempts[index]
    : attempts === undefined ? (attempt ? undefined : currentResult() ?? undefined) : null;
  const previous = index >= 0 && attempts ? attempts[index + 1] : undefined;
  const isCurrent = !attempt || attempt === 'current';

  if (!result) {
    return (
      <FrostedScreen style={styles.screen}>
        <View style={[styles.empty, { paddingTop: insets.top + AppSpacing.xxl }]}>
          {result === undefined ? <ActivityIndicator color={AppColors.textSecondary} /> : (
            <>
              <ThemedText style={styles.sectionSubtitle}>{t('tools.electividad.result.todaviaNoHayUnResultado')}</ThemedText>
              <HanetButton label={t('tools.electividad.result.irAlTest')} variant="accent" onPress={() => router.replace('/tools/electividad')} />
            </>
          )}
        </View>
      </FrostedScreen>
    );
  }

  const top = result.areas.slice(0, 3);

  return (
    <FrostedScreen style={styles.screen}>
      <ScrollView contentContainerStyle={withTopInset(styles.page, insets.top)} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          {!isCurrent && (
            <View style={styles.pastChip}>
              <Ionicons name="time-outline" size={13} color={AppColors.textPrimary} />
              <ThemedText style={styles.pastChipText}>{t('tools.electividad.result.intentoAnterior')}</ThemedText>
            </View>
          )}
          <ThemedText style={styles.eyebrow}>{answeredText(result.answeredAt)}</ThemedText>
          <ThemedText accessibilityRole="header" style={styles.title}>{headline(result)}</ThemedText>
        </View>

        <View style={styles.hero}>
          <View style={styles.heroChip}>
            <Ionicons name="sparkles" size={13} color={AppColors.textPrimary} />
            <ThemedText style={styles.heroChipText}>{t('common.tusAreasDeMayorInteres')}</ThemedText>
          </View>
          <ThemedText style={styles.heroTitle}>{list(top.map(area => area.name))}</ThemedText>
          <View style={styles.heroTiles}>
            {top.map(area => (
              <View key={area.id} style={styles.heroTile} accessible accessibilityLabel={t('tools.electividad.result.rankNamePercentPorCiento', { rank: area.rank, name: area.name, percent: area.percent })}>
                <AreaIcon area={area.id} size={24} color={AppColors.textPrimary} />
                <ThemedText style={styles.heroPercent}>{area.percent}%</ThemedText>
                <ThemedText style={styles.heroName} numberOfLines={2}>{area.name}</ThemedText>
              </View>
            ))}
          </View>
        </View>

        <ThemedText style={styles.explain}>
          {t('tools.electividad.result.elTestMideTusPreferencias')}
        </ThemedText>

        <Stats result={result} />
        <Distribution result={result} />
        <Groups result={result} previous={previous} />
        <Careers result={result} />
        <Duels result={result} />

        <View style={styles.cta}>
          <View style={styles.ctaHead}>
            <Ionicons name="school-outline" size={20} color={AppColors.textPrimary} />
            <ThemedText style={styles.ctaTitle}>{t('tools.electividad.result.postulacionAElectivos')}</ThemedText>
            <View style={styles.soonChip}>
              <ThemedText style={styles.soonChipText}>{t('common.proximamente')}</ThemedText>
            </View>
          </View>
          <ThemedText style={styles.ctaText}>{t('tools.electividad.result.aquiPodrasVerLosElectivos')}</ThemedText>
        </View>

        {isCurrent && (
          <HanetButton
            label={t('tools.electividad.repetirElTest')}
            variant="surface"
            icon={<Ionicons name="refresh" size={18} color={AppColors.textPrimary} />}
            onPress={() => router.push('/tools/electividad/test')}
          />
        )}

        <View style={styles.visibility}>
          <Ionicons name="eye-outline" size={16} color={AppColors.textSecondary} />
          <ThemedText style={styles.visibilityText}>{t('tools.electividad.result.resultadoVisibleParaTiY')}</ThemedText>
        </View>
      </ScrollView>
    </FrostedScreen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: AppColors.canvas },
  page: { width: '100%', maxWidth: 430, alignSelf: 'center', paddingHorizontal: AppSpacing.lg, paddingBottom: 150, gap: AppSpacing.xl },
  empty: { alignItems: 'center', gap: AppSpacing.lg, paddingHorizontal: AppSpacing.lg },
  header: { paddingTop: AppSpacing.lg, gap: AppSpacing.xs },
  eyebrow: { ...AppType.caption, color: AppColors.textSecondary },
  title: { ...AppType.title1, color: AppColors.textPrimary },
  hero: { padding: 18, borderRadius: AppRadii.lg, backgroundColor: AppColors.accent, gap: AppSpacing.md },
  heroChip: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 5, height: 26, paddingHorizontal: 10, borderRadius: AppRadii.pill, backgroundColor: 'rgba(40,40,41,0.22)' },
  heroChipText: { ...AppType.caption, fontFamily: 'DMSans_700Bold', color: AppColors.textPrimary },
  heroTitle: { ...AppType.title2, color: AppColors.textPrimary },
  heroTiles: { flexDirection: 'row', gap: 8 },
  heroTile: { flex: 1, padding: 12, borderRadius: AppRadii.md, backgroundColor: 'rgba(255,255,255,0.18)', gap: 4 },
  heroPercent: { ...AppType.title2, color: AppColors.textPrimary, fontVariant: ['tabular-nums'], marginTop: AppSpacing.xs },
  heroName: { ...AppType.caption, fontFamily: 'DMSans_700Bold', color: AppColors.textPrimary },
  explain: { ...AppType.footnote, color: AppColors.textSecondary },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, padding: 12, borderRadius: AppRadii.md, backgroundColor: AppColors.surface, gap: 2 },
  statLabel: { ...AppType.caption, color: AppColors.textSecondary },
  statValue: { ...AppType.title3, color: AppColors.textPrimary, fontVariant: ['tabular-nums'] },
  statSub: { ...AppType.caption, fontFamily: 'DMSans_400Regular', color: AppColors.textSecondary },
  section: { gap: AppSpacing.md },
  sectionHead: { gap: 2 },
  sectionTitle: { ...AppType.title3, color: AppColors.textPrimary },
  sectionSubtitle: { ...AppType.footnote, color: AppColors.textSecondary, textAlign: 'left' },
  card: { padding: 16, borderRadius: AppRadii.lg, backgroundColor: AppColors.surface, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', gap: AppSpacing.md },
  stack: { flexDirection: 'row', height: 14, borderRadius: AppRadii.pill, overflow: 'hidden', gap: 2 },
  legendRow: { flexDirection: 'row', gap: AppSpacing.md, alignItems: 'center' },
  legendIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: AppColors.canvas, alignItems: 'center', justifyContent: 'center' },
  legendIconTop: { backgroundColor: TINT },
  legendText: { flex: 1, gap: 2 },
  legendHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendName: { ...AppType.headline, color: AppColors.textPrimary, flex: 1 },
  legendPercent: { ...AppType.headline, color: AppColors.textPrimary, fontVariant: ['tabular-nums'] },
  legendAreas: { ...AppType.caption, fontFamily: 'DMSans_400Regular', color: AppColors.textSecondary },
  group: { gap: AppSpacing.sm },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  groupLabel: { ...AppType.caption, fontFamily: 'DMSans_700Bold', color: AppColors.textSecondary },
  areaRow: { flexDirection: 'row', alignItems: 'center', gap: AppSpacing.md },
  areaIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: AppColors.canvas, alignItems: 'center', justifyContent: 'center' },
  areaIconTop: { backgroundColor: TINT },
  areaBody: { flex: 1, gap: 5 },
  areaHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  change: { flexDirection: 'row', alignItems: 'center', gap: 1, height: 18, paddingHorizontal: 6, borderRadius: AppRadii.pill, backgroundColor: AppColors.surfaceMuted },
  changeUp: { backgroundColor: AppColors.accent },
  changeText: { ...AppType.caption, fontSize: 11, lineHeight: 14, fontFamily: 'DMSans_700Bold', color: AppColors.textPrimary, fontVariant: ['tabular-nums'] },
  pastChip: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 5, height: 26, paddingHorizontal: 10, borderRadius: AppRadii.pill, backgroundColor: AppColors.surfaceMuted, marginBottom: AppSpacing.xs },
  pastChipText: { ...AppType.caption, fontFamily: 'DMSans_700Bold', color: AppColors.textPrimary },
  areaName: { ...AppType.callout, fontFamily: 'DMSans_700Bold', color: AppColors.textPrimary },
  areaWins: { ...AppType.caption, color: AppColors.textSecondary, fontVariant: ['tabular-nums'], marginLeft: 'auto' },
  areaTrack: { height: 6, borderRadius: AppRadii.pill, backgroundColor: AppColors.canvas, overflow: 'hidden' },
  areaFill: { height: 6, borderRadius: AppRadii.pill },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 14, borderRadius: AppRadii.pill, backgroundColor: AppColors.surfaceMuted },
  tabSelected: { backgroundColor: AppColors.controlActive },
  tabText: { ...AppType.callout, fontFamily: 'DMSans_700Bold', color: AppColors.textPrimary },
  tabTextSelected: { color: AppColors.controlOnActive },
  careerRow: { flexDirection: 'row', alignItems: 'center', gap: AppSpacing.md },
  careerDivider: { paddingTop: AppSpacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.12)' },
  careerIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: AppColors.canvas, alignItems: 'center', justifyContent: 'center' },
  careerBody: { flex: 1, gap: 4, alignItems: 'flex-start' },
  careerName: { ...AppType.headline, color: AppColors.textPrimary },
  chip: { height: 22, paddingHorizontal: 9, borderRadius: AppRadii.pill, backgroundColor: AppColors.surfaceMuted, justifyContent: 'center' },
  chipText: { ...AppType.caption, color: AppColors.textPrimary },
  soon: { ...AppType.caption, fontFamily: 'DMSans_400Regular', color: AppColors.textSecondary },
  source: { ...AppType.caption, fontFamily: 'DMSans_400Regular', color: AppColors.textSecondary, textAlign: 'center' },
  duelRow: { flexDirection: 'row', alignItems: 'center', gap: AppSpacing.md },
  duelIcons: { width: 40, height: 40, borderRadius: 12, backgroundColor: AppColors.canvas, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 1 },
  duelTitle: { ...AppType.callout, fontFamily: 'DMSans_700Bold', color: AppColors.textPrimary },
  duelNote: { ...AppType.caption, fontFamily: 'DMSans_400Regular', color: AppColors.textSecondary },
  score: { minWidth: 48, height: 30, paddingHorizontal: 10, borderRadius: AppRadii.pill, backgroundColor: AppColors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  scoreClear: { backgroundColor: AppColors.accent },
  scoreText: { ...AppType.callout, fontFamily: 'DMSans_700Bold', color: AppColors.textPrimary, fontVariant: ['tabular-nums'] },
  cta: { padding: 16, borderRadius: AppRadii.lg, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', borderStyle: 'dashed', gap: AppSpacing.sm },
  ctaHead: { flexDirection: 'row', alignItems: 'center', gap: AppSpacing.sm },
  ctaTitle: { ...AppType.headline, color: AppColors.textPrimary, flex: 1 },
  soonChip: { height: 24, paddingHorizontal: 10, borderRadius: AppRadii.pill, backgroundColor: AppColors.surfaceMuted, justifyContent: 'center' },
  soonChipText: { ...AppType.caption, fontFamily: 'DMSans_700Bold', color: AppColors.textPrimary },
  ctaText: { ...AppType.footnote, color: AppColors.textSecondary },
  visibility: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  visibilityText: { ...AppType.caption, color: AppColors.textSecondary },
});
