# Release Checklist

## Lifecycle

- Mode: `full`
- Mode rationale: public package/Git release.
- Escalation: `standard -> full` — externally visible publish and tag.

## Status

`ready` for commit, push, tag, and npm publish after npm authentication.

## Hard gates

- [x] Dependency risk reviewed in `deps.md`.
- [x] `pnpm run check`, `pnpm test`, audit, package dry-run, production-package audit, and `git diff --check` passed.
- [x] No unrelated dirty files existed at task start.
- [x] Version target is `0.1.1`; tag target is `v0.1.1`.
- [x] Release note scope: refreshed transitive development dependencies; no runtime behavior change.
- [x] No migration required.
- [x] Rollback: revert the release commit; if published, deprecate `0.1.1` and publish a corrected patch rather than rewriting the tag.
- [x] Owner explicitly approved commit, push, npm publication, and Git tags.
- [ ] npm authentication available; `npm whoami` currently returns 401, so npm publication pauses at this gate.

## Validation matrix

| Command/check | Required? | Status | Evidence | Blocker/waiver |
| --- | ---: | --- | --- | --- |
| `pnpm run check` | yes | passed | Bun syntax check | none |
| `pnpm test` | yes | passed | 13 tests, 41 expectations | none |
| `pnpm audit --audit-level=low` | yes | passed | zero advisories | none |
| production tarball install + `npm audit --omit=dev` | yes | passed | zero advisories | none |
| `npm pack --dry-run --json` | yes | passed | expected 9 files | none |
| `git diff --check` | yes | passed | no whitespace errors | none |
| repository CI | no | unavailable | no GitHub Actions workflows | not required |
| `npm whoami` | publish | failed | npm 401 | blocks npm publish only |

## Dirty-artifact triage

All changes are release-owned: `.npmignore`, `README.md`, `package.json`, `pnpm-lock.yaml`, and this feature evidence directory.

## Release notes

### Changed

- Refreshed permitted transitive development dependency resolutions.
- Released patch version `0.1.1` with no extension behavior changes.

### Migration notes

None.
