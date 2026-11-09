# ADR-0003: Verdict computation as a fixed-order, closed ruleset

- **Status:** accepted (2026-11-09 — verified against the
  `packages/application` verdict engine, including the VER-003 fix from
  issue #4)
- **Date:** 2026-11-09
- **Deciders:** operator, architect
- **Related:** VER-001 … VER-007, STATE-001, STATE-002;
  product specification §5.3, §11; ADR-0001

## Context

The `Verdict` is Verdicta's core product promise: a deterministic,
evidence-based statement about a run that is independent of the agent's
own claims (specification §5.3 — "проверяются артефакты, а не уверенность
агента"). Two properties make it trustworthy:

- **Determinism:** the same evidence must always produce the same
  verdict, so a verdict is auditable and reproducible offline.
- **Separation of axes:** a `Run`'s technical status and its `Verdict`
  are different things (STATE-001). An infrastructure failure is not a
  code-quality statement, and an agent's clean exit is not a passed
  check (STATE-002).

The specification (§11) fixes five rules in a fixed order, plus the
restriction on LLM review (VER-007). What remains an architectural
decision is _why this shape_ — a closed, ordered ruleset rather than a
scoring model, a configurable policy language, or LLM judgment — and
what obligations that shape creates for future changes.

## Options considered

### Option A: Fixed-order closed ruleset (chosen)

- Four verdict values (`passed`, `needs_review`, `blocked`, `failed`),
  five rules applied in a fixed order, each to the full result set;
  a later passing rule can never mask an earlier `blocked` or `failed`.
- Pros: fully deterministic and testable rule-by-rule; every verdict can
  be explained by naming the first rule that fired; historical verdicts
  remain interpretable because rule order is stable; no configuration
  surface for an agent or prompt injection to exploit (supports
  SEC-003).
- Cons / risks: inflexible — new failure kinds require extending the
  ruleset itself; rule order must be designed carefully once, because
  reordering changes the meaning of stored verdicts.

### Option B: Weighted severity scoring

- Each finding contributes a score; thresholds map totals to verdicts.
- Pros: smooth expressiveness; tunable per project.
- Cons / risks: verdicts become non-explainable ("score 7.3 →
  needs_review"); thresholds invite per-repo tuning and drift; a high
  count of minor findings could mask one critical one — exactly what the
  fixed order forbids. Rejected.

### Option C: Configurable per-repo policy language for verdicts

- Let each repository define its own verdict rules.
- Pros: flexibility for heterogeneous projects.
- Cons / risks: verdicts stop being comparable across runs and repos;
  the rules live in agent-writable space, contradicting SEC-004 (the
  verifier's rules must be outside the agent's control); auditing a
  verdict requires auditing a program. Rejected for the core ruleset —
  per-repo _checks_ remain configurable in the `TaskContract`, but the
  mapping from check results to verdicts is not.

### Option D: LLM-as-judge verdicts

- Pros: handles non-automatable criteria naturally.
- Cons / risks: non-deterministic, non-reproducible, prompt-injectable;
  would collapse the product's central guarantee. Rejected as a verdict
  source. LLM review is kept in its VER-007 lane: it may add findings or
  recommend `needs_review`, never override the rules.

## Decision

Adopt the **fixed-order closed ruleset** as a stability contract,
implementing VER-001 … VER-007:

1. The `Verdict` type is the closed set of four values — `passed`,
   `needs_review`, `blocked`, `failed`. Adding, removing, or renaming a
   value is a breaking change requiring a new ADR.
2. Rules apply in the fixed order of the specification §11
   (policy/approval → mandatory check execution → change-policy/diff
   integrity → non-automatable residue → `passed`), each to the full
   result set. No later rule may downgrade an earlier `blocked` or
   `failed`.
3. The verdict function is **pure**: `verdict = f(evidence)` with no
   access to the agent's self-reported claims, wall-clock randomness, or
   hidden state. The same finalized `EvidenceBundle` must always yield
   the same verdict (recomputable offline, per ADR-0001).
4. `Run.status` and `Verdict` never collapse into one field or one
   code path (STATE-001, STATE-002): an infrastructure failure yields
   technical `failed`, not a verdict about code quality.
5. LLM review is advisory only, within the VER-007 limits.
6. **Change protocol:** modifying a rule, its order, or the verdict set
   requires (a) a new ADR superseding this one, (b) explicit statement
   of how historical verdicts are reinterpreted or grandfathered, and
   (c) regression tests referencing the affected VER-* IDs.

## Consequences

- Positive: verdicts are deterministic, explainable by rule number, and
  recomputable from evidence alone; the ruleset is a small audit
  surface; tests can exhaustively cover rule interactions; prompt
  injection cannot reach the verdict logic.
- Negative: every genuinely new failure class waits for a ruleset
  amendment instead of a config tweak; the fixed order must be defended
  in review each time someone wants "just one exception".
- Follow-up work: `packages/application` verdict engine as a pure
  function over evidence types from `packages/contracts`; a test suite
  with one fixture per rule plus ordering/masking cases; a verdict
  explanation string (rule ID + evidence references) stored in the
  `EvidenceBundle`.

## Revisit conditions

- A real failure class appears that cannot be expressed without
  reordering or adding rules (then follow the change protocol in rule
  6).
- Multi-tenant or hosted deployment creates demand for per-organization
  verdict policy (would require solving the SEC-004 conflict first).
- The specification's §11 is revised; the specification wins and this
  ADR is then superseded, not silently violated.
