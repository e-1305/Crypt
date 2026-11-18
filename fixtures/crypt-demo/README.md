# crypt-demo snapshot

Committed copy of three files from [e-1305/crypt-demo](https://github.com/e-1305/crypt-demo) at commit
`bd82e8eb00428db829ac002944f1be98f51c94df` (see `SNAPSHOT.json`). `npm run build:site` exhumes this directory offline
(OSV cache in `data/cache/osv`, feeds in `fixtures/vulnerable-npm/feeds`) to build the default `demo` creature.
It makes no network call. To refresh, fetch the three files at a newer SHA and update `SNAPSHOT.json`.
Never install or run anything here.
