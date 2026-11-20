import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { parseEpss, parseKev } from "../src/exhume/feeds.js";

const KEV_URL = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json";
const EPSS_URL = "https://epss.empiricalsecurity.com/epss_scores-current.csv.gz";
const dir = process.argv[2] ?? "data/feeds";

async function get(url: string): Promise<Buffer> {
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  } catch (e) {
    const timedOut = (e as Error).name === "TimeoutError";
    throw new Error(`${url}: ${timedOut ? "timed out after 30s" : (e as Error).message}`);
  }
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function put(name: string, text: string): void {
  const tmp = `${dir}/${name}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, `${dir}/${name}`);
}

async function main(): Promise<void> {
  const kevText = (await get(KEV_URL)).toString("utf8");
  const epssText = gunzipSync(await get(EPSS_URL)).toString("utf8");
  const kev = parseKev(kevText);
  const epss = parseEpss(epssText);
  if (!kev || !epss) throw new Error("downloaded feed did not validate; files left untouched");
  mkdirSync(dir, { recursive: true });
  put("kev.json", kevText);
  put("epss.csv", epssText);
  console.log(`KEV ${kev.date}: ${kev.cves.size} CVEs`);
  console.log(`EPSS ${epss.date}: ${epss.scores.size} scores`);
}

main().catch((e) => {
  console.error(`feeds:update failed: ${(e as Error).message}`);
  process.exit(1);
});
