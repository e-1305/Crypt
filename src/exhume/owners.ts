export interface OwnerRule {
  pattern: string;
  owners: string[];
}

export const CODEOWNERS_LOCATIONS = [".github/CODEOWNERS", "CODEOWNERS", "docs/CODEOWNERS"];
export const UNOWNED = "unowned";
/** Blameless copy shown to people. The data value stays "unowned". */
export const NO_OWNER_TEXT = "no owner yet";

export function ownerLabel(owner: string | null | undefined): string {
  return !owner || owner === UNOWNED ? NO_OWNER_TEXT : owner;
}

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

/** Caps on hostile CODEOWNERS files. A rule past a cap is ignored, so the manifest falls back to "unowned" (fail-safe). */
export const MAX_RULES = 5000;
export const MAX_PATTERN_LENGTH = 200;
export const MAX_PATH_LENGTH = 4096;

// Glob tokens. "jump" is an epsilon edge to `to` (an optional group); everything else moves forward one token.
type Tok =
  | { k: "lit"; c: string }
  | { k: "one" }
  | { k: "star" }
  | { k: "any" }
  | { k: "jump"; to: number };

/** Same language as patternToRegExp, as a token list for the linear matcher below. */
export function compileGlob(pattern: string): Tok[] {
  let p = pattern;
  const anchored = p.startsWith("/");
  if (anchored) p = p.slice(1);
  const dirOnly = p.endsWith("/");
  if (dirOnly) p = p.slice(0, -1);
  const slashInside = p.includes("/");
  const t: Tok[] = [];
  // (?:.*/)?  →  jump-over, any, "/"
  const optDirs = () => { const j: Tok = { k: "jump", to: 0 }; t.push(j, { k: "any" }, { k: "lit", c: "/" }); j.to = t.length; };
  if (!(anchored || slashInside)) optDirs();
  for (let i = 0; i < p.length; i++) {
    const c = p[i]!;
    if (c === "*" && p[i + 1] === "*") {
      i++;
      if (p[i + 1] === "/") { i++; optDirs(); }
      else t.push({ k: "any" });
    } else if (c === "*") t.push({ k: "star" });
    else if (c === "?") t.push({ k: "one" });
    else t.push({ k: "lit", c });
  }
  if (dirOnly) t.push({ k: "lit", c: "/" }, { k: "any" });
  else { const j: Tok = { k: "jump", to: 0 }; t.push(j, { k: "lit", c: "/" }, { k: "any" }); j.to = t.length; }
  return t;
}

/** NFA simulation over the tokens: O(path × pattern), no backtracking. */
export function globMatch(tokens: Tok[], path: string): boolean {
  const m = tokens.length;
  let cur = new Uint8Array(m + 1);
  const close = (s: Uint8Array) => {
    for (let i = 0; i < m; i++) {
      if (!s[i]) continue;
      const tk = tokens[i]!;
      if (tk.k === "star" || tk.k === "any") s[i + 1] = 1;
      else if (tk.k === "jump") { s[i + 1] = 1; s[tk.to] = 1; }
    }
  };
  cur[0] = 1;
  close(cur);
  for (const ch of path) {
    const next = new Uint8Array(m + 1);
    let alive = false;
    for (let i = 0; i < m; i++) {
      if (!cur[i]) continue;
      const tk = tokens[i]!;
      if (tk.k === "lit") { if (tk.c === ch) { next[i + 1] = 1; alive = true; } }
      else if (tk.k === "one") { if (ch !== "/") { next[i + 1] = 1; alive = true; } }
      else if (tk.k === "star") { if (ch !== "/") { next[i] = 1; alive = true; } }
      else if (tk.k === "any") { next[i] = 1; alive = true; }
    }
    if (!alive) return false;
    close(next);
    cur = next;
  }
  return cur[m] === 1;
}

/** Last matching rule wins. Returns the owners joined by a space, or "unowned". */
export function ownerOf(rules: OwnerRule[], path: string): string {
  const rel = path.replace(/^\.?\//, "");
  if (rel.length > MAX_PATH_LENGTH) return UNOWNED;
  let owners: string[] | null = null;
  for (const r of rules.slice(0, MAX_RULES)) {
    if (r.pattern.length > MAX_PATTERN_LENGTH) continue;
    if (globMatch(compileGlob(r.pattern), rel)) owners = r.owners;
  }
  return owners && owners.length > 0 ? owners.join(" ") : UNOWNED;
}
