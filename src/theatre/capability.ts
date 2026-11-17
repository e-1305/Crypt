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
}

export type TheatreMode = "3d" | "2d";
export type TheatreReason = "ok" | "flag-off" | "high-contrast" | "reduced-motion" | "no-webgl2";

export interface TheatreDecision {
  mode: TheatreMode;
  reason: TheatreReason;
}

/** The 2D page is the default for any doubt. Order: explicit flag, access needs, then hardware. */
export function decideTheatre(input: CapabilityInputs): TheatreDecision {
  if (input.flag !== null && input.flag.toLowerCase() === "off") return { mode: "2d", reason: "flag-off" };
  if (input.highContrast) return { mode: "2d", reason: "high-contrast" };
  if (input.reducedMotion) return { mode: "2d", reason: "reduced-motion" };
  if (!input.webgl2) return { mode: "2d", reason: "no-webgl2" };
  return { mode: "3d", reason: "ok" };
}
