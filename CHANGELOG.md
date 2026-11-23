# Changelog

## v0.1 (draft, unreleased)

- First public draft: commit trailers, `refs/notes/factory`, the `factory-run` predicate, DSSE envelopes and statement digest, ssh signatures, levels L0–L3, verification procedure.
- Telemetry correlation profile and HTTP receiver profile.
- Merge-gate extension (L3).
- **Breaking:** `environment.trust` values renamed from `local`/`ci` to `self-reported`/`independent`, defined by whether the agent that made the change could alter the run, not by where the run happened. This is the last change made in place under the `v0.1` predicate type URI: later breaking changes follow the compatibility rules in [RFCS.md](RFCS.md#compatibility).
- Process: RFC pull requests stay open at least 24 hours (was 7 days). New compatibility rules in RFCS.md.
- Design rule 3 and §8: a signature proves integrity and accountability, not that the stages ran.
- New §11 Limitations: self-reported proofs, untested merged trees, test quality, each with optional mitigations.
