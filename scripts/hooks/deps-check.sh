#!/usr/bin/env bash
# Hook 4 helper: print every package.json dependency or devDependency that docs/ATTRIBUTION.md does not name.
# Exit 1 when any is missing. Reads and reports only. Usage: deps-check.sh [root]
set -uo pipefail
ROOT="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
cd "$ROOT" || exit 2
[ -f package.json ] && [ -f docs/ATTRIBUTION.md ] || { echo "deps-check: package.json or docs/ATTRIBUTION.md missing" >&2; exit 2; }

names="$(node -e 'const p=JSON.parse(require("fs").readFileSync("package.json","utf8"));for(const k of ["dependencies","devDependencies"])for(const n of Object.keys(p[k]??{}))console.log(n)')" || exit 2
missing=0
while IFS= read -r n; do
  [ -z "$n" ] && continue
  esc="$(printf '%s' "$n" | sed -E 's/[][\\.^$*+?(){}|]/\\&/g')"
  # Whole-name match: "typescript" must not match "typescript-sdk" or a URL path segment.
  if ! grep -qE -- "(^|[^A-Za-z0-9@/_-])${esc}([^A-Za-z0-9_-]|$)" docs/ATTRIBUTION.md; then
    echo "deps-check: $n is in package.json but not in docs/ATTRIBUTION.md (add name, use, licence, link)" >&2
    missing=1
  fi
done <<< "$names"
[ "$missing" -eq 0 ] && echo "deps-check: ok ($(printf '%s\n' "$names" | grep -c .) dependencies attributed)"
exit "$missing"
