import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ExhumeFs } from "../src/exhume/types.js";

export function nodeFs(root = "."): ExhumeFs {
  return {
    read(p) {
      try {
        return readFileSync(join(root, p), "utf8");
      } catch {
        return null;
      }
    },
    write(p, text) {
      const full = join(root, p);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, text);
    },
  };
}
