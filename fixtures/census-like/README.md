# census-like fixtures

Two tiny projects shaped like census repositories, used by `tests/usage.test.ts`. They are hand-written, not copies of any
real repository. Nothing here is installed or run.

- `a`: CommonJS, subpath import (`lodash/fp`), scoped package (`@scope/util`), a declared-but-unimported package
  (`minimist`, `debug`), a dev-only package (`mocha`, and its nested `ms`), a transitive-only package (`ms` 2.1.2).
- `b`: ESM, dynamic `import()`, `export ... from`, transitive-only `qs` and `yaml`, a dev-only `yaml-extra`.
