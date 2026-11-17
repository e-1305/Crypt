# Shared helpers for the Kiro hook scripts. Source it; do not run it.
# Hooks only read and report: nothing here writes, commits or touches the network.

# hook_files [path...]: prints the files to check, one per line, relative to the repo root.
# With arguments it prints them. Without, it reads the Kiro event JSON from STDIN and prints every
# string value that looks like a file path (Kiro passes the saved file path in the event).
hook_files() {
  if [ "$#" -gt 0 ]; then
    printf '%s\n' "$@"
    return
  fi
  [ -t 0 ] && return
  local root; root="$(pwd)/"
  grep -oE '"[^"]+\.(ts|tsx|js|mjs|json|md|html|css)"' 2>/dev/null | tr -d '"' | sed "s#^$root##" | sort -u
}

# hook_expand dir...: prints every regular file under the given directories.
hook_expand() {
  local d
  for d in "$@"; do [ -d "$d" ] && find "$d" -type f -print; done | sort
}
