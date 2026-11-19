#!/usr/bin/env bash
# Entry point of the composite action (action.yml): bash scripts/ci/action.sh <report|graft> [limb] [sabotage]
#   report  exhume the checked-out repo, write the plate and the noise funnel to the step summary. Writes nothing to it.
#   graft   opt-in. Needs GITHUB_TOKEN. Runs scripts/ci/live-raid.sh graft (existing preflight). Never merges.
#   Env INPUT_ALERTS=issues (report mode): after exhume, print the KEV issues crypt alerts would open (dry-run, no token).
# Env: CRYPT_TARGET (repo to scan, default $GITHUB_WORKSPACE or .), CRYPT_OUT_DIR (all output, default a temp dir),
#      CRYPT_CMD, CRYPT_PLATE_CMD and CRYPT_FEEDS_CMD (stubs for tests), GITHUB_STEP_SUMMARY, GITHUB_OUTPUT.
# Exit codes: 0 ok, 1 a step failed or the state is unknown, 2 bad arguments (nothing was run).
# Fail-safe: any error or unknown state exits nonzero with a FAILED summary, never a green "all clean".
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SUMMARY="${GITHUB_STEP_SUMMARY:-/dev/null}"

usage() {
  echo "action: $1" >&2
  echo "usage: action.sh <report|graft> [LODASH|JQUERY] [true|false]" >&2
  {
    echo "## CRYPT action FAILED: bad input"
    echo
    echo "$1. Nothing was run."
  } >>"$SUMMARY"
  exit 2
}

[ "$#" -ge 1 ] && [ "$#" -le 3 ] || usage "expected 1 to 3 arguments, got $#"
mode="$1"
limb="${2:-LODASH}"
sabotage="${3:-false}"
alerts="${INPUT_ALERTS:-none}"
history_branch="${INPUT_HISTORY_BRANCH:-}"

case "$mode" in report | graft) ;; *) usage "mode must be report or graft, got '${mode:0:20}'" ;; esac
case "$limb" in LODASH | JQUERY) ;; *) usage "limb must be LODASH or JQUERY, got '${limb:0:20}'" ;; esac
case "$alerts" in none | issues) ;; *) usage "alerts must be none or issues, got '${alerts:0:20}'" ;; esac
if [ -n "$history_branch" ] && ! bash "$ROOT/scripts/ci/history-branch.sh" check "$history_branch" "${DEFAULT_BRANCH:-}"; then
  usage "history-branch must be empty or crypt-history, and must not be the default branch"
fi
case "$sabotage" in true | false) ;; *) usage "sabotage must be true or false, got '${sabotage:0:20}'" ;; esac
if [ "$mode" = "report" ] && [ "$sabotage" = "true" ]; then usage "sabotage only goes with mode graft"; fi
if [ "$mode" = "graft" ] && [ -z "${GITHUB_TOKEN:-}" ]; then
  usage "mode graft needs a token input (a fine-grained token for the target repository)"
fi
# Report mode never needs a token: do not hand one to crypt.
if [ "$mode" = "report" ]; then unset GITHUB_TOKEN GH_TOKEN || true; fi

TARGET="$(cd "${CRYPT_TARGET:-${GITHUB_WORKSPACE:-.}}" 2>/dev/null && pwd)" || usage "target directory not found"
OUT_DIR="${CRYPT_OUT_DIR:-$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/crypt-action.XXXXXX")}"
mkdir -p "$OUT_DIR"
OUT_DIR="$(cd "$OUT_DIR" && pwd)"
cd "$OUT_DIR" # crypt writes out/, data/ and crypt-audit.log to the current directory: never the repo under test.
if [ -n "${GITHUB_OUTPUT:-}" ]; then echo "dir=${OUT_DIR}/out" >>"$GITHUB_OUTPUT"; fi

CRYPT="${CRYPT_CMD:-node $ROOT/bin/crypt.mjs}"
# The plate has no crypt subcommand: it is scripts/plate.ts (npm run plate).
PLATE="${CRYPT_PLATE_CMD:-$ROOT/node_modules/.bin/tsx $ROOT/scripts/plate.ts}"
FEEDS="${CRYPT_FEEDS_CMD:-npm --prefix $ROOT run --silent feeds:update -- $OUT_DIR/data/feeds}"
mkdir -p out
log="out/action-${mode}.log"
: >"$log"

on_exit() {
  local code=$?
  if [ "$code" -ne 0 ] && [ "${failed_reported:-}" != "1" ]; then
    {
      echo "## CRYPT action FAILED (${mode})"
      echo
      echo "The step stopped with exit code ${code}. This is a failure, not a clean result. See the step log."
    } >>"$SUMMARY"
  fi
}
trap on_exit EXIT

fail() {
  {
    echo "## CRYPT action FAILED (${mode})"
    echo
    echo "$1"
    echo
    echo "This is a failure, not a clean result. Nothing was written to the repository."
  } >>"$SUMMARY"
  failed_reported=1
  echo "action: $1" >&2
  exit 1
}

if [ "$mode" = "graft" ]; then
  export CRYPT_CMD="$CRYPT" CRYPT_FEEDS_CMD="$FEEDS"
  # live-raid.sh keeps its preflight (feeds, exhume, raise) and has no merge call.
  bash "$ROOT/scripts/ci/live-raid.sh" graft "$limb" "$sabotage"
  exit 0
fi

# report mode
# shellcheck disable=SC2086
{ $FEEDS 2>&1 | tee -a "$log"; } || fail "Feed update failed (KEV and EPSS). Without them nothing can be ranked."
# shellcheck disable=SC2086
{ $CRYPT exhume "$TARGET" 2>&1 | tee -a "$log"; } || fail "crypt exhume failed on the checked-out repository."
[ -s out/creature.json ] || fail "crypt exhume wrote no out/creature.json."

# The funnel comes from the creature's own counts. Unparseable or incomplete counts are an unknown state.
funnel="$(node -e '
  const fs = require("fs");
  let c;
  try { c = JSON.parse(fs.readFileSync("out/creature.json", "utf8")).counts; } catch { process.exit(3); }
  const keys = ["findings", "exorcised", "spawned", "unresolved", "unknown"];
  if (!c || typeof c !== "object") process.exit(3);
  for (const k of keys) if (!Number.isInteger(c[k]) || c[k] < 0) process.exit(3);
  process.stdout.write(keys.map((k) => c[k]).join(" "));
')" || fail "out/creature.json is unreadable or has no valid counts."
read -r findings exorcised spawned unresolved unknown <<<"$funnel"

if [ "$alerts" = "issues" ]; then
  # Dry-run only: report mode has no token. The issues are printed to the log and the summary.
  # shellcheck disable=SC2086
  alerts_out="$($CRYPT alerts --format issues 2>>"$log")" || fail "crypt alerts failed."
  printf '%s\n' "$alerts_out" >>"$log"
fi

# shellcheck disable=SC2086
plate="$($PLATE out/creature.json 2>>"$log")" || fail "plate rendering failed."
# Optional history on the crypt-history branch: pull before the autopsy appends this run, push after. Never the default branch.
if [ -n "$history_branch" ]; then
  bash "$ROOT/scripts/ci/history-branch.sh" pull "$history_branch" "${DEFAULT_BRANCH:-}" out/crypt-history.jsonl "$TARGET" || true
fi
# shellcheck disable=SC2086
$CRYPT autopsy 2>&1 | tee -a "$log" || fail "crypt autopsy failed."
if [ -n "$history_branch" ]; then
  bash "$ROOT/scripts/ci/history-branch.sh" push "$history_branch" "${DEFAULT_BRANCH:-}" out/crypt-history.jsonl "$TARGET" || true
fi
[ -s out/autopsy.html ] || fail "crypt autopsy wrote no out/autopsy.html."

{
  echo "## CRYPT report"
  echo
  echo "| Findings | Exorcised | Monsters |"
  echo "| --- | --- | --- |"
  echo "| ${findings} | ${exorcised} | ${spawned} |"
  echo
  echo "${findings} findings, ${exorcised} exorcised as noise, ${spawned} monsters left to fight."
  echo
  echo '```'
  echo "$plate"
  echo '```'
  echo
  if [ "$alerts" = "issues" ]; then
    echo
    echo "### CRYPT alerts (dry-run)"
    echo
    echo '```'
    echo "$alerts_out"
    echo '```'
  fi
  echo
  echo "creature.json, autopsy.html and crypt-history.jsonl are in the workflow artifact. Report mode never writes to the default branch."
} >>"$SUMMARY"

if [ "$unresolved" -gt 0 ] || [ "$unknown" -gt 0 ]; then
  fail "${unresolved} findings unresolved and ${unknown} unknown: the feeds or lookups did not cover everything, so this report cannot be trusted as clean."
fi
