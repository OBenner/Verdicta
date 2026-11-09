# Task M1-1: EvidenceBundle + content-addressed artifact store

- **Date:** 2026-11-09
- **Status:** ready for an implementer
- **Milestone:** M1 — Domain core (closes it)
- **Work order per:** architecture-governance Layer 3 (ADR as work order)
- **Governing ADRs:** ADR-0001 (SQLite + content-addressed store),
  ADR-0008 (EvidenceBundle lifecycle)
- **Requirement IDs:** EVID-001, EVID-002, EVID-003, SEC-004, VER-003
- **Spec sections:** §7.5 (EvidenceBundle), §10 (Storage), §5.3–5.4
  (artifacts, not claims; fail closed)

## 1. Objective

Implement the evidence substrate every later milestone depends on:

1. **Content-addressed artifact store** (ADR-0001): artifacts are files
   named/verified by SHA-256; SQLite records only relative path, size,
   MIME type, and hash — never the blob.
2. **EvidenceBundle lifecycle** (ADR-0008): append-then-finalize,
   finalize exactly once enforced by the storage layer, hash-chained
   successor bundles via `supersedesBundleId`, offline verification as a
   first-class pure function.

## 2. Scope

In scope:

- `packages/evidence` (currently a stub):
  - Bundle assembly API over the existing `EvidenceBundle` types in
    `@verdicta/contracts` (`evidence.ts` — do not modify the contract
    shape; any needed change is escalated, not made silently).
  - Manifest computation: SHA-256 per artifact via `node:crypto`,
    streaming reads for large files (coding-conventions: no loading
    large logs into memory).
  - `finalize(bundle)`: completes the manifest, seals the bundle.
  - `verifyBundle(bundleDir)`: offline verification — recompute every
    artifact hash against the manifest, report mismatches; runs without
    the service, the database, or network access.
- `packages/storage`:
  - New migration (version 3+) adding the artifact index and bundle
    records, following the existing forward-only `MIGRATIONS` pattern in
    `database.ts`.
  - Finalize-once enforcement: writes to a finalized bundle are rejected
    by the storage layer itself, not by convention (ADR-0008 decision
    #2) — this is the fitness function named in
    `architecture-governance.md` Layer 1.
  - Successor-chain persistence: `supersedesBundleId` stored and
    queryable.
- Tests (see §4).
- If a design choice emerges that the ADRs do not prescribe (e.g.
  directory layout scheme), record it in the PR description's Key
  decisions; only a contradiction with an ADR requires a new ADR.

Out of scope (explicitly):

- JSONL event export (ADR-0008 decision #6) — separate task.
- The `verdicta verify <bundle>` CLI command — arrives with `apps/cli`
  in M5; this task delivers the library function only.
- Retention/cleanup and chain-aware deletion semantics.
- Verdict recomputation during verification (ADR-0008 decision #4 names
  it; wire-up happens when the verifier package exists in M4 — design
  `verifyBundle` so this plugs in later).

## 3. Boundaries and constraints

- Domain purity: `packages/evidence` is covered by the `boundaries.yml`
  grep gate — only relative imports, `@verdicta/*`, and `node:*`
  builtins.
- No new runtime dependencies without operator approval (`node:crypto`,
  `node:fs`, `node:sqlite` suffice).
- An agent-writable path must never be able to write into a bundle
  (SEC-004): the bundle API takes content from the application service
  only; no API accepts a workspace-controlled path as an artifact source
  without hashing it through the store.
- Atomicity (ADR-0001 decision #2): bundle state changes and their
  events land in a single SQLite transaction, mirroring the existing
  `transitions.ts` pattern.
- Work happens in a dedicated worktree on a branch from up-to-date
  `origin/main` (git-and-review §3). Note: the primary checkout is
  currently on `test/verdict-ordering-properties` with uncommitted PM
  artifacts — branch from `origin/main`, not from the working tree.

## 4. Acceptance criteria

1. **Finalize-once (fitness function).** A storage-level test proves
   every write path to a finalized bundle is rejected: append artifact,
   update manifest, re-finalize. Referenced as ADR-0008 in the test.
2. **Tamper evidence (fault injection, spec §16.3).** Corrupting a
   single byte of a stored artifact or editing the manifest makes
   `verifyBundle` fail closed with a specific mismatch report — never a
   crash, never a pass.
3. **Offline verification.** `verifyBundle` succeeds on a bundle
   directory copied to a location with no database and no service.
4. **Correction chain.** Finalizing bundle B with
   `supersedesBundleId = A` leaves A byte-identical; the chain is
   queryable from SQLite; latest-by-default lookup returns B.
5. **Migration.** Upgrade from schema version 2 to the new version is
   tested from a real v2 database file (migration recovery obligation in
   `database.ts`).
6. **Requirement traceability.** New EVID-\* behavior references its IDs
   in tests; the traceability gate (PR #9) stays green.
7. `pnpm verify` passes from a clean state; real output quoted in the PR
   description (template `.github/pull_request_template.md`, sections
   filled per git-and-review §4a, entirely in English).

## 5. Definition of done

Per `AGENTS.md`: scope respected, every existing mandatory check actually
run and honestly reported, documentation that becomes false updated in
the same change (including `docs/planning/roadmap.md` status for M1, by
the PM after merge).

## 6. Open questions for the operator (resolve before or at PR review)

1. Artifact store root location convention (e.g. `<dataDir>/artifacts/<sha256[0:2]>/<sha256>`)
   — implementer proposes in Key decisions; PM confirms against ADR-0001
   path-independence rule.
2. Maximum artifact size policy for the MVP (none vs. configurable
   limit) — if a limit is wanted, it becomes a contract field later;
   this task may ship without one if noted as a limitation.
