// Sound plan (Epic B4). Pure numbers for the WebAudio glue in web/theatre/sound.js.
// Sound is off on load; nothing here starts audio. The glue creates an AudioContext only after a click.

export const MIN_BPM = 48;
export const MAX_BPM = 150;
const BPM_PER_POSSESSED = 12;

/** Heartbeat rate from the count of possessed limbs: monotonic, clamped to [MIN_BPM, MAX_BPM]. Bad input counts as 0. */
export function heartbeatBpm(possessed: number): number {
  const n = Number.isFinite(possessed) && possessed > 0 ? Math.floor(possessed) : 0;
  return Math.min(MAX_BPM, MIN_BPM + n * BPM_PER_POSSESSED);
}

export function beatIntervalMs(possessed: number): number {
  return 60000 / heartbeatBpm(possessed);
}

/** Counts limbs whose state is exactly "Possessed". Anything malformed is ignored. */
export function countPossessed(limbs: unknown): number {
  if (!Array.isArray(limbs)) return 0;
  let n = 0;
  for (const l of limbs) if (l !== null && typeof l === "object" && (l as { state?: unknown }).state === "Possessed") n++;
  return n;
}
