# Releasing

This repository holds two things with separate versions:

- the **Factory Commits spec** (`SPEC.md`, `schemas/`, profiles, extensions), versioned by hand in the root [CHANGELOG.md](CHANGELOG.md) and through [RFCS.md](RFCS.md);
- the **`@osfactory/factory-proof`** npm package (`packages/factory-proof/`), released automatically and described here. Its history is in [packages/factory-proof/CHANGELOG.md](packages/factory-proof/CHANGELOG.md).

Package tags are `factory-proof-vX.Y.Z`, so they never collide with spec versions.

## How a release happens

1. A PR is squash-merged into `main`. Its **title** is a Conventional Commit and becomes the commit on `main`. The [PR title](.github/workflows/pr-title.yml) check rejects other titles.
2. On push to `main`, [Release](.github/workflows/release.yml) runs:
   - **verify**: `npm ci`, typecheck, tests and build of `packages/factory-proof`, then `conformance/run.sh` for both implementations (`git factory` and the shell verifier), then `npm pack --dry-run`;
   - **release**: [semantic-release](https://semantic-release.gitbook.io/) ([release.config.cjs](release.config.cjs)) reads the commits since the last `factory-proof-v*` tag. If one is releasable it bumps `packages/factory-proof/package.json` and its lockfile, prepends `packages/factory-proof/CHANGELOG.md`, commits `chore(release): factory-proof X.Y.Z [skip ci]`, tags `factory-proof-vX.Y.Z` and creates the GitHub Release. It never publishes to npm (`npmPublish: false`);
   - **publish-npm**: checks out the tag, builds, packs, writes CycloneDX and SPDX SBOMs, publishes that exact tarball with `npm publish --access public --provenance` through **npm Trusted Publishing** (no npm token), attests it with `actions/attest-build-provenance`, and uploads the tarball and SBOMs to the GitHub Release.
3. Nothing releasable (`docs:`, `ci:`, `chore:`, …): verify still runs, the rest is skipped.

Which titles release the package:

| Title | Release |
| ----- | ------- |
| `fix: …` | Patch |
| `feat: …` | Minor |
| `feat!: …` (`!` on any type) | Major |
| `docs:`, `test:`, `ci:`, `chore:`, `refactor:`, `style:` | None |
| any type with scope `spec`, `sh`, `ci` or `docs` | None |

Spec-only changes use `docs(spec): …` or `feat(spec): …`, shell verifier changes use scope `sh`: they never release the npm package. The conventionalcommits preset is used, so `!` marks a breaking change; put it in the squash title, since a squash merge drops `BREAKING CHANGE:` footers from the PR's commit bodies.

### Prereleases

Pushing to a `next` branch cuts prereleases (`X.Y.Z-next.N`, tag `factory-proof-vX.Y.Z-next.N`) published under the npm dist-tag `next`. The branch is optional: semantic-release ignores it until it exists on the remote.

### Dry run

Actions → **Release** → **Run workflow** → tick **dry_run**. It prints the next version and notes without tagging or publishing.

## One-time setup

npm Trusted Publishing can only be configured on a package that already exists on npmjs.com. So the first version, **0.1.0, is published by hand once**; CI publishes every later version. Do the steps in this order.

### 1. GitHub repository settings (before merging the release workflow, or right after)

1. **Environment.** Settings → Environments → New environment → `npm-publish`. Both the `release` and `publish-npm` jobs run in it, and the npm trusted publisher is bound to it. Optional: Deployment branches and tags → Selected branches → `main` (and `next`).
2. **Release GitHub App.** The `main` ruleset requires pull requests, so the default `GITHUB_TOKEN` cannot push the release commit. The workflow pushes with a GitHub App token instead, as os-factory/har does:
   - Install a GitHub App with **Repository permissions → Contents: Read and write** on `os-factory/factory-commits`. Either install the org's existing release App (the one os-factory/har's ruleset already lets through, `release-har-cli`) on this repository, or create a dedicated one.
   - Add its **Client ID** as a repository variable `RELEASE_APP_CLIENT_ID` (Settings → Secrets and variables → Actions → Variables), or as a secret of the `npm-publish` environment.
   - Add its **private key** (the `.pem` contents) as the `npm-publish` environment secret `RELEASE_APP_PRIVATE_KEY`.
   - Settings → Rules → Rulesets → `main` → **Bypass list** → Add bypass → the App → *Always allow*.
3. **Actions permissions.** Settings → Actions → General. Keep "Allow all actions" (or allow `actions/*` and `amannn/action-semantic-pull-request`). Workflow permissions can stay **Read repository contents** (the current default): each job declares the permissions it needs (`id-token: write`, `attestations: write`, `contents: write` for the release upload).
4. **Optional, recommended.** In the `main` ruleset, add *Require status checks to pass* with the CI jobs and `lint` (PR title).

### 2. Merge the stack to `main`

Merge the open PRs into `main` with conventional squash titles. The Release workflow runs on each push but, until a `factory-proof-v*` tag exists, it skips semantic-release with the warning "No factory-proof-v* tag yet" (otherwise semantic-release would start at 1.0.0).

### 3. Build and verify locally

From a clean checkout of `main` at the commit you will publish:

```sh
git switch main
git pull --ff-only
git status --short                       # must print nothing
git rev-parse HEAD                       # note this commit: it gets the tag in step 6

cd packages/factory-proof
npm ci
npm run typecheck
npm test                                 # builds, then runs vitest
cd ../..
conformance/run.sh packages/factory-proof/dist/cli.js
conformance/run.sh verifiers/sh/git-factory-verify
cd packages/factory-proof
npm pack --dry-run                       # expect dist/, schemas/, CLI.md, README.md, LICENSE, package.json
node -p "require('./package.json').version"   # 0.1.0
```

### 4. Publish 0.1.0 by hand

Still in `packages/factory-proof`:

```sh
npm login                                # account with publish rights on the @osfactory scope; 2FA
npm whoami
npm publish --access public --dry-run    # check name, version 0.1.0 and the file list
npm publish --access public              # asks for the 2FA code, or add --otp=<code>
npm view @osfactory/factory-proof version   # 0.1.0
```

`prepack` rebuilds `dist/` and copies the schemas and `LICENSE`. This manual publish has no npm provenance (provenance needs a supported CI provider); later versions published by CI have it.

### 5. Configure the npm Trusted Publisher

On npmjs.com → `@osfactory/factory-proof` → **Settings** → **Trusted Publisher** → **GitHub Actions**:

| Field | Value |
| ----- | ----- |
| Organization or user | `os-factory` |
| Repository | `factory-commits` |
| Workflow filename | `release.yml` |
| Environment name | `npm-publish` |

Then, on the same page, **Publishing access** → *Require two-factor authentication and disallow tokens*. Trusted Publishing keeps working, and no long-lived token can publish the package.

### 6. Tag the published commit

So that semantic-release continues from 0.1.0 instead of trying to cut a first release:

```sh
git tag -a factory-proof-v0.1.0 -m "@osfactory/factory-proof 0.1.0" <commit from step 3>
git push origin factory-proof-v0.1.0
```

Optional: `gh release create factory-proof-v0.1.0 --title "factory-proof 0.1.0" --notes "First release of @osfactory/factory-proof."`.

### 7. Check

Actions → **Release** → **Run workflow** on `main` with **dry_run**: it should find the `factory-proof-v0.1.0` tag and report no release (or the next version, if a `fix:`/`feat:` landed after the tag). The next releasable merge publishes from CI with provenance.

## Manual emergency publish

Only if CI cannot publish (registry outage, broken workflow). Prefer fixing the workflow and re-running the failed `publish-npm` job. From a clean checkout of the release tag:

```sh
cd packages/factory-proof
npm ci
npm publish --access public --otp=<code>
```

An interactive publish with a 2FA code should still be allowed under the setting from step 5 (npm documents that setting as blocking tokens, not 2FA logins; not verified here).

## Facts not verified from this repository

- npm Trusted Publishing needs npm 11.5.1 or later; the publish job uses Node 24 for that, as os-factory/otel-hook does. The publish job has not run yet in this repository.
- That a trusted publisher can only be added to an existing package is npm's behaviour at the time of writing; if npmjs.com now offers it for new packages, step 4 could be skipped, but the tag in step 6 is still needed.
- npm checks that `repository.url` in `package.json` matches the GitHub repository that publishes with provenance. `repository.directory` is set to `packages/factory-proof` for correct source links.
- Whether `release-har-cli` may be reused here is an org decision; a dedicated App works the same way.
