# Requirements: d3-creature-card

Goal: after "paste your repo" or a raid, one click produces a 1200 by 627 PNG card (LinkedIn and X size) that people can share. It is the viral loop of Epic D (Season 2, audience: CISO, VOC and SOC teams). Driven by issue #102. Follows `.kiro/steering/failsafe.md`, `blameless.md`, `paste-flow.md`, `sla-policy.md` and `tech.md`.

Terms. **Card**: the 1200 by 627 image. **Variant**: `creature` (after paste your repo) or `raid` (after a raid ends). **Layout**: the pure list of draw operations for a card. **Finding**: a limb that is Possessed, Rotting or Healed. **Monster**: a finding that spawns a limb on the plate.

## C1 Content
1. The creature card SHALL show the anatomical plate of the creature, its generated name, `N findings -> M monsters`, the possessed and rotting counts, the healed limbs this week, the line "Don't abandon your creature" with the CRYPT name, and the site URL.
2. The raid card SHALL show the same plate, name, logo line and URL, plus the team score (risk removed), limbs healed and the raid time.
3. The text in the card SHALL be printable ASCII (the arrow is written ->, the self-hosted font subset has no arrow glyph).

## C2 Blameless
1. No person, commit author, CODEOWNERS owner or "healed by" login SHALL appear in the layout, the share text or the alt text.
2. The repo name SHALL appear only when `includeRepo` is true. The toggle SHALL default to ON for a public repo read through paste your repo and OFF otherwise (raid). The user can change it before every download.

## C3 Client side
1. The card SHALL be painted on a canvas in the browser with the self-hosted JetBrains Mono. Nothing is uploaded and nothing is tracked.
2. The layout SHALL be deterministic: the same creature, variant and options give the same operations (snapshot test). `src/render/card.ts` has no DOM, clock, random or network.

## C4 Actions
1. The panel SHALL offer Download PNG, Copy image (ClipboardItem) and Share on LinkedIn, on the paste result and on the raid end screen.
2. Share on LinkedIn SHALL open `https://www.linkedin.com/sharing/share-offsite/?url=<site>` in a new window with `noopener`. LinkedIn ignores a text parameter, so the short honest text with `#KiroweenHackathon26` is also copied to the clipboard and shown on the page.
3. IF an action fails (no clipboard, popup blocked) THEN the panel SHALL say so in text and the other actions keep working. Failsafe: a card is never drawn from an unreadable creature.

## C5 Quality gate
1. The page SHALL keep passing visual QA at all viewports with the card controls present, with no control overlaps and 44 px tap targets on mobile.
2. `docs/img/card-creature.png` and `docs/img/card-raid.png` SHALL be real 1200 by 627 renders.
