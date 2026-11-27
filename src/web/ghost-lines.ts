// The ghost's line before each error (judge ask: "an error message that makes me laugh,
// and I still know what to tap next"). The plain message after it always says what to do.
// A Record over LiveErrorCode: a new error code does not compile until it has a line.
import type { LiveErrorCode } from "./live-exhume.js";

export const GHOST_LINES: Record<LiveErrorCode, string> = {
  "bad-url": "The crypt door only opens for GitHub addresses.",
  "not-found": "We dug. No bones down here.",
  "no-npm-lockfile": "Wrong graveyard: this one buries other languages.",
  "unsupported-lockfile": "These bones are older than our rites.",
  "malformed-lockfile": "The bones are jumbled. Even the ghost can't read them.",
  "rate-limited": "Too many spirits summoned at once. The gate is cooling down.",
  network: "The raven never came back.",
  "too-large": "This coffin will not fit through the door.",
  "osv-unavailable": "The oracle is not answering tonight.",
  "feed-missing": "The book of omens is missing its pages.",
};

/** For errors with no code (an unexpected failure, or a bad upload). */
export const GHOST_FALLBACK = "Something rattled in the dark.";

/** Ghost line, then the plain message. The plain message is never replaced. */
export function withGhost(code: LiveErrorCode | undefined, message: string): string {
  const line = code ? GHOST_LINES[code] : GHOST_FALLBACK;
  return `${line} ${message}`;
}
