import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? sources(join(dir, d.name)) : [join(dir, d.name)],
  );
}

describe("least privilege and economy of mechanism (rules 2, 4)", () => {
  const files = sources("src");
  it("src/ contains files", () => expect(files.length).toBeGreaterThan(0));
  it("src/ has no merge call", () => {
    for (const f of files) expect(readFileSync(f, "utf8"), f).not.toMatch(/merge/i);
  });
  it("src/ has no network client, GitHub or LLM import", () => {
    const banned = /node:https?|node:net|node:dgram|node:tls|\bfetch\s*\(|XMLHttpRequest|octokit|openai|anthropic|\bhttps?:\/\//i;
    for (const f of files) expect(readFileSync(f, "utf8"), f).not.toMatch(banned);
  });
});
