// Injected file access for the agents (necromancer, inquisitor, reraise).
import * as nodeFs from "node:fs";
import { dirname, join } from "node:path";
import { nodeFsOps, type Fs } from "../bridge/watch.js";

export interface Io extends Fs {
  /** Writes through a temporary file and a rename, so readers never see a half-written file. */
  writeText(path: string, data: string): void;
  /** File names in a directory, sorted. An absent directory gives []. */
  listDir(dir: string): string[];
}

export const nodeIo: Io = {
  ...nodeFsOps,
  writeText(path, data) {
    nodeFs.mkdirSync(dirname(path), { recursive: true });
    const tmp = join(dirname(path), `.${process.pid}.${Date.now()}.tmp`);
    nodeFs.writeFileSync(tmp, data);
    nodeFs.renameSync(tmp, path);
  },
  listDir(dir) {
    try {
      return nodeFs.readdirSync(dir).sort();
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw e;
    }
  },
};
