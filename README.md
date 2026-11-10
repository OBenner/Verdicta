# Verdicta

**Delegate code. Collect evidence.**

Verdicta is an independent, local-first control plane for delegating tasks
to external coding agents (Codex, Claude Code, Kimi Code, OpenCode and
others). It does not write code itself: for each task it creates a git
worktree, runs the chosen agent in Docker, observes execution, independently
re-runs the mandatory checks, and produces:

```text
ChangeSet + EvidenceBundle + Verdict
```

An agent's claim of "done" is never treated as evidence.

## Status

**Early feature phase.** The workspace and automated gates exist. Implemented
and tested: domain contracts, the Run state machine, deterministic verdict
rules, the lease-guarded run coordinator, startup reconciler, and SQLite
persistence with migrations and atomic transitions.

The server, CLI, execution infrastructure, evidence pipeline, verifier, and
agent adapters are still stubs or scaffolds. The Web UI is a scaffold. See
`AGENTS.md` for the current implementation inventory and verified commands.

## Repository map

| Path                | Contents                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| `apps/cli`          | command-line client (stub)                                                                             |
| `apps/server`       | local service: API, coordination, recovery (stub)                                                      |
| `apps/web`          | React + Vite web UI (scaffold)                                                                         |
| `packages/*`        | contracts, application, storage, git-workspace, sandbox, runtime, verifier, evidence, policy, adapters |
| `docs/development/` | normative development rules                                                                            |
| `docs/adr/`         | architecture decision records                                                                          |

The canonical product specification is `docs/SPECIFICATION.md` (English).
The original Russian `Verdicta-проект.txt` is retained as the historical
source; conflicts must be reported rather than silently resolved.

The product roadmap lives in `docs/ROADMAP.md`. The engineering milestone
view and its current task ordering live in `docs/planning/roadmap.md`.

## Development

Requires Node.js 24 and pnpm 12.

```text
pnpm install
pnpm verify     # format:check + lint + build + typecheck + test
```

Build precedes typecheck and tests because workspace packages resolve one
another through `dist/`. Contributing rules live in `CONTRIBUTING.md`;
agent-facing operational rules live in `AGENTS.md`.

## Security

Report suspected vulnerabilities privately according to `SECURITY.md`. Do not
use public issues, pull requests, discussions, or commit comments for
undisclosed vulnerabilities.

## License

Apache-2.0. See `LICENSE` and `NOTICE`. Verdicta is an independent
implementation and does not reuse code, prompts, storage schemas, or UI
design from third-party projects.
