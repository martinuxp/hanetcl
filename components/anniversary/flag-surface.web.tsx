// On the web Skia needs CanvasKit loaded first, which the app doesn't do, so
// the gradient cards keep their SVG blobs and still halftone there.

export const FLAG_AVAILABLE = false;

export function FlagSurface(_props: { base: string; colors: string[]; width: number; height: number }) {
  return null;
}
