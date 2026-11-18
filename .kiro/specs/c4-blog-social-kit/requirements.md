# Requirements: c4-blog-social-kit

Goal: a blog post and a social kit for the Kiroween 2026 submission (Frankenstein track; bonus categories Blog and Social Blitz). Driven by issue #68 (EPIC C, C4). Touches only `docs/BLOG.md`, `docs/SOCIAL.md` and this spec, so the other C issues can run in parallel. Follows `.kiro/steering/blameless.md` and `failsafe.md`.

## B1 Honesty
1. Every claim SHALL be provable from this repository. Every number SHALL name the file or command that produces it.
2. Anything not verified (for example a live Kiro session firing a hook) SHALL be stated as not verified, as in `docs/KIRO.md` "Limits".
3. Sources SHALL be paraphrased, not quoted at length. Credit: Nadya Bartol (TED@BCG 2021), Pullen (TED), Saltzer & Schroeder (1975).

## B2 Blog (`docs/BLOG.md`)
1. About 1,200 words, written for dev.to or Medium, first person singular, plain language.
2. Story arc: Frankenstein, ownership, shame (blamelessness), control.
3. How Kiro was used: specs first, hooks, steering (and the two custom agents).
4. Census findings: aggregates only, copied from `docs/census/RESULTS.md`, with its limitations. No project is named.
5. What failed and how it was fixed: bridge v1 flaw, fail-safe merge bug, proportional-font bug.

## B3 Social kit (`docs/SOCIAL.md`)
1. Three build-in-public posts. Each has a LinkedIn variant and an X variant.
2. Each variant SHALL start with `#KiroweenHackathon26`. Each X variant SHALL fit 280 characters including the link.
3. Each post SHALL name one image from `docs/img/`.
4. Human voice, short, no hype words.

## B4 Blameless
1. No post or paragraph names a person next to a failure. Failures are attributed to code, never to people.
