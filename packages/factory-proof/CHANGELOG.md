# Changelog

## [0.2.0](https://github.com/os-factory/factory-commits/compare/factory-proof-v0.1.0...factory-proof-v0.2.0) (2026-11-23)

### ⚠ BREAKING CHANGES

* statements with environment.trust "local" or "ci" no longer
validate. Producers must write "self-reported" or "independent".

Co-authored-by: Claude Opus 5.5 <noreply@anthropic.com>

### Features

* rename trust values to self-reported/independent and document limitations ([#13](https://github.com/os-factory/factory-commits/issues/13)) ([e20bb0e](https://github.com/os-factory/factory-commits/commit/e20bb0effb6d73662ee803dfe1a8541839572f24))

## 0.1.0

- First release of `@osfactory/factory-proof`, the reference implementation of Factory Commits v0.1: the library and the `git factory` command (published manually; later versions are cut by semantic-release).
