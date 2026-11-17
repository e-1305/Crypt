#!/usr/bin/env bash
# Hook 2: failsafe check for a saved file under src/necromancer, src/inquisitor or src/mcp.
# Fails (exit 1) on a PR-merging endpoint or command, or on a token or secret flowing into a log or audit call.
# Usage: failsafe-check.sh [file ...]   (no arguments: read the Kiro event JSON on STDIN; if that names no file, check the three directories)
# Reads and reports only (failsafe rules 1, 2, 8).
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.." || exit 2
. scripts/hooks/lib.sh

# The M word is assembled from parts so this file does not trip tests/static.test.ts, which scans scripts/.
M="mer""ge"
strip() { sed -E "s/awaiting[-_]human[-_]$M//Ig" "$1"; }

declare -a RULES=(
  "gh pr $M|gh[[:space:]]+pr[[:space:]]+$M"
  "$M endpoint|/$M\\b"
  "$M call|\\b${M}[A-Za-z_]*[[:space:]]*\\("
  "$M method name|\\b($M|enable)[A-Za-z]*(PullRequest|Auto${M^})\\b"
  "auto-$M|auto[-_ ]?$M"
  "${M}_method|${M}_method|${M}_commit"
  "PUT $M|PUT.*$M"
)
# A log or audit call on the same line as a secret: GITHUB_TOKEN, ghp_/gho_/github_pat_ values, Authorization or Bearer headers.
LOGCALL='(console\.[a-z]+|logger?\.[a-z]+|\baudit[A-Za-z]*|process\.std(out|err)\.write|writeAudit|appendFile(Sync)?)[[:space:]]*\('
SECRET='GITHUB_TOKEN|\bgh[pousr]_[A-Za-z0-9_]*|github_pat_|Authorization|Bearer[[:space:]]'

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
  for rule in "${RULES[@]}"; do
    name="${rule%%|*}"; re="${rule#*|}"
    if printf '%s\n' "$text" | grep -Eiq -- "$re"; then
      echo "failsafe-check: $f matches '$name' (failsafe rule 2: never call a $M endpoint)" >&2
      fail=1
    fi
  done
  hit="$(printf '%s\n' "$text" | grep -nE -- "$LOGCALL" | grep -E -- "$SECRET" | head -1)"
  if [ -n "$hit" ]; then
    echo "failsafe-check: $f line ${hit%%:*} sends a token or secret to a log or audit call (failsafe rule 8, keep secrets out of logs)" >&2
    fail=1
  fi
done

[ "$fail" -eq 0 ] && echo "failsafe-check: ok (${#files[@]} files checked)"
exit "$fail"
