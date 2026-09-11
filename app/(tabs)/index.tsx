import { AppColors } from '@/constants/design-tokens';
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import TopHeader from '@/components/TopHeader';
import InstitutionBanner from '@/components/InstitutionBanner';
import GridMenu from '@/components/GridMenu';
import { useSession } from '@/services/auth-service';
import { HanetButton } from '@/components/ui/hanet-button';
import { CustomIcon } from '@/components/ui/custom-icon';

export default function HomeScreen() {
  const router = useRouter();
  const { user, signOut } = useSession();

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <TopHeader />
        <InstitutionBanner />
        <GridMenu />

        {/* Auth / Signout Button */}
        {user ? (
          <HanetButton
            label="Cerrar sesión"
            accessibilityHint={user.email ? `Sesión iniciada como ${user.email}` : undefined}
            variant="accent"
            onPress={() => void signOut()}
            style={styles.authButton}
          />
        ) : (
          <HanetButton
            label="Iniciar sesión"
            onPress={() => router.push('/auth')}
            style={styles.authButton}
          />
        )}

        <HanetButton
          label="Explorar sistema UI"
          variant="surface"
          icon={<CustomIcon name="notes" size={20} color={AppColors.textPrimary} />}
          onPress={() => router.push('/ui-showcase')}
          style={styles.uiCatalogButton}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AppColors.textOnLight,
  },
  scrollContent: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingBottom: 150,
  },
  uiCatalogButton: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  authButton: {
    marginHorizontal: 16,
    marginBottom: 8,
  },
});
