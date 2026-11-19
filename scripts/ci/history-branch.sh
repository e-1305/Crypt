#!/usr/bin/env bash
# Optional persistence of the run history (roadmap P2): bash scripts/ci/history-branch.sh <check|pull|push> <branch> <default-branch> [file] [repo-dir]
#   check  exit 0 when the branch may be used, 1 when refused.
#   pull   fetch the history file from <branch> into [file], so the next run appends to it.
#   push   commit [file] on <branch> and push it there.
# The branch must be literally "crypt-history" and must differ from the default branch. An empty or unknown default branch is refused.
# The push refspec ends in refs/heads/crypt-history, so no other ref can be written.
# Fail-safe: any error exits 0 after a warning (history is a convenience), and nothing else is changed.
set -uo pipefail

ALLOWED="crypt-history"
FILE_NAME="crypt-history.jsonl"

allowed() {
  local b="$1" d="$2"
  [ "$b" = "$ALLOWED" ] && [ -n "$d" ] && [ "$b" != "$d" ]
}

cmd="${1:-}"
branch="${2:-}"
default_branch="${3:-}"
file="${4:-}"
repo="${5:-.}"

if ! allowed "$branch" "$default_branch"; then
  echo "history-branch: refused. The history branch must be named ${ALLOWED} and differ from the default branch." >&2
  [ "$cmd" = "check" ] && exit 1
  exit 0
fi
[ "$cmd" = "check" ] && exit 0

warn() { echo "history-branch: $1. The history was not changed." >&2; exit 0; }
[ -n "$file" ] || warn "no file given"
git -C "$repo" rev-parse --git-dir >/dev/null 2>&1 || warn "not a git repository"

case "$cmd" in
  pull)
    git -C "$repo" fetch --quiet --depth 1 origin "refs/heads/${ALLOWED}:refs/crypt/history" 2>/dev/null || exit 0 # no branch yet: first run
    mkdir -p "$(dirname "$file")" || warn "cannot create the output directory"
    git -C "$repo" show "refs/crypt/history:${FILE_NAME}" >"$file" 2>/dev/null || rm -f "$file"
    ;;
  push)
    [ -s "$file" ] || warn "no history file to push"
    idx="$(mktemp)" || warn "no temp file"
    rm -f "$idx"
    export GIT_INDEX_FILE="$idx"
    blob="$(git -C "$repo" hash-object -w "$file")" || warn "cannot store the file"
    git -C "$repo" update-index --add --cacheinfo "100644,${blob},${FILE_NAME}" || warn "cannot stage the file"
    tree="$(git -C "$repo" write-tree)" || warn "cannot write the tree"
    parent_args=()
    if git -C "$repo" rev-parse --verify --quiet refs/crypt/history >/dev/null; then parent_args=(-p refs/crypt/history); fi
    commit="$(git -C "$repo" -c user.name=crypt -c user.email=crypt@users.noreply.github.com commit-tree "$tree" "${parent_args[@]}" -m "crypt: history")" || warn "cannot commit"
    git -C "$repo" push --quiet origin "${commit}:refs/heads/${ALLOWED}" || warn "push failed"
    rm -f "$idx"
    ;;
  *)
    warn "unknown command"
    ;;
esac
exit 0
