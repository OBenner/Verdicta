# ADR-0004: One application service, thin clients for every surface

- **Status:** proposed
- **Date:** 2026-11-09
- **Deciders:** operator (pending acceptance with the `packages/application`
  and `apps/server` implementation)
- **Related:** VER-000 / ARCH-001, STATE-003, SEC-004;
  product specification §4, §5, §12; architecture-and-invariants §1, §8;
  ADR-0001, ADR-0002, ADR-0003

## Context

Verdicta exposes several user surfaces — CLI, Web UI, MCP server, and a
future Agent Plugin — plus internal actors (scheduler, reconciler,
coordinator). All of them trigger the same sensitive operations: state
transitions, approvals, verdict computation, evidence writes.

If any surface implements its own slice of that logic, the guarantees
collapse in predictable ways: two state machines drift apart, a CLI
write bypasses the lease guard (STATE-003), a verdict computed in the
Web UI diverges from the one in the evidence store. The specification
(§5) therefore requires one application service behind all surfaces;
this ADR records the shape of that decision and its consequences for
the module layout.

## Options considered

### Option A: Single application service with ports, thin clients (chosen)

- `packages/application` owns all use cases, the state machine, and the
  verdict rules, depending only on `contracts` and ports. `apps/*` are
  protocol adapters over that service: they translate HTTP/SSE/stdio/MCP
  frames into use-case calls and render the results.
- Pros: one place to audit for state transitions and verdict logic;
  every surface gets identical behavior and identical evidence;
  surfaces can be added (Agent Plugin) without touching the core;
  hexagonal structure enforces VER-000 by construction — vendor types
  physically cannot be imported by the domain.
- Cons / risks: a local CLI now talks to a service layer, which feels
  heavier than embedding the logic; the port interfaces must be designed
  well once, since every surface depends on them.

### Option B: CLI embeds the core, server duplicates it for Web/MCP

- Pros: fast CLI startup, no server needed for local use.
- Cons / risks: two copies of the state machine and verdict rules —
  the exact failure mode this decision exists to prevent; concurrent
  CLI/server writes would fight over leases. Rejected.

### Option C: Clients access storage directly through a shared storage package

- Pros: least code up front.
- Cons / risks: every client becomes a writer of transactional state —
  atomicity (ADR-0001) and lease guards (STATE-003) would have to be
  re-implemented per surface; SEC-004's "verifier outside the agent's
  control" becomes unenforceable. Rejected.

### Option D: Separate deployable services per concern (microservices)

- Pros: independent scaling.
- Cons / risks: absurd overhead for a single-operator local product;
  distributed transactions would replace the SQLite atomicity guarantee.
  Rejected.

## Decision

Adopt **one application service with thin clients**, implementing
architecture-and-invariants §1 and §8:

1. All state transitions, verdict computation, approval handling, and
   evidence writes happen only inside `packages/application` (via its
   ports). No `apps/*` package may import `storage`, `sandbox`,
   `adapters`, or contain its own version of the state machine or the
   verdict rules — enforced by lint boundaries and review.
2. CLI, Web UI, MCP server, and any future surface are protocol
   adapters: they translate and render, they do not decide. The CLI
   MUST NOT write state directly to SQLite (specification §12).
3. The dependency arrow points inward: infrastructure packages implement
   ports defined by `application` / `contracts`; `contracts` depends on
   nothing else in the workspace.
4. ACP, MCP, vendor SDK, and CLI-specific types appear only in
   `packages/adapters` and `apps/*` translation layers — never in
   domain types (VER-000 / ARCH-001).
5. In the MVP the service is consumed in-process or over the
   loopback-only HTTP/SSE API (transport details are ADR-0005); the
   logical contract — one service, many surfaces — is transport
   independent.

## Consequences

- Positive: a single audit surface for the system's guarantees; behavior
  parity across CLI/Web/MCP for free; adding a surface is additive work;
  the domain remains runnable and testable with no infrastructure
  (pure ports + fakes).
- Negative: more interface boilerplate; the CLI cannot be a trivial
  standalone binary, it needs the service reachable (in-process or
  loopback); careless port design gets expensive to change later, so
  ports are reviewed like API contracts.
- Follow-up work: define the initial port set in
  `packages/application` (run lifecycle, approvals, evidence read);
  eslint `no-restricted-imports` rules encoding rule 1 and rule 4;
  a contract test suite run against every surface asserting identical
  state-machine behavior.

## Revisit conditions

- A surface emerges with requirements the port model cannot express
  without leaking infrastructure types.
- Measured in-process/loopback overhead makes a legitimate embedded CLI
  mode necessary (would require solving the lease-concurrency conflict
  from Option B first, in a new ADR).
- The specification's §4/§5 is revised; the specification wins and this
  ADR is then superseded, not silently violated.
