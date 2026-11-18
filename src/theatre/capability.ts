// Decides whether the page mounts the 3D bench or keeps the plain 2D page.
// Pure function: the browser glue in web/theatre.js gathers the inputs.

export interface CapabilityInputs {
  /** A WebGL2 context could be created. */
  webgl2: boolean;
  /** `prefers-reduced-motion: reduce` matches. */
  reducedMotion: boolean;
  /** High-contrast reader mode is on (localStorage `crypt.hc` or `body.hc`). */
  highContrast: boolean;
  /** Value of the `theatre` query parameter, or null when absent. */
  flag: string | null;
  /** Viewport width in CSS pixels. */
  viewportWidth: number;
  /** The primary pointer is coarse (`pointer: coarse` matches). */
  coarsePointer: boolean;
}

/** Below this width the 2D page is the default. */
export const SMALL_SCREEN_MAX_WIDTH = 900;

export type TheatreMode = "3d" | "2d";
export type TheatreReason = "ok" | "flag-off" | "high-contrast" | "reduced-motion" | "no-webgl2" | "small-screen";

export interface TheatreDecision {
  mode: TheatreMode;
  reason: TheatreReason;
}

/** The 2D page is the default for any doubt. Order: explicit off flag, access needs, hardware, then small screens (`?theatre=3d` overrides only the small-screen rule). */
export function decideTheatre(input: CapabilityInputs): TheatreDecision {
  const flag = input.flag === null ? null : input.flag.toLowerCase();
  if (flag === "off" || flag === "2d") return { mode: "2d", reason: "flag-off" };
  if (input.highContrast) return { mode: "2d", reason: "high-contrast" };
  if (input.reducedMotion) return { mode: "2d", reason: "reduced-motion" };
  if (!input.webgl2) return { mode: "2d", reason: "no-webgl2" };
  if (flag !== "3d" && (input.viewportWidth < SMALL_SCREEN_MAX_WIDTH || input.coarsePointer)) {
    return { mode: "2d", reason: "small-screen" };
  }
  return { mode: "3d", reason: "ok" };
}
