import { useSyncExternalStore } from 'react';

// What a screen shares with the global bar: the search, which opens in the bar
// itself (HaNet Eventos and the feed), the button that sits beside it to
// publish (the feed, for those who can), and the buying options of the event
// on screen.

export type EventBarActions = {
  title: string;
  ticketUrl: string;
  sourceName: string;
  coupon: { code: string; description: string } | null;
};

/** The round "+" beside the search. */
export type EventBarCompose = { label: string; onPress: () => void };

type State = {
  searchOpen: boolean;
  query: string;
  actions: EventBarActions | null;
  compose: EventBarCompose | null;
};

let state: State = { searchOpen: false, query: '', actions: null, compose: null };
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
  openSearch: () => set({ searchOpen: true }),
  closeSearch: () => set({ searchOpen: false, query: '' }),
  setQuery: (query: string) => set({ query }),
  setActions: (actions: EventBarActions | null) => set({ actions }),
  setCompose: (compose: EventBarCompose | null) => set({ compose }),
};
