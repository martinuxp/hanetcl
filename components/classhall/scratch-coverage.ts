// How much of a scratch card has been scratched off, on a coarse grid: each
// stroke clears the cells within the brush, and past REVEAL_AT the card
// uncovers itself. Shared by the phone (Skia) and web (canvas) covers.

export const BRUSH_RADIUS = 22;
export const REVEAL_AT = 0.5;
const COLUMNS = 24;
const ROWS = 10;

export type ScratchCardProps = {
  /** What lies under the cover: the grade. */
  children: React.ReactNode;
  height: number;
  /** Covered until this turns true; the parent keeps it. */
  revealed: boolean;
  onReveal: () => void;
  /** The finger is on the cover (the parent stops its scroll meanwhile). */
  onScratching?: (active: boolean) => void;
  /** Spoken while it is covered, e.g. "Nota de Prueba 2, tapada". */
  accessibilityLabel: string;
  accessibilityHint?: string;
  /** Short line on the cover. */
  label: string;
};

export function createCoverage(width: number, height: number) {
  const cleared = new Uint8Array(COLUMNS * ROWS);
  let count = 0;
  const cellWidth = width / COLUMNS;
  const cellHeight = height / ROWS;

  const clearAround = (x: number, y: number) => {
    const fromColumn = Math.max(0, Math.floor((x - BRUSH_RADIUS) / cellWidth));
    const toColumn = Math.min(COLUMNS - 1, Math.floor((x + BRUSH_RADIUS) / cellWidth));
    const fromRow = Math.max(0, Math.floor((y - BRUSH_RADIUS) / cellHeight));
    const toRow = Math.min(ROWS - 1, Math.floor((y + BRUSH_RADIUS) / cellHeight));
    for (let row = fromRow; row <= toRow; row += 1) {
      for (let column = fromColumn; column <= toColumn; column += 1) {
        const index = row * COLUMNS + column;
        if (cleared[index]) continue;
        const centerX = (column + 0.5) * cellWidth;
        const centerY = (row + 0.5) * cellHeight;
        if ((centerX - x) ** 2 + (centerY - y) ** 2 <= BRUSH_RADIUS ** 2) {
          cleared[index] = 1;
          count += 1;
        }
      }
    }
  };

  return {
    /** Clears along the segment from (x0, y0) to (x1, y1). Returns the share scratched off. */
    stroke(x0: number, y0: number, x1: number, y1: number) {
      const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 6));
      for (let step = 0; step <= steps; step += 1) {
        clearAround(x0 + ((x1 - x0) * step) / steps, y0 + ((y1 - y0) * step) / steps);
      }
      return count / cleared.length;
    },
  };
}

/**
 * One card's scratching, outside React: where the finger was, how much is
 * gone, and when to tick. `paint` draws each segment, `reveal` runs once when
 * enough is gone (or the button uncovers it), `tick` asks for a soft haptic
 * now and then.
 */
export function createScratchSession(handlers: { paint: (from: { x: number; y: number }, to: { x: number; y: number }) => void; reveal: () => void; tick?: () => void }) {
  let coverage: ReturnType<typeof createCoverage> | null = null;
  let last: { x: number; y: number } | null = null;
  let lastTick = 0;
  let done = false;
  return {
    resize(width: number, height: number) {
      if (width > 0 && height > 0) coverage = createCoverage(width, height);
    },
    begin(x: number, y: number) {
      last = null;
      this.move(x, y);
    },
    move(x: number, y: number) {
      if (done || !coverage) return;
      const from = last ?? { x, y };
      last = { x, y };
      handlers.paint(from, last);
      const share = coverage.stroke(from.x, from.y, x, y);
      const now = Date.now();
      if (handlers.tick && now - lastTick > 90) {
        lastTick = now;
        handlers.tick();
      }
      if (share >= REVEAL_AT) this.finish();
    },
    end() {
      last = null;
    },
    isActive() {
      return last !== null;
    },
    /** Uncovered: by scratching enough, or by the button. */
    finish() {
      if (done) return;
      done = true;
      handlers.reveal();
    },
  };
}
