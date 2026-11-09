# Architecture and Invariants

Normative architectural rules for Verdicta. These rules exist so that the
system's core guarantees — evidence, isolation, deterministic verdicts — do
not erode as the codebase grows.

Critical requirements carry stable IDs (`STATE-*`, `SEC-*`, `EVID-*`,
`VER-*`). Tests and code SHOULD reference these IDs explicitly, giving
traceability: requirement → implementation → test → evidence.

## 1. Module boundaries and dependency directions

Target workspace layout:

```text
apps/cli            apps/server          apps/web
packages/contracts  packages/application packages/storage
packages/git-workspace  packages/sandbox packages/runtime
packages/verifier   packages/evidence    packages/policy
packages/adapters
```

Dependency rules:

1. `packages/contracts` defines the domain types and depends on nothing else
   in the workspace.
2. `packages/application` (use cases, state machine, verdict rules) depends
   only on `contracts` and ports (interfaces). It MUST NOT import
   infrastructure (`storage`, `sandbox`, `adapters`, HTTP frameworks).
3. Infrastructure packages implement ports defined by `application` /
   `contracts`; the dependency arrow points inward.
4. `apps/*` are thin clients. They MUST NOT contain their own version of the
   state machine, the verdict rules, or direct writes to storage. CLI, Web
   UI, MCP, and any future Agent Plugin all call the same application
   service.
5. Adapters are the only place where ACP, MCP, vendor SDK, or CLI-specific
   types may appear.

## 2. Domain purity (no adapter types in the domain)

**[VER-000 / ARCH-001]** Types from ACP, MCP, Vercel AI SDK, Workflow SDK,
or any vendor SDK MUST NOT appear in `TaskContract`, `Run`, `ChangeSet`,
`EvidenceBundle`, or `Verdict`. Translation between wire formats and domain
types happens at the adapter boundary and nowhere else.

The core must remain able to run without any model provider and without
network access to external SaaS services.

## 3. Run.status and Verdict are separate axes

**[STATE-001]** A `Run` has a technical status:

```text
queued → preparing → running → verifying → completed
                    │   ▲          │
                    │   └ repairing┘
                    ▼
             awaiting_approval

any of queued/preparing/running/awaiting_approval/verifying/repairing
  → cancelling → cancelled
  → failed
awaiting_approval → running
```

- `completed` means the pipeline reached a decision and MUST carry a
  `Verdict` — including `failed` or `blocked`.
- A `Run` status of `failed` means an infrastructure failure without a
  trustworthy verdict. The UI must render this as "execution error", never
  as "tests failed".
- `cancelled` preserves all available artifacts and is neither success nor
  failure of the code.

**[STATE-002]** A successful agent process exit, a green UI status, and a
passing verification are three different events. No code path may collapse
them into one.

**[STATE-003]** Only the run coordinator changes the technical status of a
run. Transitions are transactional and guarded by a lease with an owner and
an expiry. **[STATE-004]** A stale lease MUST NOT be able to complete a run
owned by another owner.

## 4. Verdict computation rules

The `Verdict` values are `passed`, `needs_review`, `blocked`, `failed`.
Rules apply in a fixed order, each to the full result set; a later passing
rule can never hide an earlier `blocked` or `failed`:

- **[VER-001]** If policy forbids execution, or a mandatory approval is
  missing or rejected — `blocked`.
- **[VER-002]** (reserved)
- **[VER-003]** If a mandatory check did not run, errored, timed out, or
  produced an unreadable mandatory report — `failed`. An agent's claim that
  checks passed is not a substitute for independent execution.
- **[VER-004]** If forbidden paths were modified, a mandatory diff is
  missing (`changePolicy=required`), or any diff exists under
  `changePolicy=forbidden` — `failed`.
- **[VER-005]** If non-automatable acceptance criteria, warnings, or
  material limitations remain — `needs_review`.
- **[VER-006]** Only after all previous rules pass — `passed`.

**[VER-007]** An LLM review may add findings or recommend `needs_review`,
but can never turn a failed mandatory check into `passed`, cancel a policy
violation, substitute a missing approval, or replace independent check
execution.

## 5. Immutability rules

- **[EVID-001]** `TaskContract` is immutable once a run starts. Any change
  creates a new contract version; old attempts always reference their
  original version.
- **[EVID-002]** A finalized `EvidenceBundle` is immutable. Correcting a
  result creates a new bundle linked to the previous one.
- **[EVID-003]** JSONL is permitted as an event export format, never as the
  transactional state mechanism. SQLite plus content-addressed files are
  the source of truth.

## 6. Idempotency, leases, and recovery

- **[STATE-005]** Automatic retry is allowed only for classified transient
  infrastructure errors. An operation with external side effects whose
  result is uncertain MUST NOT be retried automatically.
- **[STATE-006]** Every attempt, retry, and repair round gets its own
  number, logs, and recorded reason. Infrastructure retries must not be
  hidden inside an attempt.
- **[STATE-007]** On service start, the reconciler: finds leases with
  expired owners, cross-checks records against real containers/sessions/
  worktrees, never starts a duplicate while a previous attempt's fate is
  unknown, marks unconfirmed state as requiring a decision, resumes only
  safe idempotent operations, and records all discrepancies as recovery
  events.
- **[STATE-008]** Resume reuses a saved agent session only if the adapter
  confirms identity of session, worktree, branch, and base revision.
  Otherwise a new attempt is created with an explicit human decision; the
  old attempt is never declared successful.

## 7. Security-relevant invariants

See `security-and-secrets.md` for the full threat model. The architectural
core:

- **[SEC-001]** A git worktree is not a sandbox. Agents and verification
  commands run in Docker with the baseline restrictions defined in the
  security document.
- **[SEC-002]** Absence of Docker is a blocking `doctor` error, never a
  reason to silently execute on the host.
- **[SEC-003]** External text (repo contents, issues, agent output) is data,
  not instructions, for the policy engine and the verifier.
- **[SEC-004]** The verifier and the policy engine run outside the agent's
  control. An agent-writable workspace must not be able to alter the
  current run's verification rules.

## 8. Single API, multiple surfaces

- CLI, Web UI, MCP server, and any future Agent Plugin are clients of one
  application service.
- The HTTP API listens on loopback only in the MVP; remote network
  listening is forbidden (this deliberately avoids premature auth design).
- SSE carries events to clients; mutating operations go through the HTTP
  API.

## 9. Delivery boundaries

- A run's result is a preserved local branch, `ChangeSet`,
  `EvidenceBundle`, and `Verdict`.
- Automatic merge and push are forbidden in the MVP — by product design,
  not by missing implementation time.
