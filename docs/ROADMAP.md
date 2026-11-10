# Verdicta Roadmap

- **Status:** proposed product roadmap
- **Date:** 2026-11-09
- **Canonical product contract:** `docs/SPECIFICATION.md`

This roadmap is outcome-based, not calendar-based. A stage is complete only
when its exit criteria have been demonstrated by executed checks. If this
roadmap and the specification disagree, the specification wins; report the
conflict instead of silently resolving it.

## Product objective

Make Verdicta a trusted local-first control plane for delegating real coding
tasks to external agents. The product's primary result is:

```text
ChangeSet + EvidenceBundle + Verdict
```

The differentiator is not the number of supported agents or the visual
complexity of the UI. It is the ability to explain what changed, which checks
Verdicta independently executed, and why the resulting verdict is justified.

## Priority rule

When work competes for capacity, prioritize in this order:

1. No false `passed` verdicts.
2. Security and preservation of user data.
3. Recovery after cancellation, timeouts, and service failure.
4. A complete primary user journey.
5. CLI and Web UI usability.
6. Additional adapters and optional features.

## Starting point

The workspace, CI gates, domain contracts, Run state machine, deterministic
verdict rules, lease-guarded coordinator, startup reconciler, and SQLite
persistence already have real implementations. The execution infrastructure,
evidence pipeline, runtime adapters, server, CLI, and Web UI are still stubs or
scaffolds.

The next investment is therefore a thin vertical slice through the existing
core, not more isolated domain functionality.

## Stage 1 — First trusted end-to-end run

**Objective:** prove one narrow but complete scenario with one operator, one
repository, one active run, and one real external agent.

### Scope

- Clarify the server composition root while preserving thin-client boundaries.
- Define the execution and application-service ports.
- Create and preserve a dedicated git worktree and local branch per attempt.
- Run the agent and all verification commands only in restricted Docker
  workers.
- Implement the `AgentRuntime` port and the first pinned headless CLI adapter.
- Prepare only the minimal ephemeral credentials required by that adapter; do
  not introduce a standing model key into the core.
- Record an explicit run-creation approval if the first adapter requires the
  `full` network profile; the general approval workflow remains in Stage 2.
- Capture the real diff and independently re-run every mandatory check.
- Produce a content-addressed `EvidenceBundle` and deterministic `Verdict`.
- Expose the scenario through the loopback HTTP API and a minimal CLI.
- Exercise success, failed independent checks, missing evidence, and forbidden
  path changes on an independently created fixture repository.

### Engineering sequence

1. **Composition root and port contracts.** Record how `apps/server` wires
   infrastructure without putting domain decisions in an app; define the
   initial runtime and application-service interfaces.
2. **Git workspace lifecycle.** Implement preflight, exact-base worktree
   creation, branch preservation, diff/commit capture, and explicit cleanup.
3. **Docker worker lifecycle.** Implement fail-closed Docker preflight and a
   restricted worker with the SEC-005 baseline and explicit timeouts.
4. **Evidence foundation.** Implement SHA-256 artifact storage, bundle
   finalization, manifest generation, and offline integrity verification.
5. **First runtime adapter.** Implement the shared `AgentRuntime` contract and
   one headless CLI profile using structured output and a recorded agent
   version; run the shared adapter contract scenarios.
6. **Independent verification.** Re-execute mandatory commands in Docker,
   capture their actual exit outcomes, and derive the ChangeSet independently
   of the agent's summary.
7. **Application orchestration.** Connect contract, run, workspace, sandbox,
   runtime, verifier, storage, and evidence through lease-guarded transitions.
8. **Loopback API and CLI.** Add thin transport adapters for creating a run,
   reading its status, and retrieving its result and evidence references.
9. **Executable acceptance matrix.** Automate the successful run and the
   fail-closed scenarios listed below.
10. **Stage review.** Run the full repository gates, remove obsolete requirement
    exceptions, update affected documentation, and review the related ADRs for
    acceptance.

### Exit criteria

- An external agent fixes a reproducible fixture defect on a separate branch.
- Verdicta independently re-runs the tests, returns `passed`, and preserves a
  verifiable bundle.
- When the agent claims success but an independent mandatory test fails, the
  verdict is `failed` and the branch is preserved.
- A missing or corrupted mandatory report, unknown command status, or inability
  to re-run a mandatory check cannot produce `passed`.
- A forbidden path change cannot produce `passed`.
- The original branch is unchanged and no merge or push occurs in any scenario.
- `pnpm verify` passes after all stage changes.

### Explicitly deferred

Cancellation and crash recovery E2E, secret canaries, network isolation E2E,
Web UI, the second reference agent, and repair rounds are implemented in the
following stages. The first slice must not claim those capabilities.

## Stage 2 — Security, control, and recovery

**Objective:** make the vertical slice safe to use on a real repository.

### Scope

- Enforce network profiles and record the active profile in evidence.
- Complete scoped ephemeral credential handling, redaction, and canary coverage
  beyond the first adapter's minimal authentication path.
- Add path policy, mandatory approvals, and resource limits.
- Implement cancellation with artifact preservation.
- Exercise startup reconciliation after forced termination during preparation,
  execution, and verification.
- Prevent duplicate execution whenever the previous attempt's fate is unknown.
- Add `verdicta doctor` for Docker, Git, storage, and environment preflight.
- Automate the mandatory fault-injection and security regression scenarios.

### Exit criteria

- Host-home, Docker-socket, sibling-worktree, and forbidden-network access
  attempts are blocked and recorded.
- A secret canary is absent from SQLite, regular logs, API responses, and the
  EvidenceBundle; ephemeral credential files are removed.
- Cancellation stops the container, records `cancelled`, preserves available
  artifacts, and does not trigger an automatic restart.
- Forced service termination does not create duplicate attempts; uncertain
  states require an explicit decision.
- Absence of Docker is a blocking error and never causes host execution.

## Stage 3 — Complete local MVP

**Objective:** turn the trusted pipeline into a usable everyday product.

### Scope

- Add the Web UI as an equal client of the same application API.
- Add a queue of independent tasks and observable attempt history.
- Display status, verdict, diff, checks, limitations, and evidence consistently.
- Add the second reference agent and run the common adapter contract suite.
- Support offline bundle hash and verdict verification from the CLI.
- Document installation, authentication, first run, and troubleshooting.
- Complete all MVP acceptance criteria, including interface parity.

### Exit criteria

A new user can install Verdicta, configure a supported agent, run a real task,
understand the verdict, and inspect its evidence without assistance from the
project authors. CLI and Web UI expose the same technical status, verdict, and
evidence identifiers.

## Stage 4 — External validation

**Objective:** confirm that independent verification saves time and increases
trust on real repositories.

### Scope

- Run bounded design-partner testing with external developers and small teams.
- Observe successful runs, refusals, failures, and repeat usage.
- Compare equivalent scenarios with Runproof and Gatewright.
- Improve onboarding and diagnostics based on observed friction.
- Reconcile all public capability claims with executable evidence.

### Measures

- Runs reaching a trustworthy verdict.
- False `passed` verdicts; the target is zero.
- Manual re-execution of checks by the user.
- Repeat use for real tasks.
- Infrastructure failures and unresolved operator decisions.
- Time and assistance required for installation and the first successful run.

### Exit criteria

External users repeatedly choose Verdicta for real tasks and use the evidence
bundle to review or audit results rather than treating it as a formality.

## Stage 5 — Public MVP release

**Objective:** publish an independently understandable and honestly positioned
open-source product.

### Scope

- Stabilize documented contracts and evidence formats.
- Publish installation, security, adapter, and verification guides.
- Check npm names, repository and organization names, domains, and trademarks.
- Include Apache-2.0 and the independence statement for Auto-Claude/Aperant.
- Provide reproducible demonstrations of success, failure, and recovery.
- Define release and compatibility procedures.

### Exit criteria

A third party can install the released product, execute the documented scenario,
and independently verify the result without help from the authors.

## After the MVP

Prioritize follow-up work using observed demand rather than a fixed calendar.
Candidates include the MCP client surface, Agent Plugin, additional runtime
adapters, richer approval workflows, evidence export and retention, optional
knowledge sources, and explicitly configured parallelism.

An in-house coding agent, automatic merge/push, mandatory LLM verdicts, cloud
multi-tenancy, team accounts, remote management, Electron/Tauri, and automatic
large-task decomposition are not near-term commitments.
