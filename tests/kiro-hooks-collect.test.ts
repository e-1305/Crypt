import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { collect } from "../scripts/ci/kiro-hooks-collect.mjs";

const line = (hook: string, trigger: string, extra: Record<string, unknown> = {}) => JSON.stringify({ ts: "2026-01-01T00:00:00.000Z", hook, trigger, file: "x.ts", exit: 0, summary: "ok", ...extra });

describe("kiro-hooks-collect", () => {
  it("fails when no new line exists", () => {
    const text = line("a", "manual") + "\n";
    expect(collect(text, 1)).toEqual({ error: "no hook fired, nothing recorded" });
    expect(collect("", 0)).toEqual({ error: "no hook fired, nothing recorded" });
  });

  it("fails on a new manual line and names the hook and file", () => {
    const r = collect([line("a", "manual"), line("b", "manual")].join("\n") + "\n", 1);
    expect(r.error).toContain('hook "b"');
    expect(r.error).toContain('file "x.ts"');
  });

  it("adds source to new real lines only, keeps key order and leaves baseline lines untouched", () => {
    const base = line("a", "manual");
    const r = collect([base, line("b", "PostFileSave"), line("b", "Stop"), line("c", "SessionStart")].join("\n") + "\n", 1);
    expect(r.error).toBeUndefined();
    const out = r.text!.trim().split("\n");
    expect(out[0]).toBe(base);
    expect(out).toHaveLength(4);
    for (const l of out.slice(1)) expect(Object.keys(JSON.parse(l))).toEqual(["ts", "hook", "trigger", "file", "exit", "summary", "source"]);
    expect(JSON.parse(out[1]!)).toEqual({ ...JSON.parse(line("b", "PostFileSave")), source: "kiro-cli-ci" });
    expect(r.counts).toEqual({ b: 2, c: 1 });
  });

  it("CLI rejects a missing baseline", () => {
    const r = spawnSync("node", ["scripts/ci/kiro-hooks-collect.mjs"], { encoding: "utf8" });
    expect(r.status).toBe(2);
  });
});
