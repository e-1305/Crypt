#!/usr/bin/env bash
# Run a hook check and append one line to docs/evidence/hook-runs.jsonl, keeping the check's exit code.
# Usage: run-logged.sh <hook-name> <script> [args...]   (Kiro passes the event JSON on STDIN)
# Optional env, set in the command of a hook whose trigger has no matcher of its own (PostToolUse, Stop, SessionStart):
#   CRYPT_HOOK_FILTER   regex a written path must match. The wrapper reads the event JSON, runs nothing and logs nothing when no path matches.
#   CRYPT_HOOK_TRIGGER  trigger name written to the log line (Kiro does not put it in the payload reliably).
# The log line holds ts, hook, trigger, file, exit, summary. The STDIN payload itself is never stored.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.." || exit 2
hook="${1:?hook name}"; shift
[ "$#" -gt 0 ] || { echo "run-logged: no script given" >&2; exit 2; }

tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
: > "$tmp/payload"
[ -t 0 ] || cat > "$tmp/payload"

if [ -n "${CRYPT_HOOK_FILTER:-}" ]; then
  CRYPT_HOOK_FILE="$(node scripts/hooks/tool-write-filter.mjs "$CRYPT_HOOK_FILTER" < "$tmp/payload" 2>/dev/null)" || exit 0
  export CRYPT_HOOK_FILE
fi

bash "$@" < "$tmp/payload" > "$tmp/out" 2>&1
code=$?
cat "$tmp/out"

# Args that are files (not the script itself) name the file; otherwise the log reads it from the payload.
node scripts/hooks/log-run.mjs "$hook" "$code" "$tmp/out" "$tmp/payload" "${@:2}" 2>/dev/null || echo "run-logged: could not write the log line" >&2
exit "$code"
