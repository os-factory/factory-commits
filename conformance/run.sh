#!/bin/sh
# Factory Commits conformance runner.
# usage: conformance/run.sh <verifier-executable> [case...]
# Builds each test vector into a temporary directory, runs
#   <verifier> -C <repo> verify <rev> --json [--allowed-signers <file>]
# and compares the level and the set of problem codes with expected.json.
set -eu

if [ $# -lt 1 ]; then
  echo "usage: $0 <verifier-executable> [case...]" >&2
  exit 2
fi
verifier=$1; shift
case $verifier in /*) ;; *) verifier=$(cd "$(dirname "$verifier")" && pwd)/$(basename "$verifier") ;; esac
root=$(cd "$(dirname "$0")/.." && pwd)
cases_dir=$root/test-vectors/cases
for tool in git jq ssh-keygen; do
  command -v "$tool" >/dev/null 2>&1 || { echo "missing tool: $tool" >&2; exit 2; }
done

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT INT TERM

if [ $# -eq 0 ]; then set -- $(ls "$cases_dir"); fi

pass=0; fail=0
printf '%-26s %-16s %-6s %s\n' CASE REV RESULT DETAIL
for name in "$@"; do
  dir=$cases_dir/$name
  out=$work/$name
  mkdir -p "$out"
  if ! "$dir/build.sh" "$out" > "$out/build.log" 2>&1; then
    printf '%-26s %-16s %-6s %s\n' "$name" - FAIL "build.sh failed: $(tail -n 1 "$out/build.log")"
    fail=$((fail + 1)); continue
  fi
  signers=""
  [ -f "$out/allowed_signers" ] && signers=$out/allowed_signers
  for rev in $(jq -r 'keys[]' "$dir/expected.json"); do
    want=$(jq -c --arg r "$rev" '.[$r] | { level, problems: (.problems | unique) }' "$dir/expected.json")
    set +e
    if [ -n "$signers" ]; then
      got=$("$verifier" -C "$out/repo" verify "$rev" --json --allowed-signers "$signers" 2> "$out/stderr")
    else
      got=$("$verifier" -C "$out/repo" verify "$rev" --json 2> "$out/stderr")
    fi
    code=$?
    set -e
    got=$(printf '%s' "$got" | jq -c '.commits[0] | { level, problems: ([.problems[].code] | unique) }' 2>/dev/null || true)
    if [ "$code" -gt 1 ] || [ -z "$got" ]; then
      printf '%-26s %-16s %-6s %s\n' "$name" "$rev" FAIL "exit $code: $(head -n 1 "$out/stderr")"
      fail=$((fail + 1))
    elif [ "$got" = "$want" ]; then
      printf '%-26s %-16s %-6s %s\n' "$name" "$rev" pass "$(printf '%s' "$got" | jq -r '.level + " " + (.problems | join(","))')"
      pass=$((pass + 1))
    else
      printf '%-26s %-16s %-6s %s\n' "$name" "$rev" FAIL "want $want got $got"
      fail=$((fail + 1))
    fi
  done
done
echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
