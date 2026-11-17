// Seal state for the hosted page. SEAL CRYPT freezes agent actions until the page is reloaded (the CLI keeps .crypt-seal instead).
// Events are judged in the order the story printed them, so a SEAL and a later GRAFT in one result are handled correctly.
export interface SealEvent {
  ok: boolean;
  parsed?: { verb?: string; limb?: string };
}

export interface SealOutcome {
  /** Events the page may act on: payload, graft sound, raid start. */
  allowed: SealEvent[];
  /** GRAFT and RAID events refused because the crypt is sealed. */
  refused: SealEvent[];
}

export interface SealGate {
  readonly sealed: boolean;
  apply(events: readonly SealEvent[]): SealOutcome;
  /** Lifts the seal for this page only. Nothing outside the page changes. */
  unseal(): void;
}

export function createSealGate(): SealGate {
  let sealed = false;
  return {
    get sealed() { return sealed; },
    unseal() { sealed = false; },
    apply(events) {
      const allowed: SealEvent[] = [];
      const refused: SealEvent[] = [];
      for (const e of events) {
        const verb = e.ok ? e.parsed?.verb : undefined;
        if (verb === "SEAL") sealed = true;
        if (sealed && (verb === "GRAFT" || verb === "RAID")) refused.push(e);
        else allowed.push(e);
      }
      return { allowed, refused };
    },
  };
}

/** The line shown in the transcript and read out for a refused event. */
export function refusalMessage(e: SealEvent): string {
  return e.parsed?.verb === "RAID"
    ? "The crypt is sealed. The raid does not start. Reload the page to unseal it."
    : "The crypt is sealed. The graft is rejected and no payload is made. Reload the page to unseal it.";
}
