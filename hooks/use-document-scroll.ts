import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { DOCUMENT_SCROLL_CLASS as ROOT_CLASS, DOCUMENT_SCROLL_SPACER as SPACER_ID } from '@/constants/document-scroll';
import { useDesktopNav } from '@/hooks/use-desktop-layout';

// Phone browsers only shrink their bars (Safari's toolbar, Chrome's address
// bar) while the page itself scrolls, never while a box inside it does. The
// app draws every screen inside a box the size of the window, so on the
// phone layout of the web the screen's main list lends its scroll to the
// page: the app stays fixed over the whole window, an empty block under it
// makes the page as tall as the list, and scrolling the page scrolls the
// list to the same place. The list still sends its own scroll events, so
// everything that reads them keeps working.
//
// Only one screen holds the page at a time: the one on screen. Wide windows
// (side navigation) keep scrolling inside the box, as on a computer.

let owner: symbol | null = null;

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
    if (!active) return;
    const node = scrollNode(list);
    if (!node) return;
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

    const start = node.scrollTop;
    root.classList.add(ROOT_CLASS);
    // The finger moves the page, not the list (it still scrolls from code).
    node.style.overflowY = 'hidden';

    const range = () => Math.max(0, node.scrollHeight - node.clientHeight);
    const size = () => {
      page.style.height = `${range() + window.innerHeight}px`;
    };
    // Where `follow` last put the list, to tell its own moves from the screen's.
    let placed = node.scrollTop;
    const follow = () => {
      const y = Math.min(range(), Math.max(0, window.scrollY));
      placed = y;
      if (Math.abs(node.scrollTop - y) >= 0.5) node.scrollTop = y;
    };
    size();
    window.scrollTo(0, start);
    follow();

    // The screen scrolled its list from code ("Volver arriba"): the page goes along.
    const lead = () => {
      if (Math.abs(node.scrollTop - placed) < 1) return;
      placed = node.scrollTop;
      window.scrollTo(0, node.scrollTop);
    };

    window.addEventListener('scroll', follow, { passive: true });
    node.addEventListener('scroll', lead, { passive: true });
    window.addEventListener('resize', size);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
      size();
      follow();
    });
    observer?.observe(node);
    for (const child of Array.from(node.children)) observer?.observe(child);

    return () => {
      window.removeEventListener('scroll', follow);
      node.removeEventListener('scroll', lead);
      window.removeEventListener('resize', size);
      observer?.disconnect();
      const kept = node.scrollTop;
      node.style.overflowY = '';
      node.scrollTop = kept;
      // Another screen may already hold the page.
      if (owner !== id) return;
      owner = null;
      root.classList.remove(ROOT_CLASS);
      page.style.height = '0px';
      window.scrollTo(0, 0);
    };
  }, [active, list]);

  return setList;
}
