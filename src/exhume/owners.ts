export interface OwnerRule {
  pattern: string;
  owners: string[];
}

export const CODEOWNERS_LOCATIONS = [".github/CODEOWNERS", "CODEOWNERS", "docs/CODEOWNERS"];
export const UNOWNED = "unowned";

export function parseCodeowners(text: string): OwnerRule[] {
  const rules: OwnerRule[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/(^|\s)#.*$/, "").trim();
    if (line === "") continue;
    const [pattern, ...owners] = line.split(/\s+/);
    if (pattern === undefined) continue;
    rules.push({ pattern, owners });
  }
  return rules;
}

function esc(c: string): string {
  return c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
}

export function patternToRegExp(pattern: string): RegExp {
  let p = pattern;
  const anchored = p.startsWith("/");
  if (anchored) p = p.slice(1);
  const dirOnly = p.endsWith("/");
  if (dirOnly) p = p.slice(0, -1);
  const slashInside = p.includes("/");
  let re = "";
  for (let i = 0; i < p.length; i++) {
    const c = p[i]!;
    if (c === "*" && p[i + 1] === "*") {
      i++;
      if (p[i + 1] === "/") {
        i++;
        re += "(?:.*/)?";
      } else re += ".*";
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else re += esc(c);
  }
  const prefix = anchored || slashInside ? "^" : "^(?:.*/)?";
  return new RegExp(`${prefix}${re}${dirOnly ? "/.*" : "(?:/.*)?"}$`);
}

/** Last matching rule wins. Returns the owners joined by a space, or "unowned". */
export function ownerOf(rules: OwnerRule[], path: string): string {
  const rel = path.replace(/^\.?\//, "");
  let owners: string[] | null = null;
  for (const r of rules) if (patternToRegExp(r.pattern).test(rel)) owners = r.owners;
  return owners && owners.length > 0 ? owners.join(" ") : UNOWNED;
}
