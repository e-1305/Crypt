# Design: hook-evidence

## Layout
- `scripts/hooks/run-logged.sh <hook> <script> [args]`: reads STDIN once, runs the script with that STDIN, prints its output, appends the run line, exits with the script's exit code.
- `scripts/hooks/log-run.mjs`: builds the JSON line with `JSON.stringify` (so escaping is always valid), redacts token-like strings, truncates `summary` to 160 characters.
- `scripts/ci/hook-evidence-check.mjs`: validates hook files and the jsonl. CI runs it in `kiro-docs`; `tests/hooks.test.ts` runs it on the repository.
- `scripts/kiro-stats.ts`: `countHookRuns` and `hookRunsByHook` read the jsonl.

## Trigger and file
The event JSON is searched for the string fields `trigger`, `hookTrigger`, `event` or `eventType` and for the first path-like string. Neither is stored verbatim beyond that. With no STDIN (a terminal), `trigger` is `CRYPT_HOOK_TRIGGER` or `manual`.

## Hook name
`hook` is the hook file name without `.json`, for example `related-tests-on-save`.

## Limits
Kiro Web may not fire hooks. Then the file holds only `manual` lines and the stat reads 0.
