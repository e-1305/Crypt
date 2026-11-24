// The brand head tags (issue #332): icons, manifest, theme colour and the social preview. One source for the pages built in TypeScript;
// the static pages in web/ carry the same tags by hand (tests/brand.test.ts checks every built page).
export const SITE_URL = "https://e-1305.github.io/Crypt/";
/** The tagline of docs/FACTS.md (Brand). */
export const TAGLINE = "Don't abandon your creature.";
export const OG_DESCRIPTION = `${TAGLINE} CRYPT turns your dependency tree into a creature you heal: the few findings that matter, and one fix PR for a person to review.`;

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/'/g, "&#39;");

const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#050805"/><polygon points="22,4 42,4 54,22 42,60 22,60 10,22" fill="#0b180b" stroke="#33ff33" stroke-width="5" stroke-linejoin="round"/><path d="M17 30L47 30M20 23L20 37M26 23L26 37M32 23L32 37M38 23L38 37M44 23L44 37" fill="none" stroke="#33ff33" stroke-width="3.5" stroke-linecap="round"/></svg>`;

/**
 * Head tags for a page. `prefix` is the relative path to the site root ("" or "../").
 * `standalone` is for the autopsy report, a file people open from disk or mail: the icon is inline (its CSP allows data: images only and the
 * report makes no request), the social image is the absolute live URL, and there is no manifest.
 */
export function brandHead(opts: { title: string; prefix?: string; standalone?: boolean }): string {
  const p = opts.prefix ?? "";
  const t = esc(opts.title);
  const tags = opts.standalone
    ? [`<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${encodeURIComponent(FAVICON_SVG)}">`]
    : [
        `<link rel="icon" type="image/svg+xml" href="${p}favicon.svg">`,
        `<link rel="icon" type="image/x-icon" sizes="32x32" href="${p}favicon.ico">`,
        `<link rel="apple-touch-icon" sizes="180x180" href="${p}apple-touch-icon.png">`,
        `<link rel="manifest" href="${p}site.webmanifest">`,
      ];
  tags.push(
    `<meta name="theme-color" content="#050805">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${t}">`,
    `<meta property="og:description" content="${esc(OG_DESCRIPTION)}">`,
    `<meta property="og:image" content="${SITE_URL}og-image.png">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta name="twitter:card" content="summary_large_image">`,
  );
  return tags.join("\n");
}
