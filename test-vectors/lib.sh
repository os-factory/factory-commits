# Shared helpers for test-vectors/cases/*/build.sh. POSIX sh + git + jq (+ ssh-keygen).
# Builders write notes with these helpers, not with any Factory Commits implementation,
# so the vectors stay independent of the code they test.
set -eu

export GIT_AUTHOR_NAME="Factory Vectors" GIT_AUTHOR_EMAIL="vectors@example.invalid"
export GIT_COMMITTER_NAME="Factory Vectors" GIT_COMMITTER_EMAIL="vectors@example.invalid"
export GIT_AUTHOR_DATE="2026-01-01T00:00:00Z" GIT_COMMITTER_DATE="2026-01-01T00:00:00Z"
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 TZ=UTC LC_ALL=C

FC_NOTE_TYPE="https://os-factory.dev/factory-commits/note/v0.1"
FC_PREDICATE_TYPE="https://os-factory.dev/factory-commits/factory-run/v0.1"
FC_PAYLOAD_TYPE="application/vnd.in-toto+json"

# fc_init <out-dir>: creates <out-dir>/repo and cds into it.
fc_init() {
  FC_OUT=$(cd "$1" && pwd)
  git init -q -b main "$FC_OUT/repo"
  cd "$FC_OUT/repo"
}

# fc_commit <file> <content> <message>
fc_commit() {
  printf '%s\n' "$2" > "$1"
  git add "$1"
  printf '%s\n' "$3" | git commit -q -F -
}

fc_tree() { git rev-parse "${1:-HEAD}^{tree}"; }
fc_rev() { git rev-parse "${1:-HEAD}"; }

fc_sha256() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum | cut -d' ' -f1; else shasum -a 256 | cut -d' ' -f1; fi
}
fc_b64() { base64 | tr -d '\n'; }

# fc_predicate [jq-filter]: a passing factory-run predicate, optionally transformed.
fc_predicate() {
  jq -cn '{
    run: { id: "01JD4X7Q", startedOn: "2026-01-01T00:00:00Z", finishedOn: "2026-01-01T00:05:00Z" },
    workUnit: { id: "416", source: "github" },
    policy: { id: "default", version: "3", required: ["typecheck", "unit"] },
    stages: [
      { id: "typecheck", kind: "verify", addedBy: "policy", status: "passed", durationMs: 1200 },
      { id: "unit", kind: "test", addedBy: "policy", status: "passed", durationMs: 5300 },
      { id: "perf", kind: "verify", addedBy: "agent", status: "passed" }
    ],
    verdict: "pass",
    producer: { name: "test-vectors", version: "0.1" },
    environment: { trust: "local", executor: "local" }
  }' | jq -c "${1:-.}"
}

# fc_statement <tree> [commit|""] [predicate-json] [predicate-type]: compact statement JSON.
fc_statement() {
  jq -cn --arg tree "$1" --arg commit "${2:-}" --argjson pred "${3:-$(fc_predicate)}" \
    --arg type "${4:-$FC_PREDICATE_TYPE}" '{
    _type: "https://in-toto.io/Statement/v1",
    subject: [{ name: "git+local", digest: ({ gitTree: $tree } + (if $commit == "" then {} else { gitCommit: $commit } end)) }],
    predicateType: $type,
    predicate: $pred
  }'
}

# fc_digest <statement-json>: the statement digest of the payload bytes (no trailing newline).
fc_digest() { printf 'sha256:%s' "$(printf '%s' "$1" | fc_sha256)"; }

# fc_entry <statement-json>: an unsigned note entry for it.
fc_entry() {
  jq -cn --arg type "$(printf '%s' "$1" | jq -r .predicateType)" --arg digest "$(fc_digest "$1")" \
    --arg payload "$(printf '%s' "$1" | fc_b64)" --arg pt "$FC_PAYLOAD_TYPE" \
    '{ predicateType: $type, digest: $digest, envelope: { payloadType: $pt, payload: $payload, signatures: [] } }'
}

# fc_pae <payload-file>: the DSSE pre-authentication encoding of a payload.
fc_pae() {
  printf 'DSSEv1 %s %s %s ' "${#FC_PAYLOAD_TYPE}" "$FC_PAYLOAD_TYPE" "$(wc -c < "$1" | tr -d ' ')"
  cat "$1"
}

# fc_keygen <name>: an ed25519 key in the output dir; appends it to allowed_signers as <name>.
fc_keygen() {
  ssh-keygen -q -t ed25519 -N '' -C '' -f "$FC_OUT/$1.key"
  printf '%s %s\n' "$1" "$(cat "$FC_OUT/$1.key.pub")" >> "$FC_OUT/allowed_signers"
}

# fc_sign <entry-json> <key-name> [file-to-sign-instead-of-the-PAE]: the entry with an ssh signature added.
fc_sign() {
  tmp=$(mktemp -d)
  printf '%s' "$1" | jq -r .envelope.payload | base64 -d > "$tmp/payload"
  if [ -n "${3:-}" ]; then cp "$3" "$tmp/data"; else fc_pae "$tmp/payload" > "$tmp/data"; fi
  ssh-keygen -q -Y sign -n factory-commits -f "$FC_OUT/$2.key" "$tmp/data" 2>/dev/null
  sig=$(fc_b64 < "$tmp/data.sig")
  rm -rf "$tmp"
  printf '%s' "$1" | jq -c --arg k "$2" --arg s "$sig" '.envelope.signatures += [{ keyid: $k, sig: $s }]'
}

# fc_note <rev> <entry-json>...: writes a note holding these entries.
fc_note() {
  rev=$1; shift
  printf '%s\n' "$@" | jq -s --arg t "$FC_NOTE_TYPE" '{ type: $t, attestations: . }' \
    | git notes --ref=refs/notes/factory add -f -F - "$rev"
}

# fc_raw_note <rev> <text>: writes arbitrary note content.
fc_raw_note() { printf '%s\n' "$2" | git notes --ref=refs/notes/factory add -f -F - "$1"; }
