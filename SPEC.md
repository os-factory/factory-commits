# Factory Commits v0.1 (draft)

Factory Commits records, in git, how a change was produced and verified. A repository that follows it can answer from `git` alone: *which commits on `main` landed without the required proof, and what verified each of the others?*

> **Draft.** Breaking changes are allowed until 1.0. URIs under `https://os-factory.dev/` are provisional and may change before 1.0.

The key words MUST, MUST NOT, SHOULD, SHOULD NOT and MAY are to be interpreted as in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

## 1. Terms

| Term | Meaning |
|---|---|
| **Work unit** | The reason a change exists: an issue, ticket, incident or request. Identified by an opaque id and an optional source (`github`, `linear`, …). |
| **Factory run** | One execution of verification stages against one git tree. Identified by a run id unique within the repository. |
| **Stage** | One named check inside a run (`typecheck`, `unit`, `browser-e2e`, …). |
| **Policy** | The rule deciding which stages are required. v0.1 records which policy applied; it does not standardize a policy language. |
| **Statement** | An [in-toto Statement v1](https://github.com/in-toto/attestation/blob/main/spec/v1/statement.md) whose predicate is a `factory-run` (§4). |
| **Envelope** | A [DSSE](https://github.com/secure-systems-lab/dsse) envelope carrying a statement, signed or not. |
| **Producer** | A tool that creates statements and writes them to git (a harness, a CI job, a script). |
| **Verifier** | A tool that checks proofs (§7). |
| **Gate** | The process that verifies the commit landing on the protected branch and is the only writer of notes there (§8). |

## 2. Design rules

1. **The tree is the subject.** A statement names the git tree it verified. Squash, rebase and amend often keep the tree, so the proof survives them. The commit is bound by where the note is attached.
2. **Proof attaches after the commit.** A statement about commit X cannot live inside X, because its content would change X's id. Proof lives in git notes.
3. **A trailer is a claim; a signature is proof.** Trailers are written by the author or agent and are untrusted on their own.
4. **Git holds the ledger, not the data.** Statements and summaries go in git. Logs, screenshots and traces stay elsewhere, referenced by digest.
5. **Reuse before invent.** Only the `factory-run` predicate, the trailer names and the note layout are new.

## 3. Commit trailers (L0)

Trailers are standard [git trailers](https://git-scm.com/docs/git-interpret-trailers) at the end of the commit message. All are OPTIONAL. A producer that writes them MUST use this grammar:

| Trailer | Grammar | Example |
|---|---|---|
| `Work-Unit` | `[<source>:]<id>` | `Work-Unit: github:416` |
| `Factory-Run` | `<run-id>[; trace=<32 lowercase hex>]` | `Factory-Run: 01JD4X7Q; trace=4bf92f3577b34da6a3ce929d0e0e4736` |
| `Factory-Policy` | `<policy-id>[@<version>]` | `Factory-Policy: default@3` |
| `Factory-Agent` | `<name>[/<version>][; model=<model>]` | `Factory-Agent: claude-code/2.1; model=claude-opus-5-5` |
| `Factory-Attestation` | `sha256:<64 lowercase hex>` | `Factory-Attestation: sha256:9f2c…` |

- `<source>` matches `[a-z0-9][a-z0-9-]*`. When a `Work-Unit` value contains `:`, everything before the first `:` is the source.
- `<id>`, `<run-id>`, `<policy-id>`, `<name>` and `<model>` contain no whitespace and no `;`.
- `Factory-Attestation` is the statement digest (§5.2) of a statement whose subject tree equals the commit's tree.
- A commit MAY carry several `Work-Unit` trailers. It SHOULD carry at most one of each other trailer.

## 4. The `factory-run` predicate

Predicate type: `https://os-factory.dev/factory-commits/factory-run/v0.1`

Schema: [`schemas/factory-run.predicate.schema.json`](schemas/factory-run.predicate.schema.json). Example: [`schemas/examples/factory-run.statement.json`](schemas/examples/factory-run.statement.json).

### 4.1 Statement

```json
{
  "_type": "https://in-toto.io/Statement/v1",
  "subject": [{ "name": "git+https://github.com/acme/app", "digest": { "gitTree": "<40 or 64 hex>" } }],
  "predicateType": "https://os-factory.dev/factory-commits/factory-run/v0.1",
  "predicate": { "…": "§4.2" }
}
```

- `subject` MUST contain exactly one entry.
- `subject[0].digest.gitTree` is REQUIRED: the tree hash the run verified.
- `subject[0].digest.gitCommit` is OPTIONAL. Producers that build the statement before the commit exists omit it.
- `subject[0].name` SHOULD be `git+<repository URL>` with credentials removed. When there is no remote, it MUST be `git+local`.

### 4.2 Predicate fields

| Field | Req. | Meaning |
|---|---|---|
| `run.id` | MUST | Factory run id. Equals the `Factory-Run` trailer value without parameters |
| `run.startedOn`, `run.finishedOn` | SHOULD | RFC 3339 timestamps |
| `workUnit.id` | SHOULD | Work unit id. Equals the `Work-Unit` trailer's `<id>` |
| `workUnit.source` | MAY | Work unit source |
| `workUnit.attemptId` | MAY | Producer-specific attempt id |
| `workUnit.url`, `workUnit.title` | MAY | Privacy-sensitive (§6) |
| `policy.id` | SHOULD | Policy id |
| `policy.version`, `policy.digest` | MAY | Version string and/or `{ "sha256": … }` of the policy file |
| `policy.required` | MUST | Ids of the stages the policy required. MAY be empty |
| `stages[]` | MUST | Stages that ran or were deliberately skipped |
| `stages[].id` | MUST | Stage id, unique in the run |
| `stages[].status` | MUST | `passed`, `failed`, `error` or `skipped` |
| `stages[].addedBy` | SHOULD | `policy` (required by policy) or `agent` (added beyond policy) |
| `stages[].kind` | MAY | Free-form category, e.g. `build`, `test`, `verify` |
| `stages[].durationMs` | MAY | Non-negative integer |
| `stages[].artifacts[]` | MAY | `{ "name", "digest": { "sha256" }, "uri"? }`. The digest is the proof; the uri is a hint |
| `verdict` | MUST | `pass` or `fail` (§4.3) |
| `producer.name`, `producer.version` | MUST | The tool that built the statement, e.g. `har` / `2.0.0` |
| `agent.name`, `agent.version`, `agent.model` | MAY | The coding agent that made the change |
| `environment.trust` | MUST | `local` (a developer or agent machine) or `ci` (a runner the agent does not control) |
| `environment.executor` | MAY | e.g. `local`, `github-actions` |
| `telemetry.traceId`, `telemetry.spanId` | MAY | OTel ids of the run span ([telemetry profile](profiles/telemetry.md)) |

Unknown fields MUST be ignored by verifiers. Producers MAY add fields under `extensions.<reverse-dns or URL>`.

### 4.3 Verdict rule

`verdict` MUST be `pass` if and only if every id in `policy.required` appears in `stages` with `status: passed`. A verifier MUST recompute the verdict and reject a statement whose `verdict` disagrees.

## 5. Envelopes and digests

### 5.1 Envelope

A statement is stored in a DSSE envelope with `payloadType: "application/vnd.in-toto+json"` and `payload` the base64 of the statement's UTF-8 JSON bytes. `signatures` MAY be empty (an unsigned envelope, level L1).

### 5.2 Statement digest

The **statement digest** is `sha256:` followed by the lowercase hex SHA-256 of the decoded `payload` bytes. It identifies the statement independently of its signatures: adding a signature never changes it. The `Factory-Attestation` trailer, the note's `attestations[].digest` and the telemetry attribute `factory.attestation.digest` all carry this value.

Producers MUST NOT re-serialize a payload after computing its digest. Verifiers MUST hash the payload bytes as stored.

### 5.3 Signatures (L2)

v0.1 defines one signature scheme that needs nothing beyond git's own tooling:

- **`ssh`:** `sig` is the armored output of `ssh-keygen -Y sign -n factory-commits -f <key>` over the DSSE pre-authentication encoding (PAE) of the envelope; `keyid` is the signer principal. Verify with `ssh-keygen -Y verify -n factory-commits -I <principal> -f <allowed_signers>` over the same PAE bytes.

Other schemes (Sigstore keyless for CI) are extensions. A verifier MUST report a signature it cannot check as unverified, never as valid.

## 6. Privacy

History is permanent and often public.

- Statements, notes and trailers MUST NOT contain prompts, transcripts, file contents, diffs, secrets, credentials, email addresses or absolute local file paths.
- `workUnit.url`, `workUnit.title`, artifact `uri`s and `agent.model` MAY be omitted. Producers SHOULD make them opt-in for public repositories.
- Cost and token counts are not part of the predicate. Producers MAY put them in the note `summary` (§7.2) as opt-in.

## 7. Notes (L1)

### 7.1 Ref and placement

Proofs live in the notes ref **`refs/notes/factory`**. The note attached to a commit holds every envelope that applies to that commit. A note MUST be attached only to a commit whose tree equals the `gitTree` of each statement it contains, except for merge statements (§8).

Producers SHOULD configure, once per clone:

```sh
git config --add remote.origin.fetch '+refs/notes/factory:refs/notes/factory'
git config notes.rewriteRef refs/notes/factory   # keep notes across rebase / amend
```

### 7.2 Note document

A note is one UTF-8 JSON object. Schema: [`schemas/note.schema.json`](schemas/note.schema.json).

```json
{
  "type": "https://os-factory.dev/factory-commits/note/v0.1",
  "attestations": [
    { "predicateType": "https://os-factory.dev/factory-commits/factory-run/v0.1",
      "digest": "sha256:…",
      "envelope": { "payloadType": "application/vnd.in-toto+json", "payload": "…", "signatures": [] } }
  ],
  "summary": { "verdict": "pass" }
}
```

- `attestations[].digest` MUST equal the statement digest of its envelope.
- Writers MUST read the existing note, append new attestations, de-duplicate by `digest`, and write the result. They MUST NOT drop attestations they did not create.
- `summary` is OPTIONAL and untrusted: a convenience for humans and dashboards.

### 7.3 Single writer on shared branches

Only the gate (§8) SHOULD push `refs/notes/factory` to a shared remote. Local producers write notes for their own commits. Proofs reach the gate through the pull request, CI artifacts or the gate re-running the stages.

## 8. Levels

| Level | Name | A commit is at this level when… |
|---|---|---|
| **L0** | Linked | It has a well-formed `Work-Unit` or `Factory-Run` trailer |
| **L1** | Recorded | Its note holds a valid statement whose subject tree equals the commit's tree, with verdict `pass` |
| **L2** | Signed | L1, and that envelope has at least one signature valid for a trusted signer |
| **L3** | Gated | L2, and a statement from a trusted gate binds the merged commit (see [extensions/merge-gate.md](extensions/merge-gate.md)) |

Levels are reported per commit. A repository's level for a range is the lowest level of its commits.

## 9. Verification procedure

Given a commit `C` with tree `T`:

1. Parse trailers. A malformed factory trailer is a **problem**. Record whether `C` reaches L0.
2. Read the note on `C` in `refs/notes/factory`. If there is none, stop at L0 (or "none").
3. Validate the note against the schema. For each attestation:
   1. Recompute the statement digest from the envelope payload. It MUST equal `digest`.
   2. Decode the statement and validate it. `predicateType` MUST be recognized; other predicate types are reported and skipped.
   3. `subject[0].digest.gitTree` MUST equal `T`. If `gitCommit` is present, it MUST equal `C`.
   4. Recompute the verdict (§4.3).
4. `C` is L1 if at least one attestation passes step 3 with verdict `pass`.
5. If trusted signers are configured, check signatures (§5.3). `C` is L2 if a passing attestation carries a valid trusted signature.
6. If `C` has a `Factory-Attestation` trailer, its value MUST equal the digest of an attestation in the note. Otherwise it's a problem.

A repository audit is this procedure over `git rev-list` of a range.

## 10. Conformance

An implementation conforms to v0.1 when it produces the expected results for every case in [`test-vectors/`](test-vectors/), run with [`conformance/`](conformance/). Producers MUST emit statements and notes that validate against the schemas. Verifiers MUST report the same level and problem codes as the test vectors.

## Appendix: telemetry

How OpenTelemetry data correlates with proofs is defined in the [telemetry profile](profiles/telemetry.md). A verifier never needs telemetry.
