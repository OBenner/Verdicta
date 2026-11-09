# Verdicta — Project Specification

- **Date:** 2026-11-09
- **Status:** agreed architecture, pending user review
- **Project license:** Apache-2.0
- **Slogan:** "Delegate code. Collect evidence."

> Canonical language: English. This document is the maintained English
> artifact translated from the original Russian `Verdicta-проект.txt`
> (2026-11-09), which is retained at the repository root as the historical
> original. Where the two diverge, this file is the living specification and
> the divergence must be reported, not silently resolved.

## 1. Executive summary

Verdicta is an independent, local-first control plane for delegating tasks
to external coding agents. It is not a fork of Auto-Claude, does not
implement its own coding agent, and does not compete with models or CLI
agents as a code executor.

The user describes a task and its acceptance criteria. Verdicta creates a
separate `git worktree`, runs the chosen external agent in Docker, observes
execution, requests the necessary approvals, then independently re-runs the
mandatory checks and produces a reproducible evidence bundle.

The primary output of a run:

```text
ChangeSet + EvidenceBundle + Verdict
```

An agent's claim of "done" is not evidence. Successful termination of the
agent process, a green status in the user interface, and a successful
verification of the result are three different events.

## 2. Problem

Coding agents can plan steps autonomously, modify files, invoke tools, and
run tests. When working in parallel or autonomously, the user still has to
be responsible for:

- formulating a verifiable task;
- isolating changes and processes;
- controlling access to secrets, the network, and dangerous operations;
- recovering from hangs, restarts, or cancellation;
- independently verifying the result;
- preserving evidence of exactly what was executed;
- distinguishing a technical failure, a failed check, and a situation that
  requires a human decision.

Verdicta extracts these functions into a separate control layer without
duplicating the coding agent's internal micro-orchestration.

## 3. Goals

1. Work with existing Codex, Claude Code, Kimi Code, OpenCode, and other
   agents through extensible adapters.
2. Require no model API key for the core and the local UI.
3. Give the agent a complete task contract instead of controlling its every
   command.
4. Isolate every attempt at the Git level and at the process level.
5. Independently re-run the mandatory checks after the agent finishes.
6. Compute the final verdict with deterministic rules.
7. Preserve enough evidence for local audit and reproduction.
8. Provide a CLI and a Web UI as equal clients of one local API.
9. Handle cancellation, timeouts, limit exhaustion, and service restarts
   correctly.
10. Never modify the main branch and never push or merge automatically.

## 4. Out of scope for the MVP

- A coding agent of its own, a planner LLM, or Planner/Coder/QA role
  chains.
- Direct model calls in the main scenario.
- Automatic merge, push, PR publication, or modification of protected
  branches.
- A task graph with dependencies and automatic decomposition of large
  projects.
- Electron or Tauri.
- Cloud multi-tenancy, team accounts, and remote management.
- Graph memory and automatic long-term learning.
- LLM review as a mandatory stage or a source of the final verdict.
- Standalone IDE extensions.
- Cryptographically signed attestations and remote notarization of
  evidence.
- A security guarantee against a compromised Docker daemon, OS kernel, or
  machine administrator.

These capabilities may appear later as separate projects or extensions, but
they must not affect the stability of the MVP domain contracts.

## 5. Core principles

### 5.1 Micro-orchestration stays in the agent

The agent autonomously chooses the sequence of file reads, edits, tool
calls, and local checks. Verdicta does not try to turn it into a set of
remote functions.

### 5.2 Macro-orchestration belongs to Verdicta

Verdicta manages the contract, resources, isolation, approvals, attempts,
repair rounds, independent verification, and the final decision.

### 5.3 Artifacts are verified, not the agent's confidence

The sources of truth for the result are the real diff, the commits, the
exit codes of independently executed commands, machine-readable test
reports, and recorded limitations. The agent's summary is stored as an
unverified comment.

### 5.4 Fail closed for mandatory checks

A missing report, an unreadable result, an expired timeout, an unknown
command status, or corrupted evidence can never count as success.

### 5.5 One domain API, several interfaces

The CLI, the Web UI, MCP, and the future Agent Plugin all call one
application service. They contain no versions of their own of the state
machine, the verdict rules, or storage writes.

### 5.6 Adapters do not define the domain

Types from ACP, MCP, the Vercel AI SDK, the Workflow SDK, or any specific
vendor SDK must not appear in `TaskContract`, `Run`, `ChangeSet`,
`EvidenceBundle`, or `Verdict`.

## 6. Architecture

```text
┌──────────────┐  ┌──────────────┐  ┌──────────────────┐
│     CLI      │  │ Local Web UI │  │ MCP / Agent Plugin│
└──────┬───────┘  └──────┬───────┘  └────────┬─────────┘
       └─────────────────┼───────────────────┘
                         │ local HTTP API + SSE
                ┌────────▼─────────┐
                │ Application Core │
                │ tasks, runs,     │
                │ approvals, policy│
                └───────┬──────────┘
                        │
       ┌────────────────┼───────────────────┐
       │                │                   │
┌──────▼──────┐  ┌──────▼───────┐  ┌────────▼────────┐
│ SQLite +    │  │ Run          │  │ Evidence +      │
│ content-    │  │ coordinator  │  │ independent     │
│ addressed   │  │ and recovery │  │ verifier        │
│ artifacts   │  └──────┬───────┘  └─────────────────┘
└─────────────┘         │
              ┌─────────┼──────────┐
              │         │          │
       ┌──────▼────┐ ┌──▼───────┐ ┌▼───────────────┐
       │ Git       │ │ Docker   │ │ AgentRuntime   │
       │ worktrees │ │ workers  │ │ adapters       │
       └───────────┘ └────┬─────┘ │ ACP/native/CLI │
                          │       └───────┬────────┘
                          └───────────────┘
                                  │
                         external coding agent
```

### 6.1 Local service

A persistent local process owns the queue, state, coordination, and
evidence. By default the HTTP API is bound to loopback only. Events are
delivered to clients via SSE; mutating operations go through the HTTP API.

In the MVP, listening on remote network interfaces is forbidden. This
removes the need to design authentication and remote authorization
prematurely.

### 6.2 Run coordinator

The coordinator is the only component that changes a run's technical
status. Transitions are executed transactionally and use a lease with an
owner and an expiry. The scheduler does not rely solely on the system clock
or process liveness without cross-checking against real Docker/worktree
identifiers.

By default, one active run per Verdicta installation is executed; the rest
wait in the queue. The local operator may raise the limit after explicit
resource configuration.

### 6.3 AgentRuntime

`AgentRuntime` is Verdicta's own stable port between the core and an
external agent. Conceptual operations:

```text
probe
prepareAuthentication
start
sendInstruction
resolveApproval
cancel
resume
streamEvents
inspectSession
```

An adapter publishes capabilities: interactive follow-ups, approvals,
resume, structured events, usage limits, MCP configuration, and supported
authentication modes. A missing capability is not masked: the core either
selects a supported scenario or blocks the run with an explanation.

Supported adapter types:

1. **ACP** — preferred when the agent implements the required protocol
   capabilities.
2. **Native SDK** — used when the official SDK gives fuller control, but
   stays inside the adapter.
3. **Headless CLI** — the baseline variant with a pinned CLI version,
   structured output, and contract tests.

ACP is not a mandatory dependency. Headless CLI does not mean parsing
human-readable text with regular expressions when a machine-readable format
is available.

### 6.4 MCP

MCP is used for the agent's access to knowledge and external tools:
WeKnora, GitHub, Linear, and other explicitly permitted services. It is not
the primary channel for starting, pausing, resuming, or cancelling a coding
agent.

Verdicta's own MCP server is a client surface to the core: create a task,
get status, read evidence, request or confirm an approval. It does not
replace `AgentRuntime`.

### 6.5 Independent verifier

The verifier receives the pinned `TaskContract`, a concrete `ChangeSet`,
and a separate clean execution context. It accepts no success flag from the
agent and does not use the agent's summary as a transition condition.

Mandatory commands are re-run after the agent has finished. Predeclared
exit codes, timeouts, and — where available — machine-readable test reports
are used. The verifier and the policy engine run outside the agent's
control; the agent-writable workspace cannot change the verification rules
of the current run.

## 7. Domain model

### 7.1 TaskContract

An immutable, versioned specification of the work:

- `id`, `schemaVersion`, and a content hash;
- goal and context;
- repository and the exact `baseRevision`;
- acceptance criteria;
- mandatory verification commands and their timeouts;
- allowed paths and explicitly forbidden changes;
- change policy: `required`, `allowed`, or `forbidden`;
- network, secrets, MCP, and tool restrictions;
- limits on time, memory, CPU, PIDs, attempts, and repair rounds;
- delivery rules: create a local branch and preserve the result without
  merge/push;
- manual approval requirements;
- data classification and evidence retention rules.

Any change after a run has started creates a new contract version. Older
attempts always reference the original version.

### 7.2 Run

The technical execution of a concrete contract:

- the chosen runtime and adapter/agent versions;
- workspace, branch, container, and session identifiers;
- the current lease;
- attempts and repair rounds;
- resource-usage counters, if the runtime provides them;
- timestamps and the reason for the terminal state;
- a reference to the final `ChangeSet`, `EvidenceBundle`, and `Verdict`.

### 7.3 Attempt and RepairRound

`Attempt` — a technical launch of the runtime, including a failed start or
an abrupt interruption. `RepairRound` — new agent work on the same change
after independent verification.

An infrastructure retry is not hidden inside an attempt. Every retry and
repair gets its own number, logs, and reason. The number of attempts must
not be presented to the user as the number of successful independent
decisions.

### 7.4 ChangeSet

- repository, base revision, and final head commit;
- the local branch;
- the list of commits;
- the full diff and its hash;
- changed files;
- untracked/binary changes;
- path-policy violation flags;
- a reference to the preserved worktree.

An empty diff is permissible only with `changePolicy=allowed` or
`forbidden`. With `required`, an empty diff always yields `failed`; with
`forbidden`, any diff yields `failed`.

### 7.5 EvidenceBundle

A versioned bundle containing:

- the `TaskContract` and its hash;
- base/head revisions and the full diff;
- versions of Verdicta, the adapter, the agent, and the Docker image
  digest;
- a permitted description of the environment without secret values;
- all independently executed commands, their exit codes, and durations;
- stdout/stderr as separate artifacts;
- machine-readable test reports, if the format is supported;
- approval and cancellation events;
- attempts, retries, and repair rounds;
- policy rule results;
- the agent's summary marked `unverified`;
- a list of `limitations`;
- a manifest with the SHA-256 of every artifact.

Once finalized, the bundle is immutable. Correcting a result creates a new
bundle linked to the previous one. JSONL is allowed as an event export, but
not as the primary transactional state mechanism.

### 7.6 Verdict

Possible values:

- `passed` — all mandatory checks and approvals are complete; there are no
  limitations preventing acceptance;
- `needs_review` — technical verification is complete, but there are
  non-automatable criteria, warnings, or significant limitations;
- `blocked` — execution was stopped by policy, a missing approval, or an
  external dependency;
- `failed` — a mandatory check did not pass, the result violates the
  contract, or the permitted repair rounds are exhausted.

`passed` means only that Verdicta's machine gates passed; it does not mean
permission to merge.

## 8. Lifecycle

### 8.1 Technical Run statuses

```text
queued → preparing → running → verifying → completed
                    │   ▲          │
                    │   └ repairing┘
                    ▼
             awaiting_approval

queued/preparing/running/awaiting_approval/verifying/repairing → cancelling → cancelled
queued/preparing/running/awaiting_approval/verifying/repairing → failed
awaiting_approval → running
```

- `completed` means the pipeline reached a decision and must have a
  `Verdict`, including `failed` or `blocked`.
- A `Run` status of `failed` means an infrastructure failure without a
  trustworthy final verdict. The UI explicitly shows "execution error", not
  "tests failed".
- `cancelled` preserves all available artifacts and is not equated with
  success or failure of the code.
- `awaiting_approval` returns to `running` only after an actual approval,
  or after a denial if the contract allows the agent to continue without
  the forbidden operation.

### 8.2 Main scenario

1. The user creates a task via the CLI or the Web UI.
2. The core validates the repository, base revision, checks, runtime, and
   Docker.
3. The contract is pinned; a branch and a separate worktree are created.
4. The SecretProvider prepares minimal ephemeral credentials.
5. A Docker worker starts with resource limits and the chosen network
   policy.
6. The adapter hands the agent the `TaskContract` and the permitted
   context.
7. Events and approval requests are recorded; dangerous operations require
   a user decision.
8. When the agent finishes, the `ChangeSet` is pinned.
9. Verdicta re-runs the mandatory checks and evaluates the rules.
10. If a repair round is permitted, the agent receives structured feedback
    and repeats the work.
11. The final artifacts are finalized; the branch and the worktree are
    preserved for the human.

### 8.3 Approvals

An approval is bound to the run, the specific action, a hash of its
parameters, and an expiry. Changing the command, the path, the network
destination, or the secret requires a new decision. An "always" approval is
not supported in the MVP.

If the operation is mandatory for continuation, a denial finishes the Run
with status `completed` and verdict `blocked`. If the contract allows
continuing without it, the agent receives the denial and the Run returns to
`running`. An expired approval is never executed.

### 8.4 Retry, resume, and cancel

- Automatic retry is allowed only for classified transient infrastructure
  errors.
- An operation with external side effects and an indeterminate result is
  not retried automatically.
- A repair round receives the previous verifier feedback but cannot exceed
  the contract's budget.
- Resume uses the saved agent session only if the adapter confirms the
  identity of the session, worktree, branch, and base revision.
- If identity cannot be confirmed, a new attempt is created with an
  explicit human decision; the old one is not declared successful.
- Cancel first requests a graceful stop, then stops the container after a
  configurable grace period. Logs, diff, and the cancellation reason are
  preserved.

## 9. Isolation and security

### 9.1 Trust boundaries

Trusted: the local operator, the Verdicta core, the SQLite/artifact store,
and the Docker daemon. Untrusted:

- code and instructions in the repository under test;
- agent output and log contents;
- dependencies downloaded by the project;
- external MCP servers;
- the contents of issues, documents, and other context sources.

External text is data, not instructions for the policy engine or the
verifier.

### 9.2 A worktree is not a sandbox

A worktree isolates Git changes but does not prevent a process from reading
the host filesystem, the network, or other worktrees. Therefore the agent
and the verification commands run in Docker.

Baseline worker restrictions:

- non-root user;
- read-only root filesystem and separate writable mounts;
- `cap_drop=ALL`;
- no Docker socket and no broad host-home mounts;
- CPU, memory, PID, and time limits;
- only the explicitly selected worktree and minimal credential mounts;
- no inheritance of the full host environment;
- a separate container identity for every attempt.

Missing Docker is a blocking `doctor` error, not a reason to silently fall
back to host execution.

### 9.3 Network

Supported profiles:

- `none` — networking disabled;
- `allowlist` — outbound traffic only to explicitly permitted
  provider/package/MCP endpoints via an egress policy;
- `full` — all outbound traffic allowed; requires a separate approval when
  the run is created.

The default is `allowlist`. The rules are recorded in the evidence.
Verdicta does not promise protection against DNS/tunneling when `full` is
selected and explicitly shows the weakened boundary.

### 9.4 Secrets and authentication

In the main scenario the core holds no model API key. The agent uses its
own CLI/OAuth login. An adapter, via the `SecretProvider`, can prepare
limited ephemeral credentials for a specific worker.

Rules:

- never mount the entire host home;
- never write secrets to SQLite, task text, logs, diff metadata, or the
  EvidenceBundle;
- pass only the necessary credential material and only for the duration of
  the run;
- never store environment values in evidence;
- mask secret values in the UI and the API;
- apply redaction to known secrets and common token formats;
- treat redaction as protection against accidental leakage, not as proof
  that leakage via arbitrary output is impossible;
- delete ephemeral credential material during worker cleanup.

If a CLI login cannot be safely transferred into the worker, the user may
explicitly provide an agent API key via the OS keychain or a one-time
environment input. These are the agent's credentials, not the core's key.

### 9.5 Logs and prompt injection

Logs are escaped as data in the Web UI and are not interpreted as HTML or
Markdown with active content. External instructions cannot change the
`TaskContract`, verifier commands, or policy. Changing these objects
requires a local user action.
