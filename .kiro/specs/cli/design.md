# Design: cli

## Pipeline

```
crypt raid <target> [--offline]
  target.ts   URL? shallow clone to mkdtemp (read-only)   local path as is
        v
  exhume      lockfile + feeds + CODEOWNERS -> out/creature.json (adds "repo")
        v
  raise       creature.json -> Inform 6 -> out/creature.z8   (toolchain cache)
        v
  plate       src/render/plate.ts printed to stdout
        v
  play        dfrotz -m -p  <-- user / piped stdin
                |  stdout shown to the user, each line also fed live to
                v
              createWatcher(defaultCtx()).processText   marker -> out/requests/
                v  new request file
              graft(ctx, file) in dry-run  -> out/prs/<branch>.json  (path printed)
```

## Module layout

| Path | Role |
|---|---|
| `bin/crypt.mjs` | thin launcher: `node --import tsx scripts/cli/main.ts <args>`, stdio inherited, forwards exit code and signals |
| `src/cli/parse.ts` | pure `parseCli(argv)` returning `{command, args, flags}` or a typed `UsageError` |
| `src/cli/exit.ts` | exit code constants and the typed errors that map to them |
| `src/cli/help.ts` | help and version text |
| `src/cli/url.ts` | GitHub URL parser |
| `src/cli/name.ts` | creature name derivation, shared with exhume |
| `scripts/cli/main.ts` | dispatch, top-level catch |
| `scripts/cli/toolchain.ts` | cache dir, preflight, build |
| `scripts/cli/target.ts` | clone, symlink refusal, cleanup |
| `scripts/cli/session.ts`, `raid.ts`, `seal.ts`, `run.ts`, `signals.ts` | dfrotz session, flow, seal, child scripts, interrupt cleanup |
| `scripts/toolchain-dir.ts` | the one shared helper that resolves the toolchain location |

`src/` stays free of network code, the word for landing a PR, and `http(s)://` literals (`tests/static.test.ts`).

## Decisions

### (a) Command table

| Command | Runs | Notes |
|---|---|---|
| `exhume <target>` | spawns `node --import tsx scripts/exhume.ts` | clone first when the target is a URL |
| `raise` | spawns `scripts/raise.ts` | |
| `play` | in process | dfrotz plus watcher plus graft |
| `graft <LIMB>` | in process | dry-run unless `--live` |
| `inquisit <LIMB>` | spawns `scripts/inquisitor.ts` | |
| `reraise` | spawns `scripts/reraise.ts` | passes `--dry-run` and `--repo` |
| `seal`, `unseal` | in process | see (h) |
| `raid <target>` | in process | see (f) |
| `--help`, `--version` | in process | exit 0 |

The spawn pattern is the existing one in `bin/crypt.mjs`. `graft --live` needs `GITHUB_TOKEN` and `--repo owner/name`, else exit 2 with an actionable message and no call. `scripts/agent-cli.ts` already forces dry-run when the token is unset; the CLI additionally refuses `--live` without it so the user is never silently downgraded.

### (b) Exit codes

| Code | Meaning |
|---|---|
| 0 | ok |
| 1 | runtime failure |
| 2 | usage error |
| 3 | toolchain missing or failed to build |
| 4 | target unreadable (clone failed, no manifest) |
| 130 | interrupted |

The codes are listed in `--help` and the README. `main.ts` catches everything, prints `crypt: <message>` on one line, and exits with the mapped code. Typed errors (`UsageError`, `ToolchainError`, `TargetError`) carry their code; any other error is 1. The stack is printed only when `CRYPT_DEBUG=1`.

### (c) Package name and npx resolution
`crypt` and `crypt-cli` are both taken on the registry. The package is named `crypt-cli` (the fallback in the issue), the bin stays `crypt`, `private: true` stays, so it cannot be published by accident. Added: `files` whitelist (`bin`, `scripts`, `src`, `game`, `fixtures/vulnerable-npm`, `data/cache/osv`, `README.md`, `LICENSE`, `docs/ATTRIBUTION.md`; not `web/`, not `.toolchain/`) and `engines.node` `>=20`. `tsx` stays in `dependencies` because the launcher needs it at run time.

`npx crypt` without `--no-install` could fetch the unrelated registry package, so every documented invocation uses `npx --no-install crypt`. npm does not link a package's own bin into `node_modules/.bin`, so this was checked. Result (npm 11.4.2, Node 22.23.4): `node_modules/.bin/crypt` is not created, yet `npx --no-install crypt --help` runs this checkout from the repo root and from its subdirectories, because npm exec resolves the bin of the current project. It does not work from an unrelated directory (use `node <checkout>/bin/crypt.mjs`). No `prepare` link was needed. An `npm run crypt --` alias (`node bin/crypt.mjs`) is added as a second documented form.

### (d) Toolchain cache
Location, first match wins: `CRYPT_TOOLCHAIN_DIR`, `$XDG_CACHE_HOME/crypt/toolchain`, `~/.cache/crypt/toolchain`. The npm scripts keep the repo `.toolchain` by default so nothing changes for contributors: `scripts/setup-tools.sh` takes `TC="${CRYPT_TOOLCHAIN_DIR:-$ROOT/.toolchain}"`, and the CLI always passes an explicit `CRYPT_TOOLCHAIN_DIR`. `scripts/toolchain-dir.ts` is the single place that reads the variable; `scripts/compile.ts` and `scripts/play.ts` import it instead of hardcoding `.toolchain`. `build-game.sh` reads the same variable with the same default.

Flow: if `inform6` and `dfrotz` exist in the cache, continue. Otherwise preflight `git`, `make` and `cc` (`which`); a missing tool exits 3 with, for example, `crypt: 'make' not found. Install build tools (Debian: apt install build-essential git) and run again.` Then print `Building the Inform 6 and dfrotz toolchain once into <dir> (about a minute)...` on stderr, run `setup-tools.sh`, and on failure exit 3 naming the build log path. Build output goes to a log file in the cache dir, not the terminal.

### (e) Target handling
- URL regex as in `scripts/exhume.ts`: exactly `https://github.com/<owner>/<repo>[.git][/]`. Reject a leading `-`, whitespace, shell metacharacters and extra path segments before any process starts.
- Clone: `git clone --depth 1 --single-branch --no-tags -c core.hooksPath=/dev/null -c protocol.file.allow=never -- <url> <dir>`. The URL comes after `--`. It is spawned with an argument array and no shell. Environment adds `GIT_TERMINAL_PROMPT=0` and `GIT_LFS_SKIP_SMUDGE=1`. Submodules are not fetched (no `--recurse-submodules`).
- The directory comes from `fs.mkdtemp(os.tmpdir()/crypt-clone-)`.
- Read-only scan: only `package-lock.json`, `requirements.txt` and the CODEOWNERS locations are opened. Each is checked with `lstat` first; a symlink is refused so a hostile repo cannot point a manifest at a local file.
- Nothing from the target is executed: no `npm`, no `pip`, no scripts, no `require` of target files.
- Cleanup runs in `finally` and in `SIGINT` and `SIGTERM` handlers (exit 130). Tests inject the clone command or URL base so a local bare repository stands in for the network.

### (f) Raid flow
`raid` runs exhume, raise, plate, play. `play` spawns dfrotz with the flags used by `scripts/play.ts` (`-m -p`) on `out/creature.z8`. dfrotz stdout is written to the user and also split into lines. The status line is dropped with the `STATUS_LINE` regex from `scripts/play.ts` (`/^[>\s]*The Crypt\s+Score:.*$/`). Each line goes to `createWatcher(defaultCtx(cwd)).processText`. After the watcher writes a new file to `out/requests/`, `graft(ctx, file)` runs in dry-run mode (`dryRunClient`, advisories from the fixture or OSV cache, `targetDir`, `defaultPaths()`, as in `scripts/check-necromancer.ts`) and the payload path is printed at once.

Stdin is passed to dfrotz unchanged, so a script like `printf 'GRAFT JQUERY\n' | crypt raid ...` works. On stdin EOF dfrotz exits, the pending lines are flushed, outstanding grafts finish, and the process exits 0.

Failsafe: the watcher checks SEAL and the limb table before writing a request; the Necromancer checks SEAL again; the 5 PR cap and audit log live in `src/necromancer`. The raid adds no bypass. IF `.crypt-seal` exists at start, raid prints `The crypt is sealed. Run 'crypt unseal' to lift it.` and keeps it sealed. State (`out/`, `.crypt-seal`, `crypt-audit.log`) is relative to the cwd; scripts, fixtures and tsx are resolved relative to the package, so raid works from any scratch directory.

### (g) Offline mode
`--offline` makes no network call. Feeds come from `data/feeds` when present. When the target is the bundled fixture (its `realpath` equals the package's `fixtures/vulnerable-npm`), the fixture's `feeds/` and `advisories/` are used, and OSV data comes from the committed `data/cache/osv`. Feeds never come from an arbitrary scanned repository, so a hostile repo cannot supply its own EPSS or KEV data.

### (h) Seal and unseal
`seal` writes `.crypt-seal` and appends an audit line `SEALED`. `unseal` removes it and appends `UNSEALED` (a new outcome added to the audit outcome list). Both are human-run CLI actions. The agents' tool lists do not include them, and no marker the game prints can trigger `unseal`. Sealing an already sealed crypt, or unsealing a crypt that is not sealed, exits 0 with a one-line note.

### (i) Creature name
`exhume` writes `creature.repo` (string). Derivation in `src/cli/name.ts`, pure:
- GitHub URL: the `<repo>` segment without `.git`.
- Local path: `package.json` `name` with a leading `@scope/` removed; if absent or empty, the basename of the resolved target path.
`scripts/plate.ts`, `scripts/web.ts` and `src/mcp` read `creature.repo` and fall back to `unknown` only for creatures written before this change. They no longer use `basename(cwd)`. `src/exhume/creature.ts` `buildCreature` gains a `repo` input, and the schema section of `.kiro/specs/exhume-and-rank/design.md` is updated (FEAT-004).

### (j) Census
`scripts/census/run.ts` already reads CODEOWNERS locations per repo. It records whether any of `CODEOWNERS_LOCATIONS` exists; the field `noCodeowners` is carried through `RepoCounts`, `Aggregate` (sum) and `renderResults`, which prints `Repositories with no CODEOWNERS file: N of 20`. The number is produced by running `npm run census`, never typed by hand.

## Failure modes

| Situation | Result |
|---|---|
| Unknown command or flag | exit 2, usage line |
| `graft --live` without token or `--repo` | exit 2, names the missing item |
| URL not matching the pattern | exit 2 |
| Clone fails (404, private, timeout) | exit 4, temp dir removed |
| No `package-lock.json` or `requirements.txt` | exit 4 |
| Manifest is a symlink | exit 4 |
| `git`, `make` or `cc` missing | exit 3 with install hint |
| Toolchain build fails | exit 3 with log path |
| dfrotz exits non-zero | exit 1 |
| Ctrl-C | children stopped, temp dir removed, exit 130 |
| Sealed at start | message to unseal, grafts rejected, audited |
| Any other error | exit 1, one line, stack only with `CRYPT_DEBUG=1` |

## Tests
`tests/cli.test.ts`: parsing for every command and flag; property: `parseCli` throws only `UsageError`, and exit codes stay in the documented set; URL parser property test; exit codes by spawning `bin/crypt.mjs` with no stack lines in stderr. `tests/cli-target.test.ts`: clone against a local bare repo, temp dir gone after success, after a failing scan and after a clone failure, symlinked manifest refused. A toolchain-gated end-to-end raid test runs from a temp cwd and asserts the `GRAFT JQUERY` payload and the `SEAL CRYPT` then `GRAFT LODASH` no-op. Name derivation and the census count have unit tests; the plate snapshot is regenerated.
