# Tasks: first-60-seconds

- [x] 1. Spec: requirements, design, tasks (this folder)
- [x] 2. Move `osvLookup` to `src/exhume/osv-client.ts` and `prBody` to `src/necromancer/pr-body.ts` (old paths re-export) so the web bundle has no `node:` imports (F3.5, F4.2)
- [x] 3. `src/web/feed-snapshot.ts`: compact feed format, build and parse (F3.4, F5.1)
- [x] 4. `src/web/live-exhume.ts`: fetch, exhume, rank, owners, plate, typed errors (F3, F5, F6, F7)
- [x] 5. Dry-run payloads, max 5, same `chooseVersion` and `prBody` (F4)
- [x] 6. `scripts/build-site.ts` writes `_site/feeds.json`; `tsconfig.web.json` include list (F3.4)
- [x] 7. `tests/live-exhume.test.ts`: identical ranking with the CLI, error paths, plate, no authors, max 5 payloads, owners, no `node:` imports
- [ ] 8. `web/live-exhume.js`, form and result panel, 3-step onboarding, Bench drawer, declutter (F1, F2, F3, F8)
- [ ] 9. Visual QA and docs
