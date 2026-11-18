// Slack Block Kit payload for the gazette. Package names are put in code spans with entities escaped.
import type { Digest } from "./digest.js";

export const BUTTON_TEXT = "Open the War Room";

/** A value that is safe inside a mrkdwn code span: entities escaped, backticks removed. */
export function slackCode(v: string): string {
  return "`" + v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/`/g, "") + "`";
}

const list = (items: string[], empty: string): string => (items.length === 0 ? empty : items.map((i) => `• ${i}`).join("\n"));

export function buildSlackPayload(d: Digest): Record<string, unknown> {
  const healed = d.healed.map((h) => (h.by ? `${slackCode(h.limb)} healed by ${slackCode("@" + h.by)}` : slackCode(h.limb)));
  const nights = d.nightsWithoutPossession;
  return {
    text: "Gravedigger's Gazette",
    blocks: [
      { type: "header", text: { type: "plain_text", text: "Gravedigger's Gazette", emoji: false } },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Nights without possession*\n${nights}` },
          { type: "mrkdwn", text: `*Healed this week*\n${d.healed.length}` },
          { type: "mrkdwn", text: `*Newly possessed*\n${d.newPossessed.length}` },
          { type: "mrkdwn", text: `*SLA at risk*\n${d.slaAtRisk.length}` },
        ],
      },
      { type: "section", text: { type: "mrkdwn", text: `*Healed*\n${list(healed, "Nothing healed yet. The next raid starts it.")}` } },
      { type: "section", text: { type: "mrkdwn", text: `*Newly possessed*\n${list(d.newPossessed.map(slackCode), "None this week.")}` } },
      { type: "section", text: { type: "mrkdwn", text: `*SLA at risk*\n${list(d.slaAtRisk.map((l) => slackCode(l.name)), "None. Every window has room.")}` } },
      { type: "context", elements: [{ type: "mrkdwn", text: d.repo ? `Crypt report for ${slackCode(d.repo)}` : "Crypt report" }] },
      { type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: BUTTON_TEXT, emoji: false }, url: d.warRoomUrl }] },
    ],
  };
}
