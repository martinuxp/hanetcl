import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { CustomIcon } from '@/components/ui/custom-icon';
import { TouchableRipple } from 'react-native-paper';
import { useRouter } from 'expo-router';

type GridItemProps = {
  title: string;
  icon: any;
  height: number;
  badgeText?: string;
  layout?: 'default' | 'side-badge';
  href?: any;
};

function GridItem({ title, icon, height, badgeText, layout = 'default', href }: GridItemProps) {
  const isSideBadge = layout === 'side-badge';
  const router = useRouter();

  return (
    <TouchableRipple
      style={[styles.gridItem, { height }]}
      onPress={() => {
        if (href) router.push(href);
      }}
      rippleColor="rgba(255, 255, 255, 0.2)"
    >
      {isSideBadge ? (
        <View style={styles.gridItemInnerSide}>
          <View style={styles.sideContent}>
            <View style={styles.iconContainerSide}>
              <CustomIcon name={icon as any} size={26} color="#292927" />
            </View>
            <ThemedText style={styles.itemTitleSide}>{title}</ThemedText>
          </View>
          {badgeText && (
            <View style={styles.sideBadge}>
              <ThemedText style={styles.sideBadgeTextMain}>3 días</ThemedText>
              <ThemedText style={styles.sideBadgeTextSub}>Prox.</ThemedText>
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
            <CustomIcon name={icon as any} size={26} color="#292927" />
          </View>
          <ThemedText style={styles.itemTitleDefault}>{title}</ThemedText>
        </View>
      )}
    </TouchableRipple>
  );
}

export default function GridMenu() {
  return (
    <View style={styles.container}>
      {/* Left Column */}
      <View style={styles.column}>
        <GridItem 
          title="Eventos" 
          icon="star" 
          height={148} 
        />
        <GridItem 
          title="Mis clases" 
          icon="graduationcap" 
          height={102} 
        />
        <GridItem 
          title="Pagos" 
          icon="wallet" 
          height={76} 
        />
      </View>

      {/* Right Column */}
      <View style={styles.column}>
        <GridItem 
          title="Feed y comunidad" 
          icon="feed" 
          height={119} 
          badgeText="Pronto disponible!"
        />
        <GridItem 
          title="Calendario" 
          icon="calendar" 
          height={74} 
          badgeText="3 días Prox."
          layout="side-badge"
          href="/calendar"
        />
        <GridItem 
          title="Calificaciones y asistencias" 
          icon="notes" 
          height={133} 
          badgeText="3 calificaciones nuevas"
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
    backgroundColor: '#CECDC1',
    borderRadius: 24,
    borderCurve: 'continuous',
    overflow: 'hidden',
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
    backgroundColor: '#52524D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBadgeText: {
    fontSize: 11,
    lineHeight: 13.53,
    letterSpacing: -0.275,
    fontFamily: 'DMSans_700Bold',
    color: '#E2E1DA',
  },
  iconContainerDefault: {
    marginBottom: 8,
  },
  itemTitleDefault: {
    color: '#292927',
    fontSize: 16,
    lineHeight: 19.68,
    letterSpacing: -0.4,
    fontFamily: 'DMSans_700Bold',
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
    color: '#292927',
    fontSize: 16,
    lineHeight: 19.68,
    letterSpacing: -0.4,
    fontFamily: 'DMSans_700Bold',
    textAlign: 'left',
  },
  sideBadge: {
    width: 62,
    backgroundColor: '#52524D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideBadgeTextMain: {
    fontSize: 13,
    lineHeight: 12.87,
    letterSpacing: -0.325,
    fontFamily: 'DMSans_700Bold',
    color: '#FAFAF9',
    marginBottom: 2,
  },
  sideBadgeTextSub: {
    fontSize: 10,
    lineHeight: 9.9,
    letterSpacing: -0.25,
    fontFamily: 'DMSans_500Medium',
    color: '#E2E1DA',
    opacity: 0.7,
  },
});
