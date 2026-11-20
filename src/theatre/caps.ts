// Runtime caps for the 3D theatre: a limb cap with an "N more" aggregate, and a frame-rate guard.
// Pure functions; web/theatre/stage.js gathers the inputs.

/** Most limbs drawn on the 3D plate. The rest are summed up as "N more". */
export const MAX_LIMBS = 60;
/** Frames measured before the guard decides. */
export const GUARD_FRAMES = 10;
/** Median frame time above this (ms) means a slow device (under about 20 fps). */
export const SLOW_FRAME_MS = 50;

export interface LimbCap<T> {
  shown: T[];
  more: number;
}

export function capLimbs<T>(limbs: readonly T[], max: number = MAX_LIMBS): LimbCap<T> {
  const n = Number.isFinite(max) ? Math.max(0, Math.floor(max)) : 0;
  const shown = limbs.slice(0, n);
  return { shown, more: limbs.length - shown.length };
}

export function moreLabel(more: number): string {
  return more > 0 ? `${more} more` : "";
}

/** Slow when the median of the frame deltas (ms) exceeds the threshold. Needs at least `minFrames` deltas. */
export function isSlowDevice(deltas: readonly number[], threshold: number = SLOW_FRAME_MS, minFrames: number = GUARD_FRAMES): boolean {
  const ok = deltas.filter((d) => Number.isFinite(d) && d >= 0);
  if (ok.length < minFrames || ok.length === 0) return false;
  const s = [...ok].sort((a, b) => a - b);
  const mid = s.length >> 1;
  const median = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  return median > threshold;
}

/** Automated browsers (navigator.webdriver, e.g. CI visual-qa on a software renderer) skip the guard. Real users keep it. */
export function shouldRunGuard(webdriver: unknown): boolean {
  return webdriver !== true;
}
