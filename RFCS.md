# Changing the spec (RFCs)

1. Open an issue or Discussion describing the problem first, for anything beyond a typo.
2. Open a pull request that changes `SPEC.md`, `schemas/`, `profiles/` or `extensions/`, with:
   - the problem and who has it,
   - the change, and whether it breaks existing producers or verifiers (see [Compatibility](#compatibility)),
   - updated or new test vectors when behavior changes.
3. The pull request stays open at least 24 hours. Maintainers merge when concerns are addressed.
4. Every merged spec change gets a [CHANGELOG.md](CHANGELOG.md) entry.

## Compatibility

Proofs live in git history, so a statement, note or trailer that was valid when written must stay valid.

- **The predicate type URI is the contract version** (`https://os-factory.dev/factory-commits/factory-run/v0.1`). A change that makes an existing valid statement, note or trailer invalid, or changes what a field means, needs a new URI (`…/v0.2`). Verifiers keep recognizing the older URIs.
- **Within one URI, changes are additive only:** new optional fields and new informational problem codes. Don't rename or remove fields, don't add, rename or remove enum values (older verifiers reject unknown values), and don't tighten patterns or limits.
- **Schema changes release the package.** `@osfactory/factory-proof` ships `schemas/` and validates with them. A pull request that changes `schemas/*.schema.json` must have a title that releases the package (`feat`, `fix` or `perf`, without the `spec`, `sh`, `ci` or `docs` scope). The `schema-release` check in [pr-title.yml](.github/workflows/pr-title.yml) enforces this.
- **Until 1.0, a breaking package change bumps the minor version** (0.1 → 0.2), never to 1.0.0. See [release.config.cjs](release.config.cjs).
