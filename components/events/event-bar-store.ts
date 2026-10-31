import { useSyncExternalStore } from 'react';

// What a screen shares with the global bar: the search, which opens in the bar
// itself (HaNet Eventos and the feed), the feed's way to publish (for those
// who can, a menu with the search and "Crear" grows out of the bar), and the
// buying options of the event on screen.

export type EventBarActions = {
  title: string;
  ticketUrl: string;
  sourceName: string;
  coupon: { code: string; description: string } | null;
};

/** "Crear" in the feed's menu. */
export type EventBarCompose = { label: string; onPress: () => void };

type State = {
  searchOpen: boolean;
  query: string;
  actions: EventBarActions | null;
  compose: EventBarCompose | null;
  menuOpen: boolean;
};

let state: State = { searchOpen: false, query: '', actions: null, compose: null, menuOpen: false };
const listeners = new Set<() => void>();

function set(changes: Partial<State>) {
  state = { ...state, ...changes };
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useEventBar() {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

export const eventBar = {
  openSearch: () => set({ searchOpen: true, menuOpen: false }),
  closeSearch: () => set({ searchOpen: false, query: '' }),
  setQuery: (query: string) => set({ query }),
  setActions: (actions: EventBarActions | null) => set({ actions }),
  setCompose: (compose: EventBarCompose | null) => set(compose ? { compose } : { compose, menuOpen: false }),
  toggleMenu: () => set({ menuOpen: !state.menuOpen }),
  closeMenu: () => { if (state.menuOpen) set({ menuOpen: false }); },
};
