export interface Purl {
  type: string;
  name: string;
  version: string | null;
}

/** Parses pkg:<type>/[namespace/]name[@version][?qualifiers][#subpath]. Returns null when it is not a valid purl. */
export function parsePurl(s: unknown): Purl | null {
  if (typeof s !== "string" || s.length > 500 || !s.startsWith("pkg:")) return null;
  const rest = s.slice(4).replace(/#.*$/, "").replace(/\?.*$/, "");
  const slash = rest.indexOf("/");
  if (slash <= 0) return null;
  const type = rest.slice(0, slash).toLowerCase();
  let path = rest.slice(slash + 1);
  let version: string | null = null;
  const at = path.lastIndexOf("@");
  if (at > 0) {
    version = path.slice(at + 1);
    path = path.slice(0, at);
  }
  try {
    const name = path.split("/").map(decodeURIComponent).join("/");
    const v = version === null ? null : decodeURIComponent(version);
    if (name === "" || name.startsWith("/") || name.endsWith("/")) return null;
    return { type, name, version: v === "" ? null : v };
  } catch {
    return null;
  }
}
