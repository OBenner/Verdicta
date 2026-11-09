# ADR-0006: Lease-guarded ownership and a startup reconciler for run lifecycle

- **Status:** proposed
- **Date:** 2026-11-09
- **Deciders:** operator (pending acceptance with the run coordinator
  implementation in `packages/application` / `apps/server`)
- **Related:** STATE-003, STATE-004, STATE-005, STATE-006, STATE-007,
  STATE-008; product specification §8, §10.3, §14; ADR-0001, ADR-0002

## Context

Verdicta is a long-lived service whose runs execute in external
processes (Docker workers, agent sessions, git worktrees). The service
can crash or be killed at any point — including the worst window:
after creating a worktree but before recording the container id
(specification §14.3). On restart, Verdicta must answer: what was
running, what is actually still running, and what may safely resume?

Two failure modes must be made impossible:

- **Split brain:** two coordinators (e.g. a zombie process and a
  restarted service) both believing they own the same run, producing
  duplicate containers or conflicting state writes.
- **Lost reality:** records in SQLite claiming a run is `running` while
  its container died hours ago — or a container still running while its
  record says `failed`.

The specification (§8, §10.3) fixes the mechanism: the coordinator is
the only writer of run status, transitions are transactional and guarded
by a lease with owner and expiry, and a reconciler cross-checks records
against reality at startup. This ADR records the shape and obligations
of that mechanism.

## Options considered

### Option A: Lease-guarded transitions + startup reconciler (chosen)

- Every state transition carries the lease owner token and expiry; a
  transition from a stale or foreign owner is rejected. At startup the
  reconciler reconciles records with real containers/sessions/worktrees
  before accepting new work.
- Pros: split brain is prevented by the lease check at the storage
  layer, not by careful coding; recovery is a defined procedure with
  recorded outcomes (recovery events), not improvisation; expired
  leases make crash recovery possible without manual intervention.
- Cons / risks: lease expiry tuning is a real trade-off (too short —
  false takeovers under load; too long — slow recovery); clock skew
  must be considered (mitigated: leases compare expiry on the SQLite
  side, single store, no distributed clocks).

### Option B: Process liveness as the ownership proof

- The coordinator writes "I am alive" heartbeats; ownership is inferred
  from the coordinator process being up.
- Pros: no lease arithmetic.
- Cons / risks: a hung-but-alive process blocks recovery forever; two
  processes can both be alive (split brain unsolved); the scheduler must
  not rely on process liveness without cross-checking real
  Docker/worktree identifiers (specification §8). Rejected as the
  primary mechanism — heartbeats may still refresh leases, but the lease
  is the authority.

### Option C: Single-instance lock file (exclusive flock on the data directory)

- Pros: very simple; prevents two service instances entirely.
- Cons / risks: solves only the inter-service case, not stale records
  after a crash; no owner/expiry semantics per run; stale lock files on
  some filesystems are their own failure mode. Useful as defense in
  depth, insufficient alone. Noted as compatible, not chosen as the
  mechanism.

### Option D: Do nothing — reconcile manually on demand

- Cons / risks: turns every crash into an operator investigation and
  makes "no duplicate while fate is unknown" unenforceable. Rejected.

## Decision

Adopt **lease-guarded ownership with a startup reconciler**,
implementing STATE-003 … STATE-008:

1. Only the run coordinator changes a run's technical status. Every
   transition is a single SQLite transaction (per ADR-0001) that checks
   the lease owner token and expiry: a stale lease can never complete,
   cancel, or otherwise mutate a run owned by another owner
   (STATE-003, STATE-004).
2. Leases have explicit owner identity and expiry; expiry comparison
   happens inside the same transaction as the transition. Heartbeats
   extend a lease; they never substitute for it.
3. Automatic retry is allowed only for classified transient
   infrastructure errors; an operation with external side effects whose
   outcome is uncertain is never retried automatically (STATE-005).
4. Every attempt, retry, and repair round gets its own number, logs,
   and recorded reason; infrastructure retries are never hidden inside
   an attempt (STATE-006).
5. On service start, before accepting new work, the reconciler performs
   the §10.3 procedure: finds expired leases, cross-checks records
   against real containers/sessions/worktrees, starts no duplicate while
   a previous attempt's fate is unknown, marks unconfirmed state as
   requiring a decision, resumes only safe idempotent operations, and
   records every discrepancy as a recovery event (STATE-007).
6. Resume reuses a saved agent session only when the adapter confirms
   identity of session, worktree, branch, and base revision; otherwise a
   new attempt is created with an explicit human decision, and the old
   attempt is never declared successful (STATE-008).

## Consequences

- Positive: crash recovery is a tested procedure, not heroics; split
  brain is prevented structurally; recovery events are auditable
  evidence, consistent with the evidence-first product; the §14.3 fault
  injection scenarios map directly onto reconciler test cases.
- Negative: lease expiry needs operational tuning and honest defaults;
  the reconciler adds startup latency proportional to the number of
  in-flight runs (bounded in practice by the single-operator scale);
  the coordinator's transaction discipline must be maintained forever —
  one raw write bypassing the lease check breaks the guarantee, so
  storage exposes transitions only through a lease-checked API.
- Follow-up work: lease table and lease-checked transition API in
  `packages/storage`; reconciler implementation and its recovery-event
  schema; fault-injection tests per specification §14.3 (death after
  worktree creation, container-id race, session pointing at a foreign
  worktree); documented lease-expiry defaults and their rationale.

## Revisit conditions

- Multi-instance or HA operation becomes a requirement (leases and the
  reconciler would need distributed-clock-safe semantics).
- Evidence that lease-expiry defaults cause false takeovers or
  unacceptably slow recovery in practice.
- A new execution backend whose real-world handles cannot be
  enumerated the way Docker containers/worktrees can (the reconciler's
  cross-check assumption would need re-derivation).
- The specification's §8/§10.3 is revised; the specification wins and
  this ADR is then superseded, not silently violated.
