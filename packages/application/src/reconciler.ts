// Copyright 2026 The Verdicta Authors
// SPDX-License-Identifier: Apache-2.0

import type { Run } from "@verdicta/contracts";

/** What the outside world actually shows, collected by the caller. */
export interface ObservedState {
  readonly containerIds: readonly string[];
  readonly worktreePaths: readonly string[];
  readonly sessionIds: readonly string[];
}

export type RecoveryDecisionKind = "no_action" | "mark_needs_decision" | "safe_to_resume";

export interface RecoveryDecision {
  readonly runId: string;
  readonly kind: RecoveryDecisionKind;
  readonly reason: string;
}

const TERMINAL_STATUSES = new Set(["completed", "cancelled", "failed"]);

export function reconcileRun(run: Run, observed: ObservedState, now: string): RecoveryDecision {
  if (TERMINAL_STATUSES.has(run.status)) {
    return { runId: run.id, kind: "no_action", reason: "terminal status" };
  }

  // STATE-007 (5): a queued run never started an attempt — dispatching it
  // again is a safe idempotent operation, even if its lease expired.
  if (run.status === "queued") {
    return {
      runId: run.id,
      kind: "safe_to_resume",
      reason: "no attempt started; re-dispatch is idempotent",
    };
  }

  // STATE-007 (1, 4): expired or missing lease on an active run means the
  // previous owner may have died mid-flight — the attempt's fate is
  // unknown, so a human decision is required.
  if (run.lease === undefined) {
    return {
      runId: run.id,
      kind: "mark_needs_decision",
      reason: "active run has no lease; attempt fate unknown",
    };
  }
  if (run.lease.expiresAt <= now) {
    return {
      runId: run.id,
      kind: "mark_needs_decision",
      reason: expiredLeaseReason(run, observed),
    };
  }

  return { runId: run.id, kind: "no_action", reason: "lease still valid" };
}

/**
 * STATE-007 (6): classify a set of runs and return only the actionable
 * decisions — these are what gets recorded as recovery events.
 */
export function reconcileAll(
  runs: readonly Run[],
  observed: ObservedState,
  now: string,
): readonly RecoveryDecision[] {
  return runs
    .map((run) => reconcileRun(run, observed, now))
    .filter((decision) => decision.kind !== "no_action");
}

/**
 * STATE-007 (2, 3): cross-check the record against real containers.
 * Either way the attempt's fate is unknown — a duplicate start is
 * forbidden until a human decides.
 */
function expiredLeaseReason(run: Run, observed: ObservedState): string {
  const containerId = run.workspace.containerId;
  if (containerId === undefined) {
    return `lease expired at ${run.lease?.expiresAt ?? "unknown"}; attempt fate unknown`;
  }
  if (observed.containerIds.includes(containerId)) {
    return (
      `lease expired but container ${containerId} is still running; ` +
      "duplicate start forbidden until a decision is made"
    );
  }
  return `lease expired and container ${containerId} is not observed; attempt fate unknown`;
}
