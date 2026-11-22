# Governance

Factory Commits is a draft open convention started by the [os-factory](https://github.com/os-factory) project.

## Until 1.0

- **Maintainers** are listed in [MAINTAINERS.md](MAINTAINERS.md). They merge changes and cut releases.
- **Spec changes** go through an RFC (see [RFCS.md](RFCS.md)): a pull request that edits `SPEC.md`, the schemas or a profile, with the reasoning in the description. It stays open at least 7 days for comment before it merges.
- **Breaking changes** are allowed in 0.x releases and are listed in [CHANGELOG.md](CHANGELOG.md).
- **Decisions** are made by maintainer consensus in the open (issues, pull requests, Discussions).

## Toward 1.0

1.0 requires at least two independent producers and one consumer outside os-factory, a public comment period of at least four weeks, and maintainers from more than one organization. After 1.0, the project intends to move to a neutral foundation (for example OpenSSF or CD Foundation) once others depend on it.

## Implementations

Anyone may implement the spec. An implementation may call itself conformant when it passes the [conformance suite](conformance/) for the version it claims.
