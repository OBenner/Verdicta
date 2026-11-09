# ADR-0010: changePolicy semantics and forbidden-path enforcement

- **Status:** proposed
- **Date:** 2026-11-09
- **Deciders:** operator (pending acceptance with the `packages/policy`
  implementation)
- **Related:** VER-004, SEC-003, SEC-004; product specification §7.4,
  §9.5; ADR-0002, ADR-0003, ADR-0008

## Context

Every `TaskContract` declares whether code changes are expected:
`changePolicy` is `required` (a fix/feature task — a diff must exist),
`allowed` (investigation that may or may not change files), or
`forbidden` (read-only analysis — any diff is a violation). The contract
may also declare forbidden paths that must not be modified regardless of
policy.

The verdict consequence is fixed by VER-004: modified forbidden paths, a
missing mandatory diff (`required`), or any diff under `forbidden` all
yield `failed`. The specification §7.4 adds the empty-diff rule: an
empty diff is legal only under `allowed` or `forbidden`; under
`required` it is always `failed`.

What needs a decision is the _enforcement semantics_: what counts as a
diff, how forbidden paths are matched, who computes the answers, and how
this survives an adversarial agent.

## Options considered

### Option A: Verdicta-side diff computation with exact path rules (chosen)

- Verdicta computes the `ChangeSet` itself from the preserved worktree
  and branch (base revision → head commit, plus untracked/binary
  changes); policy evaluation compares that computed diff against the
  contract's rules. The agent is never asked what it changed.
- Pros: consistent with "artifacts, not agent claims" (specification
  §5.3) and SEC-004 — the evaluator is outside the agent's control;
  one canonical definition of "diff" for the verdict, the evidence, and
  the UI; untracked and binary changes are first-class, closing the
  "delete the diff" evasion.
- Cons / risks: git edge cases (renames, mode changes, submodules,
  CRLF normalization) must be specified once and tested; binary-change
  detection adds implementation work.

### Option B: Agent-reported change list, spot-checked

- Pros: cheap to implement.
- Cons / risks: the verdict would rest on the agent's claim — the exact
  failure mode VER-003/VER-004 exist to prevent. Rejected.

### Option C: Filesystem-level write blocking (mount everything read-only except allowed paths)

- Pros: prevention instead of detection.
- Cons / risks: build tools routinely write to unpredictable locations
  (caches, lockfiles); over-blocking breaks legitimate runs,
  under-blocking gives false confidence. Docker mounts (ADR-0002)
  already limit the _workspace_; path policy is a _contract_ judgment,
  which belongs in the verifier. Prevention via mounts stays a hardening
  option per worker, not the policy mechanism. Rejected as the
  enforcement point.

## Decision

Adopt **Verdicta-side computation with exact rules**, implementing
VER-004 and specification §7.4:

1. The `ChangeSet` (diff, hash, changed files, untracked/binary changes,
   path-policy violation flags) is computed by Verdicta from the
   preserved worktree and branch — never from agent output.
2. `changePolicy` semantics are exactly:
   - `required` — an empty diff is `failed`; a non-empty diff proceeds
     to the remaining verdict rules;
   - `allowed` — empty or non-empty diff both proceed;
   - `forbidden` — any diff is `failed`, and an empty diff is the only
     non-failing shape.
     "Empty" and "any" are evaluated over the full `ChangeSet`, including
     untracked and binary changes — a run that only adds an untracked file
     is **not** an empty diff.
3. Forbidden paths are matched against every path in the `ChangeSet`
   (modified, added, deleted, renamed-to/from). Any match is `failed`.
   The matching grammar (exact paths vs. directory prefixes vs. globs)
   is defined once in `packages/contracts` and validated at contract
   creation, so ambiguous rules never reach a run.
4. A diff-hash is recorded in the `EvidenceBundle`; the verdict's
   rule-4 evaluation cites the `ChangeSet` hash, keeping the chain
   evidence → verdict auditable offline (ADR-0003, ADR-0008).
5. Forbidden-path lists and `changePolicy` come only from the
   `TaskContract`; repository contents or agent output cannot extend or
   shrink them (SEC-003).

## Consequences

- Positive: one canonical, tested definition of "what changed"; the
  evasion classes (untracked files, binary edits, renames) are covered
  by construction; contract validation catches bad rules before a run
  burns resources; the verdict cites a hash, not a description.
- Negative: git edge cases need a maintained test matrix; large
  monorepo diffs make `ChangeSet` computation non-trivial (bounded by
  the one-repo-per-task MVP scope).
- Follow-up work: `ChangeSet` computation in `packages/git-workspace`;
  the path-matching grammar and its validator in `packages/contracts`;
  verdict rule-4 fixtures covering: empty diff under each policy,
  untracked-only change, binary change, rename into a forbidden path,
  forbidden path declared via each grammar form.

## Revisit conditions

- A real workflow needs preventive (mount-level) path enforcement in
  addition to detection — would be added as hardening, not as a
  replacement for verdict-side evaluation.
- Monorepo scale makes full-`ChangeSet` computation a bottleneck.
- The specification's §7.4 is revised; the specification wins and this
  ADR is then superseded, not silently violated.
