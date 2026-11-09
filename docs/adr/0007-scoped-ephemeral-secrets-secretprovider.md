# ADR-0007: Scoped ephemeral secrets via SecretProvider, never persisted

- **Status:** proposed
- **Date:** 2026-11-09
- **Deciders:** operator (pending acceptance with the `SecretProvider`
  port and worker credential plumbing)
- **Related:** SEC-007, SEC-001, SEC-005, VER-000; product specification
  §9.4, §14.2 (secret canary); ADR-0001, ADR-0002

## Context

Agents need credentials to work: their own CLI/OAuth login, package
registry tokens, possibly MCP service tokens. These credentials live on
the operator's machine — and the workers are explicitly untrusted
(specification §9.1). Verdicta must therefore deliver _exactly_ the
credential material a given worker needs, for the duration of that run
only, and be able to prove afterwards that it leaked nowhere.

The specification (§9.4) fixes the rules: the core has no model API key
in the main flow; an adapter may prepare limited ephemeral credentials
per worker via a `SecretProvider`; secrets are never written to SQLite,
logs, task text, diff metadata, or the `EvidenceBundle`. The security
regression suite includes the secret canary test (specification §14.2).
This ADR records the mechanism choices behind those rules.

## Options considered

### Option A: SecretProvider port preparing per-worker ephemeral credentials (chosen)

- A `SecretProvider` port in `packages/application`; adapter-specific
  implementations resolve the agent's CLI/OAuth login (or an explicitly
  provided key) into minimal, per-attempt credential material, mounted
  into the worker for the run's duration and deleted at cleanup.
- Pros: least privilege per worker; credentials expire with the
  container; the domain never sees secret values (consistent with
  VER-000); the canary test becomes a property of the port's
  implementation contract.
- Cons / risks: "which credentials does agent X actually need" is
  per-adapter knowledge that must be maintained; some agents' CLI login
  may not be transferable into a container safely (the specification's
  documented fallback: explicit user-provided key via OS keychain or
  one-time environment input).

### Option B: Mount the agent's config directory (or host home) into the worker

- Pros: trivially makes every CLI work.
- Cons / risks: grants the untrusted worker every credential the
  operator owns — direct violation of SEC-007.1 and SEC-005. Rejected.

### Option C: Long-lived secrets in environment variables passed to every worker

- Pros: simple plumbing.
- Cons / risks: values leak into evidence via crashes, logs, or
  process listings; no per-run scoping; rotation requires changing the
  service environment. Rejected — SEC-007.3 and SEC-007.4 forbid
  persisting environment values.

### Option D: Full secrets manager integration (Vault, cloud KMS, etc.)

- Pros: audit, rotation, policy.
- Cons / risks: an external service dependency contradicts local-first
  operation; nothing in the MVP's threat model requires it. Rejected for
  the MVP; the `SecretProvider` port leaves the door open (an
  implementation could be backed by such a manager later without domain
  changes).

## Decision

Adopt **scoped ephemeral credentials via a `SecretProvider` port**,
implementing SEC-007:

1. The Verdicta core holds no model API key and no standing credentials.
   Agents authenticate with their own CLI/OAuth login; the core never
   requires one (per the product's prohibitions).
2. `SecretProvider` is a port of `packages/application`; only adapter
   implementations and the sandbox plumbing touch credential material.
   Secret values never appear in domain types, events, or DTOs.
3. Per attempt, the provider prepares the minimal credential set the
   specific agent needs, delivered as time-boxed mounts/files into the
   worker — never via the full host environment and never via a broad
   home mount (SEC-005, SEC-007.1, SEC-007.3).
4. Secret values are never written to SQLite, task text, logs, diff
   metadata, API responses, or the `EvidenceBundle` (SEC-007.2,
   SEC-007.4); UI and API mask them (SEC-007.5).
5. Redaction is applied to known secrets and common token formats in
   captured output, and is documented honestly as protection against
   _accidental_ leakage, not proof against arbitrary exfiltration
   (SEC-007.6, SEC-007.7).
6. Ephemeral credential material is deleted during worker cleanup
   (SEC-007.8), including the cancel and crash paths.
7. If an agent's CLI login cannot be transferred safely, the fallback is
   an explicit user-provided agent key via OS keychain or one-time
   environment input — a user decision per run, never a stored default.
8. The secret canary regression test (specification §14.2) is part of
   the definition of done for any change touching credential plumbing:
   after a run, the canary value appears nowhere in SQLite, logs, API
   responses, or the `EvidenceBundle`.

## Consequences

- Positive: least privilege per worker; provable non-persistence via
  the canary test; no standing secrets to rotate or leak; domain purity
  preserved; a future external secrets backend requires no domain
  change.
- Negative: per-adapter credential knowledge is a maintenance burden;
  agents with non-transferable logins push the operator to the
  explicit-key fallback; cleanup must be correct on _all_ exit paths —
  a crash between mount and cleanup is a real window, mitigated by
  per-attempt ephemeral material being worthless outside its container.
- Follow-up work: `SecretProvider` port definition; redaction pass in
  the log/event capture pipeline; canary test harness; cleanup
  verification in the fault-injection suite (worker killed with
  `SIGKILL` still leaves no credential residue).

## Revisit conditions

- An agent adapter proves unable to operate with ephemeral credentials
  at all (would force a re-examination of rule 7's fallback).
- Multi-operator or shared-machine usage makes per-operator scoping
  insufficient.
- The specification's §9.4 is revised; the specification wins and this
  ADR is then superseded, not silently violated.
