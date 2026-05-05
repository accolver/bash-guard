# Bash Guard

Adversarial security review extension for [pi](https://github.com/badlogic/pi-mono). Intercepts bash tool calls, applies deterministic sensitive-command policy checks, and runs parallel security reviews using fast LLM voters before allowing execution.

## How it works

```
LLM calls bash tool
       │
       ▼
  Deterministic policy check
       │
       ├─ free mutation in /tmp or untracked git files ─▶ Allow instantly
       ├─ sensitive/cloud/out-of-CWD trigger ───────────▶ Ask user
       │
       ▼
  Whitelisted? ──yes──▶ Allow instantly
       │ no
       ▼
  Previously overridden? ──yes──▶ Allow + notify
       │ no
       ▼
  Fire 5 parallel gpt-5.4-mini voters
  "Is this command safe? YES or NO"
  (with <previous_decisions> context)
       │
       ▼
  ┌────────────────────────────┐
  │ Unanimous YES → Allow      │
  │ Unanimous NO  → Block†     │
  │ Split vote    → Block†     │
  └────────────────────────────┘
  † User can override. On-demand explanation
    via main model with full conversation context.
    Overrides are remembered for future reviews.
```

## Features

### Voting
- **5 parallel voters** using `gpt-5.4-mini` by default (configurable)
- **5-second timeout** per voter — timeouts count as abstentions
- **Live vote tracker** UI with real-time dot updates
- **Multi-model support** — round-robin across available models

### Decisions
- **Unanimous YES** → auto-allow with notification
- **Unanimous NO / Split** → bordered markdown dialog with:
  - Command preview
  - Vote icon breakdown
  - On-demand explanation (fetched in background)
  - `y` to allow, `n`/`esc` to block
- **Override warning** — every override is surfaced as a notification
- **Override memory** — overrides are persisted per-session:
  - Exact same command → auto-allowed with notification (skips review entirely)
  - Past overrides provided as `<previous_decisions>` context to voters so they learn user preferences
- **Denial reason** — returned to the LLM so it can adjust

### Explainer
- Uses Claude Haiku 4.5 with reasoning disabled (falls back to `ctx.model`)
- Includes last 20 messages of conversation context (user, assistant, thinking, tool calls, tool results)
- Structured XML context for clean prompt boundaries
- Fixed output format:
  - **What it does**
  - **Why it's being run**
  - **Risk**

### Deterministic policy guardrails
Before the LLM voters run, Bash Guard applies local deterministic checks:

- **Free manipulation** — mutating commands like `rm`, `mv`, `cp`, `mkdir`, `touch`, `truncate`, `ln`, `chmod`, `chown`, and `install` are allowed without review when every target path is either:
  - under `/tmp` or `/private/tmp`, or
  - inside the current working directory and not tracked by git.
- **Ask for assistance** — commands touching files outside the current working directory require user approval, except `/tmp` paths.
- **Sensitive bash protection** — commands that read or expose environment variables, escalate privileges, run remote shell scripts, use `chmod 777`, or force-delete broad paths require user approval.
- **Sensitive path protection** — paths like `.env`, `.ssh`, `.aws`, `.config/gcloud`, `.kube`, `.gnupg`, `.npmrc`, `.netrc`, `terraform.tfvars`, credential/token/secret paths, and key/cert files require user approval.
- **Cloud mutation protection** — mutating `aws`, `gcloud`, `gsutil`, `bq`, `kubectl`, `terraform`, and `terragrunt` commands require user approval.

In non-interactive mode, policy approval prompts become hard blocks.

### Whitelist
Read-only commands bypass the LLM review entirely for zero overhead, unless the deterministic policy catches a sensitive path, cloud mutation, or out-of-CWD path first:
- File inspection: `ls`, `head`, `tail`, `wc`, `file`, `stat`, `diff`
- Search: `grep`, `rg`
- Text processing: `cut`, `tr`, `uniq`, `jq`
- Path utilities: `basename`, `dirname`, `realpath`, `readlink`, `cd`
- System info: `pwd`, `whoami`, `date`, `uname`, `id`, `hostname`, `nproc`, `free`, `uptime`
- Checksums: `md5`/`md5sum`, `sha*sum`
- Other: `echo`, `printf`, `which`, `type`, `du`, `df`, `tree`, `man`, `test`, `[`
- Git (read-only): `status`, `log`, `branch`, `tag`, `remote`, `stash list`, `config --get`

**Disqualifiers** — any of these send the command to voters regardless:
- Pipes (`|`), semicolons (`;`), ampersands (`&`), backticks (`` ` ``), newlines
- Subshells (`$(...)`)
- Redirects (`>`, `>>`)

**Intentionally omitted** from whitelist:
- `cat`/`env`/`printenv` — can expose secrets too easily
- `git diff`/`git show` — can expose committed secrets or sensitive local changes
- `find`/`fd` — `-exec`, `-delete` flags
- `awk` — `system()` builtin, internal file I/O
- `sort` — `-o` flag writes to files

## Commands

| Command | Description |
|---|---|
| `/guard` | Toggle guard on/off |
| `/guard on` | Enable guard |
| `/guard off` | Disable guard |
| `/guard debug` | Toggle debug mode |

## Debug Mode

When enabled (`/guard debug`), shows a detailed debug pane on every review:

```
  ┄┄ Debug ┄┄
  #1 haiku-4.5       YES   420ms
  #2 haiku-4.5       NO    380ms
  #3 haiku-4.5       YES   410ms
  #4 haiku-4.5       YES   290ms
  #5 haiku-4.5       YES   310ms
  Avg: haiku-4.5 362ms
```

- Per-voter: model, vote, latency, error message
- Per-model averages with fastest **bolded**
- Unanimous YES with debug: shows full dialog (press any key to continue)

Debug state persists across `/reload`.

## Status Bar

- `🔒 guard` — active
- `🔒 guard 🔍` — active with debug
- `🔓 guard off` — disabled

## Non-interactive Mode

In print mode (`-p`) or JSON mode, the guard:
- Auto-allows deterministic free mutations in `/tmp` or untracked files
- Blocks deterministic policy triggers that need user approval
- Auto-allows previously overridden commands (from earlier interactive sessions)
- Blocks anything else that isn't unanimous YES
- Returns a descriptive denial reason to the LLM
- No UI prompts (no user to ask)

## Configuration

Edit `index.ts` constants at the top of the file, or set environment variables for model selection:

| Constant / Env var | Default | Description |
|---|---|---|
| `VOTES_PER_MODEL` | `5` | Number of votes per available model |
| `VOTE_TIMEOUT_MS` | `5000` | Timeout per voter in milliseconds |
| `PI_BASH_GUARD_ENABLED` | `"false"` | Initial guard state for new sessions (`1`, `true`, `yes`, `on`, or `enabled` starts enabled) |
| `PI_BASH_GUARD_VOTER_PROVIDER` | `"openai-codex"` | Provider for voter models |
| `PI_BASH_GUARD_VOTER_MODEL` | `"gpt-5.4-mini"` | Model ID for voters |
| `PI_BASH_GUARD_VOTER_LABEL` | same as voter model | Label shown in debug UI |
| `PI_BASH_GUARD_EXPLAINER_PROVIDER` | `"anthropic"` | Provider for the explainer model |
| `PI_BASH_GUARD_EXPLAINER_MODEL` | `"claude-haiku-4-5"` | Model ID for the explainer |
| `EXPLAINER_CONTEXT_MESSAGES` | `20` | Number of recent messages sent to explainer |

Models are resolved through the user's model registry, so proxy configurations and custom API keys are respected automatically.

## Security

- **Not exposed as a tool** — the LLM cannot disable its own sandboxing
- **User-only control** — only `/guard` commands can toggle the guard
- **Override audit trail** — every override is logged as a warning notification
- **Override persistence** — overrides survive `/reload` and session restore via `appendEntry`
