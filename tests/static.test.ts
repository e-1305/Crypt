import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? sources(join(dir, d.name)) : [join(dir, d.name)],
  );
}

const withoutLabel = (t: string) => t.replace(/awaiting[-_]human[-_]merge/gi, "");

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
    for (const f of files) expect(readFileSync(f, "utf8"), f).not.toMatch(banned);
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
  });
});
