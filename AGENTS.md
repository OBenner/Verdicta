# AGENTS.md — Verdicta

Operational instructions for coding agents working in this repository.
Read this file first. It is intentionally short; normative details live in
`docs/development/` and are linked, not duplicated.

## What this project is

Verdicta is an independent, local-first control plane for delegating tasks to
external coding agents. It does not implement its own coding agent. For each
task it creates a git worktree, runs the chosen external agent in Docker,
observes execution, re-runs the mandatory checks independently, and produces:

```text
ChangeSet + EvidenceBundle + Verdict
```

The canonical product specification is `docs/SPECIFICATION.md` (English,
maintained artifact). The original Russian `Verdicta-проект.txt`
(2026-11-09) is retained at the repository root as the historical source.
Where this file or any other document disagrees with the specification, the
specification wins — report the conflict instead of silently resolving it.

License: Apache-2.0. Verdicta is an independent implementation and borrows
no code, prompts, storage schemas, or UI design from third-party projects.

## Current phase

**Early feature phase.** The pnpm workspace skeleton exists
(`apps/*`, `packages/*`) with real gates and CI. Implemented and tested:
`packages/contracts` (domain types), `packages/application` (Run state
machine, deterministic verdict rules, lease-guarded run coordinator,
startup reconciler), `packages/storage` (SQLite persistence,
migrations, atomic transitions). Still stubs: `apps/cli`, `apps/server`,
`apps/web` (scaffold only), `packages/git-workspace`, `packages/sandbox`,
`packages/runtime`, `packages/verifier`, `packages/evidence`,
`packages/policy`, `packages/adapters`.

Verified commands (executed successfully on 2026-11-09, Node v24.21.0,
pnpm 12.18.0):

```text
pnpm install        # install workspace dependencies
pnpm verify         # format:check + lint + build + typecheck + test
                    # (build precedes typecheck/test: workspace packages
                    # resolve each other via dist/, so a clean checkout
                    # must build first)
pnpm format         # normalize formatting before committing
pnpm -r test        # tests only
pnpm --filter @verdicta/web dev   # Web UI dev server (loopback)
```

Rules:

- Run `pnpm verify` before declaring any change done; report its real
  output. Do not claim a check passed without running it.
- If you add a package, it MUST provide the full scripts contract
  (`build`, `typecheck`, `lint`, `format:check`, `test`) — see
  `docs/development/scaffolding-plan.md` section 3.
- Dependency build scripts are approved via `allowBuilds` in
  `pnpm-workspace.yaml`; adding a new entry there requires operator
  approval.

## Read before you touch

Before modifying a subsystem, read the matching normative document:

| Area                                                       | Document                                          |
| ---------------------------------------------------------- | ------------------------------------------------- |
| Module boundaries, domain model, state machine, invariants | `docs/development/architecture-and-invariants.md` |
| TypeScript style, errors, concurrency, logging             | `docs/development/coding-conventions.md`          |
| Tests, verification claims, fault injection                | `docs/development/testing-and-verification.md`    |
| Trust boundaries, Docker, secrets, network                 | `docs/development/security-and-secrets.md`        |
| Commits, branches, PRs, ADRs                               | `docs/development/git-and-review.md`              |
| Architect/implementer roles, fitness functions, gates      | `docs/development/architecture-governance.md`     |

Architectural decisions are recorded as ADRs in `docs/adr/` using
`docs/adr/template.md`.

## Prohibited actions

Unless the task explicitly and verifiably requires otherwise, do NOT:

- run `git push`, `git merge`, or modify the main branch;
- force-push or rewrite published history;
- introduce a model API key requirement into the core or the local UI;
- let ACP / MCP / vendor SDK types leak into domain types
  (`TaskContract`, `Run`, `ChangeSet`, `EvidenceBundle`, `Verdict`);
- implement automatic merge, push, or PR publication — this is out of scope
  for the MVP by design;
- fall back from Docker execution to host execution;
- copy code, prompts, schemas, or UI from any third-party project;
- perform unrelated refactoring or change files outside the task scope;
- create parallel `CLAUDE.md`, `CODEX.md`, or similar copies of this file.
  Nested `AGENTS.md` files are added only when real differences between
  `apps/*` and `packages/*` appear.

## Actions requiring explicit approval

Ask the user before:

- changing any rule in `docs/development/` or the verdict rules in the
  specification;
- adding a new runtime dependency or a new package to the workspace;
- changing the `Run` state machine, the `Verdict` values, or the verdict
  rule order;
- weakening any security boundary (Docker isolation, network profiles,
  secret handling);
- deleting or rewriting evidence-related code or stored artifacts.

## Definition of done for a task

A task is complete only when all of the following hold:

1. The change stays within the task scope.
2. Every mandatory check that exists at the current phase was actually
   executed, and its real result is reported.
3. No check was reported as passed without being run.
4. Documentation that becomes false because of the change is updated in the
   same change.

## Mandatory final report

Every completed task must report, in plain terms:

- what was changed (files / modules);
- which checks were run and their actual outcomes (including failures);
- known limitations, deviations, or risks;
- anything deliberately left out of scope.

A report of "done" without executed checks is not acceptable. In Verdicta
itself, an agent's claim is never evidence — behave accordingly.
