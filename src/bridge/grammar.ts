// Strict command grammar (failsafe 5, complete mediation).
//   command := ("EXAMINE" | "ASSIGN" | "GRAFT") " " limb | "SEAL CRYPT"
//   limb    := [A-Z]{1,32}
// One anchored regex per production, tested against the whole string. No trimming, no case folding.

export type ParseResult =
  | { ok: true; verb: "EXAMINE" | "ASSIGN" | "GRAFT"; limb: string }
  | { ok: true; verb: "SEAL"; limb: "-" }
  | { ok: false };

const LIMB_COMMAND = /^(EXAMINE|ASSIGN|GRAFT) ([A-Z]{1,32})$/;
const SEAL_COMMAND = /^SEAL CRYPT$/;

export function parseCommand(input: unknown): ParseResult {
  if (typeof input !== "string") return { ok: false };
  if (SEAL_COMMAND.test(input)) return { ok: true, verb: "SEAL", limb: "-" };
  const m = LIMB_COMMAND.exec(input);
  if (m) return { ok: true, verb: m[1] as "EXAMINE" | "ASSIGN" | "GRAFT", limb: m[2] };
  return { ok: false };
}
