// One monospace stack for every canvas texture. JetBrains Mono (self-hosted, web/fonts/, OFL-1.1) comes first;
// the system fonts are only a last resort. Canvas text is drawn with whatever is loaded at that moment, so
// callers await ensureFonts() before the first draw and redraw when fonts finish loading.
export const FONT_FAMILY = "JetBrains Mono";
export const MONO = `"${FONT_FAMILY}", ui-monospace, "DejaVu Sans Mono", Menlo, Consolas, monospace`;
/** Advance width of one glyph as a fraction of the font size (JetBrains Mono: 600 of 1000 units). */
export const ADVANCE = 0.6;

/** Resolves once the regular and bold faces are loaded (or have failed: the fallback stack then applies). */
export function ensureFonts() {
  if (typeof document === "undefined" || !document.fonts) return Promise.resolve();
  return Promise.all([
    document.fonts.load(`26px "${FONT_FAMILY}"`),
    document.fonts.load(`bold 26px "${FONT_FAMILY}"`),
  ]).then(() => undefined, () => undefined);
}

/** Calls fn once the fonts are ready, so a texture drawn early can be redrawn. */
export function onFontsReady(fn) {
  if (typeof document === "undefined" || !document.fonts) return;
  ensureFonts().then(fn);
}
