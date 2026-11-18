// Issue #41 item 4: a shared team record on creature.json. Only the scan start time, never a person.
// Pure and total: never throws, never mutates its input.

/** The previous scanStart when it is a finite positive number not after nowMs, else undefined. */
export function previousScanStart(previousRaw: unknown, nowMs: number): number | undefined {
  try {
    const parsed: unknown = typeof previousRaw === "string" ? JSON.parse(previousRaw) : previousRaw;
    const team = parsed && typeof parsed === "object" ? (parsed as { team?: unknown }).team : undefined;
    const s = team && typeof team === "object" ? (team as { scanStart?: unknown }).scanStart : undefined;
    return typeof s === "number" && Number.isFinite(s) && s > 0 && s <= nowMs ? s : undefined;
  } catch {
    return undefined;
  }
}

/** Returns a copy of creature with team: { scanStart }. Junk creature is returned unchanged. */
export function stampTeam<T>(creature: T, previousRaw: unknown, nowMs: number): T {
  if (!creature || typeof creature !== "object" || Array.isArray(creature)) return creature;
  const scanStart = previousScanStart(previousRaw, nowMs) ?? nowMs;
  return { ...(creature as object), team: { scanStart } } as T;
}
