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

## 10. Storage

### 10.1 SQLite

SQLite is the source of truth for:

- tasks and contract versions;
- runs, attempts, and leases;
- approvals;
- runtime/session identifiers;
- artifact indexes;
- final verdicts.

A state transition and its associated event are written atomically.
Migrations are versioned and tested for restoration from the previous
schema.

### 10.2 Artifact store

Large logs, diffs, reports, and manifests are stored as files with SHA-256.
SQLite holds the relative path, size, MIME type, and hash, but does not
duplicate the full content.

Paths inside the store do not depend on the location of the user's
repository. A bundle can be moved and verified offline. Evidence is deleted
only by an explicit retention/cleanup command, which never deletes the
user's branch.

### 10.3 Recovery

At startup, the service reconciler:

1. finds leases whose owner has expired;
2. cross-checks records against real containers, sessions, and worktrees;
3. does not start a duplicate while the fate of the previous attempt is
   unknown;
4. marks unconfirmed state as requiring a decision;
5. resumes only safe idempotent operations;
6. records all discrepancies in recovery events.

## 11. Verdict computation rules

The rule order is fixed:

1. If policy forbids execution, or a mandatory approval was denied or is
   missing — `blocked`.
2. If a mandatory command was not run, exited with an error, exceeded its
   timeout, or produced an unreadable mandatory report — `failed`.
3. If forbidden paths were changed, a required diff is missing, or a diff
   is present with `changePolicy=forbidden` — `failed`.
4. If non-automatable acceptance criteria, warnings, or significant
   limitations remain — `needs_review`.
5. Only after all previous rules pass — `passed`.

The rules are applied to the full set of results: any `blocked` or `failed`
from a higher-priority rule cannot be hidden by a later successful rule. An
infrastructure inability to obtain a trustworthy result finishes the Run
with the technical status `failed`, not with a verdict about code quality.

LLM review may add a finding or a `needs_review` recommendation, but it
cannot:

- turn a failed mandatory test into `passed`;
- override a policy violation;
- confirm a missing approval;
- replace the independent execution of a command.

## 12. User surfaces

### 12.1 CLI

Basic commands:

```text
verdicta serve
verdicta doctor
verdicta run
verdicta status
verdicta logs
verdicta evidence
verdicta approve
verdicta deny
verdicta cancel
verdicta resume
```

The CLI supports human-readable and JSON output. Exit codes distinguish a
usage error, an infrastructure failure, a policy refusal, and an
unsuccessful verifier result. The CLI never writes state directly to
SQLite.

### 12.2 Web UI

The MVP contains:

- a list of tasks and runs;
- a `TaskContract` creation form;
- live status and an event stream;
- an approvals queue;
- the diff and changed files;
- check results;
- EvidenceBundle and limitations viewing;
- cancel/resume/repair actions within the contract.

The UI never marks a status "done" based on the agent's message. The
technical status and the `Verdict` are visually distinct.

### 12.3 MCP and Agent Plugin

In the MVP, the agent may use external MCP servers for knowledge and tools.
Verdicta's own MCP server with read/approval/task operations and an Agent
Plugin composed of a Skill plus MCP configuration are added after the MVP
as thin clients of the same API.

No single universal binary plugin for all IDEs and agents is assumed. The
core API is the universal part; each client gets a small adapter for its
own extension model.

## 13. Technology choices

- **Language:** TypeScript.
- **Service runtime:** Node.js 24.
- **Monorepo:** pnpm workspace.
- **Web UI:** React + Vite.
- **Storage:** SQLite + content-addressed files.
- **UI events:** SSE.
- **Isolation:** Docker workers.
- **Git:** a separate worktree and branch per run.
- **License:** Apache-2.0.

Preliminary module boundaries:

```text
apps/cli
apps/server
apps/web
packages/contracts
packages/application
packages/storage
packages/git-workspace
packages/sandbox
packages/runtime
packages/verifier
packages/evidence
packages/policy
packages/adapters
```

The Vercel AI SDK is acceptable in future model-backed extensions, and the
Workflow SDK in a separate implementation of the orchestration port.
Neither is required for the MVP, and neither may define the domain types.
The core retains the ability to work without Vercel's network services and
without its own model provider.

## 14. MVP scope

The MVP includes:

- one local operator and one repository per task;
- a queue of independent tasks without a dependency graph;
- the application API, the CLI, and the Web UI;
- `AgentRuntime` with ACP and headless CLI adapters;
- reference profiles for at least two external agents: Codex and Claude
  Code;
- Kimi Code compatibility via ACP, declared only after the shared adapter
  contract suite passes;
- Docker and a git worktree for every attempt;
- scoped secrets and network profiles;
- approvals, limits, retry, repair, cancel, and crash recovery;
- an independent verifier and a deterministic `Verdict`;
- SQLite, EvidenceBundle, and offline hash verification;
- WeKnora as an optional MCP knowledge source, without porting its modules
  into Verdicta.

Support for OpenCode and other agents is achieved through the same port but
is declared only after the compatibility tests actually pass — not on the
mere existence of a same-named adapter.

## 15. MVP acceptance criteria

### 15.1 Successful E2E

On a fixture repository with a reproducible bug, an external agent creates
a fix on a separate branch. Verdicta re-runs the tests, issues `passed`,
preserves a verifiable bundle, and leaves the original branch unchanged.

### 15.2 Failure cannot be declared success

The agent reports "all checks passed", but a mandatory test fails on
independent re-execution. The result is `failed`; the branch is preserved;
no merge/push happens.

### 15.3 No evidence — no passed

A corrupted or missing mandatory report, an unknown exit status, and the
inability to re-run a check never yield `passed`.

### 15.4 Isolation

A fixture tries to access the host home, the Docker socket, another
worktree, and a forbidden network address. Access is blocked, the event is
recorded in the evidence, and the main branch and neighboring runs are
unchanged.

### 15.5 Secrets

A test secret canary is passed only to the worker. After completion, its
value is absent from SQLite, regular logs, API responses, and the
EvidenceBundle. Ephemeral credential files are deleted during cleanup.

### 15.6 Cancellation

During a long-running command, the user issues a cancel. After the grace
period the container is stopped, the status is `cancelled`, the available
diff/logs are preserved, and the next scheduler tick does not restart the
task.

### 15.7 Service restart

The service is force-killed during preparation, execution, and
verification. After startup, the reconciler creates no duplicates,
distinguishes confirmed from unknown states, and allows a safe resume or
cancel.

### 15.8 Interface parity

The same run can be created via the CLI, observed in the Web UI, and
cancelled via the CLI. Both surfaces show the same technical status,
verdict, and evidence identifiers. The next stage repeats this scenario via
MCP and the Agent Plugin without changing the domain rules.

## 16. Testing strategy

### 16.1 Unit and property tests

- a reducer for all allowed and forbidden Run transitions;
- deterministic Verdict computation;
- retry and approval policies;
- path/network policy;
- contract serialization and compatibility;
- EvidenceBundle hashing and offline verification;
- redaction and handling of binary/large logs.

### 16.2 Adapter contract tests

One set of scenarios runs against every runtime adapter: probe, start,
structured events, approval, cancellation, resume, and version mismatch. An
adapter is not considered supported if critical scenarios are skipped.

### 16.3 Fault injection

Mandatory failures:

- the agent hangs;
- the CLI returns an unknown format;
- the process disappears without an exit event;
- Docker exceeds the memory/PID limit;
- a test exceeds its timeout;
- the disk fills up during evidence writing;
- SQLite is unavailable during a state transition;
- the service dies after creating the worktree but before recording the
  container id;
- the service dies after a command finishes but before the verdict is
  recorded;
- the clock moves backwards;
- a stale lease tries to finish a run now owned by another owner;
- an agent session points at a different worktree;
- the manifest or an individual artifact is corrupted.

The expected behavior for every failure: no false `passed`, no unaccounted
duplicate, and preserved diagnostics.

### 16.4 E2E and comparative runs

Independently created fixture repositories and repeatable scenarios are
used — not a copied Auto-Claude implementation. The same set of tasks is
run through at least two runtimes. Compared are not only successes but also
the correctness of refusals, recovery, evidence preservation, and main
branch immutability.

## 17. Observability and operations

`verdicta doctor` checks:

- Node.js and a supported OS;
- the Docker daemon and the ability to create a restricted container;
- Git and worktree support;
- availability of the SQLite/artifact store;
- installed agent CLIs and their versions;
- the supported authentication method;
- network profiles;
- the absence of unresolved recovery conflicts.

Technical logs contain correlation IDs and run/attempt identifiers, but no
secrets. The diagnostic command never changes state implicitly: repair is a
separate explicit operation.

## 18. Prior art and differentiation

Verdicta does not claim uniqueness for the individual ideas of worktree
isolation, evidence gates, or agent orchestration. Before implementation,
comparative scenarios must include the following projects.

### 18.1 Auto-Claude / Aperant

Auto-Claude is the original reference point for Kanban, specifications,
Planner/Coder/QA, and the desktop experience. The current upstream
continues as Aperant under AGPL-3.0 and uses Electron with an external
coding agent. Verdicta is an independent Apache-2.0 implementation with no
copying of code, prompt files, storage schemas, or UI design.

Verdicta's main distinction is an evidence-first control plane with
independent re-execution of checks, a separate domain verdict, Docker
workers, and equal CLI/Web/MCP surfaces. A desktop app and built-in role
based agent workflows are out of MVP scope.

Sources:

- https://github.com/AndyMik90/Aperant
- https://github.com/OBenner/Auto-Coding

### 18.2 Runproof

Runproof already implements a close baseline model: a coding agent or shell
runs in its own worktree, the result is accepted only after the declared
checks, history is stored in SQLite, and no merge is performed. It is
mandatory prior art for Verdicta.

Verdicta's target distinction is a persistent recoverable service, Docker
isolation, an ACP/native/CLI capability model, an extended EvidenceBundle,
approvals, several client surfaces, and a separate state-machine recovery.
These distinctions are implementation requirements, not claims of
uniqueness.

Source: https://github.com/CAOShurong/runproof

### 18.3 Gatewright

Gatewright provides evidence-gated work tracking, file-first events, a live
board, a worktree runner, approvals/triage, resume, a CLI, and MCP.
Therefore Verdicta must not position itself as the first evidence-gated
tracker or the first worktree runner.

Verdicta's focus is the independent re-execution of checks after the agent,
a content-addressed EvidenceBundle, a Docker security boundary, a
deterministic verdict separated from the technical status, and a single
durable control plane for different runtime adapters. During
implementation, the overlap is re-compared on identical E2E scenarios.

Source: https://libraries.io/npm/gatewright

### 18.4 eve

eve provides a composable agent/code extension model and authenticated
tooling. Verdicta chooses a different boundary: it does not assemble a new
agent from extensions but controls already-existing coding applications
through runtime adapters and verifies their results independently.

Source: https://eve.dev/docs/code-extension

## 19. Naming and publication

The working name, chosen by the user, is **Verdicta**; the CLI is
`verdicta`.

Before the first public release, a separate release check of npm package
names, the GitHub organization/repository, domains, and trademarks is
performed. A preliminary GitHub search is not considered a legal
availability check of the name.

The first publication contains the Apache-2.0 license text and an explicit
statement of independence from Auto-Claude/Aperant. Referencing prior art
does not imply borrowing their code or brands.

## 20. Final architectural decisions

1. Code is executed by an external coding agent, not by Verdicta.
2. The core needs no model API key; the agent may require its own
   authentication.
3. The primary control channel is `AgentRuntime` via ACP/native
   SDK/headless CLI.
4. MCP serves knowledge, tools, and client access to the core, but does not
   replace runtime control.
5. The agent receives a `TaskContract`, not a stream of micro-commands.
6. Every attempt gets a git worktree and a Docker worker.
7. Verdicta independently re-runs the mandatory checks.
8. `Run.status` and `Verdict` are separated.
9. The final verdict is computed deterministically; an LLM cannot override
   a failed gate.
10. The result is a preserved local branch, a ChangeSet, an EvidenceBundle,
    and a Verdict.
11. Automatic merge/push is forbidden in the MVP.
12. The primary product is a local service + CLI + Web UI; the Agent Plugin
    and IDE extensions use the same API later.
13. The source of truth is SQLite and hashed files; JSONL is an export.
14. The project is independent and distributed under Apache-2.0.
