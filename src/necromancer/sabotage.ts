// Demo-only change: appends one clearly labelled failing test so the required check goes red on purpose.

export const SABOTAGE_PATH = "test/smoke.test.js";
export const SABOTAGE_TITLE_PREFIX = "[DEMO SABOTAGE] ";
export const SABOTAGE_BODY_LINE =
  "DEMO SABOTAGE: this PR is deliberately broken (crypt graft --sabotage --i-know-this-is-a-demo). CI must go red.";

const BLOCK = [
  "// CRYPT DEMO SABOTAGE: deliberately broken, the Inquisitor must reject this PR",
  "test('crypt demo sabotage', () => {",
  "  assert.fail('deliberate failure for the CRYPT demo');",
  "});",
  "",
].join("\n");

export function sabotageSmokeTest(baseText: string): string {
  const sep = baseText === "" || baseText.endsWith("\n") ? "" : "\n";
  return `${baseText}${sep}\n${BLOCK}`;
}
