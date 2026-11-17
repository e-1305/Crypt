#!/usr/bin/env bash
# Failsafe guard: fails when src/ or bin/ hold a PR-merging endpoint or command, or a blame call,
# or when .kiro/ is git-ignored. Usage: failsafe-guard.sh [root]   (root defaults to the repo root)
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
cd "$ROOT" || exit 2
fail=0

. "$HERE/failsafe-rules.sh"

files=()
for d in src bin; do
  [ -d "$d" ] && while IFS= read -r -d '' f; do files+=("$f"); done < <(find "$d" -type f -print0)
done

for f in "${files[@]}"; do
  text="$(strip "$f")"
  while IFS= read -r name; do
    [ -n "$name" ] || continue
    echo "failsafe-guard: $f matches '$name'" >&2
    fail=1
  done < <(rule_hits "$text")
done

# .kiro/ must be tracked. Probe the root and each subfolder that holds tracked work, then scan .gitignore for any .kiro pattern.
mkdir -p .kiro
if git rev-parse --git-dir >/dev/null 2>&1; then
  for probe in .kiro/probe .kiro/hooks .kiro/hooks/probe.json .kiro/hooks/probe.kiro.hook .kiro/steering .kiro/steering/probe.md \
    .kiro/specs .kiro/specs/probe/requirements.md .kiro/specs/probe/design.md .kiro/specs/probe/tasks.md; do
    if git check-ignore -q "$probe"; then
      echo "failsafe-guard: $probe is git-ignored; .kiro/ must be tracked" >&2
      fail=1
    fi
  done
fi
if [ -f .gitignore ] && grep -Eq '^[[:space:]]*[^!#[:space:]][^#]*\.kiro' .gitignore; then
  echo "failsafe-guard: .gitignore names a .kiro path ($(grep -En '^[[:space:]]*[^!#[:space:]][^#]*\.kiro' .gitignore | head -1)); .kiro/ must be tracked" >&2
  fail=1
fi

[ "$fail" -eq 0 ] && echo "failsafe-guard: ok (${#files[@]} files checked)"
exit "$fail"
