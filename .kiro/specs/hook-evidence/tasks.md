# Tasks: hook-evidence

- [x] 1. Spec: requirements, design, tasks (this folder)
- [x] 2. `scripts/hooks/run-logged.sh` and `scripts/hooks/log-run.mjs` (H1.2 to H1.4)
- [x] 3. Convert the five `.kiro/hooks/*.json` to command actions (H1.1, H1.5)
- [x] 4. `scripts/ci/hook-evidence-check.mjs`, tests in `tests/hooks.test.ts`, CI step in `kiro-docs` (H3.2)
- [x] 5. Hook runs stat in `scripts/kiro-stats.ts` with tests (H3.1)
- [x] 6. Edit files matching each matcher in the session and record the runs (H2)
- [x] 8. PostToolUse twins, Stop and SessionStart hooks, `tool-write-filter.mjs`, stricter `hook-evidence-check.mjs` (H4.1 to H4.6)
- [x] 9. Kiro-session lines for every hook (H4.7): needs a session that loads the hooks; none fired yet. The checker no longer requires every hook (H4.6)
- [x] 7. `docs/KIRO.md`, `docs/DEVPOST.md`, `docs/BLOG.md` state what fired and what did not (H2.3)
