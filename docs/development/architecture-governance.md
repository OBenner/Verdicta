# Architecture Governance

How Verdicta's architecture is kept executable in code — not just declared
in documents. This document defines the architect role's working agreement
with implementing agents and the three layers that protect the invariants.

Roles: an **architect** (owns this document, ADRs, and architectural review)
and one or more **implementers** (write production code against ADRs).

## Layer 1 — Enforcement (CI fitness functions)

Every architectural rule that can be checked mechanically becomes a test or
a CI gate. The architect specifies _what_ is checked; implementers build it.

| Rule                                               | Gate                                                                                                                                                                   |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VER-000 / ARCH-001 (domain purity)                 | `boundaries.yml` grep gate (current). Upgrade path: dependency-cruiser with declarative forbidden-direction rules — requires operator approval as a new dev dependency |
| ADR-0004 (dependencies point inward)               | Same dependency-cruiser config: `application` must not import infrastructure packages                                                                                  |
| ADR-0003 (verdict is a pure, fixed-order function) | Property test: same EvidenceBundle → same verdict; rule-order masking tests                                                                                            |
| ADR-0008 (bundle finalize-once)                    | Storage contract test: writes after finalization are rejected                                                                                                          |
| Requirement traceability (VER-/SEC-/STATE-/EVID-)  | Lint/test gate: every ID in `architecture-and-invariants.md` and `security-and-secrets.md` is referenced by at least one test; adding an ID without a test fails CI    |

A rule that is only documented is considered **at risk**; the architect
tracks it until it has a gate or a conscious, recorded exception.

## Layer 2 — Observation (code analysis)

Read-only analysis tools (dependency graphs, codegraph-style queries,
impact analysis) support architectural review:

- **Drift detection after PRs:** verify no new edges violate the module
  direction rules — especially transitive ones a file-by-file diff misses.
- **Impact analysis before changes:** which adapters/use-cases a port
  change touches.
- **Illustrations for ADRs:** generated module diagrams as attachments.

Observation never replaces enforcement: a graph query is only as good as
its invocation. Blocking decisions belong to deterministic CI gates.

## Layer 3 — Process

- **ADR as the work order.** An implementer receives a specific ADR plus
  the requirement IDs it governs. The architect reviews the result against
  the ADR's enforceable rules, not against taste.
- **PR description.** Uses `.github/pull_request_template.md` (English):
  what was added, key decisions, checks actually run, known limitations,
  and the mandatory "ADRs / requirement IDs" section.
- **CODEOWNERS.** Architectural paths (`docs/adr/`,
  `packages/contracts/`, `packages/application/`) require architectural
  review per `.github/CODEOWNERS`.
- **ADR status transitions.** `proposed → accepted` happens only when the
  architect has verified the implementation against the ADR's rules,
  including its contract tests. `superseded` only via a newer ADR.
- **Specification conflicts.** Where code or docs disagree with
  `Verdicta-проект.txt`, the specification wins and the conflict is
  reported — never silently resolved.

## Adding enforcement tooling

New gates that introduce dependencies (dependency-cruiser, codegraph
runners, custom eslint plugins) require operator approval per AGENTS.md.
Until approved, the architect falls back to the grep gate, manual graph
analysis, and review.
