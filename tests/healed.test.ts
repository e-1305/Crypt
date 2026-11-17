import { describe, expect, it } from "vitest";
import { markHealed, type MemoryStore } from "../src/web/healed.js";
import { limbKey } from "../src/render/plate.js";

const memory = (): MemoryStore => {
  const m = new Map<string, unknown>();
  return { get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, structuredClone(v)) };
};
const limb = (name: string, state: string, spawned = true) => ({ ecosystem: "npm", name, state, spawned });

describe("healed memory", () => {
  it("marks a limb healed once it is Healthy after being seen Rotting", () => {
    const store = memory();
    expect(markHealed([limb("a", "Rotting")], store)).toEqual([]);
    const l = limb("a", "Healthy");
    expect(markHealed([l], store)).toEqual(["npm:a"]);
    expect((l as { healed?: boolean }).healed).toBe(true);
    expect(markHealed([limb("a", "Healthy")], store)).toEqual([]);
  });

  it("ignores limbs never seen sick or not spawned", () => {
    const store = memory();
    markHealed([limb("b", "Possessed", false)], store);
    expect(markHealed([limb("b", "Healthy"), limb("c", "Healthy")], store)).toEqual([]);
  });

  it("returns the same key the plate uses for long and non-ASCII names", () => {
    const store = memory();
    const long = "org.springframework.boot:spring-boot-starter-web-extra-long-name";
    for (const name of [long, "caf\u00e9"]) {
      markHealed([limb(name, "Rotting")], store);
      expect(markHealed([limb(name, "Healthy")], store)).toEqual([limbKey("npm", name)]);
    }
  });
});
