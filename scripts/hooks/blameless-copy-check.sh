#!/usr/bin/env bash
# Hook 5: blameless copy check for saved game prose and UI copy (src/raise/**, web/**).
# Fails (exit 1) when copy names a person in failure, or phrases a prohibition ("don't", "never") instead of an action.
# Rules: .kiro/steering/blameless.md. Usage: blameless-copy-check.sh [file ...]
# (no arguments: read the Kiro event JSON on STDIN; if that names no file, check src/raise and web/, minus web/vendor)
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.." || exit 2
. scripts/hooks/lib.sh

# People in failure.
BLAME='\bblame[sd]?\b|\bfault of\b|\b(your|his|her|their) fault\b|\bbroke it\b|@[A-Za-z0-9_-]+ (failed|broke)|\bauthored by\b|\bcommitted by\b'
# Prohibition phrasing in user-facing strings. Names a pattern, not a person.
PROHIBIT="\\b(don't|do not|never|must not|mustn't|cannot|can't|forbidden|not allowed)\\b"

files=()
while IFS= read -r f; do
  case "$f" in
    web/vendor/*|web/js/*|web/game/*) ;;
    src/raise/*|web/*) [ -f "$f" ] && files+=("$f") ;;
  esac
done < <(hook_files "$@")
if [ "${#files[@]}" -eq 0 ] && [ "$#" -eq 0 ]; then
  while IFS= read -r f; do
    case "$f" in web/vendor/*|web/js/*|web/game/*) ;; *) files+=("$f") ;; esac
  done < <(hook_expand src/raise web)
fi

# Copy lines only: drop comment lines (//, *, #, <!--) so developer notes are not read as user copy.
copy() { grep -vE '^[[:space:]]*(//|/?\*|#|<!--)' "$1"; }

fail=0
for f in "${files[@]}"; do
  hit="$(copy "$f" | grep -nEi -- "$BLAME" | head -1)"
  if [ -n "$hit" ]; then
    echo "blameless-copy-check: $f: copy names a person in failure: ${hit#*:} (name people only in praise, e.g. 'healed by')" >&2
    fail=1
  fi
  # A prohibition only counts inside a quoted string or HTML text, which is what a player reads.
  hit="$(copy "$f" | grep -E "[\"'\`>][^\"'\`<>]*" | grep -nEi -- "[\"'\`>][^\"'\`<>]*$PROHIBIT" | head -1)"
  if [ -n "$hit" ]; then
    echo "blameless-copy-check: $f: copy states a prohibition: ${hit#*:} (state the action to take instead)" >&2
    fail=1
  fi
done

[ "$fail" -eq 0 ] && echo "blameless-copy-check: ok (${#files[@]} files checked)"
exit "$fail"
