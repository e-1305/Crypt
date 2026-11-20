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

export const MAX_PATTERN_LENGTH = 200;
export const MAX_RULES = 5000;

export function parseCodeowners(text: string): OwnerRule[] {
  const rules: OwnerRule[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/(^|\s)#.*$/, "").trim();
    if (line === "") continue;
    const [pattern, ...owners] = line.split(/\s+/);
    if (pattern === undefined) continue;
    // Fail-safe: an oversized pattern or file is dropped, so the path stays unowned.
    if (pattern.length > MAX_PATTERN_LENGTH) continue;
    if (rules.length >= MAX_RULES) break;
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

type Tok =
  | { k: "lit"; c: string }
  | { k: "one" } // ?
  | { k: "star" } // *
  | { k: "any" } // **
  | { k: "dirs" } // **/ (first half, may be skipped; the next token is "dirs2")
  | { k: "dirs2" } // **/ (second half, consumes the run and its final slash)
  | { k: "tail" }; // optional "/" followed by anything (the next token is "any")

function compile(pattern: string): Tok[] {
  let p = pattern;
  const anchored = p.startsWith("/");
  if (anchored) p = p.slice(1);
  const dirOnly = p.endsWith("/");
  if (dirOnly) p = p.slice(0, -1);
  const toks: Tok[] = [];
  if (!anchored && !p.includes("/")) toks.push({ k: "dirs" }, { k: "dirs2" });
  for (let i = 0; i < p.length; i++) {
    const c = p[i]!;
    if (c === "*" && p[i + 1] === "*") {
      i++;
      if (p[i + 1] === "/") {
        i++;
        toks.push({ k: "dirs" }, { k: "dirs2" });
      } else toks.push({ k: "any" });
    } else if (c === "*") toks.push({ k: "star" });
    else if (c === "?") toks.push({ k: "one" });
    else toks.push({ k: "lit", c });
  }
  if (dirOnly) toks.push({ k: "lit", c: "/" }, { k: "any" });
  else toks.push({ k: "tail" }, { k: "any" });
  return toks;
}

/** Linear-time glob match (NFA simulation, no backtracking). Same semantics as patternToRegExp. */
export function matchPattern(pattern: string, path: string): boolean {
  const toks = compile(pattern);
  const n = toks.length;
  let cur = new Uint8Array(n + 1);
  const close = (s: Uint8Array): void => {
    for (let i = 0; i < n; i++) {
      if (!s[i]) continue;
      const t = toks[i]!;
      if (t.k === "star" || t.k === "any") s[i + 1] = 1;
      else if (t.k === "dirs") s[i + 2] = 1;
      else if (t.k === "tail") s[i + 2] = 1;
    }
  };
  cur[0] = 1;
  close(cur);
  for (let j = 0; j < path.length; j++) {
    const ch = path[j]!;
    const next = new Uint8Array(n + 1);
    for (let i = 0; i < n; i++) {
      if (!cur[i]) continue;
      const t = toks[i]!;
      switch (t.k) {
        case "lit":
          if (ch === t.c) next[i + 1] = 1;
          break;
        case "one":
          if (ch !== "/" && ch !== "\n") next[i + 1] = 1;
          break;
        case "star":
          if (ch !== "/" && ch !== "\n") next[i] = 1;
          break;
        case "any":
          if (ch !== "\n") next[i] = 1;
          break;
        case "dirs":
          if (ch !== "\n") next[i + 1] = 1;
          if (ch === "/") next[i + 2] = 1;
          break;
        case "dirs2":
          if (ch !== "\n") next[i] = 1;
          if (ch === "/") next[i + 1] = 1;
          break;
        case "tail":
          if (ch === "/") next[i + 1] = 1;
          break;
      }
    }
    close(next);
    cur = next;
  }
  return cur[n] === 1;
}

/** Last matching rule wins. Returns the owners joined by a space, or "unowned". */
export function ownerOf(rules: OwnerRule[], path: string): string {
  const rel = path.replace(/^\.?\//, "");
  let owners: string[] | null = null;
  for (const r of rules) if (matchPattern(r.pattern, rel)) owners = r.owners;
  return owners && owners.length > 0 ? owners.join(" ") : UNOWNED;
}
