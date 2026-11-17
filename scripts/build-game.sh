#!/usr/bin/env bash
# Compile game/spike.inf to spike.z5 (Z-machine v5) with the Inform 6 compiler.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
rm -f spike.z5
.toolchain/Inform6/inform6 -v5 +include_path=.toolchain/inc game/spike.inf spike.z5
[ -s spike.z5 ] || { echo "build-game: spike.z5 missing or empty" >&2; exit 1; }
