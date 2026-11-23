/**
 * semantic-release for @osfactory/factory-proof (packages/factory-proof).
 *
 * The repository also holds the Factory Commits spec, which is versioned by
 * hand in the root CHANGELOG.md. Releases here only version and publish the
 * npm package:
 *   - tags are `factory-proof-vX.Y.Z`, so they never collide with spec tags;
 *   - @semantic-release/npm bumps packages/factory-proof/package.json only
 *     (`pkgRoot`) and never publishes (`npmPublish: false`): the publish-npm
 *     job in .github/workflows/release.yml publishes with npm Trusted
 *     Publishing and provenance;
 *   - the package has its own CHANGELOG.md.
 *
 * @type {import('semantic-release').GlobalConfig}
 */
module.exports = {
  branches: ["main", { name: "next", prerelease: true }],
  tagFormat: "factory-proof-v${version}",
  plugins: [
    [
      "@semantic-release/commit-analyzer",
      {
        // conventionalcommits (not the default angular preset) so that the
        // `!` breaking marker (`feat!: …`) cuts a major.
        preset: "conventionalcommits",
        releaseRules: [
          // Until 1.0, a breaking change bumps the minor version (0.1.0 -> 0.2.0),
          // not 1.0.0: GOVERNANCE.md sets the conditions for 1.0. Remove at 1.0.
          { breaking: true, release: "minor" },
          // Spec, shell verifier, CI and docs changes never release the package.
          { scope: "spec", release: false },
          { scope: "sh", release: false },
          { scope: "ci", release: false },
          { scope: "docs", release: false },
          { type: "ci", release: false },
          { type: "docs", release: false },
          { type: "chore", release: false },
          { type: "test", release: false },
          { type: "refactor", release: false },
          { type: "style", release: false },
        ],
      },
    ],
    // Must use the same preset as the analyzer, or breaking changes are
    // versioned but left out of the notes.
    ["@semantic-release/release-notes-generator", { preset: "conventionalcommits" }],
    [
      "@semantic-release/changelog",
      {
        changelogFile: "packages/factory-proof/CHANGELOG.md",
        changelogTitle: "# Changelog",
      },
    ],
    [
      "@semantic-release/npm",
      {
        pkgRoot: "packages/factory-proof",
        npmPublish: false,
      },
    ],
    [
      "@semantic-release/git",
      {
        assets: [
          "packages/factory-proof/CHANGELOG.md",
          "packages/factory-proof/package.json",
          "packages/factory-proof/package-lock.json",
        ],
        message:
          "chore(release): factory-proof ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}",
      },
    ],
    // The tarball is attached by the publish-npm job after npm publish.
    // The release App token only has contents: write, so no PR/issue comments,
    // labels, or failure issues.
    [
      "@semantic-release/github",
      { successComment: false, failComment: false, releasedLabels: false },
    ],
  ],
};
