# Requirements: cli

Goal: one command takes a target (local path or GitHub URL) from scan to a playable game with the watcher live, and typing `GRAFT <LIMB>` in the game produces the dry-run PR payload at once. Driven by issue #22 (Tier 1, "one command: npx crypt raid"). Follows `.kiro/steering/failsafe.md`, `blameless.md` and `tech.md`. Does not touch `web/`.

Terms. **Target**: a local directory or a GitHub URL. **Toolchain**: Inform 6, its library and dfrotz. **Toolchain cache**: the directory the toolchain is built into. **Creature name**: the `repo` string in `out/creature.json`. **SEAL**, **Graft request**, **Marker**, **Limb ID**: as in `necromancer` and `raise-the-creature`. **Raid**: exhume, then raise, then play.

## C1 Commands (issue scope 1)
1. `bin/crypt.mjs` SHALL provide the subcommands `exhume`, `raise`, `play`, `graft`, `inquisit`, `reraise`, `seal`, `unseal` and `raid`, plus `--help` and `--version`.
2. `exhume`, `raise`, `inquisit` and `reraise` SHALL behave as the existing `npm run` scripts of the same name and accept the same flags.
3. `play` SHALL run a terminal dfrotz session on `out/creature.z8` with the watcher live, so marker lines printed by the game are processed as they appear.
4. `graft <LIMB>` SHALL run the Necromancer in dry-run mode by default, writing the payload to `out/prs/`.
5. `graft --live` SHALL require `GITHUB_TOKEN` and `--repo owner/name`. IF either is missing THEN the command SHALL exit 2 with a message that names the missing item and makes no call.
6. `seal` SHALL create `.crypt-seal` and audit `SEALED`. `unseal` SHALL remove it and audit `UNSEALED`. Both are human-run CLI actions; the game and agents never call them.
7. An unknown command, an unknown flag or a missing required argument SHALL exit 2 and print the usage line.

## C2 Raid (issue scope 2)
1. `crypt raid <target>` SHALL run exhume, raise and play in that order, in one process tree, and SHALL print the plate before the game starts.
2. WHILE the game runs, each output line SHALL be fed to the watcher as it is printed. WHEN a new file appears in `out/requests/`, the Necromancer SHALL run in dry-run mode and the path of the payload SHALL be printed immediately.
3. Typing `GRAFT JQUERY` on the fixture SHALL produce exactly one payload in `out/prs/` (jquery 3.4.1 to 3.5.0).
4. Raid SHALL obey the failsafe rules: SEAL stops every graft, at most 5 PRs per raid, every outcome audited.
5. IF `.crypt-seal` exists when the raid starts THEN the raid SHALL print how to lift it (`crypt unseal`) and keep it sealed.
6. Raid and `play` SHALL work with piped, non-TTY stdin and SHALL exit cleanly on end of input.
7. `--offline` SHALL make no network call. Feeds come from `data/feeds`, or, when the target is the bundled fixture, from that fixture's `feeds/` and `advisories/`. Feeds SHALL never come from a scanned repository.

## C3 Targets (issue scope 3)
1. A GitHub URL target SHALL be shallow-cloned into a fresh temporary directory, scanned, and the directory removed when the command ends, fails or is interrupted.
2. The CLI SHALL never run code from the target, never run `npm`, `pip` or any script from it, and never install its dependencies.
3. Only `package-lock.json`, `requirements.txt` and the CODEOWNERS locations SHALL be read from a clone. A symlink in any of those locations SHALL be refused.
4. Only URLs of the form `https://github.com/<owner>/<repo>[.git][/]` SHALL be accepted. Anything else exits 2.
5. A clone failure, or a target with no manifest, SHALL exit 4 with an actionable message.

## C4 Toolchain (issue scope 4)
1. WHEN Inform 6 or dfrotz is missing, the CLI SHALL build them once into the toolchain cache and print a progress message on stderr before it starts.
2. The default cache is `~/.cache/crypt/toolchain`. `XDG_CACHE_HOME` SHALL be honoured and `CRYPT_TOOLCHAIN_DIR` SHALL override both.
3. IF `git`, `make` or a C compiler is missing, or the build fails, THEN the CLI SHALL exit 3 with one line that names the missing tool or the log file and how to fix it. It SHALL NOT print a stack trace.
4. After one successful build, later runs SHALL NOT rebuild.
5. The existing npm scripts (`raise`, `build:game`, `spike`, `raise:check`) SHALL keep using the repo `.toolchain` unless `CRYPT_TOOLCHAIN_DIR` is set.

## C5 Package (issue scope 5)
1. The package name SHALL be `crypt-cli`, with the bin name `crypt`, because `crypt` and `crypt-cli` both exist on the npm registry and `crypt-cli` is the fallback named in the issue.
2. `package.json` SHALL have `bin`, a `files` whitelist that excludes `web/` and `.toolchain/`, and `engines.node` of `>=20`.
3. The package SHALL stay `private: true`. Nothing in this work publishes it.
4. After `npm ci`, `npx --no-install crypt` SHALL resolve to the local bin and SHALL NOT fetch the unrelated registry package.

## C6 Help and exit codes (issue scope 6)
1. `--help` SHALL be written in the project's Frankenstein tone, stay clear, and list every command, every flag and every exit code.
2. Exit codes: 0 ok, 1 runtime failure, 2 usage error, 3 toolchain missing or failed to build, 4 target unreadable (clone failed, no manifest), 130 interrupted.
3. The top-level handler SHALL print one line, `crypt: <actionable message>`, and SHALL print a stack only when `CRYPT_DEBUG=1`.

## C7 README (issue scope 7)
1. The README Quickstart at the top SHALL be at most 3 lines. The existing detailed commands stay below under "More commands".
2. The README SHALL document the exit codes, or point to `--help` for them, and the working `npx` invocation.

## C8 Creature name (follow-up 1)
1. `exhume` SHALL write a top-level string `repo` into `creature.json`.
2. For a GitHub URL it SHALL be the repository name. For a local path it SHALL be the `name` in the target's `package.json` with any `@scope/` removed, else the basename of the resolved target path.
3. The plate, the web export and the MCP server SHALL use `creature.repo` and never the current working directory.
4. The plate snapshot test SHALL be updated for the new name source.

## C9 Census (follow-up 2)
1. `scripts/census/run.ts` SHALL count the repositories among the 20 that have no CODEOWNERS file, by checking every location in `CODEOWNERS_LOCATIONS`.
2. The count SHALL flow through `RepoCounts`, `Aggregate` and `renderResults`, and `docs/census/RESULTS.md` SHALL show it. `RESULTS.md` is regenerated, never hand-edited.

## C10 Acceptance
1. Clean clone: `npm ci && npx --no-install crypt raid fixtures/vulnerable-npm --offline` reaches the game prompt.
2. Scripted input `GRAFT JQUERY` writes the payload. `SEAL CRYPT` then `GRAFT LODASH` writes nothing, and the audit log shows `SEALED` then `REJECTED_SEALED`.
3. GitHub URL flow: `crypt exhume <github url>` produces `out/creature.json` without executing target code, and no clone directory remains in the OS temp directory.
4. Existing tests pass. New tests cover argument parsing, exit codes and URL to temp dir cleanup.
5. Errors never print a stack trace.
