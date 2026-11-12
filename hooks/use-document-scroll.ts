import { useFocusEffect, usePathname } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { DOCUMENT_SCROLL_CLASS as ROOT_CLASS, DOCUMENT_SCROLL_SPACER as SPACER_ID } from '@/constants/document-scroll';
import { useDesktopNav } from '@/hooks/use-desktop-layout';

// Phone browsers only shrink their bars (Safari's toolbar, Chrome's address
// bar) while the page itself scrolls, never while a box inside it does. The
// app draws every screen inside a box the size of the window, so on the
// phone layout of the web the screen's main list lends its scroll to the
// page: the app stays fixed over the whole window, an empty block under it
// makes the page as tall as the list, and the list's content slides with
// the page's scroll through a scroll-linked animation, which the browser
// runs itself (moving it from script lagged a frame behind the finger).
// The list doesn't scroll, so it sends no scroll events: only ScrollViews
// whose screen doesn't read them use this (not virtualized FlatLists).
//
// Only one screen holds the page at a time: the one on screen. Wide windows
// (side navigation) keep scrolling inside the box, as on a computer.

let owner: symbol | null = null;
// Where each screen's list was when it let go of the page, by route: a
// hidden list forgets its place, and going back can draw the screen anew.
const places = new Map<string, number>();

declare const ScrollTimeline: {
  new (options: { source: Element; axis?: 'block' | 'inline' | 'x' | 'y' }): AnimationTimeline;
};

/**
 * Browsers that move an animation with the page's scroll, pixel for pixel
 * (Chrome 115+, Safari 26+). Without it the list keeps scrolling inside the
 * app, as before: following the page from script lags behind the finger.
 */
export function scrollLinked() {
  return (
    typeof window !== 'undefined' &&
    'ScrollTimeline' in window &&
    typeof CSS !== 'undefined' &&
    CSS.supports('animation-range', '0px 1px')
  );
}

// How far the content can follow the page. The animation maps each pixel of
// the page's scroll to one pixel of the content up to here, so it never has
// to change when the window or the list does (Safari resizes the window every
// time its bar shows or hides, and remaking the animation flashed the list to
// its top for a frame). The empty block under the app sets the real end.
const FOLLOW = 1_000_000;

/** Whether a screen's list is scrolling with the page right now. */
export function pageScrolls() {
  return typeof document !== 'undefined' && document.documentElement.classList.contains(ROOT_CLASS);
}

type Scrollable = {
  getScrollableNode?: () => unknown;
  getNativeScrollRef?: () => unknown;
};

function scrollNode(target: unknown): HTMLElement | null {
  if (typeof HTMLElement === 'undefined' || !target) return null;
  if (target instanceof HTMLElement) return target;
  const scrollable = target as Scrollable;
  const node = scrollable.getScrollableNode?.() ?? scrollable.getNativeScrollRef?.();
  if (node instanceof HTMLElement) return node;
  return scrollNode(node === target ? null : node);
}

/**
 * Lets the page scroll for this screen's main list (phone web only). Returns
 * the ref for that list (a ScrollView or FlatList).
 */
export function useDocumentScroll(enabled = true): (list: unknown) => void {
  const [list, setList] = useState<unknown>(null);
  const pathname = usePathname();
  // (expo-router's focus effect also works where a screen is drawn outside a navigator.)
  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, [])
  );
  const phoneLayout = useDesktopNav() === 'bar';
  const active = Platform.OS === 'web' && enabled && focused && phoneLayout;

  useEffect(() => {
    if (!active || !scrollLinked()) return;
    const node = scrollNode(list);
    const content = node?.firstElementChild;
    if (!node || !(content instanceof HTMLElement)) return;
    const id = Symbol('document-scroll');
    owner = id;
    const root = document.documentElement;
    let spacer = document.getElementById(SPACER_ID);
    if (!spacer) {
      spacer = document.createElement('div');
      spacer.id = SPACER_ID;
      spacer.setAttribute('aria-hidden', 'true');
      document.body.appendChild(spacer);
    }
    const page = spacer;

    const start = places.get(pathname) ?? node.scrollTop;
    root.classList.add(ROOT_CLASS);
    // The finger moves the page; the list itself stays at its top and its
    // content slides with the page.
    node.style.overflowY = 'hidden';
    node.scrollTop = 0;

    // The layout height, which a transform doesn't change (scrollHeight does).
    const range = () => Math.max(0, content.offsetHeight - node.clientHeight);
    // Run by the browser's compositor from the page's scroll, frame by
    // frame with the finger: no script between the scroll and the content.
    const animation = content.animate(
      [{ transform: 'translateY(0px)' }, { transform: `translateY(${-FOLLOW}px)` }],
      {
        timeline: new ScrollTimeline({ source: document.scrollingElement ?? root, axis: 'block' }),
        rangeStart: '0px',
        rangeEnd: `${FOLLOW}px`,
        fill: 'both',
        easing: 'linear',
      } as KeyframeAnimationOptions,
    );
    let pending: number | null = start;
    let laidOut = -1;
    const layout = () => {
      // Hidden (leaving, or not back yet): nothing to measure.
      if (node.clientHeight === 0) return;
      const distance = range();
      laidOut = distance;
      page.style.height = `${distance + window.innerHeight}px`;
      // Back where it was, once the screen has its height again.
      if (pending !== null && (distance > 0 || pending === 0)) {
        window.scrollTo(0, Math.min(pending, distance));
        pending = null;
      }
    };
    layout();

    window.addEventListener('resize', layout);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(layout);
    observer?.observe(node);
    observer?.observe(content);

    return () => {
      window.removeEventListener('resize', layout);
      observer?.disconnect();
      // (By the last layout: a screen being left may already be hidden, with no height.)
      const kept = Math.min(Math.max(laidOut, 0), Math.max(0, window.scrollY));
      places.set(pathname, kept);
      animation.cancel();
      node.style.overflowY = '';
      node.scrollTop = kept;
      // Another screen may already hold the page.
      if (owner !== id) return;
      owner = null;
      root.classList.remove(ROOT_CLASS);
      page.style.height = '0px';
      window.scrollTo(0, 0);
    };
  }, [active, list, pathname]);

  return setList;
}
