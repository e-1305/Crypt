// crypt alerts --format ocsf: one OCSF Vulnerability Finding (class_uid 2002, category_uid 2) per spawned limb.
// Pure: no fs, clock or network. The caller supplies `now`. Fail-safe: a creature that does not match the strict
// shape below throws OcsfError and the caller writes nothing. Blameless: the event names a package and a CODEOWNERS
// team, never a person. Commit authors and healedBy logins are never read into an event.
// Schema: see docs/SOC.md (OCSF 1.3.0, Vulnerability Finding).
import { z } from "zod";
import { POSSESSED_WINDOW_MS, SPRINT_WINDOW_MS, EPSS_SPRINT_LINE } from "../graveyard/model.js";

export const OCSF_VERSION = "1.3.0";
export const CLASS_UID = 2002;
export const CATEGORY_UID = 2;
export const ACTIVITY_CREATE = 1;
export const TYPE_UID = CLASS_UID * 100 + ACTIVITY_CREATE;

export class OcsfError extends Error {}

const CVE = /^CVE-\d{4}-\d{4,}$/;
const text = z.string().max(300);

// .strict(): an unknown field is a failure, never a silent drop. Optional fields are those later agents add.
const limb = z
  .object({
    rank: z.number(),
    id: text,
    ecosystem: z.enum(["npm", "PyPI"]),
    name: text.min(1),
    version: text.min(1),
    direct: z.boolean(),
    manifest: text,
    owner: text,
    state: z.enum(["Healthy", "Rotting", "Possessed"]),
    unknown: z.boolean(),
    unknownReason: z.string().nullable(),
    spawned: z.boolean(),
    score: z.number(),
    kev: z.boolean(),
    epss: z.number().min(0).max(1).nullable(),
    severity: z.number().min(0).max(10),
    vulns: z.array(z.object({ id: text, cves: z.array(z.string().regex(CVE)) }).strict()),
    // Optional, written by later agents. healedBy is a person: it is accepted so the file validates, and never emitted.
    fixedVersion: text.optional(),
    healed: z.boolean().optional(),
    healedBy: z.string().optional(),
    status: z.string().optional(),
    ciVerdict: z.string().optional(),
    ciPr: z.string().optional(),
  })
  .strict();

const creatureSchema = z
  .object({ schemaVersion: z.literal(1), repo: text.optional(), limbs: z.array(limb) })
  .passthrough();

export type AlertLimb = z.infer<typeof limb>;

export function parseCreatureForAlerts(raw: string): { repo: string | null; limbs: AlertLimb[] } {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new OcsfError("out/creature.json is not valid JSON");
  }
  const r = creatureSchema.safeParse(json);
  if (!r.success) {
    const i = r.error.issues[0];
    throw new OcsfError(`out/creature.json does not match the expected shape (${i ? `${i.path.join(".") || "root"}: ${i.code}` : "invalid"})`);
  }
  return { repo: r.data.repo ?? null, limbs: r.data.limbs };
}

/** sla-policy.md: Possessed (KEV) 48h, EPSS >= 0.1 this sprint (14 days), others backlog (no deadline). */
export function slaFor(l: Pick<AlertLimb, "state" | "kev" | "epss">, now: number): { policy: "48h" | "sprint" | "backlog"; deadline: string | null } {
  if (l.state === "Possessed" || l.kev) return { policy: "48h", deadline: new Date(now + POSSESSED_WINDOW_MS).toISOString() };
  if (l.epss !== null && l.epss >= EPSS_SPRINT_LINE) return { policy: "sprint", deadline: new Date(now + SPRINT_WINDOW_MS).toISOString() };
  return { policy: "backlog", deadline: null };
}

// OCSF severity_id: 1 Informational, 2 Low, 3 Medium, 4 High, 5 Critical. A KEV limb is at least High.
function severityOf(l: AlertLimb): { id: number; label: string } {
  const byScore = l.severity >= 9 ? 5 : l.severity >= 7 ? 4 : l.severity >= 4 ? 3 : l.severity > 0 ? 2 : 1;
  const id = l.kev ? Math.max(byScore, 4) : byScore;
  return { id, label: ["Unknown", "Informational", "Low", "Medium", "High", "Critical"][id]! };
}

export function toOcsfEvents(repo: string | null, limbs: readonly AlertLimb[], now: number): Record<string, unknown>[] {
  return limbs
    .filter((l) => l.spawned)
    .map((l) => {
      const cves = [...new Set(l.vulns.flatMap((v) => v.cves))].sort();
      const sev = severityOf(l);
      const sla = slaFor(l, now);
      const owner = l.owner && l.owner !== "unowned" ? l.owner : "unowned";
      const pkg = { name: l.name, version: l.version, type: l.ecosystem, ...(l.fixedVersion ? { fixed_in_version: l.fixedVersion } : {}) };
      return {
        activity_id: ACTIVITY_CREATE,
        activity_name: "Create",
        category_uid: CATEGORY_UID,
        category_name: "Findings",
        class_uid: CLASS_UID,
        class_name: "Vulnerability Finding",
        type_uid: TYPE_UID,
        time: now,
        severity_id: sev.id,
        severity: sev.label,
        status: "New",
        status_id: 1,
        message: `${l.name}@${l.version} is ${l.state.toLowerCase()}. Owner: ${owner}.`,
        metadata: { version: OCSF_VERSION, product: { name: "CRYPT", vendor_name: "e-1305" } },
        finding_info: {
          uid: `crypt:${repo ?? "unknown"}:${l.id}`,
          title: `${l.state} dependency ${l.name}@${l.version}`,
          types: ["Vulnerability"],
        },
        vulnerabilities: [
          {
            ...(cves.length > 0 ? { cve: { uid: cves[0], ...(l.epss !== null ? { epss: { score: String(l.epss) } } : {}) } } : {}),
            related_cves: cves,
            severity: sev.label,
            is_exploit_available: l.kev,
            is_fix_available: Boolean(l.fixedVersion),
            affected_packages: [pkg],
          },
        ],
        resources: [{ type: "Package", name: l.name, owner: { name: owner } }],
        unmapped: {
          cve_ids: cves,
          kev: l.kev,
          epss: l.epss,
          crypt_state: l.state,
          owner,
          sla_policy: sla.policy,
          sla_deadline: sla.deadline,
          repo,
        },
      };
    });
}
