// A small markdown renderer for docs/USER_MANUAL.md, so the manual can be published on the site with no new dependency.
// It handles only what the manual uses: headings (levels 1 to 4), paragraphs, bullet and numbered lists, tables, fenced code, inline
// code, bold and links. All text is escaped. The output is one static page: no script, relative URLs for site files.
import { posix } from "node:path";

export interface ManualOptions {
  /** Repo-relative path of the markdown file, used to resolve its relative links. */
  sourcePath: string;
  /** Base for links to repo files that are not part of the site. */
  repoBlobBase: string;
  /** True when the repo-relative path exists in the repository. */
  repoHas: (path: string) => boolean;
  /** True when the site-relative path exists in the built site. */
  siteHas: (path: string) => boolean;
  /** Absolute URL prefix of the live site, rewritten to a relative link. */
  siteBase: string;
}

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9 -]/g, "").trim().replace(/ +/g, "-");
}

/** Maps a link in the markdown to the href used on the page. Throws when a relative link goes nowhere. */
export function rewriteLink(href: string, o: ManualOptions, ids: ReadonlySet<string> | null): string {
  if (href.startsWith("#")) {
    if (ids && !ids.has(href.slice(1))) throw new Error(`manual: link to missing heading ${href}`);
    return href;
  }
  if (href.startsWith(o.siteBase)) return "./" + href.slice(o.siteBase.length);
  if (href.startsWith("https:")) return href;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//")) throw new Error(`manual: unsupported link ${href}`);
  const [pathPart = "", frag] = href.split("#") as [string, string?];
  const repoPath = posix.normalize(posix.join(posix.dirname(o.sourcePath), pathPart));
  const suffix = frag ? `#${frag}` : "";
  if (!repoPath.startsWith("..") && o.repoHas(repoPath)) return `${o.repoBlobBase}${repoPath}${suffix}`;
  const sitePath = posix.normalize(pathPart);
  if (!sitePath.startsWith("..") && o.siteHas(sitePath)) return href;
  throw new Error(`manual: relative link ${href} is neither a repo file nor a site file`);
}

const INLINE = /`([^`]+)`|\[((?:[^\]`]|`[^`]*`)+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|(?<![\w*])\*([^*\s](?:[^*]*[^*\s])?)\*(?![\w*])|(?<![\w])_([^_\s](?:[^_]*[^_\s])?)_(?![\w])/g;

function inline(text: string, o: ManualOptions, ids: ReadonlySet<string> | null): string {
  let out = "";
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    out += esc(text.slice(last, m.index));
    last = m.index + m[0].length;
    if (m[1] !== undefined) out += `<code>${esc(m[1])}</code>`;
    else if (m[2] !== undefined && m[3] !== undefined) out += `<a href="${esc(rewriteLink(m[3], o, ids))}">${inline(m[2], o, ids)}</a>`;
    else if (m[4] !== undefined) out += `<strong>${inline(m[4], o, ids)}</strong>`;
    else out += `<em>${inline(m[5] ?? m[6] ?? "", o, ids)}</em>`;
  }
  return out + esc(text.slice(last));
}

const cells = (line: string): string[] => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

interface Heading { level: number; text: string; id: string }

function headingsOf(lines: string[]): Heading[] {
  const out: Heading[] = [];
  let fence = false;
  for (const l of lines) {
    if (l.startsWith("```")) fence = !fence;
    const m = !fence && /^(#{1,4}) (.+)$/.exec(l);
    if (m) {
      const text = m[2]!.replace(/`/g, "");
      out.push({ level: m[1]!.length, text, id: slugify(text) });
    }
  }
  const seen = new Set<string>();
  for (const h of out) {
    if (seen.has(h.id)) throw new Error(`manual: duplicate heading id ${h.id}`);
    seen.add(h.id);
  }
  return out;
}

/** The body of the page: the converted markdown, without the page wrapper. */
export function renderBody(md: string, o: ManualOptions): { html: string; title: string; toc: Heading[] } {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const heads = headingsOf(lines);
  const ids = new Set(heads.map((h) => h.id));
  const html: string[] = [];
  let i = 0;
  let current = "";
  const para: string[] = [];
  const flush = (): void => {
    if (para.length) html.push(`<p>${inline(para.join(" "), o, ids)}</p>`);
    para.length = 0;
  };
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.startsWith("```")) {
      flush();
      const body: string[] = [];
      for (i++; i < lines.length && !lines[i]!.startsWith("```"); i++) body.push(lines[i]!);
      i++;
      html.push(`<pre tabindex="0"><code>${esc(body.join("\n"))}</code></pre>`);
      continue;
    }
    const h = /^(#{1,4}) (.+)$/.exec(line);
    if (h) {
      flush();
      const level = h[1]!.length;
      const text = h[2]!.replace(/`/g, "");
      if (level > 1) current = text;
      html.push(`<h${level} id="${slugify(text)}">${inline(h[2]!, o, ids)}</h${level}>`);
      i++;
      continue;
    }
    if (line.startsWith("|") && /^\|[\s:|-]+\|$/.test(lines[i + 1] ?? "")) {
      flush();
      const head = cells(line);
      const rows: string[][] = [];
      for (i += 2; i < lines.length && lines[i]!.startsWith("|"); i++) rows.push(cells(lines[i]!));
      const th = head.map((c) => `<th scope="col">${inline(c, o, ids)}</th>`).join("");
      const tr = rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c, o, ids)}</td>`).join("")}</tr>`).join("");
      html.push(
        `<div class="table-wrap" role="region" aria-label="Table: ${esc(current)}" tabindex="0"><table><caption class="sr-only">${esc(current)}</caption>` +
          `<thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`,
      );
      continue;
    }
    const li = /^(- |\d+\. )(.*)$/.exec(line);
    if (li) {
      flush();
      const tag = li[1] === "- " ? "ul" : "ol";
      const items: string[] = [];
      while (i < lines.length) {
        const m = /^(?:- |\d+\. )(.*)$/.exec(lines[i]!);
        if (!m) break;
        const parts = [m[1]!];
        for (i++; i < lines.length && /^ +\S/.test(lines[i]!); i++) {
          if (/^ +(?:[-*+] |\d+\. )/.test(lines[i]!)) throw new Error(`manual: nested lists are not supported: ${lines[i]!.trim()}`);
          parts.push(lines[i]!.trim());
        }
        items.push(`<li>${inline(parts.join(" "), o, ids)}</li>`);
      }
      html.push(`<${tag}>${items.join("")}</${tag}>`);
      continue;
    }
    if (/^\s*>/.test(line) || /!\[[^\]]*\]\(/.test(line)) throw new Error(`manual: unsupported syntax (block quote or image): ${line}`);
    if (line.trim() === "") flush();
    else para.push(line.trim());
    i++;
  }
  flush();
  return { html: html.join("\n"), title: heads.find((x) => x.level === 1)?.text ?? "Manual", toc: heads.filter((x) => x.level === 2) };
}

/** A full static page for the manual. */
export function renderManual(md: string, o: ManualOptions): string {
  const { html, title, toc } = renderBody(md, o);
  const parts = html.split("\n");
  const head = parts.slice(0, 2); // the title and the intro paragraph
  const rest = parts.slice(2);
  const nav = toc.map((h) => `<li><a href="#${h.id}">${esc(h.text)}</a></li>`).join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="How to play CRYPT, with a quick start for people new to the demo.">
<title>${esc(title)} | CRYPT</title>
<link rel="stylesheet" href="manual.css">
</head>
<body>
<a class="skip" href="#main">Skip to the manual</a>
<header class="top">
  <a class="back" href="./">Back to the game</a>
</header>
<main id="main">
${head.join("\n")}
<nav aria-label="Contents" class="toc"><ul>${nav}</ul></nav>
${rest.join("\n")}
<p><a class="back" href="./">Back to the game</a></p>
</main>
</body>
</html>
`;
}
