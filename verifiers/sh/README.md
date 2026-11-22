# Minimal shell verifier

`git-factory-verify` is a second, independent implementation of the Factory Commits v0.1 verification procedure (SPEC §9), in about 150 lines of POSIX `sh`. It exists to show that the spec is not shaped around one tool: it passes the same [conformance](../../conformance/) vectors as the TypeScript reference implementation.

Needs `git`, `jq`, `base64`, `sha256sum` or `shasum`, and `ssh-keygen` (signatures only). No network.

```sh
verifiers/sh/git-factory-verify -C <repo> verify [<rev>] [--json] [--allowed-signers <file>]
conformance/run.sh verifiers/sh/git-factory-verify
```

Output and exit codes follow the `verify` section of [CLI.md](../../packages/factory-proof/CLI.md): the conformance JSON format with `--json`, exit `1` below L1 or on a non-informational problem, `2` on a usage or environment error.

## What it checks

Trailer grammar (SPEC §3), note JSON and shape, statement digest over the decoded payload, payload type, predicate type, statement fields, tree and commit binding, verdict recomputation, `Factory-Attestation` trailers, and ssh signatures over the DSSE PAE with `ssh-keygen -Y verify -n factory-commits`.

## Gaps (by design)

- **One revision only.** No ranges, no `--min-level`, and none of the producer commands (`attest`, `note add`, `trailers`, `setup`, `show`, `digest`).
- **Partial JSON Schema validation.** Instead of the full schemas it checks, with `jq`: the note's `type`, entry fields, digest pattern and signature `sig`; the statement's `_type`, a single subject with a `git+` name and hex `gitTree` / `gitCommit`; and the predicate's required fields (`run.id`, `policy.required`, `stages[].id` and `status`, `verdict`, `producer`, `environment.trust`). It does not check formats (`uri`, `date-time`), optional fields (`workUnit`, `telemetry`, artifact digests, length limits) or `predicateType` being a URI. A statement that only breaks those rules is accepted here and rejected by factory-proof.
- **Signatures.** Only the `ssh` scheme. Others are reported as `SIGNATURE_UNVERIFIED`.
