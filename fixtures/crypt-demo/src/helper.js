import { readFileSync } from "node:fs";

export const helper = () => readFileSync(new URL(import.meta.url), "utf8").length;
