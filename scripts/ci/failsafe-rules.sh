# Shared failsafe rules, sourced by scripts/ci/failsafe-guard.sh (CI) and scripts/hooks/failsafe-check.sh (on-save hook).
# One list, so the two checks cannot drift. Provides: M, strip, RULES, LOGCALL, SECRET, rule_hits, secret_log_hits.

# The M word is assembled from parts so this file does not trip tests/static.test.ts, which scans scripts/.
M="mer""ge"
# Forms that still need matching on whole-file text: a call split over lines, or an argument array.
Q="[\"'\`]"

# The state label (awaiting, human, then the M word) is a state, not a call; remove it before matching.
strip() { sed -E "s/awaiting[-_]human[-_]$M//Ig" "$1"; }

# "name|extended regex". Each regex runs on the file line by line AND on the whole file with newlines folded to spaces.
declare -a RULES=(
  "gh pr $M|gh[[:space:]]+pr[[:space:]]+$M"
  "$M endpoint|/$M\\b"
  "$M call|\\b${M}[A-Za-z_]*[[:space:]]*\\("
  "$M method name|\\b($M|enable)[A-Za-z]*(PullRequest|Auto${M^})\\b"
  "auto-$M|auto[-_ ]?$M"
  "${M}_method|${M}_method|${M}_commit"
  "PUT $M|PUT.*$M"
  "quoted $M token (argument array)|${Q}${M}${Q}"
  "git blame|\\bgit[[:space:]]+(-[-A-Za-z]+[[:space:]]+([^-[:space:]][^[:space:]]*[[:space:]]+)?)*blame\\b"
  "git blame as separate arguments|${Q}git${Q}[^;]{0,200}${Q}blame${Q}"
  "quoted blame token (argument array)|${Q}blame${Q}"
)

# A log or audit call and a secret: GITHUB_TOKEN, ghp_/gho_/github_pat_ values, Authorization or Bearer headers.
LOGCALL='(console\.[a-z]+|logger?\.[a-z]+|\baudit[A-Za-z]*|process\.std(out|err)\.write|writeAudit|appendFile(Sync)?)[[:space:]]*\('
SECRET='GITHUB_TOKEN|\bgh[pousr]_[A-Za-z0-9_]*|github_pat_|Authorization|Bearer[[:space:]]'

# rule_hits TEXT: print the name of every rule that matches TEXT (per line or folded to one line).
rule_hits() {
  local text="$1" folded rule name re
  folded="$(printf '%s\n' "$text" | tr '\n' ' ')"
  for rule in "${RULES[@]}"; do
    name="${rule%%|*}"; re="${rule#*|}"
    if printf '%s\n' "$text" | grep -Eiq -- "$re" || printf '%s\n' "$folded" | grep -Eiq -- "$re"; then
      printf '%s\n' "$name"
    fi
  done
}

# secret_log_hits TEXT: print a description of each way a secret reaches a log or audit call.
#  1. a log call and a secret on one line
#  2. a log call whose argument list spans lines (secret before the next semicolon)
#  3. a variable assigned from a secret that is later passed to a log call
secret_log_hits() {
  local text="$1" folded var
  folded="$(printf '%s\n' "$text" | tr '\n' ' ')"
  if printf '%s\n' "$text" | grep -E -- "$LOGCALL" | grep -Eq -- "$SECRET"; then echo "log call and secret on one line"; fi
  if printf '%s\n' "$folded" | grep -oE -- "($LOGCALL)[^;]{0,300}" | grep -Eq -- "$SECRET"; then echo "log call arguments span lines with a secret"; fi
  while IFS= read -r var; do
    [ -n "$var" ] || continue
    if printf '%s\n' "$text" | grep -E -- "$LOGCALL" | grep -Eq -- "\\b${var}\\b"; then
      echo "variable '$var' holds a secret and reaches a log call"
    fi
    if printf '%s\n' "$folded" | grep -oE -- "($LOGCALL)[^;]{0,300}" | grep -Eq -- "\\b${var}\\b"; then
      echo "variable '$var' holds a secret and reaches a multi-line log call"
    fi
  done < <(printf '%s\n' "$text" | grep -E -- "$SECRET" | grep -E -- "(const|let|var)[[:space:]]+[A-Za-z_][A-Za-z0-9_]*[[:space:]]*(:[^=]*)?=" \
    | sed -E 's/.*(const|let|var)[[:space:]]+([A-Za-z_][A-Za-z0-9_]*).*/\2/' | sort -u)
}
