# Tasks: cli

- [x] 1. Specs: requirements, design, tasks (this folder), committed before code
- [x] 2. `src/cli/`: `parse.ts`, `exit.ts`, `help.ts`, `url.ts`, `name.ts` (C1, C3.4, C6, C8.2)
- [x] 3. `scripts/toolchain-dir.ts`, `setup-tools.sh` reads `CRYPT_TOOLCHAIN_DIR`, `compile.ts`, `play.ts`, `build-game.sh` use it; npm scripts unchanged by default (C4.5)
- [x] 4. `scripts/cli/toolchain.ts`: cache dir, preflight, build once, exit 3 (C4)
- [x] 5. `scripts/cli/target.ts`: shallow clone, symlink refusal, cleanup on exit and signals (C3)
- [x] 6. `scripts/cli/session.ts`, `raid.ts`: dfrotz session, live watcher, dry-run graft, SEAL handling, `--offline` (C2)
- [x] 7. `scripts/cli/seal.ts`, `graft`, `inquisit`, `reraise` wrappers; `--live` checks (C1)
- [x] 8. `scripts/cli/main.ts` and `bin/crypt.mjs` launcher; top-level error handler (C6.3)
- [x] 9. `package.json`: name `crypt-cli`, bin, files, engines, private; lockfile name; `npm pack --dry-run` check (C5)
- [x] 10. Verify `npx --no-install crypt --help` after `npm ci`; result: it resolves with no `prepare` link (see design (c)); `npm run crypt --` alias added anyway (C5.4)
- [x] 11. `exhume` through the CLI uses the clone (done); writes `creature.repo` (C8.1, FEAT-004)
- [x] 12. `plate.ts`, `web.ts`, `src/mcp` use `creature.repo`; update `tests/__snapshots__/plate.test.ts.snap` with `npx vitest run -u tests/plate.test.ts` (C8.3, C8.4)
- [x] 13. Update the schema section of `.kiro/specs/exhume-and-rank/design.md` for `repo` (note from FEAT-002)
- [x] 14. Census: `noCodeowners` in `run.ts`, `RepoCounts`, `Aggregate`, `renderResults`; regenerate `docs/census/RESULTS.md` with `npm run census` (C9)
- [x] 15. Tests: `tests/cli.test.ts`, `tests/cli-target.test.ts`, gated raid end-to-end, name and census tests, static test still green
- [x] 16. README Quickstart (3 lines), "More commands", exit codes; `docs/ATTRIBUTION.md` (toolchain cache, git for clones); `docs/KIRO.md` spec row
- [ ] 17. Acceptance: clean clone flow, `GRAFT JQUERY`, `SEAL CRYPT` then `GRAFT LODASH`, GitHub URL exhume with no leftover temp dir (C10)
