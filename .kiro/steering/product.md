---
inclusion: always
---
# CRYPT — Product

CRYPT turns a repository's dependency tree into a Frankenstein creature: one limb per dependency.
Vulnerable limbs rot (CVE). Possessed limbs are actively exploited (CISA KEV).
Users heal limbs by playing a real Z-machine (1979 Infocom VM) text adventure.
Game commands trigger agents that open fix PRs. A limb heals only when CI is green and a human merges.

Pillars:
1. Ownership: every rotting limb gets a named owner (CODEOWNERS).
2. Blamelessness: never ask who broke it, only who will heal it.
3. Control: agents can never make things worse.

Hackathon: Kiroween 2026, Frankenstein track. Deadline Dec 4, 2026.
Primary user: a dev team doing a 15-minute weekly vulnerability raid.

Tier 1 scope (build first): OSV scan → deterministic KEV/EPSS ranking → creature with 3 states (Healthy, Rotting, Possessed) → Inform 6 → .z5 → web player → commands EXAMINE, ASSIGN, GRAFT, SEAL CRYPT → PR → CI → human merge → recompile.
Do not build Tier 2/3 features unless explicitly asked.

## Feature freeze — Nov 25, 2026
From Nov 25 only reliability, accessibility, copy and demo-path fixes are accepted. No new features.
Priority until then: the judge's first 60 seconds (judge mode, "paste your repo" plate, decluttered landing) and proof (hook evidence, upstream candidates, write-up).
One story for every surface: "Don't abandon your creature." The three pillars support it; they are not three headlines.
