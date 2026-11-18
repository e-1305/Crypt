// What `crypt raid` tells a later `crypt play` in the same directory: the target checkout and which
// advisory source the raid used. Read only to fill in flags the player left out. Explicit flags win.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface RaidContext {
  version: 1;
  /** Checkout that fixes are written against. Null when the raid scanned a temporary clone. */
  target: string | null;
  /** Where advisories came from: the bundled fixture folder, OSV, or nowhere (offline, no fixture). */
  advisories: { kind: "folder"; dir: string } | { kind: "osv" } | { kind: "none" };
  firstLimb: string | null;
}

export const contextPath = (cwd: string): string => join(cwd, "out", "raid-context.json");

export function writeRaidContext(cwd: string, ctx: RaidContext): void {
  mkdirSync(join(cwd, "out"), { recursive: true });
  writeFileSync(contextPath(cwd), JSON.stringify(ctx, null, 2) + "\n");
}

export function readRaidContext(cwd: string): RaidContext | null {
  const f = contextPath(cwd);
  if (!existsSync(f)) return null;
  try {
    const j = JSON.parse(readFileSync(f, "utf8")) as Partial<RaidContext>;
    if (j.version !== 1) return null;
    const a = j.advisories;
    const advisories =
      a?.kind === "folder" && typeof a.dir === "string" ? ({ kind: "folder", dir: a.dir } as const) : a?.kind === "osv" ? ({ kind: "osv" } as const) : a?.kind === "none" ? ({ kind: "none" } as const) : null;
    if (!advisories) return null;
    return { version: 1, target: typeof j.target === "string" ? j.target : null, advisories, firstLimb: typeof j.firstLimb === "string" ? j.firstLimb : null };
  } catch {
    return null;
  }
}

/** The line that ends a raid. Names the top limb, or says there is nothing to graft. */
export function nextLine(firstLimb: string | null): string {
  return firstLimb ? `Next: type GRAFT ${firstLimb} at the prompt` : "Next: no limb needs a graft. Type EXAMINE at the prompt to look around";
}

/** One-line reasons for the two outcomes a first-time player meets. */
export function outcomeReason(outcome: string, detail?: string): string {
  switch (outcome) {
    case "NO_FIX_AVAILABLE":
      return "no advisory gave a fixed version for this limb. Run 'crypt raid <target>' first, or pass --advisories <dir> and --target <dir>.";
    case "ERROR":
      return `the graft could not run${detail ? ` (${detail})` : ""}. Check --target points at the scanned repository and --advisories at its advisory folder.`;
    default:
      return "";
  }
}
