// npm run brand: writes assets/brand/* (the CRYPT logo and its derived files). Original artwork, no third-party image or font.
// The logo is one geometry (a coffin with a stitch across it) used for the SVGs and rasterised here with zlib only,
// so there is no image library in the dependencies. The output is deterministic; the files are committed.
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { deflateSync } from "node:zlib";

const OUT = join(resolve(import.meta.dirname, ".."), "assets", "brand");
const FG = "#33ff33";
const BG = "#050805";
const FILL = "#0b180b";
const DIM = "#22b022";
const SITE = "https://e-1305.github.io/Crypt/";
const TAGLINE = "Don't abandon your creature.";

// Logo geometry in a 64x64 box.
const COFFIN: [number, number][] = [[22, 4], [42, 4], [54, 22], [42, 60], [22, 60], [10, 22]];
const OUTLINE = 5;
const STITCH: [number, number, number, number][] = [[17, 30, 47, 30], ...[20, 26, 32, 38, 44].map((x): [number, number, number, number] => [x, 23, x, 37])];
const STITCH_W = 3.5;

const pts = COFFIN.map(([x, y]) => `${x},${y}`).join(" ");
const stitchPath = STITCH.map(([a, b, c, d]) => `M${a} ${b}L${c} ${d}`).join("");
const logoShapes =
  `<polygon points="${pts}" fill="${FILL}" stroke="${FG}" stroke-width="${OUTLINE}" stroke-linejoin="round"/>` +
  `<path d="${stitchPath}" fill="none" stroke="${FG}" stroke-width="${STITCH_W}" stroke-linecap="round"/>`;

const svgs: Record<string, string> = {
  "logo.svg": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="256" height="256" role="img" aria-label="CRYPT logo: a stitched coffin"><rect width="64" height="64" fill="${BG}"/>${logoShapes}</svg>\n`,
  "favicon.svg": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="${BG}"/>${logoShapes}</svg>\n`,
  "logo-wordmark.svg":
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 64" width="560" height="128" role="img" aria-label="CRYPT"><rect width="280" height="64" fill="${BG}"/>${logoShapes}` +
    `<text x="76" y="45" fill="${FG}" font-family="'JetBrains Mono', ui-monospace, monospace" font-size="40" font-weight="700" letter-spacing="4">CRYPT</text></svg>\n`,
};

const manifest = {
  name: "CRYPT",
  short_name: "CRYPT",
  description: TAGLINE,
  start_url: "./",
  display: "standalone",
  background_color: BG,
  theme_color: BG,
  icons: [
    { src: "favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    { src: "apple-touch-icon.png", sizes: "180x180", type: "image/png" },
  ],
};

type Rgb = [number, number, number];
const hex = (h: string): Rgb => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;

function distSeg(px: number, py: number, [ax, ay, bx, by]: [number, number, number, number]): number {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function inside(px: number, py: number): boolean {
  let c = false;
  for (let i = 0, j = COFFIN.length - 1; i < COFFIN.length; j = i++) {
    const [xi, yi] = COFFIN[i], [xj, yj] = COFFIN[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
/** The logo colour at a point of the 64x64 box, or null outside it. */
function logoAt(x: number, y: number): Rgb | null {
  for (const s of STITCH) if (distSeg(x, y, s) <= STITCH_W / 2) return hex(FG);
  for (let i = 0; i < COFFIN.length; i++) {
    const [a, b] = [COFFIN[i], COFFIN[(i + 1) % COFFIN.length]];
    if (distSeg(x, y, [a[0], a[1], b[0], b[1]]) <= OUTLINE / 2) return hex(FG);
  }
  return inside(x, y) ? hex(FILL) : null;
}

// A 5x7 pixel font, only the characters the social image uses.
const FONT: Record<string, string[]> = {
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  o: [".....", ".....", ".###.", "#...#", "#...#", "#...#", ".###."],
  n: [".....", ".....", "####.", "#...#", "#...#", "#...#", "#...#"],
  "'": ["..#..", "..#..", "..#..", ".....", ".....", ".....", "....."],
  t: [".#...", ".#...", "####.", ".#...", ".#...", ".#..#", "..##."],
  a: [".....", ".....", ".###.", "....#", ".####", "#...#", ".####"],
  b: ["#....", "#....", "####.", "#...#", "#...#", "#...#", "####."],
  d: ["....#", "....#", ".####", "#...#", "#...#", "#...#", ".####"],
  y: [".....", ".....", "#...#", "#...#", ".####", "....#", ".###."],
  u: [".....", ".....", "#...#", "#...#", "#...#", "#...#", ".####"],
  r: [".....", ".....", "#.##.", "##..#", "#....", "#....", "#...."],
  c: [".....", ".....", ".###.", "#....", "#....", "#...#", ".###."],
  e: [".....", ".....", ".###.", "#...#", "#####", "#....", ".###."],
  ".": [".....", ".....", ".....", ".....", ".....", ".....", "..#.."],
  h: ["#....", "#....", "####.", "#...#", "#...#", "#...#", "#...#"],
  p: [".....", ".....", "####.", "#...#", "####.", "#....", "#...."],
  s: [".....", ".....", ".####", "#....", ".###.", "....#", "####."],
  g: [".....", ".####", "#...#", "#...#", ".####", "....#", ".###."],
  i: ["..#..", ".....", ".##..", "..#..", "..#..", "..#..", ".###."],
  ":": [".....", "..#..", "..#..", ".....", "..#..", "..#..", "....."],
  "/": ["....#", "....#", "...#.", "..#..", ".#...", "#....", "#...."],
  "-": [".....", ".....", ".....", ".###.", ".....", ".....", "....."],
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "3": [".###.", "#...#", "....#", "..##.", "....#", "#...#", ".###."],
  "0": [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
  "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  C: [".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
};

/** Text as a lookup from pixel to on/off: x, y is the top left, scale the size of one font pixel. */
function textMask(text: string, x0: number, y0: number, scale: number): (x: number, y: number) => boolean {
  return (x, y) => {
    const ry = Math.floor((y - y0) / scale);
    if (ry < 0 || ry > 6 || x < x0) return false;
    const col = Math.floor((x - x0) / scale);
    const ch = text[Math.floor(col / 6)];
    if (ch === undefined) return false;
    const rows = FONT[ch];
    if (!rows) throw new Error(`brand: no glyph for ${JSON.stringify(ch)}`);
    const cx = col % 6;
    return cx < 5 && rows[ry][cx] === "#";
  };
}

type Sampler = (x: number, y: number) => Rgb;

function raster(w: number, h: number, ss: number, sampler: Sampler): Buffer {
  const px = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0;
      for (let j = 0; j < ss; j++) {
        for (let i = 0; i < ss; i++) {
          const c = sampler(x + (i + 0.5) / ss, y + (j + 0.5) / ss);
          r += c[0]; g += c[1]; b += c[2];
        }
      }
      const n = ss * ss, o = (y * w + x) * 4;
      px[o] = Math.round(r / n); px[o + 1] = Math.round(g / n); px[o + 2] = Math.round(b / n); px[o + 3] = 255;
    }
  }
  return px;
}

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}
function png(w: number, h: number, rgba: Buffer): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}
/** An ICO holding one PNG image. */
function ico(w: number, h: number, pngBytes: Buffer): Buffer {
  const head = Buffer.alloc(22);
  head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4);
  head[6] = w; head[7] = h; head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12);
  head.writeUInt32LE(pngBytes.length, 14); head.writeUInt32LE(22, 18);
  return Buffer.concat([head, pngBytes]);
}

/** The logo in a square icon: the box at `size` px, a rounded corner of `radius` (0 for full bleed, the OS rounds it). */
function iconSampler(size: number, pad: number, radius: number): Sampler {
  const s = (size - 2 * pad) / 64;
  return (x, y) => {
    if (radius > 0) {
      const cx = Math.min(x, size - x), cy = Math.min(y, size - y);
      if (cx < radius && cy < radius && Math.hypot(radius - cx, radius - cy) > radius) return [0, 0, 0];
    }
    return logoAt((x - pad) / s, (y - pad) / s) ?? hex(BG);
  };
}

function ogSampler(): Sampler {
  const W = 1200, H = 630;
  const word = textMask("CRYPT", 450, 120, 20);
  const tag = textMask(TAGLINE, 90, 400, 6);
  const url = textMask(SITE, 90, 510, 4);
  const logo = 280 / 64;
  return (x, y) => {
    if (word(x, y)) return hex(FG);
    if (tag(x, y)) return hex(FG);
    if (url(x, y)) return hex(DIM);
    const l = logoAt((x - 90) / logo, (y - 70) / logo);
    if (l) return l;
    // A thin frame, then a flat background.
    if (x < 8 || y < 8 || x > W - 8 || y > H - 8) return hex(DIM);
    return hex(BG);
  };
}

mkdirSync(OUT, { recursive: true });
for (const [name, text] of Object.entries(svgs)) writeFileSync(join(OUT, name), text);
writeFileSync(join(OUT, "site.webmanifest"), JSON.stringify(manifest, null, 2) + "\n");
const ico32 = png(32, 32, raster(32, 32, 8, iconSampler(32, 1, 6)));
writeFileSync(join(OUT, "favicon.ico"), ico(32, 32, ico32));
writeFileSync(join(OUT, "apple-touch-icon.png"), png(180, 180, raster(180, 180, 4, iconSampler(180, 22, 0))));
writeFileSync(join(OUT, "og-image.png"), png(1200, 630, raster(1200, 630, 3, ogSampler())));
console.log(`brand: wrote ${OUT}`);
