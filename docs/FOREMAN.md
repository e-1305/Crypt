# Foreman: the Kiro manager agent

The foreman (`.kiro/agents/foreman.json`) is a Kiro agent that runs on a schedule in Kiro Web, keeps the work moving and watches the outside world. It reports to the CTO (Claude) in issue **#180**. Claude reads only its latest report, decides merges and files new work. The foreman never merges, never closes a PR and never pushes to `main`.

## Schedule

Kiro Web → Schedule → New automation, repository `e-1305/Crypt`, every 6 hours (09:00, 15:00, 21:00, 03:00 Paris), prompt:

> Act as the foreman agent defined in `.kiro/agents/foreman.json`. Follow docs/FOREMAN.md exactly and post your report on issue #180.

## Duties

1. **Health**: CI on `main`; open PRs and their first failing line; `kiro` issues with no PR after 75 minutes.
2. **Unblock**: push small fixes to a failing PR's branch. Larger problems go into the report as a recommendation.
3. **Watch (veille)**: real traction (`npm run traction`), new CISA KEV or EPSS changes on `e-1305/crypt-demo`, any change to the Kiroween 2026 rules, deadline, criteria or prizes, and a competitor change only if it affects [ROADMAP.md](ROADMAP.md). Every number has a source.
4. **Roadmap**: status of P1 to P6 and S1 to S5.
5. **Report**: one comment on #180 in the format below.

## Report format (exact)

```
FOREMAN REPORT <UTC timestamp>
MAIN: green|red (<first failing check>)
PRS: #n <title> — green|red: <first failing line> — fixed by me: yes|no
STUCK: #n <title> (picked up <time>, no PR)
WATCH: npm <downloads/week> (source) · stars <n> · forks <n> · crypt-demo KEV <changes or none> · Kiroween rules <changed: what | unchanged>
ROADMAP: P1 <state> · P2 <state> · P3 <state> · P4 <state> · P5 <state> · P6 <state> · S1..S5 <states>
RISKS: <max 3 lines>
NEXT 3 (recommended): 1. … 2. … 3. …
```

## Limits

- It cannot see Kiro session state; "stuck" means no PR on GitHub.
- It never writes a number it did not read from a cited source in this run.
- It follows the steering files like every other session.
