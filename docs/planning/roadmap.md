# Verdicta Roadmap to MVP

Maintained by the project manager chat. Source of truth for product
meaning: `docs/SPECIFICATION.md`. Requirement IDs referenced below come
from `docs/development/architecture-and-invariants.md` and
`docs/development/security-and-secrets.md`.

Status legend: ✅ done · 🔶 partial · ⬜ not started

## Current state (verified 2026-11-09 against `origin/main`)

| Area                                           | State | Evidence                                            |
| ---------------------------------------------- | ----- | --------------------------------------------------- |
| Scaffold, gates, CI, security workflows        | ✅    | PR #1 (merged)                                      |
| ADR set 0001–0010 + governance doc             | ✅    | PR #3 (merged)                                      |
| Domain contracts (`packages/contracts`)        | ✅    | types + vocabulary tests                            |
| Run state machine + verdict rules              | ✅    | `packages/application`, ADR-0003; VER-003 fix PR #5 |
| Verdict fixed-order property tests             | ✅    | PR #11 (ADR-0003 fitness function)                  |
| Requirement-traceability gate                  | ✅    | PR #9 (architecture-governance Layer 1)             |
| Lease-guarded run coordinator + reconciler     | ✅    | ADR-0006; recovery events `cb58d2e`                 |
| SQLite storage, migrations, atomic transitions | ✅    | `packages/storage`, ADR-0001                        |
| `apps/cli`, `apps/server`, `apps/web`          | ⬜    | scaffold only                                       |
| `git-workspace`, `sandbox`, `runtime`          | ⬜    | stubs                                               |
| `verifier`, `evidence`, `policy`, `adapters`   | ⬜    | stubs                                               |

## Milestones

### M0 — Scaffold and governance ✅

Workspace, scripts contract, gates, CI, ADR process, normative docs.

### M1 — Domain core 🔶 (one task left)

Contracts, run machine, verdict ruleset, coordinator, reconciler, SQLite —
done. Remaining gaps before M1 is closed:

- **EvidenceBundle + artifact store** (§10.2, EVID-\*) — work order ready:
  `docs/planning/tasks/2026-11-09-m1-evidence-bundle-artifact-store.md`
  (ADR-0001 + ADR-0008).
- Approval records and their lifecycle (§8.3) — storage + domain events.

### M2 — Execution substrate ⬜

- `packages/git-workspace`: worktree + branch lifecycle per attempt.
- `packages/sandbox`: Docker worker with the §9.2 baseline restrictions
  (non-root, read-only rootfs, `cap_drop=ALL`, resource limits, no Docker
  socket). No host-execution fallback — SEC-\*.
- Network profiles `none | allowlist | full` with egress enforcement.
- `SecretProvider`: ephemeral scoped credentials, redaction, cleanup.

### M3 — AgentRuntime and first adapter ⬜

- `packages/runtime`: the stable port (probe, start, sendInstruction,
  resolveApproval, cancel, resume, streamEvents, inspectSession).
- Adapter contract test suite (§16.2).
- First adapter: headless CLI with pinned version and structured output.
- Then ACP adapter; Codex + Claude Code reference profiles (§14).

### M4 — Verifier and policy ⬜

- `packages/verifier`: independent re-execution of mandatory commands in a
  clean context (§6.5); verdict recomputation plugs into `verifyBundle`
  (ADR-0008 decision #4).
- `packages/policy`: path/network/change-policy evaluation feeding the
  fixed-order verdict rules (§11, ADR-0010).

### M5 — Application API and clients ⬜

- `apps/server`: loopback HTTP API + SSE, owns queue and coordination.
- `apps/cli`: the §12.1 command set with differentiated exit codes.
- `apps/web`: task list, contract form, live status, approvals queue, diff
  view, evidence viewer (§12.2).

### M6 — MVP acceptance (§15) and hardening ⬜

- E2E scenarios 15.1–15.8 on independent fixtures.
- Fault-injection suite (§16.3): all listed failure classes.
- `verdicta doctor` full check list (§17).
- Comparative runs against two runtimes (§16.4).

## Working agreements for this chat

- Every task closes per the Definition of Done in `AGENTS.md`: real
  `pnpm verify` output reported, scope respected, docs updated in the same
  change.
- Changes to the `Run` state machine, `Verdict` values, verdict rule order,
  or any `docs/development/` rule require explicit operator approval first.
- New runtime dependencies and new workspace packages require approval.
- PR descriptions and repo artifacts are written entirely in English per
  git-and-review §4a and `.github/pull_request_template.md`; this chat
  discusses in Russian.
- No push, no merge to `main`, no automatic PR publication.

## Next task proposal

Close M1 with task M1-1: EvidenceBundle + content-addressed artifact store
(`packages/evidence` + `packages/storage`, governed by ADR-0001 and
ADR-0008). Work order:
`docs/planning/tasks/2026-11-09-m1-evidence-bundle-artifact-store.md`.
This unblocks M4 and keeps the evidence-first promise enforceable early.
