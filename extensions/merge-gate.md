# Extension: merge gate (L3), v0.1 draft

The gate is the process that verifies what actually lands on a protected branch (for example a GitHub Action on `push` to `main`, or on `merge_group`). It is the only writer of `refs/notes/factory` on the shared remote.

## Binding a merged commit

When commit `M` lands with tree `T`:

1. **Exact tree match.** If some statement with verdict `pass` has `gitTree == T` (typically from the PR head, when the branch was up to date or the merge queue verified the merge result), the gate copies that envelope into `M`'s note.
2. **No match.** The tree differs from everything verified (the base moved). The gate either re-runs the required stages on `T` and records a new statement, or records nothing and `M` stays below L1. It MUST NOT copy a statement whose tree differs.
3. The gate adds a merge statement: an in-toto Statement with predicate type [`https://slsa.dev/verification_summary/v1`](https://slsa.dev/verification_summary) (VSA), subject `{gitCommit: M, gitTree: T}`, `verificationResult` `PASSED` or `FAILED`, and `inputAttestations` listing the statement digests it relied on. Factory-specific facts go in `predicate.extensions["https://os-factory.dev/factory-commits/merge/v0.1"]`: `{ "prHead": "<sha>", "mergeMethod": "squash|merge|rebase|queue", "treeMatch": true }`.
4. The gate signs the merge statement with an identity agents do not control (CI OIDC or a dedicated key), writes the note and pushes `refs/notes/factory`.

## Merge strategies

| Setup | Result |
|---|---|
| Squash or rebase, branch up to date | Exact tree match. L3 with no re-run |
| Merge queue | The queue verifies the commit that lands. L3 |
| Squash, stale branch, no queue | Re-run on the merged tree, or the commit stays "verified on PR head only" (below L1 on the branch) |

Multi-commit pull requests: the gate's note on `M` lists every passing statement from the PR whose tree equals `T`, and its VSA `inputAttestations` lists all statements from the PR head chain.
