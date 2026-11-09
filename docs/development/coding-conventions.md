# Coding Conventions

Normative TypeScript rules for the Verdicta workspace.

Principle: rules a formatter or linter can enforce belong to the tools
(Prettier / ESLint / TypeScript), not to this document. This document covers
the conventions that tools cannot enforce reliably.

## 1. Language and module system

- TypeScript with `strict: true` and all recommended strictness flags.
- ESM everywhere (`"type": "module"`); explicit file extensions in relative
  imports as required by Node ESM resolution.
- Every package declares explicit `exports` in `package.json`; importing
  across package boundaries via deep relative paths is forbidden.
- Target runtime for the service: Node.js 24 LTS line.

## 2. Types over strings and `any`

- No `any` in domain or application code. If a third-party boundary forces
  an `unknown`, narrow it immediately at the boundary.
- Domain states (`Run` status, `Verdict`, approval state, network profile)
  are string-literal unions or enums, never free-form strings.
- Branded or distinct types for identifiers that must not be mixed:
  `RunId`, `AttemptId`, `ContractId`, `LeaseOwner`, artifact hashes.
- A missing value and an empty value are different: model them explicitly
  (`null` vs absent field vs empty collection).

## 3. Errors

- Typed errors: domain errors are classes or discriminated unions with a
  stable `code`, not thrown strings.
- Empty `catch` blocks are forbidden. A `catch` must rethrow, classify and
  handle, or record the failure with context.
- Errors crossing a process or API boundary are serialized with a stable
  code and a safe message — never with stack traces or secret values to
  untrusted surfaces.
- Distinguish error classes in control flow: usage error, transient
  infrastructure error, permanent infrastructure error, policy refusal,
  verification failure. They map to different retry and CLI exit-code
  behavior.

## 4. Concurrency and cancellation

- Long-running operations accept an `AbortSignal` and honor it promptly.
- Every external call (Docker, agent process, network) has an explicit
  timeout; there are no unbounded waits.
- Retries are bounded, use backoff, and are allowed only for classified
  transient errors (see `architecture-and-invariants.md` §6). The retry
  budget is visible in logs and, for runs, in the evidence.
- State transitions are transactions: a status change and its associated
  event record are written atomically. No "update row now, write event
  later" sequences.

## 5. Logging and observability

- Structured logs (JSON or equivalent), with correlation IDs and
  run/attempt identifiers on every line that relates to a run.
- Logs never contain secret values, full credential material, or unbounded
  payloads. Redaction rules from `security-and-secrets.md` apply.
- Large outputs (agent stdout/stderr, diffs, reports) are streamed to the
  artifact store; never load them fully into memory to log or to display.
- Log levels mean what they say: `error` is actionable; `warn` is
  suspicious; `info` is normal flow; `debug` is off by default.

## 6. Storage and schemas

- SQLite access goes through the storage package only; no ad-hoc SQL in
  application or app code.
- Migrations are versioned, forward-only, and tested for recovery from the
  previous schema version.
- Persisted schemas (contracts, bundles, manifests) carry a
  `schemaVersion` and are validated on read; unknown future versions fail
  closed, not silently parse partially.
- Artifact store entries are content-addressed (SHA-256); SQLite stores the
  relative path, size, MIME type, and hash — not the content.

## 7. API and naming

- Exported API surfaces are small and deliberate; internal helpers are not
  exported from package entry points.
- Names reflect the domain language of the specification: `TaskContract`,
  `Run`, `Attempt`, `RepairRound`, `ChangeSet`, `EvidenceBundle`,
  `Verdict`. Do not invent synonyms (`Job`, `Pipeline`, `Result`) for
  existing domain terms.
- Comments explain _why_, not _what_. Code that needs a paragraph of
  explanation to be parsed should be rewritten instead.
- Time values are stored as UTC ISO-8601 (or epoch ms) with the field name
  saying which; never ambiguous local time strings.

## 8. Change discipline

- No unrelated refactoring inside a task. If you notice a problem outside
  the task scope, report it; do not fix it silently in the same change.
- Public contract changes (domain types, API routes, CLI flags, persisted
  schemas) require updating the relevant documentation in the same change.
- Dead code is removed, not commented out.

## 9. License headers

Every source file (TypeScript, JavaScript, and other code files where the
syntax permits comments) carries a short SPDX header instead of the full
Apache-2.0 boilerplate:

```text
// Copyright <year> The Verdicta Authors
// SPDX-License-Identifier: Apache-2.0
```

Rules:

- Two lines, no full license text in file headers; the canonical text lives
  in `LICENSE`, attribution in `NOTICE`.
- `<year>` is the year the file was first created; it is not bumped on
  later edits.
- Generated files and third-party vendored files are exempt (vendored code
  keeps its original license header and is recorded in `NOTICE`).
- The scaffolding task adds a lint/format check (or a `verify` step) that
  fails when a source file lacks the header.
