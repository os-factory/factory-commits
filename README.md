# Factory Commits

**Git history that proves what your agents did.**

Factory Commits is an open convention for recording, in git itself, how each change was produced and verified: which work unit it belongs to, which checks ran on the exact tree, and whether they passed. It builds on standards that already exist: git trailers, git notes, [in-toto](https://in-toto.io/) attestations, [DSSE](https://github.com/secure-systems-lab/dsse) envelopes and [OpenTelemetry](https://opentelemetry.io/) semantic conventions.

> **Status: v0.1 draft.** Everything here may change before 1.0. Feedback is welcome in Discussions and issues.

## What's here

| Path | What |
|---|---|
| [`SPEC.md`](SPEC.md) | The core specification |
| [`schemas/`](schemas/) | JSON Schemas for the `factory-run` predicate and the note document |
| [`profiles/telemetry.md`](profiles/telemetry.md) | How OpenTelemetry data correlates with proofs |
| [`test-vectors/`](test-vectors/) · [`conformance/`](conformance/) | Repositories with known answers, and a runner any implementation can use |
| [`packages/factory-proof/`](packages/factory-proof/) | Reference implementation: a TypeScript library and the `git factory` command |
| [`verifiers/sh/`](verifiers/sh/) | A second, minimal verifier using only `git` and `jq` |

## License

Specification text: [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/). Code: [Apache-2.0](LICENSE).
