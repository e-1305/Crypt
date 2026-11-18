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
# KEV and EPSS feeds. Without them exhume cannot rank, every finding stays unresolved and nothing spawns.
FEEDS="${CRYPT_FEEDS_CMD:-npm run --silent feeds:update}"
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

# Field of the newest real PR record for the limb: url, from, to. Rejected records count too:
# inquisit archives a red graft to out/prs/rejected/. Newest means latest modification time.
pr_field() {
  node -e '
    const fs = require("fs");
    const [limb, field] = process.argv.slice(1);
    const files = [];
    for (const dir of ["out/prs", "out/prs/rejected"]) {
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir).sort()) {
        if (f.endsWith(".json")) files.push({ p: dir + "/" + f, t: fs.statSync(dir + "/" + f).mtimeMs });
      }
    }
    files.sort((a, b) => a.t - b.t);
    let best = "";
    for (const { p } of files) {
      try {
        const r = JSON.parse(fs.readFileSync(p, "utf8"));
        if (r.limb === limb && r.dryRun !== true && typeof r[field] === "string") best = r[field];
      } catch {}
    }
    process.stdout.write(best);
  ' "$limb" "$1"
}

# True when the run state already records the limb as healed (by this run or an earlier one).
limb_healed() {
  node -e '
    try {
      const s = JSON.parse(require("fs").readFileSync("out/state.json", "utf8"));
      process.exit(s.limbs && s.limbs[process.argv[1]] && s.limbs[process.argv[1]].state === "healed" ? 0 : 1);
    } catch { process.exit(1); }
  ' "$limb"
}

: >"$log"
on_exit() {
  local code=$?
  if [ "$code" -ne 0 ]; then
    {
      echo "## Live raid FAILED: ${mode} ${limb}"
      echo
      echo "crypt stopped with exit code ${code}. Check the repository for an open pull request, then see the step log."
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
    # Always rebuild the limb table from the repository as it is now: a table restored from an
    # earlier run may be stale or empty. Pull request records in out/prs/ are kept.
    # shellcheck disable=SC2086
    $FEEDS 2>&1 | tee -a "$log"
    run_crypt exhume "$URL"
    run_crypt raise out/creature.json
    args=(graft "$limb" --live --target "$URL")
    if [ "$sabotage" = "true" ]; then args+=(--sabotage --i-know-this-is-a-demo); fi
    run_crypt "${args[@]}"
    # Fail-safe: a graft that opened nothing is a failed step, never a green run.
    if ! grep -qE "PR_OPENED|PR_EXISTS" "$log"; then
      outcome="$(grep -oE "REJECTED_[A-Z_]+|REFUSED_[A-Z_]+|NO_FIX_AVAILABLE|RAID_LIMIT|ERROR" "$log" | tail -n 1)"
      {
        echo "## Live raid: graft ${limb} opened no pull request"
        echo
        echo "- Outcome: ${outcome:-none reported}"
        echo "- Nothing was written to ${REPO}. See the step log."
      } >>"$SUMMARY"
      echo "live-raid: graft ${limb} opened no pull request (${outcome:-no outcome})" >&2
      trap - EXIT
      exit 1
    fi
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
    if grep -q '^reraise: ' "$log"; then
      verdict="$(grep '^reraise: ' "$log" | tail -n 1 | cut -c1-160)"
    else
      # The plate is everything after the healed: line, so stderr warnings stay out of it.
      sed -n '/^healed:/,$p' "$log" | sed '1d' | sed '/./,$!d' >out/plate.txt || true
      plate="$(cat out/plate.txt)"
      if grep -q "^healed: .*${limb}" "$log" || limb_healed; then
        verdict="${limb} HEALED"
      else
        verdict="${limb} not healed yet (merge the pull request first)"
      fi
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
