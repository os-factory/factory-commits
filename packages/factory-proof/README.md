# factory-proof

Reference implementation of [Factory Commits v0.1](../../SPEC.md): a small TypeScript library and the **`git factory`** command. It writes and verifies proofs in git (trailers, `refs/notes/factory`, in-toto statements in DSSE envelopes, ssh signatures) and reports levels L0–L2.

- The command-line contract is [CLI.md](CLI.md). Tools that integrate with Factory Commits should call `git factory … --json` rather than import this library.
- Pure and local: no network calls, no telemetry. Runtime dependencies: `ajv` and `ajv-formats`. External tools: `git`, and `ssh-keygen` for signatures.
- Node.js 20 or later.

## Install

```sh
npm install -g @osfactory/factory-proof
git factory --version     # factory-proof <version> (factory-commits v0.1)
```

From a checkout of this repository instead:

```sh
cd packages/factory-proof
npm ci
npm run build
npm install -g .          # links the git-factory executable; or: npm link
```

`npm install -g .` links to the checkout, so keep it (and rebuild after pulling). For a copy that does not depend on the checkout, install a tarball instead: `npm install -g "$(npm pack --silent)"`.

Releases are described in [RELEASING.md](../../RELEASING.md) and listed in [CHANGELOG.md](CHANGELOG.md).

## Quick start

```sh
git factory setup                                  # fetch refspec + notes.rewriteRef, once per clone
git factory trailers .git/COMMIT_EDITMSG --work-unit github:416 --run 01JD4X7Q   # e.g. from a commit-msg hook
git commit ...
git factory attest --predicate run.json --write-note HEAD        # record a factory-run statement (L1)
git factory attest --predicate run.json --sign-key ~/.ssh/id_ed25519 --signer dev@example.org --write-note HEAD   # L2
git factory verify --allowed-signers .factory/allowed_signers --json
git factory verify origin/main~20..origin/main     # audit a range
```

`run.json` is a `factory-run` predicate (see [`schemas/examples/`](../../schemas/examples/factory-run.statement.json)). Before a commit exists, use `--tree "$(git write-tree)" --out att.json`, then `git factory note add HEAD --attestation att.json` after committing.

## Library

```ts
import { verifyCommit, attest, statementDigest, pae } from "@osfactory/factory-proof";
```

Modules: `trailers` (SPEC §3 grammar, `git interpret-trailers`), `statement` (builder, verdict rule), `dsse` (PAE, envelope, statement digest), `note` (read, merge, de-duplicate, write), `ssh` (`ssh-keygen -Y sign|verify -n factory-commits`), `verify` (SPEC §9 and problem codes), `setup`.

## Implementation choices

Where SPEC v0.1 leaves room, this implementation does the following. Other implementations must match the first three to pass [conformance](../../conformance/).

- **Check order.** Each attestation is checked in this order and stops at its first failure: base64 → digest → payload type, JSON → predicate type → statement schema → tree → commit → verdict. One problem per attestation.
- **Levels.** L1 does not require L0: a commit with a valid note but no trailers is L1. Problems do not lower the level; they make `verify` exit `1`.
- **Signatures.** `sig` is the base64 of the armored `ssh-keygen` signature (DSSE requires base64); a raw armored value is also accepted. Signatures are checked only with `--allowed-signers`, only on attestations that passed every check. A signature whose key is not in the allowed signers, has no `keyid`, or uses another `scheme` is `SIGNATURE_UNVERIFIED`; a known key that does not verify is `SIGNATURE_INVALID`.
- **Same digest, new signatures.** Appending an attestation whose digest is already in the note adds its new signatures to the existing entry instead of dropping them.
- **Subject name.** Credentials are stripped; `user@host:path` becomes `ssh://host/path`; a remote that is a local path becomes `git+local` (SPEC §6 forbids local paths).
- **L3** (merge gate) is not implemented in v0.1; merge statements are reported as `PREDICATE_UNKNOWN`.

## Development

```sh
npm ci
npm run typecheck
npm test        # builds, then runs vitest against real temporary git repositories
```

The JSON Schemas are copied from the repository's [`schemas/`](../../schemas/) at build time (`npm run schemas`); never edit a copy.
