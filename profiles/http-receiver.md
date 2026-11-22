# HTTP receiver profile (v0.1, draft)

An open contract for sending proofs to any service (a dashboard, an audit store, a team's own API) at the moment a producer writes them to git. Git stays the ledger; a receiver gets a copy.

## Request

```
POST <receiver URL>
Content-Type: application/vnd.factory-commits.proof+json
<auth headers configured by the user>
```

```json
{
  "type": "https://os-factory.dev/factory-commits/proof/v0.1",
  "repository": "https://github.com/acme/app",
  "commit": "<sha, when known>",
  "tree": "<tree hash>",
  "attestations": [ { "predicateType": "…", "digest": "sha256:…", "envelope": { "…": "…" } } ]
}
```

`attestations[]` entries are exactly the note entries ([SPEC.md §7.2](../SPEC.md)), so a receiver can verify them with the same code as a git-based verifier. `repository` has credentials removed.

## Semantics

- Idempotent by `digest`: receivers MUST accept repeated deliveries of the same attestation.
- The same statement may arrive twice: once at verification time without `commit`, again after the commit with it.
- Success: any `2xx`. Producers SHOULD retry on `429` and `5xx` with backoff and MUST NOT block the developer's workflow on delivery.
- The body carries nothing beyond what the note holds, so the privacy rules of [SPEC.md §6](../SPEC.md) apply unchanged.
