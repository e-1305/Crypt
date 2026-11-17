// Asserts the R8 acceptance result: 1 request, 4 audit lines, 1 REJECTED_SEALED graft.
import { existsSync, readdirSync, readFileSync } from "node:fs";

const requests = existsSync("out/requests") ? readdirSync("out/requests") : [];
const audit = readFileSync("crypt-audit.log", "utf8").split("\n").filter((l) => l !== "");
const outcomes = audit.map((l) => l.split("\t")[3]);
const rejected = outcomes.filter((o) => o === "REJECTED_SEALED").length;

const errors: string[] = [];
if (requests.length !== 1) errors.push(`expected 1 request, found ${requests.length}`);
if (audit.length !== 4) errors.push(`expected 4 audit lines, found ${audit.length}`);
if (rejected !== 1) errors.push(`expected 1 REJECTED_SEALED, found ${rejected}`);
if (outcomes.join(",") !== "OK,REQUEST_WRITTEN,SEALED,REJECTED_SEALED") {
  errors.push(`unexpected outcome sequence: ${outcomes.join(",")}`);
}
if (errors.length > 0) {
  console.error("spike check FAILED:\n  " + errors.join("\n  "));
  process.exit(1);
}
console.log("spike check OK: 1 request, 4 audit lines, 1 graft rejected after seal");
