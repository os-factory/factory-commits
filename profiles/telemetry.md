# Telemetry correlation profile (v0.1, draft)

How OpenTelemetry data links to Factory Commits proofs. A producer that follows this profile lets any OTel backend (a Collector, Langfuse, Datadog, Grafana, …) answer: *which agent sessions, verification runs and proofs belong to this work unit, and to this git tree?*

The key words MUST, SHOULD and MAY are used as in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

## Principles

1. **Reuse OpenTelemetry semantic conventions first.** `vcs.*`, `cicd.*` and `gen_ai.*` names are used wherever they exist. `factory.*` names cover only what OTel has no name for yet; they are candidates for upstream proposals.
2. **The correlation keys are the ones in the proof.** A work unit id, run id and tree hash in telemetry are byte-for-byte the values in the commit trailers and the `factory-run` statement ([SPEC.md](../SPEC.md)).
3. **No content.** Attributes in this profile never carry prompts, transcripts, file contents or secrets. Absolute local paths appear only under the local-only `factory.local.*` namespace ([Local-only attributes](#local-only-attributes-factorylocal)), which never leaves the machine.

## Correlation keys

| Key | Attribute | Same value as |
|---|---|---|
| Work unit | `factory.work_unit.id` | `Work-Unit` trailer, `predicate.workUnit.id` |
| Work unit source | `factory.work_unit.source` | `predicate.workUnit.source` |
| Attempt | `factory.attempt.id` | `predicate.workUnit.attemptId`. The key that links agent telemetry to runs ([Linking](#linking-telemetry-to-a-factory-run)) |
| Factory run (verification) | `factory.run.id` **and** `cicd.pipeline.run.id` | `Factory-Run` trailer, `predicate.run.id` |
| Git tree | `factory.git.tree` | statement `subject[].digest.gitTree` |
| Git commit | `vcs.ref.head.revision` | statement `subject[].digest.gitCommit`, the commit carrying the note |
| Attestation | `factory.attestation.digest` | `Factory-Attestation` trailer, note `attestations[].digest` |
| Repository | `vcs.repository.url.full` | statement `subject[].name` (without the `git+` prefix) |
| Branch | `vcs.ref.head.name` | — |
| Agent session | `session.id` | — |

## Resource attributes (agent sessions)

A producer that launches or wraps a coding agent (a harness, a hook adapter) SHOULD put these on the OTel Resource of everything the session emits. The simplest carrier is `OTEL_RESOURCE_ATTRIBUTES` in the agent's environment.

| Attribute | Requirement | Notes |
|---|---|---|
| `session.id` | SHOULD | The session correlation key: one value for everything one agent session emits ([OTel session conventions](https://opentelemetry.io/docs/specs/semconv/general/session/)). A harness that launches the agent sets its own key here |
| `factory.slot.id` | MAY | The harness slot (isolated workspace) the session runs in, e.g. `1` |
| `factory.work_unit.id` | SHOULD, when a work unit is bound | |
| `factory.work_unit.source` | MAY | Tracker name, e.g. `github`, `linear`, `jira` |
| `factory.attempt.id` | SHOULD, when known | When the attempt is bound after the session starts, see [Attaching work identity](#attaching-work-identity-to-agent-sessions) |
| `vcs.repository.url.full` | SHOULD | Credentials MUST be stripped |
| `vcs.ref.head.name` | SHOULD | |
| `factory.producer.name` | SHOULD | The harness or tool that set these, e.g. `har` |
| `factory.producer.version` | SHOULD | |

On the Resource, `session.id` names the session the producer launched. A record MAY carry its own `session.id` attribute, for example the coding agent's own session id. A consumer correlating with the producer's session reads the Resource value.

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

## Linking telemetry to a factory run

A factory run is the verification. The work it verifies happened earlier, in one or more agent sessions. Telemetry therefore links to a run in three ways, each with its own key:

| Telemetry | Linked to run `R` by | Notes |
|---|---|---|
| Verification trace | Its trace id: `R.telemetry.traceId`, the `Factory-Run` trailer's `trace=`, or the [derived trace id](#trace-id-derivation) | One trace per run |
| Verification spans | `factory.run.id` = `R.run.id`, and `factory.git.tree` = the statement's tree | The run span and its stage spans |
| Agent telemetry | `factory.attempt.id` = `R.workUnit.attemptId`, and a timestamp in the [run window](#run-window) | Spans, logs and metrics of the agent sessions that did the work |

A consumer that has only a commit can follow the chain: the trailers give the run id (and the trace id), the statement gives the attempt id and `run.finishedOn`, and those select the telemetry.

### Why agent telemetry has no run id

The run id is assigned when verification starts. Agent telemetry was emitted before that, while the agent worked, so it cannot carry a run id that did not exist yet. One attempt can also produce several runs (verify, fail, fix, verify again). The attempt id is the key that exists for the whole time, and it is already in the statement (`workUnit.attemptId`).

- Consumers MUST NOT expect `factory.run.id` on agent telemetry.
- Producers MUST NOT rewrite already-exported telemetry to add a run id.

### Run window

The agent telemetry of run `R` is every record with `factory.attempt.id` = `R.workUnit.attemptId` and a timestamp at or before `R.run.finishedOn`.

- The window is cumulative: it includes the telemetry that also belongs to earlier runs of the same attempt. A consumer that wants only what changed since the previous run MAY start the window at that run's `finishedOn`.
- The window ends at `finishedOn`, not `startedOn`, because an agent often keeps working while it runs verification.
- When the statement has no `workUnit.attemptId`, this profile defines no link between agent telemetry and the run. A consumer MAY use its own heuristics, and MUST present the result as inferred.

### Trace id derivation

A producer that starts the run span's trace SHOULD use this trace id:

```
traceId = first 32 hex characters of lowercase-hex( SHA-256( UTF-8( "factory-run:" + run.id ) ) )
```

Example: run id `01JD4X7Q` gives `08a4c2fcb06d20d6c9f76d79addde080`.

The id is known as soon as the run id is, before any span exists. Any tool can then find the verification trace from a `Factory-Run` trailer alone, even when the trailer has no `trace=` and the statement is unavailable.

- A producer whose run joins an existing trace (for example a CI job that already has a trace context) keeps that trace id. It SHOULD then write it to `telemetry.traceId` and to the trailer, because a consumer cannot derive it.
- A consumer MUST prefer `telemetry.traceId`, then the trailer's `trace=`, and only then the derived id.

### Trailer and predicate

`telemetry.traceId` in the predicate and `trace=` in the `Factory-Run` trailer name the **verification run's** trace, never an agent session's trace. When both are present they MUST be equal.

Agent session ids do not go into trailers. A run can follow several sessions, and the attempt id in the statement already links them. A producer MAY record session ids in its own run records or evidence.

A verifier never needs telemetry. Telemetry is for interpretation, the proof is for trust.

## Attaching work identity to agent sessions

An agent session often starts before a work unit is bound to it. For example, an agent is opened in a repository and later runs the harness command that creates the attempt. The session's OpenTelemetry Resource is fixed when the process starts, so the Resource attributes above cannot change mid-session.

- A producer that binds an already-running session to an attempt SHOULD make the session's emitter add `factory.work_unit.id`, `factory.work_unit.source` and `factory.attempt.id` as **record attributes** on everything the session emits from the binding on.
- It SHOULD NOT add them to records emitted before the binding, and SHOULD stop when the binding ends (the attempt is completed or abandoned).
- A record attribute in the `factory.*` namespace takes precedence over the same key on the Resource. Consumers read the record first.
- The binding is stamped where the telemetry is produced, so every destination (a local dashboard, a hosted backend, a Collector) receives the same linked data and none of them has to reconstruct the link.

*Informative.* One way to do this is a session context file that only the producer writes and the emitter reads on each event. It holds time segments for one agent session:

```json
{
  "agentTool": "claude-code",
  "sessionId": "5f0c…",
  "segments": [
    {
      "from": "2026-01-01T00:00:00Z",
      "to": null,
      "attributes": {
        "factory.work_unit.id": "416",
        "factory.work_unit.source": "github",
        "factory.attempt.id": "att_01JD4X5K"
      }
    }
  ]
}
```

The emitter applies the attributes of the segment whose `[from, to)` contains the record's timestamp. The file holds identifiers only, never content (Principle 3).

## Local-only attributes (`factory.local.*`)

`factory.local.*` holds absolute paths and other machine-local facts that a local consumer (for example a dashboard on the same machine) needs to attribute telemetry to a checkout or workspace, such as `factory.local.checkout_path` and `factory.local.work_dir`.

- Attributes in this namespace MUST NOT be exported to third parties by default.
- A forwarder (a local collector, a relay, a proxy) MUST strip every `factory.local.*` key, at every level that carries attributes, from each copy it sends off the machine, unless the operator explicitly opted in for that destination.
- A forwarder MUST strip by prefix, not by a list of known keys, so a key added later is stripped too.
- Values in this namespace are never correlation keys: nothing in a proof refers to them.

## Producer-specific names

Producers SHOULD use this profile's names for everything the profile names. A producer's own namespace (for example `har.*`) is only for data that has no name in this profile or in the OpenTelemetry semantic conventions.
