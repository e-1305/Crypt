import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildSite } from "../scripts/build-site.js";
import { inform6Path } from "../scripts/toolchain-dir.js";
import { OG_DESCRIPTION, TAGLINE } from "../src/report/brand.js";

// Issue #332: logo, favicon and social preview on every built page.

const BRAND = "assets/brand";
const pngSize = (f: string): [number, number] => {
  const b = readFileSync(f);
  expect(b.subarray(1, 4).toString("ascii"), f).toBe("PNG");
  expect(b.subarray(12, 16).toString("ascii"), f).toBe("IHDR");
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};

describe("brand files", () => {
  it("have the right sizes", () => {
    expect(pngSize(`${BRAND}/og-image.png`)).toEqual([1200, 630]);
    expect(pngSize(`${BRAND}/apple-touch-icon.png`)).toEqual([180, 180]);
    const ico = readFileSync(`${BRAND}/favicon.ico`);
    expect([ico.readUInt16LE(2), ico.readUInt16LE(4), ico[6], ico[7]]).toEqual([1, 1, 32, 32]);
    expect(ico.subarray(22, 26).toString("latin1")).toContain("PNG");
  });
  it("has SVG logos in phosphor green and a manifest", () => {
    for (const f of ["logo.svg", "logo-wordmark.svg", "favicon.svg"]) expect(readFileSync(`${BRAND}/${f}`, "utf8")).toContain("#33ff33");
    expect(readFileSync(`${BRAND}/logo-wordmark.svg`, "utf8")).toContain(">CRYPT<");
    const m = JSON.parse(readFileSync(`${BRAND}/site.webmanifest`, "utf8"));
    expect(m.name).toBe("CRYPT");
    expect(m.short_name).toBe("CRYPT");
    expect(m.theme_color).toBe("#050805");
    expect(m.icons.length).toBeGreaterThan(0);
  });
  it("uses the tagline of docs/FACTS.md and lists the files in ATTRIBUTION", () => {
    expect(readFileSync("docs/FACTS.md", "utf8")).toContain(OG_DESCRIPTION);
    expect(TAGLINE).toBe("Don't abandon your creature.");
    expect(readFileSync("docs/ATTRIBUTION.md", "utf8")).toContain("assets/brand/*");
  });
});

const head = (html: string) => html.slice(0, html.indexOf("</head>"));
function checkPage(html: string, where: string, exists: (href: string) => boolean, opts: { standalone?: boolean } = {}) {
  const h = head(html);
  expect(h, where).toMatch(/<link rel="icon" type="image\/svg\+xml" href="([^"]+)">/);
  expect(h, where).toContain('<meta name="theme-color" content="#050805">');
  expect(h, where).toContain('<meta property="og:title" content="');
  expect(h, where).toContain(`<meta property="og:description" content="${OG_DESCRIPTION.replace(/'/g, "&#39;")}">`);
  expect(h, where).toContain('<meta property="og:image" content="https://e-1305.github.io/Crypt/og-image.png">');
  expect(h, where).toContain('<meta name="twitter:card" content="summary_large_image">');
  const links = [...h.matchAll(/<link rel="(?:icon|apple-touch-icon|manifest)"[^>]*href="([^"]+)"/g)].map((m) => m[1]);
  if (!opts.standalone) {
    expect(h, where).toMatch(/<link rel="icon" type="image\/x-icon" sizes="32x32" href="[^"]*favicon\.ico">/);
    expect(h, where).toMatch(/<link rel="apple-touch-icon" sizes="180x180" href="[^"]*apple-touch-icon\.png">/);
    expect(h, where).toMatch(/<link rel="manifest" href="[^"]*site\.webmanifest">/);
    expect(h, where).toContain("manifest-src 'self'");
  }
  for (const href of links) if (!href.startsWith("data:")) expect(exists(href), `${where}: ${href}`).toBe(true);
}

describe("source pages", () => {
  it.each([
    ["web/index.html", ""],
    ["web/for-teams.html", ""],
    ["web/war-room/war-room.html", ""],
    ["web/graveyard/graveyard.html", "../"],
  ])("%s links the brand files", (file, prefix) => {
    const html = readFileSync(file, "utf8");
    checkPage(html, file, (href) => existsSync(join(BRAND, href.slice(prefix.length))));
    expect(html).toContain(`href="${prefix}favicon.svg"`);
  });
});

const haveToolchain = existsSync(inform6Path());
describe.skipIf(!haveToolchain)("built site", () => {
  it("links the brand files from every built HTML page and ships them", async () => {
    const d = mkdtempSync(join(tmpdir(), "crypt-brand-test-"));
    await buildSite(d);
    for (const f of readdirSync(BRAND)) expect(existsSync(join(d, f)), f).toBe(true);
    expect(pngSize(join(d, "og-image.png"))).toEqual([1200, 630]);
    const pages: [string, boolean][] = [
      ["index.html", false], ["for-teams.html", false], ["war-room.html", false], ["manual.html", false],
      ["autopsy.html", true], ["graveyard/graveyard.html", false], ["graveyard/index.html", false],
    ];
    for (const [page, standalone] of pages) {
      expect(existsSync(join(d, page)), page).toBe(true);
      checkPage(readFileSync(join(d, page), "utf8"), page, (href) => existsSync(join(d, page, "..", href)), { standalone });
    }
  }, 300_000);
});
