#!/usr/bin/env bash
# Build the Inform 6 compiler, Inform 6 library and dfrotz into .toolchain/ (git-ignored).
# Idempotent: exits early when all three outputs exist. Needs git, make, a C compiler, network.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TC="$ROOT/.toolchain"

INFORM_REV=624aabb   # Inform 6 compiler 6.45
LIB_REV=33aebe6      # Inform 6 standard library 6.12.2
FROTZ_REV=fe66e2e    # Frotz / dfrotz 2.44

if [ -x "$TC/Inform6/inform6" ] && [ -x "$TC/frotz/dfrotz" ] && [ -f "$TC/inc/Parser.h" ]; then
  exit 0
fi

mkdir -p "$TC"

fetch() { # name url rev
  if [ ! -d "$TC/$1/.git" ]; then
    git clone --quiet "$2" "$TC/$1"
  fi
  git -C "$TC/$1" checkout --quiet "$3"
}

fetch Inform6 https://github.com/DavidKinder/Inform6.git "$INFORM_REV"
fetch lib https://github.com/DavidGriffith/inform6lib.git "$LIB_REV"
fetch frotz https://github.com/DavidGriffith/frotz.git "$FROTZ_REV"

make -C "$TC/Inform6" -s
# The compiler binary is built as ./inform
if [ ! -x "$TC/Inform6/inform6" ]; then
  cp "$TC/Inform6/inform" "$TC/Inform6/inform6"
fi

# frotz 2.44 does not link with modern GCC without -fcommon (design.md L4)
make -C "$TC/frotz" -s dfrotz CFLAGS="-O2 -fcommon"

# Library includes use mixed case, files are lowercase (design.md L6)
rm -rf "$TC/inc"
mkdir -p "$TC/inc"
for f in "$TC"/lib/*.h; do
  b="$(basename "$f")"
  ln -s "../lib/$b" "$TC/inc/$b"
  cap="$(echo "${b:0:1}" | tr a-z A-Z)${b:1}"
  [ "$cap" = "$b" ] || ln -s "../lib/$b" "$TC/inc/$cap"
done
ln -sf "../lib/verblib.h" "$TC/inc/VerbLib.h"
echo "tools ready in $TC"
