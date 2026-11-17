// Text layout for the CRT canvas: wrap transcript lines to the screen width and keep the tail.

/** Wrap one line at `cols` characters, preferring to break at a space. Never returns an empty array. */
export function wrapLine(text: string, cols: number): string[] {
  const width = Math.max(1, Math.floor(cols));
  const out: string[] = [];
  let rest = text.replace(/\u00a0/g, " ").replace(/\t/g, "    ");
  while (rest.length > width) {
    let cut = rest.lastIndexOf(" ", width);
    if (cut <= 0) cut = width;
    out.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).replace(/^ +/, "");
  }
  out.push(rest);
  return out;
}

/** The last `rows` wrapped rows of all lines. Every row is at most `cols` characters. */
export function tailRows(lines: readonly string[], cols: number, rows: number): string[] {
  const keep = Math.max(0, Math.floor(rows));
  const all: string[] = [];
  for (const line of lines) all.push(...wrapLine(line, cols));
  return keep === 0 ? [] : all.slice(-keep);
}
