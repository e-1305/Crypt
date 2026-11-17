// One sanitizer for every dynamic string that reaches generated Inform source or game text (R6).
// Output is printable ASCII only, free of Inform specials and brackets, and at most MAX_TEXT long,
// so no data string can end or start a line, escape a literal, or form a "[[CRYPT" marker.

export const MAX_TEXT = 80;

export function sanitize(input: unknown): string {
  const s = typeof input === "string" ? input : "";
  let out = "";
  // Iterate by code point so a surrogate pair becomes one replacement.
  for (const ch of s) {
    const c = ch.codePointAt(0) as number;
    if (c < 32 || c === 127 || (c >= 128 && c <= 159) || c === 0x2028 || c === 0x2029) continue; // control chars
    if (ch === "[") out += "(";
    else if (ch === "]") out += ")";
    else if (ch === '"') out += "'";
    else if (ch === "~") out += "-";
    else if (ch === "^") out += " ";
    else if (ch === "\\") out += "/";
    else if (ch === "@") out += "(at)";
    else if (c > 126) out += "?";
    else out += ch;
  }
  out = out.trim();
  if (out.length > MAX_TEXT) out = out.slice(0, MAX_TEXT - 3).trimEnd() + "...";
  return out;
}
