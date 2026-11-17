// crypt: command dispatch and the top-level error handler. One actionable line per error, never a stack
// trace unless CRYPT_DEBUG=1. Exit codes are documented in src/cli/exit.ts and in --help.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { defaultPaths } from "../../src/common/agent.js";
import { nodeIo } from "../../src/common/io.js";
import { CliError, EXIT, exitCodeFor } from "../../src/cli/exit.js";
import { helpText, versionText } from "../../src/cli/help.js";
import { parseCli, type Parsed } from "../../src/cli/parse.js";
import { dryRunClient } from "../../src/github/client.js";
import { graft } from "../../src/necromancer/index.js";
import { githubClient } from "../github-client.js";
import { fixtureAdvisories, osvAdvisories } from "../osv-advisory.js";
import { exhumeCommand, raidCommand } from "./raid.js";
import { runScript, runScriptOrFail } from "./run.js";
import { seal, unseal } from "./seal.js";
import { playStory } from "./session.js";
import { ensureToolchain } from "./toolchain.js";

const advisoriesFor = (dir: unknown) => (typeof dir === "string" ? fixtureAdvisories(resolve(dir)) : osvAdvisories());

async function graftCommand(p: Parsed): Promise<number> {
  const limb = p.args[0]!;
  const cwd = process.cwd();
  const paths = defaultPaths(cwd);
  const now = () => new Date();
  const live = p.flags.live === true;
  const client = live ? githubClient(String(p.flags.repo), process.env.GITHUB_TOKEN ?? "") : dryRunClient(nodeIo, paths.prsDir, now);
  const tmp = mkdtempSync(join(tmpdir(), "crypt-graft-"));
  try {
    const file = join(tmp, "request.json");
    writeFileSync(file, JSON.stringify({ version: 1, action: "GRAFT", limb, command: `GRAFT ${limb}`, requestedAt: now().toISOString() }));
    const ctx = {
      ...paths,
      io: nodeIo,
      client,
      advisories: advisoriesFor(p.flags.advisories),
      targetDir: resolve(typeof p.flags.target === "string" ? p.flags.target : "."),
      now,
    };
    const r = await graft(ctx, file);
    const where = r.branch ? ` ${r.branch}${r.breaking ? " (breaking: true)" : ""}${live ? "" : " (dry-run payload in out/prs/)"}` : "";
    console.log(`${limb}: ${r.outcome}${where}`);
    return r.outcome === "ERROR" ? EXIT.FAILURE : EXIT.OK;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function agentArgs(p: Parsed): string[] {
  return [
    ...p.args,
    ...(p.flags["dry-run"] === true ? ["--dry-run"] : []),
    ...(typeof p.flags.repo === "string" ? ["--repo", p.flags.repo] : []),
  ];
}

async function run(argv: string[]): Promise<number> {
  const p = parseCli(argv, process.env);
  switch (p.command) {
    case "help":
      process.stdout.write(helpText());
      return EXIT.OK;
    case "version":
      process.stdout.write(versionText());
      return EXIT.OK;
    case "exhume":
      return exhumeCommand(p);
    case "raid":
      return raidCommand(p);
    case "raise": {
      await ensureToolchain();
      await runScriptOrFail("raise.ts", [...p.args, ...(typeof p.flags.out === "string" ? ["--out", p.flags.out] : [])]);
      return EXIT.OK;
    }
    case "play": {
      await ensureToolchain();
      const cwd = process.cwd();
      return playStory({
        story: resolve(typeof p.flags.story === "string" ? p.flags.story : "out/creature.z8"),
        cwd,
        targetDir: resolve(typeof p.flags.target === "string" ? p.flags.target : "."),
        advisories: advisoriesFor(p.flags.advisories),
      });
    }
    case "graft":
      return graftCommand(p);
    case "inquisit":
      return runScript("inquisitor.ts", agentArgs(p));
    case "reraise":
      await ensureToolchain();
      return runScript("reraise.ts", agentArgs(p));
    case "seal":
      console.log(seal());
      return EXIT.OK;
    case "unseal":
      console.log(unseal());
      return EXIT.OK;
  }
}

try {
  process.exitCode = await run(process.argv.slice(2));
} catch (e) {
  const msg = e instanceof CliError ? e.message : `${(e as Error)?.message ?? String(e)}`;
  if (msg) process.stderr.write(`crypt: ${msg}\n`);
  if (process.env.CRYPT_DEBUG === "1" && e instanceof Error && e.stack) process.stderr.write(`${e.stack}\n`);
  process.exitCode = exitCodeFor(e);
}
