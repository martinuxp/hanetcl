import { AppColors } from '@/constants/design-tokens';
import { Image } from 'expo-image';
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import TopHeader from '@/components/TopHeader';
import InstitutionBanner from '@/components/InstitutionBanner';
import GridMenu from '@/components/GridMenu';
import { consumePendingWelcome, getGreetingProfile, getMyProfile, getOnboardingStep, isOnboardingKnownDone, routeForStep, useRole, useSession } from '@/services/auth-service';
import type { MyProfile, Treatment } from '@/services/auth-service';
import { restoreCached } from '@/services/cache';
import { listMyHalls } from '@/services/classhall-service';
import { listEvents } from '@/services/events-service';
import { listFeed } from '@/services/feed-service';
import { WelcomeCelebration } from '@/components/WelcomeCelebration';
import { HanetButton } from '@/components/ui/hanet-button';
import { useHomeHighlights } from '@/hooks/use-home-highlights';
import { HomeSkeleton } from '@/components/skeletons';
import { markLaunchContentReady } from '@/services/launch-ready';

export default function HomeScreen() {
  const router = useRouter();
  const { user, initializing } = useSession();
  // Only decides whether to draw the entry; the panel and its backend check the role again.
  const isHnt = useRole() === 'HNT';

  // The account's institution and its identity (shield and banner), set in
  // the HNT panel. Reloaded on every visit; the last one stays while it loads.
  const [institution, setInstitution] = useState<{ uid: string; name: string; logoUrl: string | null; bannerUrl: string | null } | null>(null);
  // Which account the banner is known for (with its photos downloaded, so
  // they don't fade in after the splash), even if there is none.
  const [institutionUid, setInstitutionUid] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let active = true;
      const show = (profile: MyProfile) => setInstitution(profile.institutionName
        ? { uid: user.uid, name: profile.institutionName, logoUrl: profile.institutionLogoUrl ?? null, bannerUrl: profile.institutionBannerUrl ?? null }
        : null);
      // The banner the phone kept (its photos are already on disk) shows
      // right away; the fresh profile replaces it when it arrives.
      let fresh = false;
      void restoreCached<MyProfile>('profile').then(kept => {
        if (!active || !kept || fresh) return;
        show(kept);
        setInstitutionUid(user.uid);
      });
      getMyProfile()
        .then(async profile => {
          fresh = true;
          if (!active) return;
          const urls = [profile.institutionBannerUrl, profile.institutionLogoUrl].filter((url): url is string => !!url);
          // A photo that never arrives must not hold back the banner.
          if (urls.length) await Promise.race([Image.prefetch(urls).catch(() => false), new Promise(resolve => setTimeout(resolve, 4000))]);
          if (!active) return;
          show(profile);
        })
        .catch(() => undefined)
        .finally(() => { if (active) setInstitutionUid(user.uid); });
      return () => { active = false; };
    }, [user])
  );
  const shownInstitution = user && institution?.uid === user.uid ? institution : null;
  const institutionKnown = !!user && institutionUid === user.uid;
  const { nextCalendarItem, promotedEvent, loaded: highlightsLoaded } = useHomeHighlights();

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
        else {
          router.replace(routeForStep(step));
          // The step it goes to has its own content; nothing to wait for here.
          markLaunchContentReady();
        }
      })
      // Offline or a failed read: let the account in rather than lock it out.
      .catch(() => { if (active) setCheckedUid(user.uid); });
    return () => { active = false; };
  }, [router, user]);

  // Opening the app, the splash stays up until Home has all of this.
  const contentLoaded = gateOpen && (!user || (institutionKnown && highlightsLoaded));
  useEffect(() => {
    if (contentLoaded) markLaunchContentReady();
  }, [contentLoaded]);

  // With Home on screen, the other sections load behind it: they open with
  // their content, and their functions are already awake.
  const linked = gateOpen && !!user && isOnboardingKnownDone(user);
  useEffect(() => {
    if (!contentLoaded || !linked) return;
    void listFeed().catch(() => undefined);
    void listMyHalls().catch(() => undefined);
    void listEvents('institution').catch(() => undefined);
  }, [contentLoaded, linked]);

  if (!gateOpen) {
    return (
      <View style={styles.container}>
        <TopHeader />
        <HomeSkeleton />
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
        {!!user && !institutionKnown && <HomeSkeleton grid={false} />}
        {!!shownInstitution && (
          <View style={styles.banner}>
            <InstitutionBanner title={shownInstitution.name} logoUrl={shownInstitution.logoUrl} bannerUrl={shownInstitution.bannerUrl} />
          </View>
        )}
        <GridMenu nextCalendarItem={nextCalendarItem} promotedEvent={promotedEvent} />

        {!user && (
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
  scrollContent: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingBottom: 150,
  },
  banner: {
    paddingHorizontal: 20,
    marginTop: 10,
    marginBottom: 24,
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
