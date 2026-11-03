import { ThemedText } from '@/components/themed-text';
import { AreaIcon, FIELD_AREA, KnowledgeIcon } from '@/components/tools/area-icon';
import { FrostedScreen, withTopInset } from '@/components/ui/frosted-screen';
import { HanetButton } from '@/components/ui/hanet-button';
import { AppColors, AppPressed, AppRadii, AppSpacing, AppType } from '@/constants/design-tokens';
import { currentResult, formatDuration, getElectividad, headline, rememberResult } from '@/services/electividad-service';
import type { AreaScore, ElectividadResult } from '@/services/electividad-service';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// The full result of HaNet Electividad: the top three, how the answers split,
// every area by group, related careers and the most telling comparisons.

const TINT = 'rgba(239,34,116,0.18)';
const FIELD_COLORS = ['#EF2274', '#DDDDE2', '#7D7C82'];
const GROUPS: { id: AreaScore['group']; label: string; color: string }[] = [
  { id: 'alto', label: 'Mayor interés', color: '#EF2274' },
  { id: 'medio', label: 'Interés intermedio', color: '#DDDDE2' },
  { id: 'bajo', label: 'Menor interés', color: '#7D7C82' },
];
const MIFUTURO_URL = 'https://www.mifuturo.cl/buscador-de-empleabilidad-e-ingresos/';

function list(names: string[]) {
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}` : names.join('');
}

function answeredText(at: number | null) {
  if (!at) return 'Resultado';
  try {
    return `Respondido el ${new Date(at).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}`;
  } catch {
    return 'Resultado';
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
    { label: 'Consistencia', value: `${result.consistency.percent}%`, sub: `${result.consistency.same} de ${result.consistency.of} pares` },
    { label: 'Duración', value: formatDuration(result.durationSec), sub: perQuestion ? `${perQuestion} s por pregunta` : 'Sin registro' },
    { label: 'Perfil', value: result.profile === 'definido' ? 'Definido' : 'Amplio', sub: result.profile === 'definido' ? 'Top 3 destacado' : 'Intereses repartidos' },
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
    <Section title="Distribución por ámbito" subtitle="Porcentaje de tus 72 elecciones">
      <View style={styles.card}>
        <View style={styles.stack} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {result.fields.map((field, index) => (
            <View key={field.id} style={{ flex: Math.max(field.percent, 1), backgroundColor: FIELD_COLORS[index] }} />
          ))}
        </View>
        {result.fields.map((field, index) => (
          <View key={field.id} style={styles.legendRow} accessible accessibilityLabel={`${field.name}: ${field.percent} por ciento. ${list(field.areas)}`}>
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

function Groups({ result }: { result: ElectividadResult }) {
  return (
    <Section title="Todas las áreas" subtitle="Elecciones a favor de cada área, de 16">
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
                <View key={area.id} style={styles.areaRow} accessible accessibilityLabel={`${area.name}: ${area.wins} de ${area.of}, ${area.percent} por ciento`}>
                  <View style={[styles.areaIcon, top && styles.areaIconTop]}>
                    <AreaIcon area={area.id} size={20} color={top ? AppColors.accent : AppColors.textPrimary} />
                  </View>
                  <View style={styles.areaBody}>
                    <View style={styles.areaHead}>
                      <ThemedText style={styles.areaName}>{area.name}</ThemedText>
                      <ThemedText style={styles.areaWins}>{area.wins} de {area.of}</ThemedText>
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
    <Section title="Carreras relacionadas" subtitle="Según tus áreas de mayor interés">
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
        <ThemedText style={styles.soon}>Duración, arancel e instituciones de cada carrera: Próximamente.</ThemedText>
      </View>
      <HanetButton
        label="Ver empleabilidad e ingresos en mifuturo.cl"
        variant="surface"
        icon={<Ionicons name="open-outline" size={18} color={AppColors.textPrimary} />}
        onPress={() => void WebBrowser.openBrowserAsync(MIFUTURO_URL)}
      />
      <ThemedText style={styles.source}>Fuente: www.mifuturo.cl, de Mineduc</ThemedText>
    </Section>
  );
}

function Duels({ result }: { result: ElectividadResult }) {
  if (!result.duels.length) return null;
  return (
    <Section title="Comparaciones destacadas" subtitle="Cada par de áreas apareció 2 veces">
      <View style={styles.card}>
        {result.duels.map((duel, index) => {
          const clear = duel.kind === 'clara';
          return (
            <View
              key={`${duel.aId}-${duel.bId}`}
              style={[styles.duelRow, index > 0 && styles.careerDivider]}
              accessible
              accessibilityLabel={`${duel.a} contra ${duel.b}: ${duel.score.replace('–', ' a ')}. ${clear ? 'Preferencia clara' : 'La comparación más pareja'}`}
            >
              <View style={styles.duelIcons}>
                <AreaIcon area={duel.aId} size={18} color={AppColors.accent} />
                <AreaIcon area={duel.bId} size={18} color={AppColors.textSecondary} />
              </View>
              <View style={styles.careerBody}>
                <ThemedText style={styles.duelTitle}>{duel.a} vs {duel.b}</ThemedText>
                <ThemedText style={styles.duelNote}>{clear ? 'Preferencia clara' : 'La comparación más pareja'}</ThemedText>
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
  const [result, setResult] = useState<ElectividadResult | null | undefined>(() => currentResult() ?? undefined);

  useEffect(() => {
    if (result) return;
    let alive = true;
    getElectividad()
      .then(data => {
        if (!alive) return;
        if (data.result) rememberResult(data.result);
        setResult(data.result);
      })
      .catch(() => { if (alive) setResult(null); });
    return () => { alive = false; };
  }, [result]);

  if (!result) {
    return (
      <FrostedScreen style={styles.screen}>
        <View style={[styles.empty, { paddingTop: insets.top + AppSpacing.xxl }]}>
          {result === undefined ? <ActivityIndicator color={AppColors.textSecondary} /> : (
            <>
              <ThemedText style={styles.sectionSubtitle}>Todavía no hay un resultado para mostrar.</ThemedText>
              <HanetButton label="Ir al test" variant="accent" onPress={() => router.replace('/tools/electividad')} />
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
          <ThemedText style={styles.eyebrow}>{answeredText(result.answeredAt)}</ThemedText>
          <ThemedText accessibilityRole="header" style={styles.title}>{headline(result)}</ThemedText>
        </View>

        <View style={styles.hero}>
          <View style={styles.heroChip}>
            <Ionicons name="sparkles" size={13} color={AppColors.textPrimary} />
            <ThemedText style={styles.heroChipText}>Tus áreas de mayor interés</ThemedText>
          </View>
          <ThemedText style={styles.heroTitle}>{list(top.map(area => area.name))}</ThemedText>
          <View style={styles.heroTiles}>
            {top.map(area => (
              <View key={area.id} style={styles.heroTile} accessible accessibilityLabel={`${area.rank}. ${area.name}, ${area.percent} por ciento`}>
                <AreaIcon area={area.id} size={24} color={AppColors.textPrimary} />
                <ThemedText style={styles.heroPercent}>{area.percent}%</ThemedText>
                <ThemedText style={styles.heroName} numberOfLines={2}>{area.name}</ThemedText>
              </View>
            ))}
          </View>
        </View>

        <ThemedText style={styles.explain}>
          El test mide tus preferencias entre áreas, no tu rendimiento. Un puntaje menor indica que elegiste otras áreas con más frecuencia.
        </ThemedText>

        <Stats result={result} />
        <Distribution result={result} />
        <Groups result={result} />
        <Careers result={result} />
        <Duels result={result} />

        <View style={styles.cta}>
          <View style={styles.ctaHead}>
            <Ionicons name="school-outline" size={20} color={AppColors.textPrimary} />
            <ThemedText style={styles.ctaTitle}>Postulación a electivos</ThemedText>
            <View style={styles.soonChip}>
              <ThemedText style={styles.soonChipText}>Próximamente</ThemedText>
            </View>
          </View>
          <ThemedText style={styles.ctaText}>Aquí podrás ver los electivos que ofrece tu liceo según tu resultado y postular a ellos.</ThemedText>
        </View>

        <View style={styles.visibility}>
          <Ionicons name="eye-outline" size={16} color={AppColors.textSecondary} />
          <ThemedText style={styles.visibilityText}>Resultado visible para ti y para la administración de tu liceo.</ThemedText>
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
  areaHead: { flexDirection: 'row', justifyContent: 'space-between' },
  areaName: { ...AppType.callout, fontFamily: 'DMSans_700Bold', color: AppColors.textPrimary },
  areaWins: { ...AppType.caption, color: AppColors.textSecondary, fontVariant: ['tabular-nums'] },
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
