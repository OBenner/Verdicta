# Verdicta

**Delegate code. Receive evidence.**

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

Scaffolded, pre-feature. The monorepo skeleton and the automated gates
exist; the runtime (server, coordinator, Docker workers, agent adapters) is
not implemented yet. See `AGENTS.md` for the verified commands and
`docs/development/scaffolding-plan.md` for what the scaffold covers.

## Repository map

| Path                | Contents                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| `apps/cli`          | command-line client (stub)                                                                             |
| `apps/server`       | local service: API, coordination, recovery (stub)                                                      |
| `apps/web`          | React + Vite web UI (scaffold)                                                                         |
| `packages/*`        | contracts, application, storage, git-workspace, sandbox, runtime, verifier, evidence, policy, adapters |
| `docs/development/` | normative development rules                                                                            |
| `docs/adr/`         | architecture decision records                                                                          |

The canonical product specification is `Verdicta-проект.txt` (Russian).

## Development

Requires Node.js 24 and pnpm 12.

```text
pnpm install
pnpm verify     # format:check + lint + typecheck + test + build
```

Contributing rules live in `CONTRIBUTING.md`; agent-facing operational rules
in `AGENTS.md`.

## License

Apache-2.0. See `LICENSE` and `NOTICE`. Verdicta is an independent
implementation and does not reuse code, prompts, storage schemas, or UI
design from third-party projects.
