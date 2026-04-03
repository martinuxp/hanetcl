import React, { useState } from 'react';
import { ScrollView, StyleSheet, View, TouchableOpacity, Alert, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import TopHeader from '@/components/TopHeader';
import InstitutionBanner from '@/components/InstitutionBanner';
import GridMenu from '@/components/GridMenu';
import NotificationSection from '@/components/NotificationSection';
import NotificationModal from '@/components/NotificationModal';
import { ThemedText } from '@/components/themed-text';
import { useSession } from '@/services/auth-service';

export default function HomeScreen() {
  const router = useRouter();
  const { user, signOut } = useSession();
  const [showNotifModal, setShowNotifModal] = useState(false);

  const handleActivateNotifications = () => {
    setShowNotifModal(false);
    // Here you'd call expo-notifications to request permissions
    Alert.alert(
      'Notificaciones activadas',
      'Ahora recibirás avisos importantes de tu curso.',
      [{ text: 'OK' }]
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <TopHeader />
        <InstitutionBanner />
        <GridMenu />

        {/* Temporary Navigation Button */}
        <TouchableOpacity
          style={styles.tempButton}
          onPress={() => router.navigate('/event-info')}
          activeOpacity={0.85}
        >
          <ThemedText style={styles.tempButtonText}>📅 Ver Info de Evento (Test)</ThemedText>
        </TouchableOpacity>

        {/* Auth / Signout Button */}
        {user ? (
          <TouchableOpacity
            style={[styles.authButton, { backgroundColor: '#FF6A5F', marginBottom: 16 }]}
            onPress={() => {
              signOut();
              alert('Sesión cerrada correctamente');
            }}
            activeOpacity={0.85}
          >
            <ThemedText style={styles.authButtonText}>🚪 Cerrar sesión ({user.email})</ThemedText>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.authButton}
            onPress={() => router.push('/auth')}
            activeOpacity={0.85}
          >
            <ThemedText style={styles.authButtonText}>🔑 Iniciar sesión</ThemedText>
          </TouchableOpacity>
        )}

        {/* Notification Activation Button */}
        <TouchableOpacity
          style={styles.notifButton}
          onPress={() => setShowNotifModal(true)}
          activeOpacity={0.85}
        >
          <ThemedText style={styles.notifButtonText}>🔔 Activar notificaciones</ThemedText>
        </TouchableOpacity>

        <NotificationSection />
      </ScrollView>

      <NotificationModal
        visible={showNotifModal}
        onActivate={handleActivateNotifications}
        onDismiss={() => setShowNotifModal(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#292927',
  },
  scrollContent: {
    paddingBottom: 150,
  },
  notifButton: {
    backgroundColor: '#FF6A5F',
    marginHorizontal: 16,
    marginBottom: 16,
    height: 48,
    borderRadius: 360,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notifButtonText: {
    color: '#292927',
    fontSize: 15,
    fontFamily: 'DMSans_700Bold',
    letterSpacing: -0.35,
  },
  authButton: {
    backgroundColor: '#465A54',
    marginHorizontal: 16,
    marginBottom: 8,
    height: 48,
    borderRadius: 360,
    justifyContent: 'center',
    alignItems: 'center',
  },
  authButtonText: {
    color: '#FAFAF9',
    fontSize: 15,
    fontFamily: 'DMSans_700Bold',
    letterSpacing: -0.35,
  },
  tempButton: {
    backgroundColor: '#3E3E3A',
    marginHorizontal: 16,
    marginBottom: 8,
    height: 48,
    borderRadius: 360,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CECDC1',
  },
  tempButtonText: {
    color: '#CECDC1',
    fontSize: 15,
    fontFamily: 'DMSans_700Bold',
    letterSpacing: -0.35,
  },
});
