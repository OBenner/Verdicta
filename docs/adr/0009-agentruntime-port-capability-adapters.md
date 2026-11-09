# ADR-0009: AgentRuntime port with capability-declared adapters (ACP / native SDK / headless CLI)

- **Status:** proposed
- **Date:** 2026-11-09
- **Deciders:** operator (pending acceptance with the `packages/runtime` /
  `packages/adapters` implementation)
- **Related:** VER-000 / ARCH-001, STATE-008; product specification §5.6,
  §6.3, §6.4, §13, §14 (adapter contract suite); ADR-0002, ADR-0004

## Context

Verdicta controls external coding agents it does not implement: Codex,
Claude Code, Kimi Code, OpenCode, and others (specification §3). Each
agent exposes a different control surface — some implement ACP, some
have an official SDK, some only a headless CLI. Verdicta needs a stable
internal contract (`AgentRuntime`, specification §6.3) so that the core
never speaks vendor protocols, while supporting agents honestly: a
capability an agent lacks must surface as a limitation or a blocked run,
never as silently degraded control.

Key forces:

- **Domain purity (VER-000):** vendor protocol types must never enter
  domain types; translation happens only at the adapter boundary.
- **Honest capabilities:** an adapter that cannot resume, cancel, or
  stream structured events must say so, and the core must act on that.
- **Evolvability:** agents change fast; the port must outlive any
  single vendor API.
- **Support is earned, not declared:** specification §13 requires one
  contract scenario suite per adapter (probe, start, structured events,
  approval, cancellation, resume, version mismatch) and forbids calling
  an adapter "supported" while critical scenarios are skipped.

## Options considered

### Option A: One AgentRuntime port, per-vendor adapters with declared capabilities (chosen)

- `packages/runtime` defines the port (probe, prepareAuthentication,
  start, sendInstruction, resolveApproval, cancel, resume,
  streamEvents, inspectSession); `packages/adapters` holds one adapter
  per agent, publishing a capability set.
- Pros: vendor churn is contained in adapters; capabilities make
  degraded control explicit and blockable; the contract suite gives an
  objective bar for "supported"; adding an agent is additive work
  consistent with ADR-0004's inward dependency rule.
- Cons / risks: the port's operation set must cover the least common
  denominator without flattening rich agents; capability matrices need
  to be maintained per agent version.

### Option B: Standardize on ACP only

- Pros: one protocol, one adapter shape.
- Cons / risks: ACP coverage across agents is incomplete; the
  specification explicitly makes ACP non-mandatory (§6.3) and names
  agents whose best control surface today is a CLI. Rejected as the
  only mechanism — ACP remains the _preferred_ adapter type.

### Option C: Drive agents through MCP

- Pros: MCP is a common protocol many agents expose.
- Cons / risks: MCP is a tool/knowledge channel, not a run-control
  channel; the specification §6.4 forbids using it for launch,
  suspension, resume, and cancellation of the coding agent. Rejected.

### Option D: Per-agent code paths inside the core

- Pros: no port design work.
- Cons / risks: vendor types leak into the domain (violates VER-000),
  every agent change touches the core, and surfaces diverge. Rejected.

### Option E: Parse human-readable CLI output

- Pros: works for any CLI.
- Cons / risks: fragile and unverifiable; the specification forbids
  regex-parsing human text where a machine format exists (§6.3).
  Headless CLI adapters use structured output with a pinned CLI version
  and contract tests.

## Decision

Adopt the **AgentRuntime port with capability-declared adapters**:

1. `AgentRuntime` in `packages/runtime` is the only interface the core
   uses to control agents; its operations are those of specification
   §6.3. All agent communication goes through it.
2. Three adapter types exist, in this preference order: **ACP** (when
   the agent implements the needed protocol surface), **native SDK**
   (when the official SDK gives fuller control), **headless CLI**
   (pinned CLI version, structured/machine output, contract tests — no
   regex parsing of human text).
3. Every adapter publishes its capabilities (interactive follow-ups,
   approvals, resume, structured events, usage limits, MCP
   configuration, authentication modes). A missing capability is never
   masked: the core either selects a supported scenario or blocks the
   run with an explanation (specification §6.3).
4. An adapter is declared **supported** only after passing the shared
   adapter contract suite (specification §13: probe, start, structured
   events, approval, cancellation, resume, version mismatch). Skipping a
   critical scenario means "not supported", regardless of code presence.
   MVP support claims (Codex, Claude Code reference profiles; Kimi Code
   via ACP) follow this bar and no other.
5. Adapter, agent, and Verdicta versions are recorded in the
   `EvidenceBundle` (specification §7.5), and resume requires the
   adapter to confirm session/worktree/branch/base-revision identity
   (STATE-008, ADR-0006).
6. Vendor protocol and SDK types exist only inside `packages/adapters`;
   the domain never sees them (VER-000), enforced by the import
   boundary gate.

## Consequences

- Positive: the core is immune to vendor churn; capability honesty turns
  "the agent can't do that" into a designed behavior with an explanation
  instead of undefined behavior; the contract suite converts marketing
  claims ("adapter exists") into verified support.
- Negative: maintaining per-agent capability matrices and pinned CLI
  versions is ongoing work; the contract suite must run against real
  agents, which needs credentials and Docker in CI or a documented
  manual gate.
- Follow-up work: port type definitions in `packages/runtime`; the
  contract suite harness; reference profiles for Codex and Claude Code;
  the version-mismatch scenario (adapter rejects an incompatible agent
  version rather than guessing).

## Revisit conditions

- ACP (or a successor protocol) reaches sufficient coverage that a
  single-protocol model becomes viable — would simplify, not weaken,
  this decision.
- An agent family appears whose control model does not fit the port's
  operation set (then extend the port via a new ADR, keeping domain
  purity).
- The specification's §6.3/§13 is revised; the specification wins and
  this ADR is then superseded, not silently violated.
