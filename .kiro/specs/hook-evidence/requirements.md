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

## H4 Kiro Web twins (issue #87)
Source: the [Kiro hook types page](https://kiro.dev/docs/hooks/types/). File Save is supported in the IDE and CLI V3, not in Kiro Web. Kiro Web supports Prompt Submit, Agent Stop, Session Start, Pre Tool Use and Post Tool Use.
1. Each hook file with a `PostFileSave` command entry SHALL also hold a `PostToolUse` entry with matcher `write` (the docs' category for all built-in file write tools). Its command sets `CRYPT_HOOK_TRIGGER=PostToolUse` and `CRYPT_HOOK_FILTER` to the same regex as the `PostFileSave` matcher.
2. With `CRYPT_HOOK_FILTER` set, the wrapper reads the written path from the session context JSON on STDIN (`scripts/hooks/tool-write-filter.mjs`). When no path matches it runs nothing and logs nothing. Otherwise it runs the check and logs `trigger: "PostToolUse"`.
3. `failsafe-guard-on-stop.json` (trigger `Stop`) SHALL run `scripts/ci/failsafe-guard.sh` over all of `src/` and `bin/` and log one line.
4. `session-start-log.json` (trigger `SessionStart`) SHALL log one line and read no payload.
5. `CRYPT_HOOK_TRIGGER`, when set, wins over a trigger found in the payload.
6. `hook-evidence-check.mjs` SHALL NOT require a non-manual line for every hook name, because a headless session may not fire every trigger. A line MAY carry the key `source` with the value `kiro-cli-ci`, and such a line SHALL NOT have trigger `manual`.
7. If `write` does not match in a session, the tool IDs that session's write tools use SHALL be recorded here. None has been recorded: no PostToolUse run has been observed yet (see `docs/KIRO.md`, "Hook runs").
