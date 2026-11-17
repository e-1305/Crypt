#!/usr/bin/env bash
# Hook 2: failsafe check for a saved file under src/necromancer, src/inquisitor or src/mcp.
# Fails (exit 1) on a PR-merging endpoint or command, or on a blame call, or on a token or secret flowing into a log or audit call
# (same line, a call split over lines, or a variable assigned from a secret and logged later).
# Usage: failsafe-check.sh [file ...]   (no arguments: read the Kiro event JSON on STDIN; if that names no file, check the three directories)
# Reads and reports only (failsafe rules 1, 2, 8).
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.." || exit 2
. scripts/hooks/lib.sh

# Rules, strip() and the secret-in-log detectors are shared with the CI guard so the two cannot drift.
. scripts/ci/failsafe-rules.sh

files=()
while IFS= read -r f; do
  case "$f" in src/necromancer/*|src/inquisitor/*|src/mcp/*) [ -f "$f" ] && files+=("$f") ;; esac
done < <(hook_files "$@")
if [ "${#files[@]}" -eq 0 ] && [ "$#" -eq 0 ]; then
  while IFS= read -r f; do files+=("$f"); done < <(hook_expand src/necromancer src/inquisitor src/mcp)
fi

fail=0
for f in "${files[@]}"; do
  text="$(strip "$f")"
  while IFS= read -r name; do
    [ -n "$name" ] || continue
    echo "failsafe-check: $f matches '$name' (failsafe rule 2: never call a $M endpoint, rule 1: no blame)" >&2
    fail=1
  done < <(rule_hits "$text")
  while IFS= read -r why; do
    [ -n "$why" ] || continue
    echo "failsafe-check: $f sends a token or secret to a log or audit call: $why (failsafe rule 8, keep secrets out of logs)" >&2
    fail=1
  done < <(secret_log_hits "$text")
done

[ "$fail" -eq 0 ] && echo "failsafe-check: ok (${#files[@]} files checked)"
exit "$fail"
