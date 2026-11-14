/**
 * Heights each sheet screen can rest at, as fractions of the screen height,
 * smallest first; it opens at the first one. The root layout gives them to
 * the native iOS sheet and the HaNet sheet (sheet-frame.tsx) reads them on
 * Android and the web, so both stop at the same places.
 */
export const SHEET_DETENTS: Record<string, number[]> = {
  'event-form': [1.0],
  'event-options': [0.5],
  'feed-post': [1.0],
  'create-event': [0.5, 1.0],
  'day-change': [1.0],
  'edit-profile': [0.75, 1.0],
  'classhall/join': [0.75, 1.0],
  'classhall/create': [0.75, 1.0],
  'classhall/announce': [0.75, 1.0],
  'classhall/evaluation-new': [0.5],
  'classhall/evaluation-form': [1.0],
  'classhall/grades': [1.0],
  'classhall/task-form': [1.0],
  'classhall/submit': [0.85, 1.0],
  'classhall/submission': [0.75, 1.0],
  'anniversary/setup': [1.0],
  'anniversary/activity': [1.0],
  'anniversary/detail': [0.75, 1.0],
  'anniversary/result': [0.75, 1.0],
  'anniversary/points': [0.75, 1.0],
  'anniversary/deadline': [0.75, 1.0],
  'anniversary/flash': [1.0],
  'anniversary/leads': [0.75, 1.0],
  'anniversary/score': [0.85, 1.0],
};

export function sheetDetents(route: string) {
  return SHEET_DETENTS[route] ?? [1.0];
}

/**
 * On a wide web window a sheet is a centered card. A card as tall as the
 * window leaves short forms floating in empty space, so it gets a height
 * of its own: these, or at most CARD_MAX_HEIGHT.
 */
export const CARD_MAX_HEIGHT = 820;
const CARD_HEIGHTS: Record<string, number> = {
  'classhall/join': 500,
};

export function cardHeight(route: string) {
  return CARD_HEIGHTS[route] ?? CARD_MAX_HEIGHT;
}
