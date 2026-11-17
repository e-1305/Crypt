#!/usr/bin/env bash
# Scripted offline raid on the bundled fixture. Asserts exit 0 and one payload in out/prs/.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

cd "$WORK"
printf 'GRAFT JQUERY\nSEAL CRYPT\nGRAFT LODASH\n' | node "$ROOT/bin/crypt.mjs" raid "$ROOT/fixtures/vulnerable-npm" --offline

shopt -s nullglob
payloads=("$WORK"/out/prs/*.json)
if [ "${#payloads[@]}" -ne 1 ]; then
  echo "raid-offline: expected 1 payload in out/prs/, found ${#payloads[@]}" >&2
  exit 1
fi
echo "raid-offline: ok (${payloads[0]##*/})"
