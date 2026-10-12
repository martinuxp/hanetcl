import { BlockedScreen, FatalScreen, OfflineScreen, ServerScreen } from '@/components/errors/AppErrorScreens';
import { clearAppError, isAppErrorPreview, isBlockedError, showAppError, useAppError } from '@/services/app-error';
import { useSession } from '@/services/auth-service';
import { checkConnection } from '@/services/connection';
import React, { Component, useCallback, useEffect, useRef, useState } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

// A resume shortly after the last check does not check again.
const RECHECK_AFTER_MS = 60_000;

/**
 * Watches for the problems that stop the app and draws their screen over
 * everything, the tab bar included: on launch and each time the app comes
 * back to the front it checks the connection and, with a session, whether the
 * HaNet ID was blocked.
 */
export function AppErrorLayer() {
  const kind = useAppError();
  const { user } = useSession();
  const [retrying, setRetrying] = useState(false);
  const lastCheck = useRef(0);

  const check = useCallback(async () => {
    lastCheck.current = Date.now();
    const status = await checkConnection();
    if (status !== 'ok') {
      showAppError(status);
      return false;
    }
    if (user) {
      try {
        // Asks Firebase Auth for the account; a blocked one is disabled there.
        await user.reload();
      } catch (error) {
        if (isBlockedError(error)) {
          showAppError('blocked');
          return false;
        }
      }
    }
    return true;
  }, [user]);

  useEffect(() => {
    void check();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active' && Date.now() - lastCheck.current > RECHECK_AFTER_MS) void check();
    });
    return () => subscription.remove();
  }, [check]);

  const retry = async () => {
    if (isAppErrorPreview()) {
      clearAppError();
      return;
    }
    setRetrying(true);
    const ok = await check();
    setRetrying(false);
    if (ok) clearAppError();
  };

  if (!kind) return null;
  const common = { onDismiss: clearAppError, signedIn: !!user, preview: isAppErrorPreview() };
  return (
    <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={styles.layer}>
      {kind === 'blocked' && <BlockedScreen {...common} />}
      {kind === 'server' && <ServerScreen {...common} onRetry={retry} retrying={retrying} />}
      {kind === 'offline' && <OfflineScreen {...common} onRetry={retry} retrying={retrying} />}
    </Animated.View>
  );
}

type BoundaryState = { failed: boolean };

/** Catches a crash anywhere below it and shows the fatal error screen instead of a blank app. */
export class FatalBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('HaNet se detuvo por un error', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <View style={styles.fatal}>
        <FatalScreen onDismiss={() => this.setState({ failed: false })} />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFill,
    zIndex: 1000,
    elevation: 30,
  },
  fatal: {
    flex: 1,
  },
});
