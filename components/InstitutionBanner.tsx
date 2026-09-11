import { AppColors } from '@/constants/design-tokens';
import React from 'react';
import { View, StyleSheet, ImageBackground, Image, Platform } from 'react-native';
import { ThemedText } from '@/components/themed-text';

export default function InstitutionBanner() {
  return (
    <View style={styles.container}>
      <ImageBackground
        source={{ uri: 'https://www.ufromedios.cl/wp-content/uploads/2021/04/Edificio_Liceo_Camilo_Henriquez.jpg' }}
        style={styles.imageBackground}
        imageStyle={styles.imageStyle}
      >
        <View style={styles.overlay} />
        <View style={styles.content}>
          <View style={styles.logoPlaceholder}>
            <Image
              source={require('@/assets/images/lch-transparente.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>
          <ThemedText style={styles.title}>LCH Temuco</ThemedText>
        </View>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    marginTop: 10,
    marginBottom: 24,
  },
  imageBackground: {
    height: 105,
    width: '100%',
    justifyContent: 'center',
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 4px 10px rgba(0,0,0,0.3)' } as any)
      : { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 5 }),
    elevation: 8,
  },
  imageStyle: {
    borderRadius: 32,
    borderCurve: 'continuous',
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 32,
    borderCurve: 'continuous',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  logoPlaceholder: {
    width: 65,
    height: 75,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  logoImage: {
    width: 56,
    height: 67,
  },
  title: {
    color: AppColors.textSecondary,
    fontSize: 24,
    lineHeight: 28.8,
    letterSpacing: -1.08,
    fontFamily: 'DMSans_700Bold',
    marginBottom: 0,
    ...(Platform.OS === 'web'
      ? ({ textShadow: '0 4px 5px rgba(0,0,0,0.7)' } as any)
      : { textShadowColor: 'rgba(0,0,0,0.7)', textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 5.1 }),
  },
});
