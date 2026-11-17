// Turns a target (local directory or GitHub URL) into a directory that can be scanned.
// A URL is shallow-cloned into a temporary directory. The clone is only read: no hooks, no
// submodules, no package manager and no code from the target is ever run.
import { spawn } from "node:child_process";
import { existsSync, lstatSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { CODEOWNERS_LOCATIONS } from "../../src/exhume/owners.js";
import { TargetError, ToolchainError, UsageError } from "../../src/cli/exit.js";
import { deriveRepoName } from "../../src/cli/name.js";
import { looksRemote, parseGithubUrl } from "../../src/cli/url.js";
import { onInterrupt } from "./signals.js";

export interface Target {
  /** Directory to scan. */
  dir: string;
  /** Creature name (repository name). */
  name: string;
  /** True when dir is a temporary clone. */
  cloned: boolean;
  /** Removes the temporary clone. Safe to call more than once. */
  cleanup(): void;
}

export interface TargetOpts {
  /** Remote location for owner/repo. Tests point this at a local bare repository. */
  remote?: (owner: string, repo: string) => string;
  /** Parent of the temporary directory. Default: the OS temp directory. */
  tmpRoot?: string;
  cloneTimeoutMs?: number;
}

const MANIFESTS = ["package-lock.json", "requirements.txt"];
const READ_PATHS = [...MANIFESTS, ...CODEOWNERS_LOCATIONS];
const CLONE_TIMEOUT_MS = 120_000;

/** Refuses a symlink at any component of the path, so a hostile repository cannot aim a file at the local disk. */
export function assertNoSymlinks(root: string, rel: string): void {
  let cur = root;
  for (const part of rel.split("/")) {
    cur = join(cur, part);
    let st;
    try {
      st = lstatSync(cur);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT" || (e as NodeJS.ErrnoException).code === "ENOTDIR") return;
      throw e;
    }
    if (st.isSymbolicLink()) throw new TargetError(`'${rel}' in the repository is a symbolic link. crypt does not follow links out of a cloned repository.`);
  }
}

export function assertScannable(dir: string, label: string, refuseSymlinks: boolean): void {
  if (refuseSymlinks) for (const p of READ_PATHS) assertNoSymlinks(dir, p);
  if (!MANIFESTS.some((m) => existsSync(join(dir, m)))) {
    throw new TargetError(`no package-lock.json or requirements.txt found in ${label}. crypt reads those two files.`);
  }
}

function packageName(dir: string): string | null {
  try {
    const j: unknown = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    const n = (j as { name?: unknown } | null)?.name;
    return typeof n === "string" ? n : null;
  } catch {
    return null;
  }
}

function gitClone(url: string, dest: string, extra: string[], timeoutMs: number): Promise<{ code: number | null; err: string }> {
  return new Promise((res, rej) => {
    const args = [
      "clone", "--depth", "1", "--single-branch", "--no-tags", "--quiet",
      "-c", "core.hooksPath=/dev/null",
      ...extra,
      "--", url, dest,
    ];
    const child = spawn("git", args, {
      stdio: ["ignore", "ignore", "pipe"],
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_LFS_SKIP_SMUDGE: "1" },
    });
    let err = "";
    child.stderr.on("data", (d: Buffer) => {
      err = (err + d.toString()).slice(-2000);
    });
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    const off = onInterrupt(() => {
      child.kill("SIGKILL");
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      off();
      rej(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      off();
      res({ code, err });
    });
  });
}

const lastLine = (s: string) => s.trim().split("\n").filter(Boolean).pop() ?? "no details";

export async function openTarget(arg: string, opts: TargetOpts = {}): Promise<Target> {
  const gh = parseGithubUrl(arg);
  if (!gh) {
    if (looksRemote(arg)) throw new UsageError(`'${arg.slice(0, 60)}' is not a GitHub repository URL. Use a local path or a link of the form github.com/<owner>/<repo>.`);
    const dir = resolve(arg);
    let ok = false;
    try {
      ok = statSync(dir).isDirectory();
    } catch {
      ok = false;
    }
    if (!ok) throw new TargetError(`'${arg}' is not a readable directory.`);
    assertScannable(dir, arg, false);
    return { dir, name: deriveRepoName({ packageName: packageName(dir), path: dir }), cloned: false, cleanup() {} };
  }

  const label = `${gh.owner}/${gh.repo}`;
  const tmp = mkdtempSync(join(opts.tmpRoot ?? tmpdir(), "crypt-clone-"));
  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    off();
    rmSync(tmp, { recursive: true, force: true });
  };
  const off = onInterrupt(() => {
    done = true;
    rmSync(tmp, { recursive: true, force: true });
  });
  const dir = join(tmp, "repo");
  try {
    // protocol.file.allow=never keeps a clone from reading local paths. Tests that clone a local bare repository set opts.remote.
    const url = opts.remote ? opts.remote(gh.owner, gh.repo) : `${"https:"}//github.com/${gh.owner}/${gh.repo}.git`;
    const extra = opts.remote ? [] : ["-c", "protocol.file.allow=never"];
    let r;
    try {
      r = await gitClone(url, dir, extra, opts.cloneTimeoutMs ?? CLONE_TIMEOUT_MS);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") throw new ToolchainError("'git' not found. Install git (Debian: apt install git) and run again.");
      throw e;
    }
    if (r.code !== 0) {
      throw new TargetError(`could not clone ${label}: ${lastLine(r.err)}. Check the name and that the repository is public.`);
    }
    assertScannable(dir, label, true);
    return {
      dir,
      name: deriveRepoName({ url: arg, path: dir }),
      cloned: true,
      cleanup,
    };
  } catch (e) {
    cleanup();
    throw e;
  }
}

