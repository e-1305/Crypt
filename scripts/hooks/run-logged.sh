#!/usr/bin/env bash
# Run a hook check and append one line to docs/evidence/hook-runs.jsonl, keeping the check's exit code.
# Usage: run-logged.sh <hook-name> <script> [args...]   (Kiro passes the event JSON on STDIN)
# The log line holds ts, hook, trigger, file, exit, summary. The STDIN payload itself is never stored.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.." || exit 2
hook="${1:?hook name}"; shift
[ "$#" -gt 0 ] || { echo "run-logged: no script given" >&2; exit 2; }

tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
: > "$tmp/payload"
[ -t 0 ] || cat > "$tmp/payload"

bash "$@" < "$tmp/payload" > "$tmp/out" 2>&1
code=$?
cat "$tmp/out"

# Args that are files (not the script itself) name the file; otherwise the log reads it from the payload.
node scripts/hooks/log-run.mjs "$hook" "$code" "$tmp/out" "$tmp/payload" "${@:2}" 2>/dev/null || echo "run-logged: could not write the log line" >&2
exit "$code"
