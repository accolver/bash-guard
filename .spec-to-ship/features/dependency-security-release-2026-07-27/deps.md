# Dependency Decision

## Lifecycle

- Mode: `full`
- Mode rationale: dependency security maintenance followed by public release.
- Escalation: `standard -> full` — publishing and tagging are externally visible.

## Proposed change

Refresh the pnpm lockfile to the newest resolution allowed by the existing manifests and release `@accolver/bash-guard@0.1.1`.

## Dependency type

Dev and transitive dependencies only; runtime peer contracts are unchanged.

## Reason

Reduce stale transitive dependency exposure while keeping direct Pi package versions on the current `0.82.1` release.

## Existing alternatives

No new package was added. Leaving the lockfile unchanged was rejected because the request explicitly requires dependency refresh and security verification.

## Standard-library or no-dependency alternative

Not applicable to typechecking and Pi host API declarations.

## License result

Allow. Direct dependencies are Pi packages under MIT-compatible licensing; no direct dependency or license changed.

## Maintenance evidence

Registry checks on 2026-07-27 showed `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, and `@earendil-works/pi-tui` current at `0.82.1`. `pnpm outdated --format json` returned no outdated direct dependency.

## Vulnerability/provenance evidence

- `pnpm audit --audit-level=low`: zero known vulnerabilities.
- Lockfile supply-chain policy check passed during pnpm operations.
- No new direct package, native dependency, install script, or binary download was introduced.

## Size/runtime impact

None. Only dev/transitive lock resolution changed; production package dry-run remains source-only and production tarball audit reports zero vulnerabilities.

## Lockfile/package-manager behavior

The repository-declared `pnpm@11.17.0` was used. `pnpm update --latest` refreshed `pnpm-lock.yaml`; package manifest ranges remain unchanged.

## Decision

Accept the lockfile refresh and patch release.

## Residual risk and follow-up

The refreshed development graph still reports the pre-existing deprecated `node-domexception@1.0.0` transitive package, but it has no reported advisory and is not in the published runtime payload.
