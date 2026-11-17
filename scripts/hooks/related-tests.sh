#!/usr/bin/env bash
# Hook 1: run the tests related to a saved src/**/*.ts file.
# Usage: related-tests.sh [file.ts ...]   (no arguments: read the Kiro event JSON on STDIN)
# CRYPT_HOOK_VITEST overrides the runner (tests use `echo`).
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.." || exit 2
. scripts/hooks/lib.sh

files=()
while IFS= read -r f; do
  case "$f" in src/*.ts|src/**/*.ts) [ -f "$f" ] && files+=("$f") ;; esac
done < <(hook_files "$@")

if [ "${#files[@]}" -eq 0 ]; then
  echo "related-tests: no saved src/**/*.ts file given, nothing to run"
  exit 0
fi

# shellcheck disable=SC2086
${CRYPT_HOOK_VITEST:-npx --no-install vitest} related --run --passWithNoTests "${files[@]}"
