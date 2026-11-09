# Testing and Verification

Normative rules for how Verdicta is tested and for how verification results
may be claimed. Verdicta's product promise is "evidence, not confidence" —
its own development must follow the same standard.

## 1. Honesty rules (highest priority)

1. Never claim a check passed unless it was actually executed in the current
   change's context, and its real output is reported.
2. Never mark a test as passed, skipped, or "not applicable" to make a
   suite green without an explicit, recorded reason.
3. Never weaken, delete, or "fix" an existing test to match new behavior
   unless the underlying requirement changed — and requirement changes are
   documented (see `git-and-review.md`, ADR policy).
4. A regression test comes first: reproduce the defect with a failing test,
   then fix the code.

## 2. Test levels

| Level                  | Scope                             | Rules                                                                                                                                                                                                       |
| ---------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit / property        | Pure domain logic                 | Fast, deterministic, no I/O. Property tests for the `Run` reducer and the verdict rules: enumerate valid and invalid transitions.                                                                           |
| Integration            | Storage, git, Docker boundaries   | Use real SQLite and, where marked, real Docker — not total mocks. External SaaS is mocked; core infrastructure is not.                                                                                      |
| Adapter contract suite | Each runtime adapter              | One shared scenario set runs against every adapter: `probe`, `start`, structured events, approval, cancellation, resume, version mismatch. An adapter is not "supported" while skipping critical scenarios. |
| Fault injection        | Recovery and fail-closed behavior | Mandatory scenarios from §4.                                                                                                                                                                                |
| E2E                    | Full pipeline                     | Independently created fixture repositories, minimum two runtimes for the comparative suite.                                                                                                                 |

## 3. What must be covered

- The `Run` state machine: every permitted transition, and proof that every
  forbidden transition is rejected (reference `STATE-*` IDs).
- Deterministic verdict computation: the fixed rule order, including proof
  that a later passing rule cannot hide an earlier `blocked`/`failed`
  (`VER-*` IDs).
- Retry and approval policy, including approval expiry and parameter-hash
  binding.
- Path policy and network profile evaluation.
- Contract serialization and backward compatibility across schema versions.
- `EvidenceBundle` hashing and offline verification, including detection of
  a corrupted manifest or artifact.
- Redaction of known secrets and common token formats; handling of binary
  and oversized logs.

## 4. Mandatory fault-injection scenarios

Each scenario must have a test proving: no false `passed`, no unaccounted
duplicate execution, and preserved diagnostics.

1. Agent process hangs.
2. Agent CLI returns an unknown output format.
3. Agent process disappears without an exit event.
4. Docker worker hits its memory or PID limit.
5. A mandatory check exceeds its timeout.
6. Disk fills while evidence is being written.
7. SQLite is unavailable during a state transition.
8. Service dies after creating the worktree but before recording the
   container ID.
9. Service dies after a check command finishes but before the verdict is
   recorded.
10. System clock moves backwards.
11. A stale lease tries to complete a run now owned by another owner.
12. An agent session points at a different worktree than recorded.
13. The bundle manifest or an individual artifact is corrupted.

## 5. Fail-closed expectations

Tests must assert, not assume, the fail-closed direction:

- Missing or unreadable mandatory report ⇒ not `passed`.
- Unknown exit status of a mandatory command ⇒ not `passed`.
- Corrupted evidence ⇒ not `passed`.
- Timeout of a mandatory check ⇒ `failed` (verdict) or infrastructure
  failure, never silent success.

## 6. E2E acceptance scenarios (MVP)

These mirror the specification's acceptance criteria and must exist as
executable scenarios:

1. **Successful E2E**: fixture repo with a reproducible defect; the agent
   produces a fix on its own branch; Verdicta re-runs the tests
   independently, returns `passed`, preserves a verifiable bundle, and
   leaves the original branch untouched.
2. **Failure cannot be reported as success**: the agent claims all checks
   pass, but the mandatory test fails on independent re-run ⇒ `failed`;
   branch preserved; no merge/push.
3. **No evidence, no passed**: corrupted or missing mandatory report,
   unknown exit status, or inability to re-run a check blocks `passed`.
4. **Isolation**: a fixture attempting to reach the host home, the Docker
   socket, another worktree, or a forbidden network address is blocked; the
   event lands in evidence; the main branch and neighboring runs are
   unchanged.
5. **Secrets**: a secret canary given only to the worker is absent from
   SQLite, regular logs, API responses, and the `EvidenceBundle` after
   completion; ephemeral credential files are removed at cleanup.
6. **Cancel**: during a long command the user cancels; after the grace
   period the container is stopped, status is `cancelled`, available
   diff/logs are preserved, and the next scheduler tick does not restart
   the task.
7. **Service restart**: the service is killed during preparation, during
   execution, and during verification; after restart the reconciler creates
   no duplicates, distinguishes confirmed from unknown states, and offers
   safe resume or cancel.
8. **Interface parity**: the same run is created via CLI, observed in the
   Web UI, and cancelled via CLI; both surfaces show identical technical
   status, verdict, and evidence identifiers.

## 7. Fixtures and independence

- Fixture repositories are created independently for Verdicta's tests.
  Copying test assets, prompts, or scenarios from third-party prior-art
  projects is forbidden.
- Comparative runs across runtimes compare not only successes but also
  correctness of refusals, recovery behavior, evidence integrity, and
  immutability of the user's main branch.

## 8. Tooling note (documentation-only phase)

The concrete test runner, coverage gates, and CI workflow are defined by
the scaffolding change. Until then this document describes the required
contract; no test command may be cited as working before it exists and has
been executed.
