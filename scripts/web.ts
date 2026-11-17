// npm run web: build the story file, compile the hook for the browser, serve web/ on 127.0.0.1.
// Serves GET and HEAD for files under web/ only, with a fixed content-type table.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve, sep } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const WEB = join(ROOT, "web");
const PORT = Number(process.env.PORT ?? 8080);

function step(name: string, cmd: string, args: string[]) {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit" });
  if (r.status !== 0) {
    console.error(`web: step failed: ${name}`);
    process.exit(1);
  }
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".z5": "application/octet-stream",
  ".txt": "text/plain; charset=utf-8",
};

export function resolveStatic(urlPath: string): string | null {
  let rel: string;
  try {
    rel = decodeURIComponent(urlPath.split("?")[0].split("#")[0]);
  } catch {
    return null;
  }
  if (rel.includes("\0")) return null;
  if (rel.endsWith("/")) rel += "index.html";
  const full = resolve(WEB, "." + (rel.startsWith("/") ? rel : "/" + rel));
  return full.startsWith(WEB + sep) ? full : null;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("web.ts")) {
  if (!existsSync(join(ROOT, "spike.z5"))) step("build story file (npm run build:game)", "npm", ["run", "build:game"]);
  step("compile output hook (tsc -p tsconfig.web.json)", "npx", ["tsc", "-p", "tsconfig.web.json"]);
  mkdirSync(join(WEB, "game"), { recursive: true });
  copyFileSync(join(ROOT, "spike.z5"), join(WEB, "game", "spike.z5"));

  const server = createServer((req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { Allow: "GET, HEAD" }).end();
      return;
    }
    const file = resolveStatic(req.url ?? "/");
    const type = file ? TYPES[extname(file)] : undefined;
    if (!file || !type || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found\n");
      return;
    }
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
    res.end(req.method === "HEAD" ? undefined : readFileSync(file));
  });
  server.listen(PORT, "127.0.0.1", () => console.log(`CRYPT web player: http://127.0.0.1:${PORT}/`));
}
