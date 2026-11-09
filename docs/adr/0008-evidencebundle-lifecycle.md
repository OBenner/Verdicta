# ADR-0008: EvidenceBundle lifecycle — finalize once, link corrections, verify offline

- **Status:** proposed
- **Date:** 2026-11-09
- **Deciders:** operator (pending acceptance with the `packages/evidence`
  implementation)
- **Related:** EVID-001, EVID-002, EVID-003, VER-003; product
  specification §5.3, §7.5, §10.2; ADR-0001, ADR-0003

## Context

The `EvidenceBundle` is the artifact that makes a `Verdict` checkable
without trusting Verdicta itself: contract hash, revisions, diff,
environment description, independently executed commands with exit codes
and durations, stdout/stderr artifacts, machine reports, approval and
cancel events, attempts/retries/repair-rounds, policy results, the
agent's summary explicitly marked `unverified`, limitations, and a
manifest with the SHA-256 of every artifact (specification §7.5).

Three lifecycle questions need a decision beyond "bundle exists":

- **When does a bundle become immutable?** During a run, evidence is
  being appended; consumers need a clear finalization point after which
  the bytes never change (EVID-002).
- **How are corrections represented?** Reality requires fixing or
  superseding results — without rewriting history.
- **How is a bundle checked independently?** The product promise is
  verification of artifacts, not of claims — so verification must work
  offline, from the bundle alone, against ADR-0001's store.

## Options considered

### Option A: Append-then-finalize with hash-chained successor bundles (chosen)

- A bundle is mutable while its run is in flight; finalization seals it
  (manifest computed, hash recorded, no further writes). A correction
  creates a new bundle that references its predecessor; the predecessor
  is never edited.
- Pros: immutability is a property of bytes, not of discipline —
  verifiable by hash; corrections are auditable history rather than
  silent edits; offline verification needs only the manifest and the
  files (ADR-0001, specification §10.2); mirrors the
  contract-versioning rule (EVID-001) so the model is uniform.
- Cons / risks: storage grows with every correction (bounded by
  retention policy per ADR-0001); tooling must present the _latest_
  bundle by default while keeping the chain inspectable.

### Option B: Mutable bundle updated in place, guarded by ACLs

- Pros: less storage; simpler reads.
- Cons / risks: immutability becomes an operational promise instead of
  a verifiable fact; a bug or compromise can rewrite evidence without a
  trace — the exact failure an evidence-first product exists to
  prevent. Rejected (EVID-002 forbids it outright).

### Option C: New bundle per event batch (no finalization concept)

- Pros: immutability from the start; no sealing step.
- Cons / risks: fragments the evidence of one run across many bundles;
  verdict computation (ADR-0003, pure over evidence) loses its single
  well-defined input. Rejected.

### Option D: Signed but mutable bundles (signature refreshed on change)

- Pros: detects tampering.
- Cons / risks: requires key management (a new trust anchor in a
  local-first product) and still permits sanctioned silent edits.
  Content addressing already provides tamper evidence without keys.
  Rejected.

## Decision

Adopt **append-then-finalize with hash-chained successor bundles**,
implementing EVID-002 and the specification's §7.5:

1. A bundle is created at run start in a `collecting` state and accepts
   appends (events, artifacts, check results) only while the run is in
   flight. Only the application service appends (ADR-0004); an
   agent-writable path can never write into a bundle (SEC-004).
2. Finalization happens exactly once per bundle, when the run reaches a
   terminal state: the manifest with every artifact's SHA-256 is
   completed and recorded in SQLite (ADR-0001), and the bundle becomes
   immutable bytes. Writes after finalization are rejected by the
   storage layer, not by convention.
3. Correcting or superseding a result creates a new bundle with a
   `supersedes` reference to the previous one; both remain stored.
   UI and API default to the latest bundle in a chain and expose the
   chain explicitly.
4. Offline verification is a first-class operation: given a bundle
   directory, recompute every artifact hash against the manifest and
   recompute the verdict from the evidence (ADR-0003) without the
   service, the database, or network access.
5. The agent's own summary is stored in the bundle but always rendered
   and exported with the `unverified` marker (specification §7.5);
   removal of the marker is a contract violation.
6. JSONL exports of events may be produced from a finalized bundle;
   they are exports, never a state mechanism (EVID-003), and carry the
   bundle's identity hash.

## Consequences

- Positive: evidence integrity is checkable by anyone with the files;
  corrections are transparent history; the verdict's pure-function
  property (ADR-0003) has a stable input; the `unverified` marker keeps
  agent claims visually and structurally separate from verified facts.
- Negative: no "quick fix" edits of evidence — every correction is a
  new bundle and a visible chain; retention/cleanup (ADR-0001) must
  understand chains so it never deletes a predecessor while presenting
  a successor.
- Follow-up work: bundle schema and manifest format in
  `packages/evidence`; the finalize-once enforcement in
  `packages/storage`; the offline `verdicta verify <bundle>` command;
  chain-aware retention semantics; an `unverified`-marker rendering
  rule shared by CLI, Web UI, and exports.

## Revisit conditions

- Bundle size or correction frequency makes the hash-chained model
  operationally painful (would need a compaction design, not in-place
  edits).
- External auditing requirements emerge that demand cryptographic
  signatures rather than content addressing (a new ADR introducing key
  management).
- The specification's §7.5/§10.2 is revised; the specification wins and
  this ADR is then superseded, not silently violated.
