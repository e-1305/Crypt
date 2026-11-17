// The Inform 6 and dfrotz toolchain: built once into a user cache directory by scripts/setup-tools.sh.
import { spawn } from "node:child_process";
import { accessSync, closeSync, constants, existsSync, mkdirSync, openSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { ToolchainError } from "../../src/cli/exit.js";
import { cliToolchainDir } from "../../src/cli/paths.js";
import { PACKAGE_ROOT } from "../toolchain-dir.js";
import { onInterrupt } from "./signals.js";

const BUILD_TOOLS = ["bash", "git", "make", "cc"];

export function toolchainReady(dir: string): boolean {
  return (
    existsSync(join(dir, "Inform6", "inform6")) && existsSync(join(dir, "frotz", "dfrotz")) && existsSync(join(dir, "inc", "Parser.h"))
  );
}

function onPath(tool: string, path: string | undefined): boolean {
  return (path ?? "").split(delimiter).some((d) => {
    if (!d) return false;
    try {
      accessSync(join(d, tool), constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
}

export function missingBuildTools(path: string | undefined = process.env.PATH): string[] {
  return BUILD_TOOLS.filter((t) => !onPath(t, path));
}

/** Makes sure the toolchain exists, building it on first use. Sets CRYPT_TOOLCHAIN_DIR for this process and its children. */
export async function ensureToolchain(): Promise<string> {
  const dir = resolve(cliToolchainDir(process.env, homedir()));
  process.env.CRYPT_TOOLCHAIN_DIR = dir;
  if (toolchainReady(dir)) return dir;

  const missing = missingBuildTools();
  if (missing.length > 0) {
    throw new ToolchainError(
      `'${missing[0]}' not found. Install build tools (Debian: apt install build-essential git) and run again.`,
    );
  }
  mkdirSync(dir, { recursive: true });
  const log = join(dir, "build.log");
  process.stderr.write(`Building the Inform 6 and dfrotz toolchain once into ${dir} (about a minute)...\n`);
  const fd = openSync(log, "w");
  try {
    const code = await new Promise<number | null>((res, rej) => {
      const child = spawn("bash", [join(PACKAGE_ROOT, "scripts", "setup-tools.sh")], {
        stdio: ["ignore", fd, fd],
        env: { ...process.env, CRYPT_TOOLCHAIN_DIR: dir },
      });
      const off = onInterrupt(() => {
        child.kill("SIGTERM");
      });
      child.on("error", (e) => {
        off();
        rej(e);
      });
      child.on("close", (c) => {
        off();
        res(c);
      });
    });
    if (code !== 0) {
      throw new ToolchainError(
        `the toolchain build failed (exit ${code}). The build needs network access to github.com, git, make and a C compiler. See ${log}`,
      );
    }
  } catch (e) {
    if (e instanceof ToolchainError) throw e;
    throw new ToolchainError(`could not run the toolchain build: ${(e as Error).message}. See ${log}`);
  } finally {
    closeSync(fd);
  }
  if (!toolchainReady(dir)) throw new ToolchainError(`the toolchain build finished but ${dir} is incomplete. See ${log}`);
  return dir;
}
