# Telemetry correlation profile (v0.1, draft)

How OpenTelemetry data links to Factory Commits proofs. A producer that follows this profile lets any OTel backend (a Collector, Langfuse, Datadog, Grafana, …) answer: *which agent sessions, verification runs and proofs belong to this work unit, and to this git tree?*

The key words MUST, SHOULD and MAY are used as in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

## Principles

1. **Reuse OpenTelemetry semantic conventions first.** `vcs.*`, `cicd.*` and `gen_ai.*` names are used wherever they exist. `factory.*` names cover only what OTel has no name for yet; they are candidates for upstream proposals.
2. **The correlation keys are the ones in the proof.** A work unit id, run id and tree hash in telemetry are byte-for-byte the values in the commit trailers and the `factory-run` statement ([SPEC.md](../SPEC.md)).
3. **No content.** Attributes in this profile never carry prompts, transcripts, file contents, secrets or absolute local paths.

## Correlation keys

| Key | Attribute | Same value as |
|---|---|---|
| Work unit | `factory.work_unit.id` | `Work-Unit` trailer, `predicate.workUnit.id` |
| Work unit source | `factory.work_unit.source` | `predicate.workUnit.source` |
| Attempt | `factory.attempt.id` | `predicate.workUnit.attemptId` |
| Factory run (verification) | `factory.run.id` **and** `cicd.pipeline.run.id` | `Factory-Run` trailer, `predicate.run.id` |
| Git tree | `factory.git.tree` | statement `subject[].digest.gitTree` |
| Git commit | `vcs.ref.head.revision` | statement `subject[].digest.gitCommit`, the commit carrying the note |
| Attestation | `factory.attestation.digest` | `Factory-Attestation` trailer, note `attestations[].digest` |
| Repository | `vcs.repository.url.full` | statement `subject[].name` (without the `git+` prefix) |
| Branch | `vcs.ref.head.name` | — |

## Resource attributes (agent sessions)

A producer that launches or wraps a coding agent (a harness, a hook adapter) SHOULD put these on the OTel Resource of everything the session emits. The simplest carrier is `OTEL_RESOURCE_ATTRIBUTES` in the agent's environment.

| Attribute | Requirement | Notes |
|---|---|---|
| `factory.work_unit.id` | SHOULD, when a work unit is bound | |
| `factory.work_unit.source` | MAY | Tracker name, e.g. `github`, `linear`, `jira` |
| `factory.attempt.id` | SHOULD, when known | |
| `vcs.repository.url.full` | SHOULD | Credentials MUST be stripped |
| `vcs.ref.head.name` | SHOULD | |
| `factory.producer.name` | SHOULD | The harness or tool that set these, e.g. `har` |
| `factory.producer.version` | SHOULD | |

Span-level `gen_ai.*` attributes (model, tokens, agent name, conversation id) follow the [OTel GenAI conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/) unchanged.

## Verification spans

A producer that runs verification stages SHOULD emit one span per run and one child span per stage, following the [OTel CI/CD span conventions](https://opentelemetry.io/docs/specs/semconv/cicd/cicd-spans/). Check the current names before implementing: the CI/CD conventions are still in development.

**Run span** (one per factory run)

| Attribute | Value |
|---|---|
| `cicd.pipeline.name` | Policy or pipeline name, e.g. `har verify` |
| `cicd.pipeline.run.id` | The factory run id |
| `cicd.pipeline.result` | `success`, `failure`, `error`, `timeout`, `cancellation` or `skip` |
| `factory.run.id` | The factory run id (same as above, for backends that index only `factory.*`) |
| `factory.git.tree` | Tree hash the run verified |
| `factory.policy.id` | Policy id, when one applies |
| `factory.verdict` | `pass` or `fail`, the predicate verdict |
| `factory.attestation.digest` | Digest of the statement built for this run, when one was built |
| `vcs.ref.head.revision` | Commit, when the run verified a commit |

**Stage span** (child of the run span, one per stage)

| Attribute | Value |
|---|---|
| `cicd.pipeline.task.name` | Stage id, the same as `predicate.stages[].id` |
| `cicd.pipeline.task.run.id` | Unique id for this stage execution |
| `cicd.pipeline.task.run.result` | Same values as `cicd.pipeline.result` |
| `cicd.pipeline.task.type` | `build`, `test` or `deploy` when it fits; omitted otherwise |
| `factory.stage.added_by` | `policy` or `agent` |

The work unit and attempt attributes from the Resource table above apply to verification spans too.

### Result mapping

| `predicate.stages[].status` | `cicd.pipeline.task.run.result` |
|---|---|
| `passed` | `success` |
| `failed` | `failure` |
| `error` | `error` |
| `skipped` | `skip` |

## Linking a proof to telemetry

The `factory-run` predicate MAY carry `telemetry.traceId` (and `telemetry.spanId`) of the run span. The `Factory-Run` trailer MAY carry `trace=<traceId>`. A verifier never needs telemetry. Telemetry is for interpretation, the proof is for trust.

## Deprecation of producer-specific names

Producers that already emit their own names (for example `har.work_unit_id`) SHOULD emit both for at least one major version and document the removal.
