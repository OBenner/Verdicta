# Git and Review

Normative rules for commits, branches, pull requests, and decision records
in the Verdicta repository itself.

## 1. Change size and scope

- One change does one thing. Keep changes small and isolated.
- No unrelated refactoring, formatting sweeps, or opportunistic cleanup in
  a task-scoped change. Found a problem outside scope? Report it separately.
- Documentation that becomes false because of a code change is updated in
  the same change — not "later".

## 2. Commits

We use [Conventional Commits](https://www.conventionalcommits.org/):

```text
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

Common types:

| Type           | Use for                           |
| -------------- | --------------------------------- |
| `feat`         | a new capability                  |
| `fix`          | a bug fix                         |
| `docs`         | documentation only                |
| `test`         | adding or correcting tests        |
| `refactor`     | behavior-preserving restructuring |
| `perf`         | performance improvement           |
| `build` / `ci` | build system or CI changes        |
| `chore`        | everything else (deps, tooling)   |

Rules:

- The description is written in the imperative mood: "add lease expiry
  check", not "added" / "adds".
- A breaking change is marked with `!` or a `BREAKING CHANGE:` footer.
- Commits reference requirement IDs (`VER-003`, `SEC-007`, …) in the body
  when they implement or change a tracked requirement.
- Conventional Commits gives us a uniform history and enables automated
  changelog and release tooling later.

## 3. Branches, worktrees, and history

- Work happens on short-lived feature branches, not directly on the main
  branch.
- **Each development task gets its own git worktree** created from an
  up-to-date `main` (e.g. `git worktree add ../verdicta-wt/<task> -b
feat/<task> main`). The primary checkout stays clean for other agents
  and operators; parallel work never fights over one working tree.
- A worktree is removed once its branch is merged and the user confirms
  cleanup.
- No `push --force`, no rebasing or rewriting published history, without an
  explicit request from the user.
- No push at all without an explicit request — local commits are the
  default end state of an agent's work. (This mirrors the product rule:
  Verdicta itself never merges or pushes automatically.)

## 4. Pull request readiness

A PR (or a change presented for review) is ready when:

1. The change is scoped and complete for its stated purpose.
2. All mandatory checks that exist were run, and their real results —
   including failures — are reported in the PR description or the final
   report.
3. Tests follow the honesty rules in `testing-and-verification.md`
   (regression test first, no weakening tests to match behavior).
4. Documentation and requirement references are updated in the same change.
5. The diff contains no secrets, no large generated artifacts, and no
   unrelated files.

## 4a. Pull request description standard

PR descriptions are written **entirely in English**, with a Conventional
Commits title, and follow this section structure (established with PR #1):

1. **What was added** — what the change contains; a table for enumerations
   (files, workflows, commands) is preferred over prose.
2. **Key decisions** — design choices made within the task scope and their
   rationale. Decisions beyond task scope are escalated to an ADR instead
   of being buried here.
3. **Checks (executed locally)** — only checks that were actually run,
   with their real outcomes. Quoting `pnpm verify` output is the norm.
4. **Known limitations** — what is deliberately not covered, risks, and
   deferred work.
5. **After merge** — follow-up actions the merge unlocks or requires
   (branch protection settings, deployments), when applicable.

Sections that are genuinely empty are omitted rather than filled with
boilerplate — except _Checks_, which is mandatory.

## 5. Architecture decision records

- An ADR is written for significant architectural decisions: new domain
  concepts, changes to the state machine or verdict rules, new trust
  boundaries, technology choices with long-term consequences.
- An ADR is NOT written for routine bug fixes, dependency bumps, or small
  internal refactors.
- ADRs live in `docs/adr/`, numbered sequentially
  (`0001-short-title.md`), using `docs/adr/template.md`.
- ADRs are immutable once accepted except for marking them superseded by a
  newer ADR.

## 6. Licensing hygiene

- Every contribution is Apache-2.0.
- Do not import code, prompts, storage schemas, or UI design from any
  third-party project — including "temporary" copies. Copyleft-licensed
  (e.g. AGPL) prior art in this problem space is particularly incompatible
  with this repository.
