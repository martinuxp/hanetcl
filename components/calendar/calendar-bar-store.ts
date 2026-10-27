import { useSyncExternalStore } from 'react';

// What the Calendar shares with the global bar: the view on screen, which the
// bar's center pill names, and the menu that grows out of that pill to change
// it. The menu asks; the screen moves (it owns the zoom between views).

export type CalendarView = 'day' | 'week' | 'month' | 'year' | 'schedule';

export const CALENDAR_VIEWS: { view: CalendarView; label: string }[] = [
  { view: 'day', label: 'Día' },
  { view: 'week', label: 'Semana' },
  { view: 'month', label: 'Mes' },
  { view: 'year', label: 'Año' },
  { view: 'schedule', label: 'Horario' },
];

export const viewLabel = (view: CalendarView) => CALENDAR_VIEWS.find(item => item.view === view)?.label ?? '';

/** Moves the screen to `view`; `today` also brings it back to today. */
type ChooseHandler = (view: CalendarView, today: boolean) => void;

type State = {
  view: CalendarView;
  menuOpen: boolean;
};

let state: State = { view: 'day', menuOpen: false };
let chooser: ChooseHandler | null = null;
const listeners = new Set<() => void>();

function set(changes: Partial<State>) {
  state = { ...state, ...changes };
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCalendarBar() {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

export const calendarBar = {
  setView: (view: CalendarView) => { if (view !== state.view) set({ view }); },
  openMenu: () => set({ menuOpen: true }),
  closeMenu: () => { if (state.menuOpen) set({ menuOpen: false }); },
  toggleMenu: () => set({ menuOpen: !state.menuOpen }),
  /** Closes the menu and asks the screen for `view`. */
  choose: (view: CalendarView, today = false) => {
    set({ menuOpen: false });
    chooser?.(view, today);
  },
  /** The Calendar screen takes the menu's choices while it is mounted. */
  handleChoose: (handler: ChooseHandler) => {
    chooser = handler;
    return () => {
      if (chooser === handler) chooser = null;
    };
  },
};
