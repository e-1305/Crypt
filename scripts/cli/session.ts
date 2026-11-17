// An interactive dfrotz session wired to the watcher and the Necromancer (dry-run).
// dfrotz output is shown to the player and, line by line, fed to the watcher. Every new graft
// request is handled before the next output line is read, so SEAL always takes effect in order.
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { createWatcher, defaultCtx } from "../../src/bridge/watch.js";
import { branchFile, defaultPaths } from "../../src/common/agent.js";
import { nodeIo } from "../../src/common/io.js";
import { CliError, EXIT, ToolchainError } from "../../src/cli/exit.js";
import { dryRunClient } from "../../src/github/client.js";
import { graft, type AdvisoryLookup } from "../../src/necromancer/index.js";
import type { GithubClient } from "../../src/github/client.js";
import type { RegistryClient } from "../../src/registry/types.js";
import { STATUS_LINE } from "../play.js";
import { dfrotzPath } from "../toolchain-dir.js";
import { handleLiveGraft } from "./live-graft.js";
import { onInterrupt } from "./signals.js";

export interface SessionOpts {
  story: string;
  cwd: string;
  /** Checkout that fixes are written against. */
  targetDir: string;
  advisories: AdvisoryLookup;
  out?: { write(s: string): unknown };
  /** Live mode: a real GitHub client and registry; the Inquisitor watches each opened pull request. */
  live?: { client: GithubClient; registry: RegistryClient; timeoutMs: number; repo: string };
}

const POLL_INTERVAL_MS = 20_000;

const MARKER_LINE = /^\[\[CRYPT [A-Z ]+\]\]$/;
const REQUEST_FILE = /^graft-.*\.json$/;

export function playStory(o: SessionOpts): Promise<number> {
  const out = o.out ?? process.stdout;
  if (!existsSync(o.story)) throw new CliError(`${o.story} not found. Run 'crypt raise' (or 'crypt raid <target>') first.`);
  const paths = defaultPaths(o.cwd);
  const now = () => new Date();
  const ctx = {
    ...paths,
    io: nodeIo,
    client: o.live ? o.live.client : dryRunClient(nodeIo, paths.prsDir, now),
    registry: o.live?.registry,
    advisories: o.advisories,
    targetDir: o.targetDir,
    now,
  };
  const watching = new Set<Promise<void>>();
  const watcher = createWatcher(defaultCtx(o.cwd));
  const requestsDir = join(o.cwd, "out", "requests");
  // A new session numbers its requests from 1 again, so requests of an earlier session are cleared.
  for (const f of nodeIo.listDir(requestsDir)) if (REQUEST_FILE.test(f)) nodeIo.remove(join(requestsDir, f));
  if (existsSync(paths.sealPath)) process.stderr.write("The crypt is sealed. Run 'crypt unseal' to lift it. Grafts stay rejected until then.\n");

  const handled = new Set<string>();
  async function runNewGrafts(): Promise<void> {
    for (const f of nodeIo.listDir(requestsDir)) {
      if (!REQUEST_FILE.test(f) || handled.has(f)) continue;
      handled.add(f);
      const file = join(requestsDir, f);
      let limb = "?";
      try {
        const r: unknown = JSON.parse(readFileSync(file, "utf8"));
        if (r && typeof (r as { limb?: unknown }).limb === "string") limb = (r as { limb: string }).limb;
      } catch {
        // the necromancer rejects an unreadable request
      }
      try {
        const res = await graft(ctx, file);
        if (res.outcome === "PR_OPENED" && res.branch && o.live) {
          const p: Promise<void> = handleLiveGraft(
            { ...paths, io: nodeIo, client: o.live.client, now, sleep: (ms) => new Promise<void>((r) => setTimeout(r, ms)), timeoutMs: o.live.timeoutMs, intervalMs: POLL_INTERVAL_MS },
            limb,
            res.branch,
            out,
          )
            .catch((e: unknown) => void out.write(`${limb}: ERROR while checking the pull request (${(e as Error).message})\n`))
            .finally(() => void watching.delete(p));
          watching.add(p);
        } else if (res.outcome === "PR_OPENED" && res.branch) {
          const payload = relative(o.cwd, join(paths.prsDir, branchFile(res.branch)));
          out.write(`Graft ${limb}: dry-run payload written to ${payload}${res.breaking ? " (breaking: true)" : ""}\n`);
        } else {
          out.write(`Graft ${limb}: ${res.outcome}, no payload written\n`);
        }
      } catch (e) {
        out.write(`Graft ${limb}: ERROR, no payload written (${(e as Error).message})\n`);
      }
    }
  }

  async function handleLine(line: string): Promise<void> {
    if (STATUS_LINE.test(line)) return;
    const t = line.replace(/\r$/, "").trim();
    if (t === "." || t === "EOT") return;
    watcher.processText(t + "\n");
    if (!MARKER_LINE.test(t)) out.write(line.replace(/\r$/, "") + "\n");
    await runNewGrafts();
  }

  return new Promise<number>((resolve, reject) => {
    const child = spawn(dfrotzPath(), ["-m", "-p", o.story], { stdio: ["inherit", "pipe", "inherit"] });
    const off = onInterrupt(() => {
      child.kill("SIGTERM");
    });
    let buf = "";
    let chain: Promise<void> = Promise.resolve();
    const queue = (fn: () => Promise<void>) => {
      chain = chain.then(fn);
    };
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      queue(async () => {
        buf += chunk;
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const l of lines) await handleLine(l);
        if (/^>\s*$/.test(buf)) {
          out.write(buf); // the prompt: show it at once
          buf = "";
        }
      });
    });
    child.on("error", (e) => {
      off();
      reject(new ToolchainError(`could not start dfrotz at ${dfrotzPath()}: ${e.message}`));
    });
    child.on("close", (code, signal) => {
      queue(async () => {
        if (!/^[>\s]*$/.test(buf)) await handleLine(buf);
        buf = "";
      });
      chain
        .then(async () => {
          while (watching.size > 0) await Promise.all([...watching]);
          off();
          resolve(signal ? EXIT.INTERRUPTED : code === 0 ? EXIT.OK : EXIT.FAILURE);
        })
        .catch((e: unknown) => {
          off();
          reject(e);
        });
    });
  });
}
