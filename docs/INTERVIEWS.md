# User interviews

Status: **0 of 5 done.** This file holds the guide and an empty template. Findings count only after a real conversation; no quote is ever written here that a person did not say. No employer names or data: people are described by role only, with their consent.

## Who counts (screener)

- Owns or fixes dependency vulnerabilities at work (AppSec, vulnerability management, SOC, platform/DevOps, engineering manager), **or** maintains an npm/pip project with users.
- Has looked at a scanner report (Dependabot, Snyk, Socket, Trivy, other) in the last month.
- Target mix for 5: 2 security (AppSec/VOC/SOC), 2 engineering (EM/dev/DevOps), 1 open-source maintainer.

## Guide (15 minutes)

1. **Context (2 min).** Role, team size, which scanner, how many open dependency alerts roughly.
2. **Last time (4 min).** "Tell me about the last dependency alert you actually fixed. What happened from alert to merge?" Probe: who decided it mattered, who owned it, how long it took.
3. **Workaround and cost (3 min).** "What do you do with the ones nobody owns?" "How much time a week goes to triage?" (Their estimate, labelled as such.)
4. **Show (3 min).** Open the live site, paste one of their public repos or the demo repo. Say nothing; note the first question they ask.
5. **Switch (3 min).** "What would have to be true for you to run this in CI next week?" "What would stop you?" "Would anyone pay for the org view?"

Do not pitch. Do not ask "would you use this?" without a concrete next step.

## Findings template (one block per interview)

```
### Interview N · YYYY-MM-DD · role: ___ · scanner: ___
Last real alert story (their words, short):
Who owns alerts today:
Time on triage per week (their estimate):
First question when shown CRYPT:
Would run in CI next week? yes / no / maybe, because:
Biggest objection:
Next step agreed (none / try init / intro to someone):
```

## Summary (fill after 5)

| Theme | Interviews that raised it | What we change |
|---|---|---|
| | | |
