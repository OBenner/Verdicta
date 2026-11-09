# ADR-0005: Loopback-only HTTP API with SSE events, no auth in the MVP

- **Status:** proposed
- **Date:** 2026-11-09
- **Deciders:** operator (pending acceptance with the `apps/server`
  implementation)
- **Related:** SEC-003, SEC-004, STATE-003;
  product specification §4, §12; architecture-and-invariants §8;
  ADR-0004

## Context

Per ADR-0004, all surfaces talk to one application service. The CLI, Web
UI, and MCP server need a concrete transport to reach it, and clients
need live updates during long runs (agent output, state transitions,
verdicts) without polling loops.

Two decisions are entangled here:

1. **Transport shape** — how clients invoke use cases and receive events.
2. **Exposure boundary** — who may reach the API, and therefore whether
   authentication must exist.

The specification (§4) fixes the exposure boundary for the MVP: the HTTP
API listens on loopback only, remote listening is forbidden, and this is
explicitly framed as avoiding _premature_ auth design — not as a claim
that auth is unnecessary forever. This ADR records the transport choice
and the security posture together, because they only hold as a pair.

## Options considered

### Option A: Loopback HTTP (mutations) + SSE (events), no auth (chosen)

- REST-ish HTTP endpoints for commands/queries; Server-Sent Events for
  the event stream; bound to `127.0.0.1` only; no authentication layer.
- Pros: matches the single-operator local-first product; HTTP+SSE works
  from browsers (Web UI) without extra libraries; SSE is
  firewall-friendly, text-based, and trivially replayable from the event
  store; loopback binding is a hard, verifiable boundary (test: connect
  from a non-loopback address must fail); no half-built auth to give
  false confidence.
- Cons / risks: any local process can call the API (accepted — see
  decision rule 5); SSE is one-directional, so mutations need a separate
  HTTP call (acceptable); the "no auth" posture must be loudly
  documented so nobody exposes the port.

### Option B: WebSocket for both directions

- Pros: one channel for commands and events; slightly lower latency.
- Cons / risks: no browser-native reconnection semantics; more protocol
  machinery (framing, heartbeats) to audit; no benefit for the MVP's
  mutation/event asymmetry. Rejected — events only need server→client.

### Option C: In-process library calls only, no HTTP API

- Pros: no network surface at all.
- Cons / risks: the Web UI is a browser application and cannot link a
  Node library; the MCP server is a separate process. A real transport
  is unavoidable. Rejected.

### Option D: Network-listening API with authentication from day one

- Pros: remote access possible immediately.
- Cons / risks: the specification forbids remote listening in the MVP;
  designing auth before the product has users produces a security
  theater layer and delays the core guarantees. Rejected by
  specification; revisit conditions below cover the legitimate need.

## Decision

Adopt **loopback-only HTTP + SSE without authentication for the MVP**:

1. `apps/server` binds to `127.0.0.1` (and `::1` where applicable) only.
   There is no configuration option to bind other interfaces; adding one
   requires superseding this ADR.
2. Mutations and queries go through the HTTP API; events stream to
   clients over SSE. No other channel carries state changes
   (architecture-and-invariants §8).
3. No authentication or session layer exists in the MVP. The defense is
   the binding itself, and it is verified by an automated test asserting
   that non-loopback connections fail.
4. The API is an adapter over the application service (ADR-0004): it
   performs transport concerns only — validation of wire shapes,
   SSE framing, error mapping. Domain types never appear on the wire
   without a serialized DTO form (VER-000).
5. The residual risk — any local process can drive the API — is
   accepted and documented: the operator's account is the trust
   boundary (specification §9.1), and log/UI copy must not claim
   otherwise.
6. Approvals remain interactive local user actions (SEC-004 /
   specification §8): the API exposes them, but never auto-approves.

## Consequences

- Positive: zero auth machinery to design, audit, or break; the Web UI
  needs no tokens or login flow; the security boundary is one line of
  socket configuration plus one test; the SSE stream maps naturally onto
  the event log of ADR-0001.
- Negative: no remote control of Verdicta at all in the MVP (SSH port
  forwarding is the documented workaround, outside the product); any
  local malware already inside the operator's account can use the API —
  acceptable because such malware already owns everything Verdicta
  protects.
- Follow-up work: bind-address test in `apps/server`; SSE event schema
  derived from the domain events of `packages/application`; honest
  security copy in `README` / doctor output stating the loopback-only
  posture and the reason auth is absent.

## Revisit conditions

- Any request for remote access (team usage, headless server, IDE
  remoting): requires a new ADR covering authentication, authorization,
  and transport encryption _before_ the binding is relaxed.
- A credible local privilege-separation requirement appears (e.g.
  running Verdicta under a dedicated OS account).
- The specification's §4 is revised; the specification wins and this
  ADR is then superseded, not silently violated.
