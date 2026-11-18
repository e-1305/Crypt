# Releasing `@e-1305/crypt`

The release workflow (`.github/workflows/release.yml`) publishes the package so that `npx @e-1305/crypt raid <path-or-github-url>` works. It needs one secret, `NPM_TOKEN`, which only the owner can create.

## Steps for the owner (Amine)

1. **Create an npm automation token.** On npmjs.com, open Access Tokens, generate a new token of type Automation (or a granular token with read and write on `@e-1305/crypt`), and copy it once. The `@e-1305` scope must exist under the publishing npm account.
2. **Add it as the `NPM_TOKEN` repository secret.** In GitHub, open Settings > Secrets and variables > Actions > New repository secret. Name: `NPM_TOKEN`. Paste the token as the value. Never commit it, print it or put it in an issue.
3. **Run the release workflow.** Open Actions > Release > Run workflow on `main`. Pushing a tag `vX.Y.Z` that matches the `version` in `package.json` runs the same workflow.

## What the workflow does

1. `npm ci`, typecheck, toolchain build, the full test suite.
2. `scripts/ci/pack-install-test.sh`: packs the tarball, installs it into an empty project and runs the installed `crypt` command (the same check as the `pack-install` CI job).
3. `npm pack --dry-run`.
4. `npm publish --access public --provenance`, authenticated by `NPM_TOKEN`. The workflow has `contents: read` and `id-token: write` permissions only. If the secret is missing, the job fails before publishing.

An npm version can be published once. Bump `version` in `package.json` before each release.
