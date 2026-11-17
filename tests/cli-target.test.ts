import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TargetError, UsageError } from "../src/cli/exit.js";
import { GITHUB_BASE } from "../src/cli/url.js";
import { openTarget } from "../scripts/cli/target.js";

const FIXTURE = join(process.cwd(), "fixtures", "vulnerable-npm");
const work = mkdtempSync(join(tmpdir(), "crypt-test-remotes-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));

function git(cwd: string, ...args: string[]): void {
  const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
}

/** Builds a bare repository at <work>/<owner>/<repo>.git from a populate callback. */
function makeRemote(owner: string, repo: string, populate: (dir: string) => void): void {
  const src = join(work, `src-${owner}-${repo}`);
  mkdirSync(src, { recursive: true });
  git(src, "init", "-q", "-b", "main");
  populate(src);
  git(src, "add", "-A");
  git(src, "commit", "-q", "-m", "init");
  mkdirSync(join(work, owner), { recursive: true });
  git(work, "clone", "-q", "--bare", src, join(work, owner, `${repo}.git`));
}

const remote = (owner: string, repo: string) => `file://${join(work, owner, `${repo}.git`)}`;

beforeAll(() => {
  makeRemote("o", "good", (d) => {
    cpSync(join(FIXTURE, "package-lock.json"), join(d, "package-lock.json"));
    writeFileSync(join(d, "package.json"), JSON.stringify({ name: "@o/ignored-for-urls" }));
  });
  makeRemote("o", "empty", (d) => writeFileSync(join(d, "README.md"), "nothing to scan\n"));
  makeRemote("o", "linked", (d) => {
    writeFileSync(join(d, "secret.txt"), "not a lockfile\n");
    symlinkSync("/etc/passwd", join(d, "package-lock.json"));
  });
  makeRemote("o", "linkdir", (d) => {
    cpSync(join(FIXTURE, "package-lock.json"), join(d, "package-lock.json"));
    symlinkSync("/etc", join(d, ".github"));
  });
});

function leftovers(root: string): string[] {
  return readdirSync(root).filter((n) => n.startsWith("crypt-clone-"));
}

describe("URL target: shallow clone into a temporary directory", () => {
  it("clones, names the creature after the repo, and removes the directory on cleanup", async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), "crypt-test-tmp-"));
    try {
      const t = await openTarget(`${GITHUB_BASE}/o/good`, { remote, tmpRoot });
      expect(t.cloned).toBe(true);
      expect(t.name).toBe("good");
      expect(t.dir.startsWith(tmpRoot)).toBe(true);
      expect(readdirSync(t.dir)).toContain("package-lock.json");
      expect(leftovers(tmpRoot)).toHaveLength(1);
      t.cleanup();
      expect(leftovers(tmpRoot)).toEqual([]);
      t.cleanup(); // idempotent
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it("removes the temporary directory when the scan fails after the clone (no manifest)", async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), "crypt-test-tmp-"));
    try {
      await expect(openTarget(`${GITHUB_BASE}/o/empty`, { remote, tmpRoot })).rejects.toThrow(TargetError);
      expect(leftovers(tmpRoot)).toEqual([]);
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it("removes the temporary directory when the clone itself fails", async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), "crypt-test-tmp-"));
    try {
      await expect(openTarget(`${GITHUB_BASE}/o/missing`, { remote, tmpRoot })).rejects.toThrow(/could not clone o\/missing/);
      expect(leftovers(tmpRoot)).toEqual([]);
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it("refuses a symlinked package-lock.json and cleans up", async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), "crypt-test-tmp-"));
    try {
      await expect(openTarget(`${GITHUB_BASE}/o/linked`, { remote, tmpRoot })).rejects.toThrow(/symbolic link/);
      expect(leftovers(tmpRoot)).toEqual([]);
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it("refuses a manifest reached through a symlinked directory", async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), "crypt-test-tmp-"));
    try {
      await expect(openTarget(`${GITHUB_BASE}/o/linkdir`, { remote, tmpRoot })).rejects.toThrow(/symbolic link/);
      expect(leftovers(tmpRoot)).toEqual([]);
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});

describe("local and invalid targets", () => {
  it("a local directory is used in place and cleanup leaves it alone", async () => {
    const t = await openTarget(FIXTURE);
    expect(t.cloned).toBe(false);
    expect(t.dir).toBe(FIXTURE);
    expect(t.name).toBe("vulnerable-npm-fixture");
    t.cleanup();
    expect(readdirSync(FIXTURE)).toContain("package-lock.json");
  });
  it("a missing directory and a directory without manifests are TargetErrors", async () => {
    await expect(openTarget(join(tmpdir(), "crypt-nope-xyz"))).rejects.toThrow(TargetError);
    const d = mkdtempSync(join(tmpdir(), "crypt-empty-"));
    try {
      await expect(openTarget(d)).rejects.toThrow(/package-lock\.json or requirements\.txt/);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
  it("a non-GitHub URL is a UsageError", async () => {
    await expect(openTarget("https://example.com/a/b")).rejects.toThrow(UsageError);
  });
});
