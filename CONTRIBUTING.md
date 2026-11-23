# Contributing

Thanks for helping. Two kinds of contribution:

- **Spec**: follow [RFCS.md](RFCS.md).
- **Code** (`packages/`, `verifiers/`, `conformance/`): open a pull request with tests. Every implementation must keep passing `conformance/run.sh`.

Keep implementations small, dependency-light, and free of network calls and telemetry.

## Pull request titles

Pull requests are squash-merged, and the PR title becomes the commit on `main`. Use a [Conventional Commit](https://www.conventionalcommits.org/) title (`feat:`, `fix:`, `docs:`, `test:`, `ci:`, …); the [PR title](.github/workflows/pr-title.yml) check enforces it.

The title also decides whether `@osfactory/factory-proof` is released (see [RELEASING.md](RELEASING.md)):

| Title | Package release |
| ----- | --------------- |
| `fix: …` | Patch |
| `feat: …` | Minor |
| `feat!: …` (`!` on any type) | Major |
| `docs:`, `test:`, `ci:`, `chore:`, `refactor:`, `style:` | None |
| any type with scope `spec`, `sh`, `ci` or `docs` | None |

Spec changes use `docs(spec): …` (or `feat(spec): …`); shell verifier changes use scope `sh`. Neither releases the npm package.
