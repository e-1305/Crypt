// The one place that reads CRYPT_TOOLCHAIN_DIR. Default: the repo's .toolchain, so npm scripts behave as before.
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Root of the crypt package (the directory with package.json), independent of the current directory. */
export const PACKAGE_ROOT = fileURLToPath(new URL("..", import.meta.url));

export function toolchainDir(env: NodeJS.ProcessEnv = process.env): string {
  const v = env.CRYPT_TOOLCHAIN_DIR;
  return v ? resolve(v) : join(PACKAGE_ROOT, ".toolchain");
}

export const inform6Path = (env?: NodeJS.ProcessEnv) => join(toolchainDir(env), "Inform6", "inform6");
export const dfrotzPath = (env?: NodeJS.ProcessEnv) => join(toolchainDir(env), "frotz", "dfrotz");
export const includePath = (env?: NodeJS.ProcessEnv) => join(toolchainDir(env), "inc");
