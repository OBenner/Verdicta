# Scaffolding Plan

Plan for the first code change in the repository: the monorepo skeleton with
working automated gates. This is the task that turns the documentation-only
phase into an enforceable one — it implements the third layer of the rules
system (formatter, linter, typecheck, tests) and updates `AGENTS.md` with
the real, verified commands.

This document is a plan, not a specification. Domain meaning comes from the
product specification and `architecture-and-invariants.md`.

## 1. Scope

In scope:

- pnpm workspace with the target layout (`apps/*`, `packages/*`).
- TypeScript base configuration (strict, ESM, Node 24).
- The standard `scripts` contract in every package.
- Formatter, linter, typecheck, and a test runner that actually run.
- A minimal `packages/contracts` module with placeholder domain types and
  one real test, so that `test` is not an empty gate.
- Root tooling configuration (one source of truth, inherited by packages).
- Update of `AGENTS.md` and `CONTRIBUTING.md` with the verified commands.
- `README.md` (English, short: what Verdicta is, phase, how to run gates).

Explicitly out of scope:

- Any runtime behavior of Verdicta itself (server, coordinator, Docker,
  adapters). Those are later tasks with their own plans and, where
  significant, ADRs.
- CI/CD configuration (a separate change once the local gates are stable).
- Publishing configuration (npm names remain subject to the release check).

## 2. Target layout

```text
package.json                 — root, private, workspace scripts
pnpm-workspace.yaml
tsconfig.base.json           — strict ESM base, Node 24 libs
.prettierrc.json / .prettierignore
eslint.config.js             — flat config, typescript-eslint
.gitignore                   — node_modules, dist, coverage, artifacts
.editorconfig

apps/
  cli/                       — placeholder package, scripts contract only
  server/                    — placeholder package, scripts contract only
  web/                       — placeholder (React + Vite added when the UI
                               task starts; for now a package stub or
                               deferred creation — see open questions)

packages/
  contracts/                 — domain types: TaskContract, Run, Verdict,
                               ChangeSet, EvidenceBundle (skeleton + tests)
  application/               — stub
  storage/                   — stub
  git-workspace/             — stub
  sandbox/                   — stub
  runtime/                   — stub
  verifier/                  — stub
  evidence/                  — stub
  policy/                    — stub
  adapters/                  — stub
```

Stubs contain only: `package.json` (name `@verdicta/<name>`, `type:
module`, explicit `exports`), a `tsconfig.json` extending the base, an
`src/index.ts` placeholder export, and the scripts contract. No invented
logic.

## 3. Scripts contract

Every package and the root MUST provide:

| Script         | Tool (planned)                             | Meaning                                                                           |
| -------------- | ------------------------------------------ | --------------------------------------------------------------------------------- |
| `build`        | `tsc` (or `tsup` where bundling is needed) | emits to `dist/`                                                                  |
| `typecheck`    | `tsc --noEmit`                             | strict, zero errors                                                               |
| `lint`         | `eslint`                                   | zero errors                                                                       |
| `format:check` | `prettier --check`                         | zero diffs                                                                        |
| `test`         | `vitest run`                               | may be a no-op placeholder suite per package, but the command must exist and pass |

Root scripts run the contract across the workspace via `pnpm -r`, plus
`pnpm verify` = `format:check && lint && typecheck && test && build` in
that order (cheap failures first).

Rules:

- The scaffolder must execute `pnpm verify` once and paste the real output
  into the final report. Only then may `AGENTS.md` list these commands as
  working.
- No script may be declared that has not been run successfully.

## 4. Tooling choices to validate during the task

- **Package manager:** pnpm (per the specification).
- **Test runner:** vitest — ESM-native, TypeScript without extra build
  steps, watch mode for TDD. If evaluation shows a blocker, record the
  alternative choice in an ADR.
- **Lint:** ESLint flat config + typescript-eslint strict rules; no style
  rules that Prettier owns.
- **Formatting:** Prettier.
- **Node:** `.nvmrc` / `engines` pinning Node 24.

## 5. packages/contracts content (first real code)

Skeleton types only, faithful to the specification's domain model — no
behavior:

- `TaskContract` (with `schemaVersion`, `changePolicy: "required" |
"allowed" | "forbidden"`, limits, network profile `"none" | "allowlist" |
"full"`);
- `Run` with the technical status union (`queued`, `preparing`, `running`,
  `awaiting_approval`, `verifying`, `repairing`, `cancelling`,
  `cancelled`, `completed`, `failed`);
- `Verdict` = `"passed" | "needs_review" | "blocked" | "failed"`;
- `ChangeSet`, `EvidenceBundle` (fields per specification §7, as
  interfaces).

Tests (real, from day one):

- the status union contains exactly the ten specified states;
- the verdict union contains exactly the four specified values;
- a JSON round-trip of a sample `TaskContract` preserves its content hash.

These tests anchor the domain vocabulary against accidental renames.

## 6. Definition of done for the scaffolding change

1. `pnpm install` completes from a clean checkout.
2. `pnpm verify` passes end to end; the actual output is quoted in the
   final report.
3. `AGENTS.md` "Current phase" section is updated in the same change:
   phase becomes "scaffolded, pre-feature", and the verified commands are
   listed.
4. `CONTRIBUTING.md` gains the "how to run the gates" subsection with the
   same verified commands.
5. No dependency is added without a one-line justification in the PR
   description / final report.
6. No ADR is required for this change unless a tooling choice from §4 is
   replaced.

## 7. Open questions for the operator — RESOLVED (2026-11-09)

1. `apps/web`: ~~stub or defer?~~ **Decision: full Vite + React scaffold
   during this task.**
2. Git initialization and first commits: **Decision: the scaffolder runs
   `git init` and creates local commits (Conventional Commits). No push.**
3. Node/pnpm version pinning: **Decision: `packageManager` field (corepack)
   plus `engines` in the root `package.json`; no `.nvmrc`.**
