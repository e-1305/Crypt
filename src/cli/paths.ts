// Where the CLI keeps its built toolchain. First match wins.
export function cliToolchainDir(env: Record<string, string | undefined>, home: string): string {
  if (env.CRYPT_TOOLCHAIN_DIR) return env.CRYPT_TOOLCHAIN_DIR;
  const xdg = env.XDG_CACHE_HOME;
  // The XDG spec ignores relative values.
  if (xdg && xdg.startsWith("/")) return `${xdg.replace(/\/+$/, "")}/crypt/toolchain`;
  return `${home.replace(/\/+$/, "")}/.cache/crypt/toolchain`;
}
