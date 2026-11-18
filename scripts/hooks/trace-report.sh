#!/usr/bin/env bash
# Hook 5 check: print the traceability table that kiro-trace.ts would write, and a one line summary. Writes nothing.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.." || exit 2
out="$(npx --no-install tsx scripts/hooks/kiro-trace.ts 2>&1)" || { printf '%s\n' "$out"; echo "trace-report: kiro-trace failed" >&2; exit 1; }
rows="$(printf '%s\n' "$out" | grep -c '^| ' || true)"
echo "trace-report: ok (${rows} table rows, run kiro-trace.ts --write to refresh docs/KIRO.md)"
