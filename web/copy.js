// Copy buttons for the one-line install command. Plain text only: the command is shown on screen, so the
// button is a convenience. If the clipboard is blocked the text is selected so Ctrl+C works, and the status says so.
export function wireCopy(button, source, say) {
  button.addEventListener("click", async () => {
    const text = source.textContent || "";
    try {
      await navigator.clipboard.writeText(text);
      say("Copied: " + text);
    } catch {
      const range = document.createRange();
      range.selectNodeContents(source);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      say("The command is selected. Press Ctrl+C or Command+C to copy it.");
    }
  });
}
