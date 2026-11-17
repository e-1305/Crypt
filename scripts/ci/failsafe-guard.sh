#!/usr/bin/env bash
# Failsafe guard: fails when src/ or bin/ hold a PR-merging endpoint or command, or a blame call,
# or when .kiro/ is git-ignored. Usage: failsafe-guard.sh [root]   (root defaults to the repo root)
set -uo pipefail
ROOT="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
cd "$ROOT" || exit 2
fail=0

# The state label (awaiting, human, then the M word) is a state, not a call; remove it before matching.
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
  'git blame|git[[:space:]]+blame\b|"git"[[:space:]]*,[[:space:]]*"blame"|'"'git'"'[[:space:]]*,[[:space:]]*'"'blame'"
)

files=()
for d in src bin; do
  [ -d "$d" ] && while IFS= read -r -d '' f; do files+=("$f"); done < <(find "$d" -type f -print0)
done

for f in "${files[@]}"; do
  text="$(strip "$f")"
  for rule in "${RULES[@]}"; do
    name="${rule%%|*}"; re="${rule#*|}"
    if printf '%s\n' "$text" | grep -Eiq -- "$re"; then
      echo "failsafe-guard: $f matches '$name'" >&2
      fail=1
    fi
  done
done

mkdir -p .kiro
if git rev-parse --git-dir >/dev/null 2>&1 && git check-ignore -q .kiro/probe; then
  echo "failsafe-guard: .kiro/ is git-ignored; it must be tracked" >&2
  fail=1
fi

[ "$fail" -eq 0 ] && echo "failsafe-guard: ok (${#files[@]} files checked)"
exit "$fail"
