/**
 * Shared motion helpers (Apple's "Designing Fluid Interfaces" model).
 * Springs are given as stiffness/damping for mass 1: response r gives
 * stiffness (2π/r)², and damping ratio ζ gives damping 2ζ·√stiffness.
 */

/** Critically damped, ~0.3 s: moves without bouncing. */
export const SPRING_SMOOTH = { stiffness: 440, damping: 42, mass: 1 };

/** Damping ratio 0.8, ~0.3 s: for releases that carried momentum (sheets, flicks). */
export const SPRING_MOMENTUM = { stiffness: 440, damping: 34, mass: 1 };

/** Where a flick would come to rest, as scroll deceleration projects it. */
export function project(velocity: number, decelerationRate = 0.998) {
  'worklet';
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/** Past a bound, the further it is pulled the less it follows. */
export function rubberband(overshoot: number, dimension: number, constant = 0.55) {
  'worklet';
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}
