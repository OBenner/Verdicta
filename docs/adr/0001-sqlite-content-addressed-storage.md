# ADR-0001: SQLite plus content-addressed artifact store as the source of truth

- **Status:** proposed
- **Date:** 2026-11-09
- **Deciders:** operator (pending acceptance with the `packages/storage`
  implementation)
- **Related:** EVID-001, EVID-002, EVID-003, STATE-003, STATE-007;
  product specification §10 (Хранение), §5.3, §9.4; ADR: none yet

## Context

Verdicta's core guarantee is evidence: every run produces a durable,
tamper-detectable record (runs, attempts, leases, approvals, verdicts,
logs, diffs, reports) that must survive process restarts and remain
verifiable offline. The system is local-first: no external SaaS database
is available or permitted, and the core must work without network access.

The specification (§10) already fixes the storage split, but the choice
of mechanism — embedded SQLite plus a file store addressed by SHA-256,
rather than any alternative — has long-term consequences for migrations,
recovery, retention, and forensic verification, and therefore needs a
decision record.

Forces that shape the decision:

- **Durability and atomicity.** State transitions and their events must
  be recorded atomically; a crash must never leave a half-written run
  record (§10.1, STATE-007).
- **Immutability.** A finalized `EvidenceBundle` never changes; a
  correction creates a new linked bundle (EVID-002). Content addressing
  gives tamper evidence by construction.
- **Volume asymmetry.** Relational state is small (tasks, runs, leases,
  approvals); artifacts are large (stdout/stderr, diffs, check reports,
  manifests — §7 of the specification).
- **Portability.** Bundle paths must not depend on the user repository
  location; bundles are moved and verified offline via hashes (§10.2).
- **Operational simplicity.** Single-operator, loopback-only product:
  no server processes beyond Verdicta itself.
- **Prior art.** Runproof, the mandatory prior art named in the
  specification, stores history in SQLite; divergence from it must be
  justified, not accidental.

## Options considered

### Option A: SQLite + content-addressed files (chosen)

- Relational state in embedded SQLite; artifacts as files named/verified
  by SHA-256; SQLite stores relative path, size, MIME type, and hash —
  never the blob itself.
- Pros: atomic multi-row transactions (state + event in one commit);
  zero external services; mature backup/recovery story; tamper-evident
  artifacts; offline hash verification without the service running;
  matches prior art.
- Cons / risks: single-writer concurrency limits; schema migrations are
  our responsibility; filesystem and DB can drift, requiring the
  reconciler (STATE-007) to cross-check them.

### Option B: JSONL event log as primary storage

- Append-only JSONL per run as the state mechanism; rebuild views by
  replay.
- Pros: extremely simple to append and inspect; natural event export
  format.
- Cons / risks: no atomic multi-entity transactions; no constraints or
  queries without a full replay; compaction becomes a second storage
  engine we would have to build. Rejected as the primary mechanism —
  but JSONL remains permitted as an **export** format (EVID-003), so
  this option's real benefit is preserved without its costs.

### Option C: PostgreSQL (or another client-server DBMS)

- Pros: full SQL, concurrency headroom, tooling.
- Cons / risks: requires a running server — contradicts local-first
  operation and adds installation/upgrade burden for every operator;
  the MVP has no multi-writer workload that would justify it.

### Option D: Git as the storage engine

- Store state and artifacts in a dedicated git repository.
- Pros: immutable history, content addressing built in.
- Cons / risks: poor fit for mutable, lease-guarded relational state
  (runs, attempts, approvals); git's own locking does not give us
  transactional state-machine transitions; evidence and the user's
  repository must not be entangled.

### Option E: Do nothing (keep storage unspecified)

- Cons / risks: `packages/storage` is the next package to receive real
  code; without a recorded decision the schema, migration discipline,
  and hash verification obligations would be re-litigated per PR.
  Rejected.

## Decision

Adopt **SQLite + content-addressed artifact store** as the single source
of truth for Verdicta state and evidence, implementing EVID-003 and the
specification's §10:

1. **SQLite owns relational state:** tasks and contract versions
   (EVID-001), runs, attempts, leases (STATE-003), approvals,
   runtime/session identifiers, artifact indexes, and final verdicts.
2. **Atomicity rule:** a state transition and its associated event(s)
   are committed in a single SQLite transaction. There is no code path
   that writes one without the other.
3. **Artifacts are files, not rows:** stdout/stderr, diffs, reports, and
   manifests are stored as files addressed by SHA-256. SQLite records
   only the relative path, size, MIME type, and hash per artifact.
4. **Path independence:** artifact paths inside the store are relative
   and never embed the user repository location; a bundle must verify
   offline by hash alone.
5. **Migrations are versioned** and are tested for upgrade from the
   previous schema version before any release that changes the schema.
6. **Deletion is explicit only:** evidence is removed solely by an
   explicit retention/cleanup command, which never touches the user's
   branches (§10.2).
7. **JSONL is export-only** (EVID-003) and MUST NOT be loaded as
   transactional state at any point.

## Consequences

- Positive: evidence is tamper-evident and offline-verifiable; state
  transitions are atomic; no external service dependency; reconciler
  (STATE-007) can trust the DB as the anchor when cross-checking
  containers, sessions, and worktrees.
- Negative: we must implement and test schema migrations ourselves;
  write concurrency is serialized (acceptable for a single-operator
  MVP); DB/filesystem drift is a real failure mode the reconciler must
  detect and record as recovery events.
- Follow-up work: schema versioning mechanism in `packages/storage`;
  artifact store layout (directory scheme, hash verification on read of
  finalized bundles); migration upgrade tests; a retention/cleanup
  command specification; `doctor` checks for store integrity and
  writability.

## Revisit conditions

- Multi-operator or multi-instance access becomes a product requirement
  (SQLite's single-writer model may then be the bottleneck).
- Measured evidence that artifact volume or query load exceeds what the
  file-plus-index model handles with acceptable latency.
- A platform constraint (e.g. unreliable filesystem semantics on a
  supported OS) breaks the atomicity or content-addressing guarantees
  above.
- The specification's §10 is revised — the specification wins; this ADR
  would then be superseded, not silently violated.
