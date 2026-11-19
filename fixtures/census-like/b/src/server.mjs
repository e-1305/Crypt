// ESM, dynamic import, export-from. qs and yaml are not declared by the root package.
import express from "express";
export * from "left-pad";

export async function load() {
  const mod = await import("express/lib/router");
  return mod;
}

export const app = express();
