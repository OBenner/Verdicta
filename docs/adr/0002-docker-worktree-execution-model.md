# ADR-0002: Docker plus per-attempt git worktree as the only execution model

- **Status:** proposed
- **Date:** 2026-11-09
- **Deciders:** operator (pending acceptance with the `packages/sandbox` /
  `packages/git-workspace` implementation)
- **Related:** SEC-001, SEC-002, SEC-005, SEC-006, STATE-008;
  product specification §1, §9.2, §9.3, §14.4; ADR-0001

## Context

Verdicta executes untrusted code: the agent's commands, the project's own
build/test tooling, and any dependency code downloaded during a run are
all in the "untrusted" list of the threat model (specification §9.1). At
the same time Verdicta must run these on the operator's real machine,
next to real repositories, real credentials, and other in-flight runs.

Two distinct needs follow:

- **Change isolation:** the agent's edits must not touch the operator's
  working tree or a sibling run's edits, and must be preserved as a
  reviewable branch afterwards (specification §11, delivery boundaries).
- **Process isolation:** the running process must not read the host
  filesystem, network, or other worktrees beyond what the task allows.

The specification (§9.2) states that a git worktree is not a sandbox and
fixes Docker as the execution boundary, with a fail-closed rule when
Docker is absent. This choice has long-term consequences — UX for users
without Docker, Windows/macOS specifics, image management, verifier
placement — so it is recorded here.

## Options considered

### Option A: Docker container + dedicated git worktree per attempt (chosen)

- Every attempt gets its own branch and worktree (change isolation) and
  runs inside a Docker worker with the SEC-005 baseline restrictions
  (process isolation). Both the agent **and** the verification commands
  execute in Docker.
- Pros: one coherent boundary for all untrusted execution; containers
  are disposable and identifiable, which the reconciler (STATE-007)
  cross-checks against records; images are versioned by digest and
  recorded in evidence (specification §7); mature on Windows/macOS/Linux
  via Docker Desktop / Engine; matches the prior-art baseline (Runproof
  uses per-task worktrees) while adding the missing sandbox.
- Cons / risks: requires Docker as a hard dependency (deliberate — see
  decision rule 4); container startup latency per attempt; Windows file
  sharing and path translation add implementation complexity; a
  compromised Docker daemon or kernel is explicitly out of scope
  (specification §2).

### Option B: Git worktree only, execution on the host

- Pros: zero extra dependencies, fastest startup, simplest code.
- Cons / risks: violates the threat model — an agent or a `postinstall`
  script could read SSH keys, browser profiles, or a sibling run's
  worktree, or exfiltrate over the network. This would make the evidence
  claims dishonest. Rejected; SEC-001 exists precisely to forbid it.

### Option C: Agent in Docker, verifier on the host

- Run only the agent in a container; run the independent verification
  commands on the host against the worktree.
- Pros: simpler verifier plumbing; host toolchains available.
- Cons / risks: verification commands are project-provided and therefore
  also untrusted (a rigged `test` script executes on the host). It also
  breaks reproducibility: the verifier's environment would differ from
  the agent's. Rejected — SEC-004 requires the verifier outside the
  agent's control, not outside the sandbox.

### Option D: Full virtual machines (or microVMs, e.g. Firecracker)

- Pros: stronger boundary than containers; would cover part of the
  out-of-scope threat model.
- Cons / risks: heavy operational cost (images, boot time, nested
  virtualization on Windows/macOS), far beyond MVP needs; the
  specification explicitly excludes compromised-kernel scenarios.

### Option E: Lightweight OS sandboxes per platform (seatbelt, nsjail, WSL sandbox, gVisor)

- Pros: less overhead than Docker on some platforms.
- Cons / risks: different mechanism per OS — three isolation
  implementations to audit and keep equivalent; weaker or absent network
  profiling; gVisor is a runtime under Docker anyway (a possible later
  hardening, not an alternative). Rejected as the primary model.

## Decision

Adopt **Docker worker + per-attempt git worktree and branch** as the
only execution model, implementing SEC-001, SEC-002, and SEC-005:

1. Every attempt (including retries and repair rounds) receives its own
   worktree, branch, and container identity. Nothing executes directly
   on the host as part of a run — agent, tools, and verifier alike.
2. The SEC-005 baseline is mandatory for every worker: non-root user,
   read-only root filesystem with explicit writable mounts,
   `cap_drop=ALL`, no Docker socket, no broad host-home mounts,
   CPU/memory/PID/wall-time limits, only the selected worktree and
   minimal credential mounts, no inheritance of the full host
   environment.
3. Network access follows the SEC-006 profiles (`none` / `allowlist` /
   `full`; default `allowlist`, `full` requires explicit approval), and
   the active profile is recorded in evidence.
4. **Fail closed:** absence of Docker, or inability to create a
   restricted container, is a blocking `doctor` / preflight error. No
   fallback to host execution exists or may be added without superseding
   this ADR (SEC-002).
5. Resume may reuse a saved agent session only when the adapter confirms
   identity of session, worktree, branch, and base revision
   (STATE-008); otherwise a new attempt is created.
6. The Docker image digest is recorded in the `EvidenceBundle` for every
   attempt.

## Consequences

- Positive: a single, auditable execution boundary; reproducible
  environments via pinned image digests; crash-safe cleanup (containers
  are disposable); the isolation regression tests of the specification
  (§14.4) become implementable as fixtures.
- Negative: Docker becomes a hard installation requirement, excluding
  users who cannot run it; per-attempt container/worktree setup adds
  latency; Windows/macOS path and file-sharing behavior needs dedicated
  engineering and testing; image distribution/versioning is a new
  maintenance surface.
- Follow-up work: base worker image definition and digest pinning;
  `packages/sandbox` port and Docker adapter; `packages/git-workspace`
  worktree lifecycle (create, preserve, explicit cleanup); preflight
  `doctor` checks for Docker, git worktree support, and resource limits;
  the §14.4 isolation fixture (host home, Docker socket, sibling
  worktree, forbidden network address).

## Revisit conditions

- A supported platform appears where Docker cannot provide the SEC-005
  guarantees (then hardening such as gVisor, or a per-platform
  mechanism, must be evaluated in a new ADR).
- A measured startup/latency budget makes per-attempt containers
  untenable for an important workflow.
- The threat model expands to include a compromised Docker daemon or
  kernel — that requires microVM-class isolation and supersedes this
  decision.
- The specification's §9.2/§9.3 is revised; the specification wins and
  this ADR is then superseded, not silently violated.
