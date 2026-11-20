import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? sources(join(dir, d.name)) : [join(dir, d.name)],
  );
}

// The state label, the human-merged event type (data a person produced) and the GitHub data fields merged_at and merged_by are not calls.
const withoutLabel = (t: string) => t.replace(/awaiting[-_]human[-_]merge|(?<![\w/.-])human-merged(?![\w-])|\bmerged_at\b|\bmerged_by\b/gi, "");

/** Merge endpoints and commands: banned in src/ and scripts/ (failsafe 2). Returns the offending patterns. */
export function mergeOffenses(text: string): string[] {
  const t = withoutLabel(text);
  const patterns: [string, RegExp][] = [
    ["gh pr merge", /gh\s+pr\s+merge/i],
    ["merge endpoint", /\/merge\b/i],
    ["merge call", /\bmerge\w*\s*\(/i],
    ["merge method name", /\b(merge|enable)\w*(PullRequest|AutoMerge)\b/i],
    ["auto-merge", /auto[-_ ]?merge/i],
    ["merge_method", /merge_method|merge_commit/i],
    ["PUT merge", /PUT[^\n]*merge/i],
  ];
  return patterns.filter(([, re]) => re.test(t)).map(([n]) => n);
}

describe("least privilege and economy of mechanism (rules 2, 4)", () => {
  const files = sources("src");
  it("src/ contains files", () => expect(files.length).toBeGreaterThan(0));
  it("src/ has no merge call", () => {
    // The only allowed use of the word is the limb state label "awaiting-human-merge" and its audit outcome (a state, not a call).
    for (const f of files) expect(withoutLabel(readFileSync(f, "utf8")), f).not.toMatch(/merge/i);
  });
  it("src/ has no network client, GitHub or LLM import", () => {
    const banned = /node:https?|node:net|node:dgram|node:tls|\bfetch\s*\(|XMLHttpRequest|octokit|openai|anthropic|\bhttps?:\/\//i;
    // The live exhume modules receive an injected fetch and may name exactly two hosts: raw.githubusercontent.com and api.osv.dev.
    const hosts = new Set(["src/web/live-exhume.ts", "src/exhume/osv-client.ts", "src/necromancer/package-advisories.ts", "src/render/card.ts", "src/report/template.ts", "src/alerts/sarif.ts"]);
    const urlOk = /^https:\/\/(raw\.githubusercontent\.com|api\.osv\.dev|e-1305\.github\.io|www\.linkedin\.com|json\.schemastore\.org)\b/;
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      if (!hosts.has(f)) {
        expect(text, f).not.toMatch(banned);
        continue;
      }
      expect(text, f).not.toMatch(/node:https?|node:net|node:dgram|node:tls|\bfetch\s*\(|XMLHttpRequest|octokit|openai|anthropic/i);
      for (const u of text.match(/https?:\/\/[^\s"'`)]*/g) ?? []) {
        // Prose examples (a pasted repository, the npx command) are not requests.
        if (/^https:\/\/github\.com\//.test(u)) continue;
        expect(u, f).toMatch(urlOk);
      }
    }
  });
});

describe("no merge endpoint or command anywhere (failsafe 2)", () => {
  const all = [...sources("src"), ...sources("scripts")];
  it("src/ and scripts/ contain no merge endpoint, command or call", () => {
    expect(all.length).toBeGreaterThan(0);
    for (const f of all) expect(mergeOffenses(readFileSync(f, "utf8")), f).toEqual([]);
  });
  it("the check fails on planted offenders", () => {
    const planted = [
      "run('gh pr merge 5')",
      "fetch(`/repos/o/r/pulls/5/merge`, { method: 'PUT' })",
      "await octo.mergePullRequest(5)",
      "enableAutoMerge(pr)",
      "client.merge(5)",
      'body: {"merge_method": "squash"}',
    ];
    for (const p of planted) expect(mergeOffenses(p), p).not.toEqual([]);
  });
  it("the state label alone is allowed", () => {
    expect(mergeOffenses('state: "awaiting-human-merge"')).toEqual([]);
    expect(mergeOffenses("x/human-merged(")).not.toEqual([]);
    expect(mergeOffenses('fetch("/repos/o/r/pulls/1/merged_at/merge")')).not.toEqual([]);
  });
});

// Every fetch( call in scripts/ must pass a signal so a stalled server cannot hang a run.
// Allow list: files whose fetch is only a reference handed to a wrapper that sets the signal per request.
const FETCH_ALLOW = new Set<string>(["scripts/github-client.ts"]);

/** Returns the line numbers of fetch( calls whose argument list has no signal. */
export function fetchWithoutSignal(text: string): number[] {
  const bad: number[] = [];
  for (const m of text.matchAll(/(?<![\w.])fetch\s*\(/g)) {
    let depth = 0;
    let end = m.index! + m[0].length - 1;
    for (; end < text.length; end++) {
      if (text[end] === "(") depth++;
      else if (text[end] === ")" && --depth === 0) break;
    }
    if (!/\bsignal\b/.test(text.slice(m.index!, end))) bad.push(text.slice(0, m.index).split("\n").length);
  }
  return bad;
}

describe("every script fetch has a timeout signal", () => {
  it("scripts/*.ts pass a signal to each fetch(", () => {
    const offenders = readdirSync("scripts")
      .filter((f) => f.endsWith(".ts") && !FETCH_ALLOW.has(`scripts/${f}`))
      .flatMap((f) => fetchWithoutSignal(readFileSync(join("scripts", f), "utf8")).map((l) => `scripts/${f}:${l}`));
    expect(offenders).toEqual([]);
  });
  it("the check fails on a planted offender and passes with a signal", () => {
    expect(fetchWithoutSignal("await fetch(url);")).toEqual([1]);
    expect(fetchWithoutSignal("await fetch(url, { signal: AbortSignal.timeout(1) });")).toEqual([]);
  });
});
