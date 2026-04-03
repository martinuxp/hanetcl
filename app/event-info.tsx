import React from 'react';
import { StyleSheet, View, ScrollView, Platform, Dimensions, Linking, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { TouchableRipple } from 'react-native-paper';
import { ThemedText } from '@/components/themed-text';
import { CustomIcon } from '@/components/ui/custom-icon';
import { useSession } from '@/services/auth-service';
import { db } from '@/services/firebase';
import { doc, getDoc } from 'firebase/firestore';

const { width } = Dimensions.get('window');

export default function EventInfoScreen() {
  const router = useRouter();
  const { user } = useSession();

  const handleSubscribe = async () => {
    if (!user) return;
    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      const courseId = userDoc.data()?.courseId;
      if (!courseId) {
        Alert.alert('Error', 'No tienes un curso vinculado a tu RUT.');
        return;
      }
      
      const feedUrl = `webcal://us-central1-hanet-edu.cloudfunctions.net/icalFeed?courseId=${courseId}`;
      await Linking.openURL(feedUrl);
    } catch (e: any) {
      console.error(e);
      Alert.alert('Error', 'Hubo un error abriendo iCloud.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView 
        style={{ flex: 1, width: '100%' }}
        showsVerticalScrollIndicator={false} 
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustsScrollIndicatorInsets={false}
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 16,
          paddingTop: 40,
          paddingBottom: 150
        }}
      >
        {/* Main Title */}
        <ThemedText style={styles.mainTitle}>
          Evaluación | Lenguaje y Literatura | 2do K
        </ThemedText>

        {/* Content Card */}
        <View style={styles.card}>
          <View style={styles.infoRow}>
            <View style={styles.iconContainer}>
              <CustomIcon name="calendar" size={20} color="#E2E1DA" />
            </View>
            <View style={styles.infoTextContainer}>
              <ThemedText style={styles.infoLabel}>Fecha</ThemedText>
              <ThemedText style={styles.infoValue}>Hoy, 12 de Marzo, 2026</ThemedText>
            </View>
          </View>

          <View style={styles.infoRow}>
            <View style={styles.iconContainer}>
              <CustomIcon name="clock" size={20} color="#E2E1DA" />
            </View>
            <View style={styles.infoTextContainer}>
              <ThemedText style={styles.infoLabel}>Duración</ThemedText>
              <ThemedText style={styles.infoValue}>09:00 - 10:30 (1 hora y 30 minutos)</ThemedText>
            </View>
          </View>

          <View style={styles.infoRow}>
            <View style={styles.iconContainer}>
              <CustomIcon name="map-pin" size={20} color="#E2E1DA" />
            </View>
            <View style={styles.infoTextContainer}>
              <ThemedText style={styles.infoLabel}>Ubicación</ThemedText>
              <ThemedText style={styles.infoValue}>Sala 304-B (P3)</ThemedText>
            </View>
          </View>

          <View style={styles.infoRow}>
            <View style={styles.iconContainer}>
              <CustomIcon name="book" size={20} color="#E2E1DA" />
            </View>
            <View style={styles.infoTextContainer}>
              <ThemedText style={styles.infoLabel}>Tipo de evaluación</ThemedText>
              <ThemedText style={styles.infoValue}>Evaluación sumativa (sin material pedagógico)</ThemedText>
            </View>
          </View>

          <View style={styles.infoRow}>
            <View style={styles.iconContainer}>
              <CustomIcon name="tag" size={20} color="#E2E1DA" />
            </View>
            <View style={styles.infoTextContainer}>
              <ThemedText style={styles.infoLabel}>Asignatura relacionada</ThemedText>
              <ThemedText style={styles.infoValue}>Lenguaje y Literatura</ThemedText>
            </View>
          </View>

          <View style={[styles.infoRow, { alignItems: 'flex-start' }]}>
            <View style={[styles.iconContainer, { marginTop: 4 }]}>
              <CustomIcon name="file-text" size={20} color="#E2E1DA" />
            </View>
            <View style={styles.infoTextContainer}>
              <ThemedText style={styles.infoLabel}>Descripción</ThemedText>
              <ThemedText style={[styles.infoValue, { lineHeight: 20 }]}>
                “Unidad 1: Sobre la ausencia: exilio, migración e identidad{'\n'}
                • Genero Narrativo y obras narrativas.{'\n'}
                • Movimientos Literarios.”
              </ThemedText>
            </View>
          </View>

          <TouchableRipple style={styles.actionBtnBlue} onPress={handleSubscribe}>
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
              <CustomIcon name="calendar" size={18} color="#FAFAF9" />
              <ThemedText style={styles.actionBtnDarkText}>Suscribir iPad/iPhone a iCal</ThemedText>
            </View>
          </TouchableRipple>

          <TouchableRipple style={styles.actionBtnLight} onPress={() => {}}>
            <ThemedText style={styles.actionBtnLightText}>Tabla de especificaciones</ThemedText>
          </TouchableRipple>

          <TouchableRipple style={styles.actionBtnDark} onPress={() => {}}>
            <ThemedText style={styles.actionBtnDarkText}>Ir a los documentos de la clase</ThemedText>
          </TouchableRipple>

          <ThemedText style={styles.helperText}>
            Evento generado y conectado al HaNet Calendar del curso y al HaNet ClassHall de la asignatura.
          </ThemedText>
        </View>

        {/* Verification */}
        <View style={styles.verificationContainer}>
          <CustomIcon name="check-circle" size={20} color="#34C759" />
          <View style={styles.verificationTextContainer}>
            <ThemedText style={styles.verificationSub}>Info. verificada por un docente:</ThemedText>
            <ThemedText style={styles.verificationName}>Monica Jannette Campos Veloso</ThemedText>
          </View>
        </View>

        <ThemedText style={styles.footerLegal}>
          La información publicada por miembros de la directiva puede no ser oficial. La información verificada por tus profesores está indicada con un verificado azul.
        </ThemedText>
      </ScrollView>

      {/* Floating Bottom Bar (Volver) */}
      <View style={styles.bottomBarWrapper} pointerEvents="box-none">
        <BlurView
          intensity={Platform.OS === 'android' ? 60 : 70}
          tint="dark"
          experimentalBlurMethod="dimezisBlurView"
          style={styles.bottomBarContainer}
        >
          <View style={styles.leftIconBtn}>
            <CustomIcon name="home" size={24} color="#E2E1DA" />
          </View>

          <View style={styles.centerPillWrapper}>
            <TouchableRipple
              style={styles.volverPill}
              onPress={() => router.back()}
              rippleColor="rgba(255, 255, 255, 0.3)"
              borderless={false}
            >
              <>
                <CustomIcon name="chevron-left" size={18} color="#292927" />
                <ThemedText style={styles.volverText}>Volver</ThemedText>
              </>
            </TouchableRipple>
          </View>

          <View style={styles.rightIconBtn}>
            <CustomIcon name="user" size={24} color="#E2E1DA" />
          </View>
        </BlurView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#292927', // Same as Figma screenshot background
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  mainTitle: {
    color: '#E2E1DA',
    fontSize: 32,
    fontFamily: 'DMSans_700Bold',
    lineHeight: 38,
    marginBottom: 24,
    marginLeft: 8,
  },
  card: {
    backgroundColor: '#3E3E3A',
    borderRadius: 32,
    padding: 24,
    marginBottom: 24,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  iconContainer: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  infoTextContainer: {
    flex: 1,
  },
  infoLabel: {
    color: '#E2E1DA',
    fontSize: 14,
    fontFamily: 'DMSans_500Medium',
    opacity: 0.9,
    marginBottom: 4,
  },
  infoValue: {
    color: '#E2E1DA',
    fontSize: 14,
    fontFamily: 'DMSans_400Regular',
    opacity: 0.8,
  },
  actionBtnLight: {
    backgroundColor: '#EBEBE6',
    borderRadius: 360,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 10,
  },
  actionBtnLightText: {
    color: '#292927',
    fontSize: 16,
    fontFamily: 'DMSans_700Bold',
  },
  actionBtnDark: {
    backgroundColor: '#42564F', // Dark Green
    borderRadius: 360,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 20,
  },
  actionBtnBlue: {
    backgroundColor: '#2D81F7', // iOS Blue
    borderRadius: 360,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  actionBtnDarkText: {
    color: '#FAFAF9',
    fontSize: 16,
    fontFamily: 'DMSans_700Bold',
  },
  helperText: {
    color: '#E2E1DA',
    fontSize: 11,
    fontFamily: 'DMSans_400Regular',
    opacity: 0.6,
    textAlign: 'center',
    alignSelf: 'center',
    paddingHorizontal: 10,
  },
  verificationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  verificationTextContainer: {
    marginLeft: 8,
    flexDirection: 'column',
  },
  verificationSub: {
    color: '#E2E1DA',
    fontSize: 12,
    opacity: 0.7,
  },
  verificationName: {
    color: '#E2E1DA',
    fontSize: 13,
    fontFamily: 'DMSans_700Bold',
  },
  footerLegal: {
    color: '#E2E1DA',
    fontSize: 11,
    opacity: 0.6,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  bottomBarWrapper: {
    position: 'absolute',
    bottom: 30,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
    zIndex: 999,
  },
  bottomBarContainer: {
    width: 330,
    height: 64,
    borderRadius: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(52, 52, 45, 0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    boxShadow: '0px 10px 20px rgba(0, 0, 0, 0.3)',
    elevation: 8,
  },
  leftIconBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    width: 70,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rightIconBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    width: 70,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerPillWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 10,
  },
  volverPill: {
    backgroundColor: '#CECDC1',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    width: 120,
    height: 45,
    borderRadius: 360,
    gap: 8,
  },
  volverText: {
    color: '#292927',
    fontFamily: 'DMSans_700Bold',
    fontSize: 15,
  },
});
