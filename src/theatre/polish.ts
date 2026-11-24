// Pure decisions for the B5 polish: title card timing, recording-mode flag, camera dolly.
// The browser glue (web/theatre/stage.js, web/theatre.js) only reads the clock and the DOM.

/** The cold open stays on screen this long unless the viewer skips it. */
export const TITLE_CARD_MS = 3000;
/** Verbatim title card text. */
export const TITLE_CARD_TEXT = "CRYPT \u2014 Don't abandon your creature.";
/** Length of the camera move toward the CRT. */
export const DOLLY_MS = 1200;

export interface TitleCardInputs {
  /** The 3D bench is mounted. The 2D page never shows a card. */
  mode3d: boolean;
  reducedMotion: boolean;
}

/** Card only on the 3D path, and not under reduced motion. */
export function shouldShowTitleCard(input: TitleCardInputs): boolean {
  return input.mode3d && !input.reducedMotion;
}

/** True while the card should still cover the scene. Any skip clears it at once. */
export function titleCardVisible(elapsedMs: number, skipped: boolean): boolean {
  if (skipped) return false;
  return elapsedMs < TITLE_CARD_MS;
}

/** `?record=1` (also `true` or `on`, any case) turns recording mode on. Anything else leaves it off. */
export function parseRecordFlag(search: string): boolean {
  const v = new URLSearchParams(search).get("record");
  if (v === null) return false;
  return ["1", "true", "on"].includes(v.trim().toLowerCase());
}

/** Escape leaves recording mode. Other keys never change it. */
export function recordModeAfterKey(recording: boolean, key: string): boolean {
  return recording && key === "Escape" ? false : recording;
}

/** Dolly progress from 0 (start position) to 1 (at the CRT). Instant under reduced motion. Ease-out, monotonic. */
export function dollyProgress(elapsedMs: number, reducedMotion: boolean): number {
  if (reducedMotion) return 1;
  if (!(elapsedMs > 0)) return 0;
  if (elapsedMs >= DOLLY_MS) return 1;
  const t = elapsedMs / DOLLY_MS;
  return 1 - Math.pow(1 - t, 3); // ease-out cubic, same family as --ease-out in web/style.css
}
