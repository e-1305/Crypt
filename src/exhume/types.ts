export type Ecosystem = "npm" | "PyPI";

export interface Limb {
  ecosystem: Ecosystem;
  name: string;
  version: string; // "unknown" when the manifest does not pin one
  direct: boolean;
  manifest: string;
}

export interface ExhumeFs {
  /** Returns null when the file is absent or unreadable. */
  read(path: string): string | null;
  write(path: string, text: string): void;
}

export interface OsvVuln {
  id: string;
  aliases: string[];
  severity: string | null;
}

export const UNKNOWN_VERSION = "unknown";

export function limbKey(l: Pick<Limb, "ecosystem" | "name" | "version">): string {
  return `${l.ecosystem}:${l.name}@${l.version}`;
}

export function compareLimbs(a: Limb, b: Limb): number {
  return cmp(a.ecosystem, b.ecosystem) || cmp(a.name, b.name) || cmp(a.version, b.version);
}

export function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
