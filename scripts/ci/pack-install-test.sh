#!/usr/bin/env bash
# Packs the package, installs the tarball into an empty project and runs the installed CLI.
# Set CRYPT_PACK_RAID=1 to also play a scripted offline raid (needs the toolchain; see CRYPT_TOOLCHAIN_DIR).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
fail() { echo "pack-install: $*" >&2; exit 1; }

mkdir "$WORK/pack" "$WORK/project"
(cd "$ROOT" && npm pack --silent --pack-destination "$WORK/pack" >/dev/null)
TARBALL="$(ls "$WORK"/pack/*.tgz)"
[ -f "$TARBALL" ] || fail "npm pack produced no tarball"

# The tarball must carry the runtime files and none of the tests, specs or web build.
LIST="$(tar -tzf "$TARBALL")"
for f in package/bin/crypt.mjs package/scripts/cli/main.ts package/scripts/setup-tools.sh package/fixtures/vulnerable-npm/package-lock.json package/LICENSE package/README.md; do
  grep -qx "$f" <<<"$LIST" || fail "tarball is missing $f"
done
if grep -qE '^package/(tests|\.kiro|\.github|\.agents|web|_site|out)/' <<<"$LIST"; then fail "tarball contains development files"; fi

cd "$WORK/project"
npm init -y >/dev/null
npm install --no-audit --no-fund --loglevel=error "$TARBALL"

HELP="$(npx --no-install crypt --help)" || fail "crypt --help failed"
grep -q "raid" <<<"$HELP" || fail "help text does not mention raid"
VERSION="$(npx --no-install crypt --version)" || fail "crypt --version failed"
grep -qE '^crypt [0-9]+\.[0-9]+\.[0-9]+' <<<"$VERSION" || fail "unexpected version output: $VERSION"

# Offline exhume of the packaged fixture writes out/ into the current directory.
npx --no-install crypt exhume node_modules/@e-1305/crypt/fixtures/vulnerable-npm --offline >/dev/null
[ -f out/creature.json ] || fail "exhume did not write out/creature.json in the current directory"

if [ "${CRYPT_PACK_RAID:-0}" = "1" ]; then
  printf 'GRAFT JQUERY\nSEAL CRYPT\nGRAFT LODASH\n' | npx --no-install crypt raid node_modules/@e-1305/crypt/fixtures/vulnerable-npm --offline >/dev/null
  shopt -s nullglob
  payloads=(out/prs/*.json)
  [ "${#payloads[@]}" -eq 1 ] || fail "expected 1 payload in out/prs/, found ${#payloads[@]}"
fi
echo "pack-install: ok ($(basename "$TARBALL"), node $(node -v))"
