// exhume, raise, plate and play for one target. State (out/, .crypt-seal, crypt-audit.log) lives in the
// current directory. Scripts, fixtures and tsx are found relative to the package.
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Parsed } from "../../src/cli/parse.js";
import type { AdvisoryLookup } from "../../src/necromancer/index.js";
import { parseGithubUrl } from "../../src/cli/url.js";
import { renderPlate } from "../../src/render/plate.js";
import { raiseCreature } from "../compile.js";
import { fixtureAdvisories, osvAdvisories } from "../osv-advisory.js";
import { PACKAGE_ROOT } from "../toolchain-dir.js";
import { preflightedClients, timeoutMsFrom, writeTargetRecord } from "./live.js";
import { runScriptOrFail } from "./run.js";
import { playStory } from "./session.js";
import { openTarget, type Target } from "./target.js";
import { ensureToolchain } from "./toolchain.js";

const FIXTURE = join(PACKAGE_ROOT, "fixtures", "vulnerable-npm");

function same(a: string, b: string): boolean {
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return false;
  }
}

export const isBundledFixture = (dir: string): boolean => same(dir, FIXTURE);

/** Feeds and the OSV cache come from the current directory when present, else from the package. Never from the scanned repository. */
export function inputPaths(dir: string, flags: Parsed["flags"], cwd: string = process.cwd()): { feeds: string; cache: string; offline: boolean } {
  const offline = flags.offline === true;
  const localFeeds = join(cwd, "data", "feeds");
  const localCache = join(cwd, "data", "cache", "osv");
  const feeds =
    typeof flags.feeds === "string"
      ? resolve(flags.feeds)
      : !existsSync(localFeeds) && offline && isBundledFixture(dir)
        ? join(FIXTURE, "feeds")
        : localFeeds;
  const cache =
    typeof flags.cache === "string" ? resolve(flags.cache) : !existsSync(localCache) && offline ? join(PACKAGE_ROOT, "data", "cache", "osv") : localCache;
  return { feeds, cache, offline };
}

export async function exhumeTarget(t: Target, flags: Parsed["flags"]): Promise<string> {
  const { feeds, cache, offline } = inputPaths(t.dir, flags);
  const out = typeof flags.out === "string" ? flags.out : "out/creature.json";
  await runScriptOrFail("exhume.ts", [t.dir, "--out", out, "--feeds", feeds, "--cache", cache, "--name", t.name, ...(offline ? ["--offline"] : [])]);
  return out;
}

export async function exhumeCommand(p: Parsed): Promise<number> {
  const t = await openTarget(p.args[0]!);
  try {
    await exhumeTarget(t, p.flags);
  } finally {
    t.cleanup();
  }
  return 0;
}

export async function raidCommand(p: Parsed): Promise<number> {
  const live = p.flags.live === true;
  const gh = live ? parseGithubUrl(p.args[0]!) : null;
  // Live: every check runs before anything is cloned or written.
  const lc = live && gh ? await preflightedClients(`${gh.owner}/${gh.repo}`, process.env.GITHUB_TOKEN ?? "") : null;
  const t = await openTarget(p.args[0]!);
  try {
    await ensureToolchain();
    const cwd = process.cwd();
    const creature = await exhumeTarget(t, { ...p.flags, out: "out/creature.json" });
    if (lc) writeTargetRecord(cwd, { repo: lc.repo, url: p.args[0]!, live: true });
    raiseCreature(creature, "out");
    process.stdout.write("\n" + renderPlate(JSON.parse(readFileSync(creature, "utf8")), { repo: t.name }) + "\n");
    const offline = p.flags.offline === true;
    const advisories: AdvisoryLookup = offline
      ? isBundledFixture(t.dir)
        ? fixtureAdvisories(join(FIXTURE, "advisories"))
        : async () => null
      : osvAdvisories();
    return await playStory({
      story: join(cwd, "out", "creature.z8"),
      cwd,
      targetDir: t.dir,
      advisories,
      live: lc ? { client: lc.client, registry: lc.registry, timeoutMs: timeoutMsFrom(p.flags), repo: lc.repo } : undefined,
    });
  } finally {
    t.cleanup();
  }
}
