// Microsoft Teams message with an Adaptive Card (version 1.4) for the gazette.
import type { Digest } from "./digest.js";

export const TEAMS_BUTTON_TEXT = "Open the War Room";

/** Escapes the characters Teams markdown treats as syntax, and HTML specials. */
export function teamsText(v: string): string {
  return v.replace(/[\\`*_{}\[\]()#+!|<>&~-]/g, (c) => "\\" + c);
}

const lines = (items: string[], empty: string): string => (items.length === 0 ? empty : items.map((i) => `- ${i}`).join("\n"));

export function buildTeamsPayload(d: Digest): Record<string, unknown> {
  const healed = d.healed.map((h) => (h.by ? `${teamsText(h.limb)} healed by ${teamsText("@" + h.by)}` : teamsText(h.limb)));
  const block = (t: string, extra: Record<string, unknown> = {}) => ({ type: "TextBlock", text: t, wrap: true, ...extra });
  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        contentUrl: null,
        content: {
          type: "AdaptiveCard",
          version: "1.4",
          body: [
            block("Gravedigger's Gazette", { size: "Large", weight: "Bolder" }),
            {
              type: "FactSet",
              facts: [
                { title: "Nights without possession", value: String(d.nightsWithoutPossession) },
                { title: "Healed this week", value: String(d.healed.length) },
                { title: "Newly possessed", value: String(d.newPossessed.length) },
                { title: "SLA at risk", value: String(d.slaAtRisk.length) },
              ],
            },
            block("**Healed**", { separator: true }),
            block(lines(healed, "Nothing healed yet. The next raid starts it.")),
            block("**Newly possessed**"),
            block(lines(d.newPossessed.map(teamsText), "None this week.")),
            block("**SLA at risk**"),
            block(lines(d.slaAtRisk.map((l) => teamsText(l.name)), "None. Every window has room.")),
            block(d.repo ? `Crypt report for ${teamsText(d.repo)}` : "Crypt report", { isSubtle: true, size: "Small" }),
          ],
          actions: [{ type: "Action.OpenUrl", title: TEAMS_BUTTON_TEXT, url: d.warRoomUrl }],
        },
      },
    ],
  };
}
