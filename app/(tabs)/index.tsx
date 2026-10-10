import { AppColors } from '@/constants/design-tokens';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import TopHeader from '@/components/TopHeader';
import InstitutionBanner from '@/components/InstitutionBanner';
import GridMenu from '@/components/GridMenu';
import { consumePendingWelcome, getGreetingProfile, getOnboardingStep, isOnboardingKnownDone, routeForStep, useSession } from '@/services/auth-service';
import type { Treatment } from '@/services/auth-service';
import { WelcomeCelebration } from '@/components/WelcomeCelebration';
import { HanetButton } from '@/components/ui/hanet-button';
import { CustomIcon } from '@/components/ui/custom-icon';

export default function HomeScreen() {
  const router = useRouter();
  const { user, initializing, signOut } = useSession();
  // The uid whose token carries the HNT role; signing out or switching
  // accounts makes it stop matching.
  const [hntUid, setHntUid] = useState<string | null>(null);
  const isHnt = !!user && hntUid === user.uid;

  const [welcome, setWelcome] = useState<{ firstName: string; treatment: Treatment; institutionName?: string } | null>(null);

  // Arriving right after the link was completed: play the welcome once.
  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      const pending = consumePendingWelcome();
      if (!pending) return;

      let active = true;
      getGreetingProfile(user)
        .catch(() => ({ firstName: '', treatment: 'neutro' as const }))
        .then(profile => { if (active) setWelcome({ ...profile, institutionName: pending.institutionName }); });
      return () => { active = false; };
    }, [user])
  );

  // An account that has not finished joining its institution goes back to
  // the step it is missing instead of seeing an empty Home.
  const [checkedUid, setCheckedUid] = useState<string | null>(null);
  // Until the step is known, a signed-in account sees a loader instead of a
  // Home it may be about to leave.
  const gateOpen = !initializing && (!user || isOnboardingKnownDone(user) || checkedUid === user.uid);

  useEffect(() => {
    if (!user) return;
    let active = true;
    getOnboardingStep(user)
      .then(step => {
        if (!active) return;
        if (step === 'done') setCheckedUid(user.uid);
        else router.replace(routeForStep(step));
      })
      // Offline or a failed read: let the account in rather than lock it out.
      .catch(() => { if (active) setCheckedUid(user.uid); });
    return () => { active = false; };
  }, [router, user]);

  // Only decides whether to draw the entry; the panel and its backend check the role again.
  useEffect(() => {
    if (!user) return;
    let active = true;
    user.getIdTokenResult()
      .then(({ claims }) => { if (active) setHntUid(claims.role === 'HNT' ? user.uid : null); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [user]);

  if (!gateOpen) {
    return (
      <View style={[styles.container, styles.loading]}>
        <ActivityIndicator size="large" color={AppColors.textSecondary} />
      </View>
    );
  }

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

        {isHnt && (
          <HanetButton
            label="Panel HNT"
            variant="surface"
            onPress={() => router.push('/hnt-admin')}
            style={styles.uiCatalogButton}
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

      <WelcomeCelebration
        visible={!!welcome}
        firstName={welcome?.firstName ?? ''}
        treatment={welcome?.treatment}
        institutionName={welcome?.institutionName}
        onDone={() => setWelcome(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AppColors.textOnLight,
  },
  loading: {
    alignItems: 'center',
    justifyContent: 'center',
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
