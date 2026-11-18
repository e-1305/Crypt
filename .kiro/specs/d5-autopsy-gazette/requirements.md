# Requirements: d5-autopsy-gazette

Goal: a security team shows leadership what the raids achieved (issue #104, Epic D). `crypt autopsy` writes a one-page CISO report. `crypt gazette` writes a weekly digest for Slack and Teams. Follows `.kiro/steering/failsafe.md`, `blameless.md`, `sla-policy.md` and `product.md`. Both commands are read-only: they read `out/creature.json` and `out/state.json` and write one file or print one payload. They call no network and no GitHub endpoint.

Scope: `src/report/` (autopsy model, HTML), `src/gazette/` (gazette model, Slack and Teams payloads), `scripts/cli/`, templates, tests, `docs/img/autopsy.png`, the command registration in `src/cli/parse.ts` and `src/cli/help.ts`, page coverage in `scripts/ci/visual-qa.mjs`.

## Data sources and assumptions
1. `out/creature.json`: `counts`, `team.scanStart` (ms), `limbs[]` with `id`, `name`, `owner` (`unowned` when CODEOWNERS names none), `state`, `spawned`, `kev`, `epss`, `healed`, `healedBy`. Optional per limb: `foundAt`, `wasKev`.
2. `out/state.json`: `limbs{ID: {state, pr, updatedAt, healedBy?}}`. Optional per entry: `mergedAt`, `kev`. Optional top-level `history`: `[{at, possessed, rotting, healthy, spawned, healed}]`, one entry per raid. `serializeState` drops unknown keys, so `history` is read from the raw JSON and these commands never write it.
3. When `foundAt` is absent, the finding time is `team.scanStart`. When `mergedAt` is absent, the fix time is the state entry `updatedAt`.

## A1 Autopsy report (`crypt autopsy`)
1. The command SHALL write `out/autopsy.html` (or `--out <path>`): one self-contained printable page (inline CSS, no script, no external request). Print CSS gives A4 on one page and a white-safe palette. A hint "Print or save as PDF from your browser" is shown on screen and hidden in print.
2. The report SHALL carry the three NIST SP 800-55 measure types, each with a "How computed" footnote:
   - Implementation: share of finding limbs (not Healthy, or healed) that have a CODEOWNERS owner.
   - Efficiency: median hours from finding to fix over healed limbs, `n/a` when none.
   - Impact: sum of EPSS of healed limbs that were KEV or EPSS >= 0.1, labelled "exploitable risk removed".
3. SLA compliance SHALL follow `sla-policy.md`: Possessed 48 h, EPSS >= 0.1 the 14-day sprint, windows counted from `scanStart`. The share is healed inside the window plus still open inside it. Breached and at-risk (75% of the window used) limbs are listed by limb id and package name only.
4. Trend SHALL show the last N raids (default 8, `--last N`) as an inline SVG sparkline with a text alternative. With fewer than 2 raids it says "Not enough raids yet".
5. Noise exorcised SHALL be `counts.exorcised / counts.findings` as a percentage.
6. `--sample` writes a deterministic sample report, used by tests and visual QA.
7. A missing `out/creature.json` SHALL stop with "Run crypt raid <target> first", a non-zero exit, and write nothing.

## A2 Honesty and safety
1. Failure text SHALL name limbs (packages) only. A person appears only as `healedBy` in the praise section. Owners are counted, never printed. No git history is read.
2. Junk or missing input SHALL give a model with `n/a` values. The model builder never throws.
3. All values are HTML-escaped. The copy states actions to take, no prohibitions.
4. Accessible markup: landmarks, a text alternative for the chart, text contrast of at least 4.5.

## A3 Gazette (see FEAT-002 and FEAT-003)
`crypt gazette` builds a weekly digest from the same sources and prints Slack Block Kit or Teams Adaptive Card JSON. It posts only when a webhook is given, never reads secrets into logs, and reuses the autopsy model.

## A4 Acceptance
`npx vitest run tests/autopsy.test.ts` passes. `crypt autopsy --sample --out /tmp/a.html` writes a page with Implementation, Efficiency, Impact, SLA compliance, trend and noise exorcised, each with a footnote. `docs/img/autopsy.png` is a screenshot of the sample.
