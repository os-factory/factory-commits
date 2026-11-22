# Conformance

An implementation conforms to Factory Commits v0.1 when it gives the expected result for every case in [`test-vectors/`](../test-vectors/) (SPEC §10).

```sh
conformance/run.sh <verifier-executable> [case...]
```

Requirements: POSIX `sh`, `git`, `jq`, `ssh-keygen`, `base64`, and `sha256sum` or `shasum`.

## Contract for a verifier

The runner calls, for each revision listed in a case's `expected.json`:

```
<verifier> -C <repo> verify <rev> --json [--allowed-signers <file>]
```

- `-C <repo>`: the repository to read (like `git -C`).
- `<rev>`: any git revision (`HEAD`, a tag name).
- `--allowed-signers <file>`: an ssh `allowed_signers` file, passed only when the case built one. Without it, the verifier must not check signatures.
- Exit status `0` or `1`. Status `2` or more counts as a failure.
- Stdout: one JSON object in the conformance output format of [CLI.md](../packages/factory-proof/CLI.md#git-factory-verify):

```json
{ "commits": [ { "commit": "<sha>", "level": "none|L0|L1|L2|L3", "problems": [ { "code": "TREE_MISMATCH", "message": "…" } ] } ] }
```

The runner compares `level` and the **set** of problem `code`s of `commits[0]`. Messages, ordering and duplicate codes are not compared.

## Rules the vectors pin down

Where SPEC v0.1 leaves a choice, the vectors expect:

- Each attestation is checked in SPEC §9 order and contributes at most one problem: its first failure among base64 / digest / payload type and JSON / predicate type / statement schema / tree / commit / verdict.
- L1 does not require L0. Problems do not lower the level.
- Signatures are checked only on attestations that passed every check. A key absent from `allowed_signers` (or an unknown `scheme`) is `SIGNATURE_UNVERIFIED`; a listed key whose signature fails is `SIGNATURE_INVALID`.
- DSSE `sig` holds the base64 of the armored `ssh-keygen -Y sign -n factory-commits` output over the PAE.

## Test vectors

Each `test-vectors/cases/<case>/` has:

- `build.sh <out-dir>`: builds `<out-dir>/repo` deterministically (fixed names, emails and dates, so commit ids are stable), and `<out-dir>/allowed_signers` when the case is about signatures (keys are generated at build time).
- `expected.json`: `{ "<rev>": { "level": "…", "problems": ["CODE", …] } }`.

Builders use only `sh`, `git`, `jq` and `ssh-keygen` through [`test-vectors/lib.sh`](../test-vectors/lib.sh). They never call an implementation, so the vectors test implementations rather than mirror one.

| Case | Revisions | Expected |
|---|---|---|
| `no-proof` | HEAD | none |
| `l0-trailers` | HEAD | L0 |
| `l1-valid` | HEAD, `no-trailers` | L1 |
| `tree-mismatch` | HEAD | L0, `TREE_MISMATCH` |
| `commit-mismatch` | HEAD | L0, `COMMIT_MISMATCH` |
| `digest-mismatch` | HEAD | L0, `DIGEST_MISMATCH` |
| `verdict-mismatch` | HEAD | L0, `VERDICT_MISMATCH` |
| `statement-invalid` | HEAD | L0, `STATEMENT_INVALID` |
| `note-invalid-json` | HEAD | L0, `NOTE_INVALID_JSON` |
| `note-schema` | HEAD | L0, `NOTE_SCHEMA` |
| `malformed-trailer` | HEAD, `only-malformed` | L0 / none, `TRAILER_MALFORMED` |
| `attestation-not-in-note` | HEAD, `in-note` | L1, `TRAILER_ATTESTATION_NOT_FOUND` / L1 |
| `unknown-predicate` | HEAD | L1, `PREDICATE_UNKNOWN` |
| `rewrite-keeps-tree` | `amended`, `squashed` | L1 (note carried by `notes.rewriteRef` and `git notes copy`) |
| `l2-signed` | HEAD | L2 |
| `l2-tampered` | HEAD | L1, `SIGNATURE_INVALID` |
| `signature-unverified` | HEAD | L1, `SIGNATURE_UNVERIFIED` |

## Running the known implementations

```sh
(cd packages/factory-proof && npm ci && npm run build)
conformance/run.sh packages/factory-proof/dist/cli.js
```

Adding a case: create `test-vectors/cases/<name>/build.sh` and `expected.json`, then make every implementation pass.
