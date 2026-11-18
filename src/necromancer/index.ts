// Necromancer: graft request -> one PR that bumps one dependency. Never lands a PR.
// Fail-safe: SEAL first (zero calls), unknown or unspawned limb or any ambiguity gives no PR.
import type { Io } from "../common/io.js";
import {
  audit,
  branchFile,
  isSealed,
  lookupLimb,
  readPrRecords,
  readState,
  tryAudit,
  type AgentOutcome,
  type AgentPaths,
  type PrRecord,
} from "../common/agent.js";
import type { FileChange, GithubClient } from "../github/client.js";
import type { RegistryClient, RegistryVersion } from "../registry/types.js";
import { BUMP_MESSAGES, bumpLockfile, jsonIndent, overrideLockfile, respec, setOverride } from "./lockfile.js";
import { fetchPackageAdvisories, unionAdvisories, type PackageAdvisoryLookup } from "./package-advisories.js";
import { prBody, prTitle, auditIdFor } from "./pr-body.js";
import { SABOTAGE_PATH, SABOTAGE_TITLE_PREFIX, sabotageSmokeTest } from "./sabotage.js";
import { chooseGroupVersion, compareVersions, parseVersion, type Advisory } from "./version.js";

export { prBody, auditIdFor, type PrFields } from "./pr-body.js";

export const MAX_PRS_PER_RAID = 5;

/** Returns the advisory with OSV affected ranges for an ID, or null when it cannot be had. */
export type AdvisoryLookup = ((id: string) => Promise<Advisory | null>) & {
  /** Every advisory for a package (all versions). Without it, only the advisories of the installed copies are known. */
  forPackage?: PackageAdvisoryLookup;
};

export interface NecromancerCtx extends AgentPaths {
  io: Io;
  client: GithubClient;
  advisories: AdvisoryLookup;
  /** Overrides `advisories.forPackage`. */
  packageAdvisories?: PackageAdvisoryLookup;
  /** Directory of the target repository checkout (package.json, package-lock.json). */
  targetDir: string;
  now: () => Date;
  /** Registry metadata source. Required whenever the client is not a dry run. */
  registry?: RegistryClient;
  /** Demo only: add a deliberately failing test to the PR. */
  sabotage?: boolean;
}

export interface GraftResult {
  outcome: AgentOutcome;
  branch?: string;
  breaking?: boolean;
}

interface CreatureLimb {
  ecosystem: string;
  name: string;
  version: string;
  direct?: boolean;
  state?: string;
  owner?: string;
  spawned?: boolean;
  kev?: boolean;
  epss?: number | null;
  vulns?: { id: string; cves?: string[] }[];
}

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

/** Edits package.json and package-lock.json texts. Returns null when the dependency is not found in both. */
export function editManifests(
  pkgText: string,
  lockText: string,
  name: string,
  version: string,
  opts: { transitive?: boolean } = {},
): { pkg: string; lock: string } | null {
  const pkg: unknown = JSON.parse(pkgText);
  const lock: unknown = JSON.parse(lockText);
  if (!isObj(pkg) || !isObj(lock)) return null;
  if (opts.transitive === true) return editOverrides(pkg, lock, pkgText, lockText, name, version);
  let found = false;
  const bump = (deps: unknown): void => {
    if (isObj(deps) && typeof deps[name] === "string") {
      deps[name] = respec(deps[name] as string, version);
      found = true;
    }
  };
  for (const k of ["dependencies", "devDependencies", "optionalDependencies"]) bump(pkg[k]);
  if (!found) return null;
  let lockFound = false;
  const packages = lock.packages;
  if (isObj(packages)) {
    const root = packages[""];
    if (isObj(root)) for (const k of ["dependencies", "devDependencies", "optionalDependencies"]) bump(root[k]);
    const entry = packages[`node_modules/${name}`];
    if (isObj(entry)) {
      entry.version = version;
      delete entry.resolved;
      delete entry.integrity;
      lockFound = true;
    }
  }
  const legacy = lock.dependencies;
  if (isObj(legacy) && isObj(legacy[name])) {
    const e = legacy[name] as Json;
    e.version = version;
    delete e.resolved;
    delete e.integrity;
    lockFound = true;
  }
  if (!lockFound) return null;
  return {
    pkg: JSON.stringify(pkg, null, jsonIndent(pkgText)) + "\n",
    lock: JSON.stringify(lock, null, jsonIndent(lockText)) + "\n",
  };
}

/** Transitive-only package: `overrides` in package.json, and every lock copy below the fixed version loses its pins. */
function editOverrides(pkg: Json, lock: Json, pkgText: string, lockText: string, name: string, version: string) {
  const target = parseVersion(version);
  if (!target) return null;
  const below = (v: unknown): boolean => {
    const p = typeof v === "string" ? parseVersion(v) : null;
    return p !== null && compareVersions(p, target) < 0;
  };
  let changed = 0;
  if (isObj(lock.packages)) {
    for (const [k, e] of Object.entries(lock.packages)) {
      if ((k === `node_modules/${name}` || k.endsWith(`/node_modules/${name}`)) && isObj(e) && below(e.version)) {
        e.version = version;
        delete e.resolved;
        delete e.integrity;
        changed++;
      }
    }
  }
  const walk = (deps: unknown): void => {
    if (!isObj(deps)) return;
    for (const [k, e] of Object.entries(deps)) {
      if (!isObj(e)) continue;
      if (k === name && below(e.version)) {
        e.version = version;
        delete e.resolved;
        delete e.integrity;
      }
      walk(e.dependencies);
    }
  };
  walk(lock.dependencies);
  if (changed === 0 || !setOverride(pkg, name, version)) return null;
  return {
    pkg: JSON.stringify(pkg, null, jsonIndent(pkgText)) + "\n",
    lock: JSON.stringify(lock, null, jsonIndent(lockText)) + "\n",
  };
}

/** Handles one graft request file. Never throws for expected failures; the outcome is audited. */
export async function graft(ctx: NecromancerCtx, requestPath: string): Promise<GraftResult> {
  const { io } = ctx;
  const log = (command: string, limb: string, outcome: AgentOutcome, url = "-") =>
    audit(io, ctx.auditPath, ctx.now, command, limb, outcome, url);
  const logSafe = (command: string, limb: string, outcome: AgentOutcome) =>
    tryAudit(io, ctx.auditPath, ctx.now, command, limb, outcome);

  let limb = "-";
  try {
    let req: unknown;
    try {
      req = JSON.parse(io.readText(requestPath));
    } catch {
      req = null;
    }
    const rawLimb = isObj(req) && typeof req.limb === "string" ? req.limb : "";
    const command = rawLimb ? `GRAFT ${rawLimb}`.slice(0, 64) : "GRAFT";
    if (isSealed(io, ctx.sealPath)) {
      logSafe(command, rawLimb || "-", "REJECTED_SEALED");
      return { outcome: "REJECTED_SEALED" };
    }
    const ref = lookupLimb(io, ctx.limbsPath, rawLimb);
    if (!ref) {
      log(command, "-", "REJECTED_UNKNOWN_LIMB");
      return { outcome: "REJECTED_UNKNOWN_LIMB" };
    }
    limb = rawLimb;
    const done = (outcome: AgentOutcome, extra: Partial<GraftResult> = {}, url = "-"): GraftResult => {
      log(command, limb, outcome, url);
      return { outcome, ...extra };
    };

    const creature: unknown = JSON.parse(io.readText(ctx.creaturePath));
    const limbs = isObj(creature) && Array.isArray(creature.limbs) ? (creature.limbs as CreatureLimb[]) : [];
    const cl = limbs.find((l) => l && l.ecosystem === ref.ecosystem && l.name === ref.name && l.version === ref.version);
    if (!cl || cl.spawned !== true) return done("REFUSED_NOT_SPAWNED");
    if (ref.ecosystem !== "npm") return done("NO_FIX_AVAILABLE");

    // One graft per package: every installed copy, every known advisory of the package.
    const copies = limbs.filter((l) => l && l.ecosystem === ref.ecosystem && l.name === ref.name);
    const vulnList = copies.flatMap((c) => (Array.isArray(c.vulns) ? c.vulns : []));
    const ids = [...new Set(vulnList.map((v) => v.id))];
    const perId: Advisory[] = [];
    for (const id of ids) {
      const a = await ctx.advisories(id);
      if (!a) return done("ERROR"); // missing evidence: change nothing
      perId.push(a);
    }
    const forPackage = ctx.packageAdvisories ?? ctx.advisories.forPackage;
    let advisories: Advisory[] = perId;
    if (forPackage) {
      const all = await forPackage(ref.ecosystem, ref.name);
      if (!all) return done("ERROR");
      advisories = unionAdvisories(perId, all);
    }
    const installed = [...new Set(copies.map((c) => c.version))];
    const rotting = [...new Set(copies.filter((c) => (Array.isArray(c.vulns) && c.vulns.length > 0) || c.state === "Rotting" || c.state === "Possessed").map((c) => c.version))];
    const choice = chooseGroupVersion(ref.ecosystem, ref.name, installed, rotting, advisories);
    if (!choice) return done("NO_FIX_AVAILABLE");
    const transitive = !copies.some((c) => c.direct !== false);
    const directCopy = copies.find((c) => c.direct !== false);
    const versions = choice.affected;
    const toV = parseVersion(choice.version);
    const dv = directCopy ? parseVersion(directCopy.version) : null;
    if (!transitive && (!toV || !dv || compareVersions(dv, toV) >= 0)) return done("NO_FIX_AVAILABLE");
    const fromVersion = transitive ? choice.from : directCopy!.version;

    const branch = `crypt/graft-${limb.toLowerCase()}-${choice.version}${ctx.sabotage === true ? "-sabotage" : ""}`;
    const records: PrRecord[] = readPrRecords(io, ctx.prsDir);
    // One PR per package, not per installed copy.
    if (records.some((r) => r.branch === branch || r.limb === limb || (r.ecosystem === ref.ecosystem && r.name === ref.name))) return done("PR_EXISTS");
    // A raid is the set of PRs not yet healed: healed and rejected records do not count.
    const state = readState(io, ctx.statePath);
    const open = records.filter((r) => state.limbs[r.limb]?.state !== "healed");
    if (open.length >= MAX_PRS_PER_RAID) return done("RAID_LIMIT");

    // Live mode (a client that writes to a remote): registry metadata is required before any GitHub write.
    const live = !ctx.client.dryRun;
    let meta: RegistryVersion | null = null;
    if (ctx.registry) {
      meta = await ctx.registry.getVersion(ref.name, choice.version);
      if (meta.version !== choice.version) throw new Error(`registry answered ${meta.version} for ${choice.version}`);
    } else if (live) {
      throw new Error("npm registry client is required for a live graft");
    }
    const readFile = (path: string): Promise<string> | string =>
      live ? ctx.client.readBaseFile(path) : io.readText(`${ctx.targetDir}/${path}`);
    const pkgText = await readFile("package.json");
    const lockText = await readFile("package-lock.json");
    let edited: { pkg: string; lock: string } | null;
    if (meta) {
      const input = { pkgText, lockText, name: ref.name, from: fromVersion, meta, fixed: choice.version };
      const r = transitive ? overrideLockfile(input) : bumpLockfile(input);
      if (!r.ok) {
        process.stderr.write(`necromancer: ${BUMP_MESSAGES[r.reason]} (${r.reason})\n`);
        return done(r.reason === "not-direct-dependency" || r.reason === "lock-entry-count" ? "NO_FIX_AVAILABLE" : "ERROR");
      }
      edited = r;
    } else {
      edited = editManifests(pkgText, lockText, ref.name, choice.version, { transitive });
    }
    if (!edited) return done("NO_FIX_AVAILABLE");
    const sabotage = ctx.sabotage === true;
    const files: FileChange[] = [
      { path: "package.json", content: edited.pkg },
      { path: "package-lock.json", content: edited.lock },
    ];
    if (sabotage) files.push({ path: SABOTAGE_PATH, content: sabotageSmokeTest(await readFile(SABOTAGE_PATH)) });

    const auditId = auditIdFor(ctx.now(), limb);
    const cves = [...new Set(vulnList.flatMap((v) => (Array.isArray(v.cves) ? v.cves : [])))].sort();
    const body = prBody({
      limb,
      name: ref.name,
      from: choice.from,
      to: choice.version,
      breaking: choice.breaking,
      kind: transitive ? "transitive" : "direct",
      versions,
      cves,
      kev: cl.kev === true,
      epss: typeof cl.epss === "number" ? cl.epss : null,
      owner: typeof cl.owner === "string" ? cl.owner : "",
      auditId,
      fromRegistry: meta !== null,
      sabotage,
    });
    const title = `${sabotage ? SABOTAGE_TITLE_PREFIX : ""}${prTitle({ name: ref.name, from: choice.from, versions, to: choice.version, limb, breaking: choice.breaking })}`;
    // Complete mediation: re-check the seal before each remote write step.
    if (isSealed(io, ctx.sealPath)) return done("REJECTED_SEALED");
    await ctx.client.createBranchWithFiles({ branch, message: title, files });
    if (isSealed(io, ctx.sealPath)) {
      if (ctx.client.deleteBranch && branch.startsWith("crypt/")) await ctx.client.deleteBranch(branch).catch(() => undefined);
      return done("REJECTED_SEALED");
    }
    let pr: { number: number; url: string; headSha?: string };
    try {
      pr = await ctx.client.openPullRequest({
        branch,
        title,
        body,
        meta: { limb, ecosystem: ref.ecosystem, name: ref.name, from: choice.from, to: choice.version, breaking: choice.breaking },
      });
    } catch (e) {
      // The branch exists but no PR does: remove it so no orphan remains (best effort).
      if (ctx.client.deleteBranch && branch.startsWith("crypt/")) await ctx.client.deleteBranch(branch).catch(() => undefined);
      throw e;
    }
    if (!ctx.client.dryRun) {
      const rec = {
        branch, limb, ecosystem: ref.ecosystem, name: ref.name, from: choice.from, to: choice.version, breaking: choice.breaking,
        number: pr.number, url: pr.url, headSha: pr.headSha, sabotage, auditId,
      };
      try {
        io.mkdirp(ctx.prsDir);
        io.writeText(`${ctx.prsDir}/${branchFile(branch)}`, JSON.stringify(rec, null, 2) + "\n");
      } catch (e) {
        // The PR is open but unrecorded. Closing it would be another remote write, so name it for a human.
        process.stderr.write(`necromancer: pull request ${pr.url} is open but its record could not be written (${(e as Error).message}). Close it by hand before grafting ${limb} again.\n`);
        return done("ERROR", {}, pr.url);
      }
    }
    // A dry run opened nothing: it never claims PR_OPENED and has no URL to record.
    if (ctx.client.dryRun) return done("DRYRUN_WRITTEN", { branch, breaking: choice.breaking });
    return done("PR_OPENED", { branch, breaking: choice.breaking }, pr.url);
  } catch (e) {
    process.stderr.write(`necromancer: ${(e as Error).message}\n`);
    logSafe("GRAFT", limb, "ERROR");
    return { outcome: "ERROR" };
  }
}
