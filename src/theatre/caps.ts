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

/** Frame cap for the 3D bench (frames per second). */
export const MAX_FPS = 30;
/** Slack (ms) so a 60 Hz display still lands on every second frame. */
const FRAME_SLACK_MS = 2;
/** No input for this long (ms) and nothing animating: the render loop stops. */
export const IDLE_MS = 6000;
/** Upper bound for the renderer pixel ratio. */
export const MAX_PIXEL_RATIO = 1.5;

export interface RenderState {
  now: number;
  lastInputAt: number;
  dollyActive: boolean;
  flashActive: boolean;
  texDirty: boolean;
  visible: boolean;
}

/** True when a frame at `now` is due under the fps cap. A bad timestamp renders (fail open to a normal frame). */
export function frameDue(now: number, lastRenderAt: number, maxFps: number = MAX_FPS): boolean {
  if (!Number.isFinite(now) || !Number.isFinite(lastRenderAt) || !(maxFps > 0)) return true;
  return now - lastRenderAt >= 1000 / maxFps - FRAME_SLACK_MS;
}

/** Render only while visible and (recent input, or a dolly, flash or texture update is pending). */
export function shouldRender(s: RenderState, idleMs: number = IDLE_MS): boolean {
  if (!s.visible) return false;
  if (s.dollyActive || s.flashActive || s.texDirty) return true;
  if (!Number.isFinite(s.now) || !Number.isFinite(s.lastInputAt)) return true;
  return s.now - s.lastInputAt < idleMs;
}

/** Pixel ratio for the renderer: the device ratio, at most `max`, at least 1. */
export function pixelRatioFor(dpr: unknown, max: number = MAX_PIXEL_RATIO): number {
  const d = typeof dpr === "number" && Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  return Math.min(d, max);
}
