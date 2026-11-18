# Requirements: hook-evidence

Goal: every Kiro hook leaves a record, so `docs/KIRO.md` can state what fired and what did not. Issue #74. Follows `.kiro/steering/blameless.md` and `failsafe.md`.

Terms. **Run line** is one JSON line in `docs/evidence/hook-runs.jsonl`. **Kiro-session line** is a run line whose `trigger` is not `manual`. **Wrapper** is `scripts/hooks/run-logged.sh`.

## H1 Every hook logs
1. Each file in `.kiro/hooks/*.json` SHALL have a `command` action that runs the wrapper, with an explicit `timeout` and `enabled: true`.
2. The wrapper SHALL run the hook's check, keep its exit code, and append one run line with the keys `ts`, `hook`, `trigger`, `file`, `exit`, `summary`.
3. The wrapper SHALL NOT write the STDIN payload, secrets or author names. `summary` is the last output line, sanitized and truncated.
4. `trigger` and `file` come from the event JSON on STDIN, then from the environment (`CRYPT_HOOK_TRIGGER`), else `trigger` is `manual`.
5. The hooks for `package.json` and spec `tasks.md` SHALL keep their agent prompt as a second entry with the same matcher.

## H2 Honest evidence
1. A run line SHALL only come from the wrapper running. No line is typed by hand.
2. Runs started by hand carry `manual`. Only Kiro-session lines count in `npm run kiro:stats`.
3. Where a hook did not fire in Kiro Web, `docs/KIRO.md` SHALL say so and name the trigger tried.

## H3 Checks
1. `npm run kiro:stats` SHALL print "Hook runs recorded in a Kiro session" from the Kiro-session lines, `unavailable` when the file is missing.
2. A CI step SHALL fail when a hook file lacks the command action, timeout or `enabled: true`, or when a run line is invalid.
