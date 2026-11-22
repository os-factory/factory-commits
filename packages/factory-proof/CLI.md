# `git factory` CLI contract (v0.1)

The `factory-proof` package installs the executable **`git-factory`**, so it runs as `git factory …`. Any other implementation (Go, shell) that follows this contract can replace it. Producers such as harnesses call these commands and parse `--json` output; they never import a library.

General rules:

- Runs in the current repository (`-C <path>` changes it, like git).
- `--json` prints one JSON object on stdout. Human output otherwise. Diagnostics go to stderr.
- Exit codes: `0` success / verified, `1` verification failed (level below `--min-level`, or problems found), `2` usage or environment error (not a repo, bad input, missing tool).
- Never prints secrets or key material. Never makes network calls.

## `git factory attest`

Build a statement from a predicate, wrap it in a DSSE envelope, optionally sign it and write it to a note.

```
git factory attest --predicate <file|-> [--tree <tree-sha> | --rev <rev>] [--commit <sha>]
                   [--repo-url <url>] [--sign-key <ssh-key-path> --signer <principal>]
                   [--write-note <rev>] [--out <file>] [--json]
```

- The tree defaults to the tree of `--rev`, which defaults to `HEAD`. Use `--tree "$(git write-tree)"` before a commit exists.
- `--repo-url` defaults to the `origin` URL with credentials stripped, or `local`. The subject name is `git+<url>`.
- The predicate is validated against the schema before anything is written. An invalid predicate exits `2`.
- `--write-note <rev>` appends the attestation to the note on `<rev>`, de-duplicated by digest. It refuses (exit 2) when the rev's tree differs from the statement's tree.
- `--out` writes the attestation entry (`{predicateType, digest, envelope}`) to a file.
- `--json` output: `{ "digest": "sha256:…", "tree": "…", "attestation": { "predicateType", "digest", "envelope" }, "noteWritten": "<commit sha>" | null }`

## `git factory note add`

```
git factory note add <rev> --attestation <file|->    [--json]
```

Appends an existing attestation entry (as written by `attest --out`) to the note on `<rev>`. It checks the digest and the tree match first. `--json` output: `{ "commit": "…", "added": true|false }` (false when already present).

## `git factory show`

```
git factory show [<rev>] [--json]
```

Prints the note on `<rev>` (default `HEAD`): trailers, attestations with digest, predicate type, run id, verdict, signature count. `--json` output: `{ "commit", "tree", "trailers": {…}, "note": <note document> | null }`

## `git factory verify`

```
git factory verify [<rev> | <rev-range>] [--allowed-signers <file>] [--min-level L0|L1|L2|L3] [--json]
```

Runs the verification procedure (SPEC §9) on one commit (default `HEAD`) or each commit of a range (`A..B`). `--json` output is the **conformance output format**:

```json
{ "commits": [ { "commit": "<sha>", "level": "none|L0|L1|L2|L3", "problems": [ { "code": "TREE_MISMATCH", "message": "…" } ] } ] }
```

Exits `1` when any commit is below `--min-level` (default `L1` for a single rev, `none` for a range) or has problems. Exits `0` otherwise.

### Problem codes (stable)

| Code | Meaning |
|---|---|
| `TRAILER_MALFORMED` | A factory trailer does not match its grammar |
| `NOTE_INVALID_JSON` | The note isn't valid JSON |
| `NOTE_SCHEMA` | The note doesn't match the note schema |
| `DIGEST_MISMATCH` | `attestations[].digest` isn't the SHA-256 of the payload |
| `STATEMENT_INVALID` | The payload isn't a valid statement (bad base64 or JSON, schema failure) |
| `PREDICATE_UNKNOWN` | Unrecognized predicate type (reported, skipped, not fatal on its own) |
| `TREE_MISMATCH` | Statement `gitTree` ≠ commit tree |
| `COMMIT_MISMATCH` | Statement `gitCommit` present and ≠ commit |
| `VERDICT_MISMATCH` | Recorded verdict disagrees with the recomputed one |
| `SIGNATURE_INVALID` | A signature fails verification against the allowed signers |
| `SIGNATURE_UNVERIFIED` | A signature whose scheme can't be checked (reported, not fatal on its own) |
| `TRAILER_ATTESTATION_NOT_FOUND` | A `Factory-Attestation` trailer's digest isn't in the note |

`PREDICATE_UNKNOWN` and `SIGNATURE_UNVERIFIED` are informational: they don't make verify exit `1` on their own.

## `git factory trailers`

```
git factory trailers <message-file> [--work-unit <[source:]id>]... [--run <id>[;trace=<hex>]]
                     [--policy <id[@v]>] [--agent <name[/v][;model=m]>] [--attestation <sha256:…>]
```

Adds trailers in place using `git interpret-trailers`. It validates each value against the SPEC §3 grammar (exit `2` on a bad value), replaces an existing trailer of the same name (except `Work-Unit`, which is added if different), and is idempotent. Built to be called from a `commit-msg` or `prepare-commit-msg` hook.

## `git factory setup`

```
git factory setup [--remote origin] [--json]
```

Idempotently adds `+refs/notes/factory:refs/notes/factory` to the remote's fetch refspecs and sets `notes.rewriteRef refs/notes/factory`. `--undo` removes both.

## `git factory digest`

```
git factory digest <envelope-or-attestation-file|->
```

Prints the statement digest (SPEC §5.2).

## `git factory --version`

Prints `factory-proof <version> (factory-commits v0.1)`.
