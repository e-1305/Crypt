// npm run plate -- out/creature.json [--repo name]: print the anatomical plate.
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { renderPlate } from "../src/render/plate.js";

const USAGE = "usage: crypt plate <creature.json> [--repo name]";
const args = process.argv.slice(2);
let file = "";
let repo = basename(resolve("."));
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--repo") repo = args[++i] ?? "";
  else if (!file && !args[i]!.startsWith("--")) file = args[i]!;
  else {
    console.error(USAGE);
    process.exit(2);
  }
}
if (!file) {
  console.error(USAGE);
  process.exit(2);
}
try {
  process.stdout.write(renderPlate(JSON.parse(readFileSync(file, "utf8")), { repo }));
} catch (e) {
  console.error(`plate: ${(e as Error).message}`);
  process.exit(1);
}
