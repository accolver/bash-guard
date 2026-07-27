# Bash Guard

Pi extension that intercepts `bash` tool calls, applies deterministic safety policy checks, and then uses parallel LLM voters for commands that are not trivially safe.

See [`extensions/bash-guard/README.md`](extensions/bash-guard/README.md) for behavior and configuration.

## Quick start

```bash
pi install npm:@accolver/bash-guard
```

Or install directly from GitHub:

```bash
pi install git:github.com/accolver/bash-guard
```

## Development

```bash
pnpm test
pnpm check
```
