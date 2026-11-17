// npm registry metadata for one exact version. The real client is scripts/registry-client.ts; this file has no network code.

export interface RegistryVersion {
  version: string;
  /** Tarball URL from the registry `dist` metadata. */
  resolved: string;
  /** `sha512-...` from the registry `dist` metadata. */
  integrity: string;
  dependencies: Record<string, string>;
  optionalDependencies: Record<string, string>;
  peerDependencies: Record<string, string>;
}

export interface RegistryClient {
  /** Reads metadata only. Never downloads or runs the package. */
  getVersion(name: string, version: string): Promise<RegistryVersion>;
}
