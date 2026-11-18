#!/usr/bin/env bash
# Live raid from GitHub Actions: bash scripts/ci/live-raid.sh <mode> <limb> <sabotage>
#   mode     graft | inquisit | reraise
#   limb     LODASH | JQUERY
#   sabotage true | false (true only with mode graft; adds the two demo confirmation flags)
# Exit codes: 0 ok, 1 a crypt command failed, 2 bad arguments (nothing was run).
# The token (GITHUB_TOKEN) is read by crypt from the environment. This script never prints it.
# Tests stub the crypt command with CRYPT_CMD. No merge call exists here: a human lands the PR.
set -euo pipefail

REPO="e-1305/crypt-demo"
URL="https://github.com/${REPO}"
CRYPT="${CRYPT_CMD:-npx --no-install crypt}"
SUMMARY="${GITHUB_STEP_SUMMARY:-/dev/null}"

usage() {
  echo "live-raid: $1" >&2
  echo "usage: live-raid.sh <graft|inquisit|reraise> <LODASH|JQUERY> <true|false>" >&2
  exit 2
}

[ "$#" -eq 3 ] || usage "expected 3 arguments, got $#"
mode="$1"
limb="$2"
sabotage="$3"

case "$mode" in graft | inquisit | reraise) ;; *) usage "unknown mode '${mode:0:20}'" ;; esac
case "$limb" in LODASH | JQUERY) ;; *) usage "unknown limb '${limb:0:20}'" ;; esac
case "$sabotage" in true | false) ;; *) usage "sabotage must be true or false, got '${sabotage:0:20}'" ;; esac
if [ "$sabotage" = "true" ] && [ "$mode" != "graft" ]; then
  usage "sabotage=true only goes with mode graft"
fi

mkdir -p out
log="out/live-raid-${mode}.log"

# Run crypt (word-split on purpose: CRYPT may be 'npx --no-install crypt'), keep the output, fail on error.
run_crypt() {
  # shellcheck disable=SC2086
  $CRYPT "$@" 2>&1 | tee -a "$log"
}

# Field of the newest real PR record for the limb: url, from, to.
pr_field() {
  node -e '
    const fs = require("fs");
    const [limb, field] = process.argv.slice(1);
    let best = "";
    for (const f of fs.existsSync("out/prs") ? fs.readdirSync("out/prs").sort() : []) {
      if (!f.endsWith(".json")) continue;
      try {
        const r = JSON.parse(fs.readFileSync("out/prs/" + f, "utf8"));
        if (r.limb === limb && r.dryRun !== true && typeof r[field] === "string") best = r[field];
      } catch {}
    }
    process.stdout.write(best);
  ' "$limb" "$1"
}

: >"$log"
on_exit() {
  local code=$?
  if [ "$code" -ne 0 ]; then
    {
      echo "## Live raid FAILED: ${mode} ${limb}"
      echo
      echo "crypt stopped with exit code ${code}. Nothing was changed on the limb. See the step log."
    } >>"$SUMMARY"
  fi
}
trap on_exit EXIT
verdict=""
plate=""
title="Live raid: ${mode} ${limb}"
if [ "$sabotage" = "true" ]; then title="Live raid: SABOTAGE ${mode} ${limb}"; fi

case "$mode" in
  graft)
    if [ ! -f out/limbs.json ]; then
      run_crypt exhume "$URL"
      run_crypt raise out/creature.json
    fi
    args=(graft "$limb" --live --target "$URL")
    if [ "$sabotage" = "true" ]; then args+=(--sabotage --i-know-this-is-a-demo); fi
    run_crypt "${args[@]}"
    verdict="pull request opened, wait for the test check, then merge it yourself"
    if [ "$sabotage" = "true" ]; then verdict="SABOTAGE: the pull request carries a failing test on purpose; CI should go red"; fi
    ;;
  inquisit)
    run_crypt inquisit "$limb" --live --repo "$REPO"
    if grep -q "AWAITING_HUMAN_MERGE" "$log"; then
      verdict="test check GREEN: awaiting a human to merge"
    elif grep -q "GRAFT_REJECTED" "$log"; then
      verdict="test check not green: graft REJECTED, the limb stays rotting"
    else
      verdict="no verdict: $(tail -n 1 "$log" | cut -c1-120)"
    fi
    ;;
  reraise)
    run_crypt reraise --live --repo "$REPO"
    grep -v '^healed:' "$log" | sed '/./,$!d' >out/plate.txt || true
    plate="$(cat out/plate.txt)"
    if grep -q "^healed: .*${limb}" "$log"; then
      verdict="${limb} HEALED"
    else
      verdict="${limb} not healed yet (merge the pull request first)"
    fi
    ;;
esac

pr_url="$(pr_field url)"
from="$(pr_field from)"
to="$(pr_field to)"
{
  echo "## ${title}"
  echo
  echo "- Limb: ${limb}"
  echo "- Version: ${from:-unknown} to ${to:-unknown}"
  echo "- Pull request: ${pr_url:-none recorded}"
  echo "- Verdict: ${verdict}"
  if [ "$sabotage" = "true" ]; then
    echo "- SABOTAGE: DEMO ONLY. Close the pull request on GitHub and delete its branch afterwards."
  fi
  if [ -n "$plate" ]; then
    echo
    echo '```'
    echo "$plate"
    echo '```'
  fi
} >>"$SUMMARY"
