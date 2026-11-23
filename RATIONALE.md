# Rationale: how Factory Commits relates to existing standards

This document explains *why* Factory Commits looks the way it does: what it reuses, what it adds, which existing standards overlap with it, and how we intend to work with them. It is not normative; [SPEC.md](SPEC.md) is.

Facts about other projects were checked on 2026-11-23 against the sources linked in each section. If one is out of date, please open an issue.

## The question

Factory Commits touches a lot: trailers, git notes, in-toto statements, DSSE envelopes, signatures, levels, a merge gate, telemetry. Several existing standards already cover parts of this. Two questions follow:

1. Are we building a new standard where an existing one would do?
2. If an existing one almost fits, can we get our needs into it, or will its maintainers refuse?

## How standards actually layer

Mature standards are designed to be extended without asking permission. You rarely change someone else's standard. You build on the extension points it already has. There are four ways to do that, from cheapest to most expensive:

| Mechanism | What it means | Permission needed | Example in Factory Commits |
|---|---|---|---|
| **Extension point** | The spec leaves a slot for others to fill | None | in-toto lets anyone define a predicate type. DSSE accepts any `payloadType`. Git trailer names and notes refs are open namespaces. |
| **Profile** | Pick existing standards, constrain them, and specify how they combine. Nothing new at the bottom layer. | None | "A factory proof is an in-toto Statement, in a DSSE envelope, in `refs/notes/factory`, linked by these trailers." |
| **Registry listing** | Get the extension listed in the upstream catalog | Light review | Listing `factory-run` in the in-toto predicate catalog ([process](https://github.com/in-toto/attestation/blob/main/docs/new_predicate_guidelines.md): "Your predicate is yours.") |
| **Upstream change** | Change the other spec itself | Their full process, and usually users first | Not needed today |

This is how the standards we reuse were built themselves. SLSA did not modify in-toto: it defined predicates (provenance, VSA) on in-toto's extension point. Sigstore wraps DSSE rather than changing it. Conventional Commits needed nothing from git. OpenTelemetry absorbed Elastic Common Schema only after ECS was widely deployed.

Standards bodies mostly codify what is already deployed. The way in is to ship on their extension points, get used, then ask to be listed. That is why our [GOVERNANCE.md](GOVERNANCE.md) sets 1.0 at two independent producers and one outside consumer.

So the answer to question 2 is: we don't need anyone to accept a modification. Every part of Factory Commits sits on an extension point an upstream standard deliberately left open.

## What is reused and what is new

| Part | Status | Upstream |
|---|---|---|
| Commit trailers | Reused mechanism, new names (`Work-Unit`, `Factory-*`) | [git interpret-trailers](https://git-scm.com/docs/git-interpret-trailers) |
| Notes ref `refs/notes/factory` | Reused mechanism, new layout and merge rules | [git notes](https://git-scm.com/docs/git-notes) |
| Statement | Reused as is | [in-toto Statement v1](https://github.com/in-toto/attestation/blob/main/spec/v1/statement.md) |
| Envelope and digest | Reused as is | [DSSE](https://github.com/secure-systems-lab/dsse) |
| Signatures | Reused as is | `ssh-keygen -Y sign`, Sigstore as an extension |
| Merge gate statement (L3) | Reused as is, with an `extensions` field | [SLSA VSA](https://slsa.dev/spec/v1.2/verification_summary) ([extensions/merge-gate.md](extensions/merge-gate.md)) |
| Telemetry correlation | Reused names, new correlation attributes | [OpenTelemetry semantic conventions](https://opentelemetry.io/docs/specs/semconv/) ([profiles/telemetry.md](profiles/telemetry.md)) |
| **`factory-run` predicate** | **New** | Defined on in-toto's predicate extension point |
| **Tree as the subject** | **New convention** | Uses in-toto's open `digest` map (`gitTree`) |
| **Levels L0 to L3** | **New**, and the part most likely to overlap (see SLSA Source below) | Modeled on SLSA levels |

The new surface is the predicate, the trailer names, the note layout and the levels. Everything else is reuse. That keeps review short and lets a verifier work with only `git` and `jq` ([verifiers/sh/](verifiers/sh/)).

## Neighbors

| Project | What it answers | Relation to Factory Commits |
|---|---|---|
| [SLSA Source track](https://slsa.dev/spec/v1.2/source-requirements) (v1.2) | What controls the source control system enforced on a revision | **Closest overlap.** See the next section. |
| [SLSA VSA](https://slsa.dev/spec/v1.2/verification_summary) | A verifier's PASSED/FAILED for a resource against a policy | **Reused** for the merge gate (L3) |
| [in-toto `test-result`](https://github.com/in-toto/attestation/blob/main/spec/predicates/test-result.md) (v0.1) | PASSED/WARNED/FAILED with passed, warned and failed test lists, about "the source artifacts tested" | **Closest existing predicate.** See [Why not `test-result`](#why-not-the-in-toto-test-result-predicate). |
| [Agent Trace](https://agent-trace.dev/) | Which lines came from AI vs. humans | **Complement.** Authorship, not verification. A `factory-run` can reference an Agent Trace record by digest. |
| [Git AI](https://usegitai.com/docs/how-git-ai-works) | Line-level AI authorship in `refs/notes/ai` | **Same storage pattern** (separate notes ref, single writer), different question |
| [gittuf](https://github.com/gittuf/gittuf) (OpenSSF) | Signed ref-state log and policy in `refs/gittuf/*` | **Possible enforcer**: "no push to `main` without a valid proof" |
| [agent-attest](https://github.com/zhengqiuyang/agent-attest) | Signed chain of custody for what an agent did, committed next to the code, with a CI gate on protected paths | **Similar goal**, a single tool without a spec. Records agent actions, not which checks passed on the tree. |
| [Sigstore](https://www.sigstore.dev/) / [gitsign](https://github.com/sigstore/gitsign) | Who signed a commit | **Reused** for keyless CI signatures. Proves identity, not verification. |
| Forge status checks (GitHub checks, merge queues) | Pass/fail per commit, inside the forge | **The incumbent.** Lives in the forge's database, not in git, so it can't be audited offline and doesn't move with the repository. |

## SLSA Source track

SLSA v1.2 added a Source track. It is the closest standard to Factory Commits, so it deserves a careful comparison.

### What it says

All quotes are from [SLSA v1.2 source requirements](https://slsa.dev/spec/v1.2/source-requirements):

- **Per-revision summaries.** "The SCS MUST generate a source verification summary attestation (Source VSA) to indicate the SLSA Source Level of any revision at Level 1 or above." The Source VSA uses predicate type `https://slsa.dev/verification_summary/v1`.
- **Custom properties.** "The SCS MAY embed additional properties within `verifiedLevels` provided by the organization as long as they are prefixed by `ORG_SOURCE_`", and "The meaning of the properties is left entirely to the organization."
- **Tests as a control.** "If the organization claims that all consumable Source Revisions on the `main` branch were tested prior to acceptance, this MUST be explicitly enforced in the SCS."
- **Source provenance format is open.** "SLSA leaves source provenance attestations undefined and up to the SCSs."
- **Storage is open.** The spec does not say where attestations live.

The prototype implementation, [slsa-framework/source-tool](https://github.com/slsa-framework/source-tool) ("A proof-of-concept for how the SLSA Source Track could be implemented"), stores attestations in git notes, "where each line of the note is a separate signed attestation" ([DESIGN.md](https://github.com/slsa-framework/source-tool/blob/main/docs/DESIGN.md)). Its example policy maps a check named `test` to the property `ORG_SOURCE_TESTED`.

### Where it overlaps

- Both produce per-revision attestations and summarize them as levels.
- Both can express "required checks passed before this revision was accepted".
- The prototype implementations of both store attestations in git notes.

### Where it differs

| | SLSA Source | Factory Commits |
|---|---|---|
| Who issues the proof | The source control system (the forge) | Any producer (a harness, a CI job, a script), then a gate |
| What is proven | Controls the forge enforced (branch protection, review, status checks) | Which stages ran on an exact tree, which were required by policy and which an agent added, and in what trust environment |
| Subject | The commit (`gitCommit`) | The tree (`gitTree`), so the proof survives squash and rebase |
| Work and agent context | Not modeled | Work unit, agent, model (opt-in), producer |
| Verifying without the forge | Depends on the forge publishing VSAs | Only `git` and `jq` |

SLSA Source is about trusting the forge's controls. Factory Commits is about a portable record of what verified a change, especially a change made by an agent, wherever it was produced. They answer neighboring questions, and a repository can use both.

### How we intend to fit together

1. **Keep `factory-run` as its own predicate.** SLSA leaves source provenance undefined, and no existing predicate records policy-required stages, agent-added stages and the trust environment. `factory-run` could serve as one concrete source provenance format that an SCS or gate consumes.
2. **Keep the merge gate on VSA** (already the case in [extensions/merge-gate.md](extensions/merge-gate.md)). A gate that also acts as the SCS's verifier can emit a Source VSA whose `inputAttestations` point to `factory-run` digests.
3. **Recommend `ORG_SOURCE_` property names** for organizations that want Factory Commits levels in their Source VSAs, rather than inventing a parallel summary format. The SLSA spec leaves the meaning of these properties to each organization, so this can only be a recommended convention, for example `ORG_SOURCE_FACTORY_COMMITS_L2`.
4. **Compare note layouts with source-tool before 1.0.** Our note is one JSON document with an `attestations` array; source-tool uses one attestation per line. If a shared layout is possible, two tools reading the same commit should not need two formats.

## Why not the in-toto `test-result` predicate

[`test-result` v0.1](https://github.com/in-toto/attestation/blob/main/spec/predicates/test-result.md) records `result` (PASSED, WARNED or FAILED), `configuration`, an optional `url`, and lists of test names. It is the closest existing predicate, but it cannot express:

- **a policy**: which stages were required, so a verifier can recompute the verdict ([SPEC §4.3](SPEC.md#43-verdict-rule));
- **stage provenance**: whether a stage was required by policy or added by an agent;
- **the trust environment**: `self-reported` (the agent could have altered the run) versus `independent` ([SPEC §4.2](SPEC.md#42-predicate-fields), [§11.1](SPEC.md#111-self-reported-proofs));
- **the work unit and agent** behind the change.

`factory-run` could reference `test-result` statements per stage (through artifact digests) instead of replacing them. That is an open question below.

## Open questions

Please discuss these in [Discussion #11](https://github.com/os-factory/factory-commits/discussions/11).

1. **Level names.** Do "L0 to L3" confuse readers who know SLSA Source levels? Should ours be renamed (for example "Linked, Recorded, Signed, Gated" only) or mapped explicitly?
2. **`ORG_SOURCE_` convention.** Should the spec recommend property names for Source VSAs, and which ones?
3. **Note layout.** Converge with source-tool's one-attestation-per-line layout, or keep a single JSON document?
4. **`test-result` composition.** Should stages be able to reference `test-result` statements?
5. **Agent Trace link.** Should `factory-run` define a field for an Agent Trace record digest, or leave it to `extensions`?
