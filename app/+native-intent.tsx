// Links that open the app from outside. The iOS share extension opens
// hanetcl://dataUrl=hanetclShareKey…, which isn't a screen: ShareIntake (root
// layout) reads the shared file and opens /share, so here it goes to Home.
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    if (path.includes('dataUrl=')) return '/';
    return path;
  } catch {
    return '/';
  }
}
