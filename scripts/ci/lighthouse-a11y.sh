#!/usr/bin/env bash
# Lighthouse accessibility score for the 2D page (?theatre=2d), threshold 0.95 (issue #56).
# Needs _site/ built and a Chrome binary (CHROME_PATH, or the Playwright chromium).
set -euo pipefail
cd "$(dirname "$0")/../.."
port=8765
python3 -m http.server "$port" --bind 127.0.0.1 --directory _site >/dev/null 2>&1 &
srv=$!
trap 'kill $srv 2>/dev/null || true' EXIT
sleep 1
mkdir -p out/visual-qa
npx --yes lighthouse@12 "http://127.0.0.1:$port/?theatre=2d" \
  --only-categories=accessibility --output=json --output-path=out/visual-qa/lighthouse.json \
  --chrome-flags="--headless --no-sandbox --disable-gpu --disable-dev-shm-usage" --quiet
node -e '
const r = JSON.parse(require("fs").readFileSync("out/visual-qa/lighthouse.json", "utf8"));
const s = r.categories.accessibility.score;
console.log("Lighthouse accessibility:", s);
for (const a of Object.values(r.audits)) if (a.score === 0) console.log("  failing:", a.id, a.title);
if (s < 0.95) process.exit(1);'
