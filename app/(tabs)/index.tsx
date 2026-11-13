import { AppColors } from '@/constants/design-tokens';
import { Image } from 'expo-image';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import TopHeader from '@/components/TopHeader';
import InstitutionBanner from '@/components/InstitutionBanner';
import GridMenu from '@/components/GridMenu';
import { consumePendingWelcome, getGreetingProfile, getMyProfile, getOnboardingStep, isOnboardingKnownDone, routeForStep, useRole, useSession } from '@/services/auth-service';
import type { MyProfile, Treatment } from '@/services/auth-service';
import { restoreCached, useCached } from '@/services/cache';
import { listMyHalls } from '@/services/classhall-service';
import { listEvents } from '@/services/events-service';
import { listFeed } from '@/services/feed-service';
import { WelcomeCelebration } from '@/components/WelcomeCelebration';
import { HanetButton } from '@/components/ui/hanet-button';
import { useHomeHighlights } from '@/hooks/use-home-highlights';
import { getAnniversary, homeAnniversary, useAnniversaryState } from '@/services/anniversary-service';
import { AnniversaryCarousel, AnniversaryGlow, anniversaryKicker } from '@/components/anniversary/home-anniversary';
import type { AnniversaryState } from '@/services/anniversary-service';
import { HomeSkeleton } from '@/components/skeletons';
import { markLaunchContentReady } from '@/services/launch-ready';
import { FrostedScreen } from '@/components/ui/frosted-screen';
import { HomeNotificationsPreview, NotificationsPeek } from '@/components/notifications/home-notifications';
import { CLOSE_THRESHOLD, NotificationsPanel } from '@/components/notifications/notifications-panel';
import { usePullDown } from '@/components/notifications/pull-down';
import { loadNotifications, markNotificationsSeen, useNotifications } from '@/services/notifications-service';
import { t } from '@/i18n';
import { DesktopHome } from '@/components/home/desktop-home';
import { useSideNav } from '@/hooks/use-desktop-layout';
import { useDocumentScroll } from '@/hooks/use-document-scroll';
import { PushPermissionDialog } from '@/components/notifications/push-permission-dialog';

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

  // The Aniversario tile: what the phone kept, then the fresh score on every visit.
  const keptAnniversary = useCached<AnniversaryState>(linked ? 'anniversary' : null);
  const anniversary = useAnniversaryState() ?? keptAnniversary;
  useFocusEffect(
    useCallback(() => {
      if (contentLoaded && linked) void getAnniversary().catch(() => undefined);
    }, [contentLoaded, linked])
  );

  // During alianza week the top of the Home dresses up in the alianzas' colors.
  const { width, height: screenHeight } = useWindowDimensions();

  // Notifications (Figma 11011:3217): the Home ends with the latest ones and
  // the section's top peeking out. Pulling past the end, like Instagram's
  // vanish mode, sends the Home up and brings the section up after it;
  // pulling the section down past its top brings the Home back.
  const notifications = useNotifications(linked);
  const [notificationsError, setNotificationsError] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  // What was new when it opened stays marked as new while it is open.
  const [seenBefore, setSeenBefore] = useState(0);
  const open = useSharedValue(0);
  const reduceMotion = useReducedMotion();
  const refreshNotifications = useCallback(() => {
    loadNotifications()
      .then(() => setNotificationsError(false))
      .catch(() => setNotificationsError(true));
  }, []);
  useFocusEffect(
    useCallback(() => {
      if (contentLoaded && linked) refreshNotifications();
    }, [contentLoaded, linked, refreshNotifications])
  );
  const move = useCallback((to: 0 | 1, done?: () => void) => {
    const finish = (finished?: boolean) => {
      'worklet';
      if (finished && done) scheduleOnRN(done);
    };
    open.set(reduceMotion ? withTiming(to, { duration: 180 }, finish) : withSpring(to, OPEN_SPRING, finish));
  }, [open, reduceMotion]);
  const openRef = useRef<() => void>(() => undefined);
  const closeRef = useRef<() => void>(() => undefined);
  const triggerOpen = useCallback(() => openRef.current(), []);
  const triggerClose = useCallback(() => closeRef.current(), []);
  const homePull = usePullDown({ edge: 'end', threshold: OPEN_THRESHOLD, enabled: linked && !panelOpen, onTrigger: triggerOpen });
  const closePull = usePullDown({ edge: 'start', threshold: CLOSE_THRESHOLD, enabled: panelOpen, onTrigger: triggerClose });
  // Each pull resets once the Home has moved, so it starts again from zero.
  const homeLift = homePull.pull;
  const panelLift = closePull.pull;
  const seenAt = notifications?.seenAt ?? 0;
  useEffect(() => {
    openRef.current = () => {
      setSeenBefore(seenAt);
      setPanelOpen(true);
      move(1, () => homeLift.set(0));
      void markNotificationsSeen();
      refreshNotifications();
    };
    closeRef.current = () => {
      setPanelOpen(false);
      move(0, () => panelLift.set(0));
    };
  }, [homeLift, move, panelLift, refreshNotifications, seenAt]);
  // A shortcut (the app icon's or the web app's) opens them right away.
  const { abrir } = useLocalSearchParams<{ abrir?: string }>();
  useEffect(() => {
    if (abrir !== 'notificaciones' || !linked || !contentLoaded) return;
    router.setParams({ abrir: undefined });
    if (!panelOpen) openRef.current();
  }, [abrir, contentLoaded, linked, panelOpen, router]);
  // Android's back button closes the section first.
  useFocusEffect(
    useCallback(() => {
      if (!panelOpen) return;
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        closeRef.current();
        return true;
      });
      return () => subscription.remove();
    }, [panelOpen])
  );
  // On Android the Home itself follows the finger up; iOS bounces the list.
  const homeStyle = useAnimatedStyle(() => {
    const progress = open.get();
    const lift = homePull.translates ? homePull.pull.get() * (1 - progress) : 0;
    return { transform: [{ translateY: -(lift + screenHeight * progress) }] };
  });
  const panelStyle = useAnimatedStyle(() => {
    const progress = open.get();
    const lift = homePull.translates ? homePull.pull.get() * (1 - progress) : 0;
    return { transform: [{ translateY: screenHeight * (1 - progress) - lift }] };
  });
  // Beside the side navigation (wide web window) Home is a board of what
  // each section holds, instead of the grid that opens them.
  const desktop = useSideNav().width > 0 && !!user;
  // On a phone's browser the page scrolls, so its bars shrink (not while the
  // notifications are open: they scroll on their own).
  const homeScroll = useDocumentScroll(gateOpen && !panelOpen);

  const festive = linked ? homeAnniversary(anniversary) : null;
  const openScore = () => router.push('/anniversary/score');

  if (!gateOpen) {
    return (
      <View style={styles.container}>
        <TopHeader />
        <HomeSkeleton />
      </View>
    );
  }

  return (
    <FrostedScreen style={styles.container}>
      <Animated.View
        style={[styles.home, homeStyle]}
        pointerEvents={panelOpen ? 'none' : 'auto'}
        accessibilityElementsHidden={panelOpen}
        importantForAccessibility={panelOpen ? 'no-hide-descendants' : 'auto'}
      >
        <GestureDetector gesture={homePull.gesture}>
          <Animated.ScrollView
            ref={homeScroll}
            contentContainerStyle={[styles.scrollContent, !linked && styles.scrollEnd, desktop && styles.scrollContentWide]}
            showsVerticalScrollIndicator={false}
            onScroll={homePull.onScroll}
            scrollEventThrottle={16}
            overScrollMode={linked ? 'never' : 'auto'}
          >
            {desktop ? (
              <DesktopHome
                institution={shownInstitution && { name: shownInstitution.name, logoUrl: shownInstitution.logoUrl, bannerUrl: shownInstitution.bannerUrl }}
                promoted={promotedEvent}
                anniversary={anniversary}
              />
            ) : (
            <>
            {festive && <AnniversaryGlow alliances={festive.anniversary.alliances} width={Math.min(width, 760)} waving={festive.phase === 'during'} />}
            <TopHeader transparent={!!festive} />
            {!!user && !institutionKnown && <HomeSkeleton grid={false} />}
            {!!shownInstitution && (
              <View style={[styles.banner, festive && styles.festiveBanner]}>
                <InstitutionBanner
                  title={shownInstitution.name}
                  logoUrl={shownInstitution.logoUrl}
                  bannerUrl={shownInstitution.bannerUrl}
                  kicker={festive ? anniversaryKicker(festive.anniversary, festive.phase) : undefined}
                />
              </View>
            )}
            {festive && <AnniversaryCarousel anniversary={festive.anniversary} phase={festive.phase} onOpen={openScore} />}
            <GridMenu nextCalendarItem={nextCalendarItem} promotedEvent={promotedEvent} anniversary={anniversary} />
            </>
            )}


            {!user && (
              <HanetButton
                label={t('common.iniciarSesion')}
                onPress={() => router.push('/auth')}
                style={styles.authButton}
              />
            )}

            {isHnt && !desktop && (
              <HanetButton
                label={t('index.panelHnt')}
                variant="surface"
                onPress={() => router.push('/hnt-admin')}
                style={styles.uiCatalogButton}
              />
            )}

            {linked && <HomeNotificationsPreview state={notifications} onOpen={triggerOpen} />}
            {linked && !desktop && <NotificationsPeek pull={homePull.pull} armed={homePull.armed} threshold={OPEN_THRESHOLD} />}
          </Animated.ScrollView>
        </GestureDetector>
      </Animated.View>

      {linked && (
        <NotificationsPanel
          state={notifications}
          seenBefore={seenBefore}
          error={notificationsError}
          onRetry={refreshNotifications}
          onClose={triggerClose}
          close={closePull}
          visible={panelOpen}
          style={panelStyle}
        />
      )}

      {/* After the splash and the welcome: the first visit asks for notifications. */}
      <PushPermissionDialog ready={linked && contentLoaded && !welcome} />

      <WelcomeCelebration
        visible={!!welcome}
        firstName={welcome?.firstName ?? ''}
        treatment={welcome?.treatment}
        institutionName={welcome?.institutionName}
        onDone={() => setWelcome(null)}
      />
    </FrostedScreen>
  );
}

// How far past the Home's end a pull has to go to open the notifications.
const OPEN_THRESHOLD = Platform.OS === 'ios' ? 110 : 96;
// Critically damped, ~0.45 s: the Home leaves without bouncing back.
const OPEN_SPRING = { stiffness: 200, damping: 28, mass: 1 };

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // What shows past the Home's end: the notifications section's surface.
    backgroundColor: AppColors.surface,
    overflow: 'hidden',
  },
  home: {
    flex: 1,
    backgroundColor: AppColors.textOnLight,
  },
  scrollContent: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
  },
  scrollEnd: {
    paddingBottom: 150,
  },
  // The board centers its own content; its header photo runs full width.
  scrollContentWide: {
    maxWidth: '100%',
    paddingBottom: 48,
  },
  banner: {
    paddingHorizontal: 20,
    marginTop: 10,
    marginBottom: 24,
  },
  festiveBanner: {
    marginTop: 8,
    marginBottom: 12,
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
