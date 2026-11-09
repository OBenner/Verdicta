// Copyright 2026 The Verdicta Authors
// SPDX-License-Identifier: Apache-2.0

import type { Run } from "@verdicta/contracts";

/** A live agent session and the worktree it is actually attached to. */
export interface ObservedSession {
  readonly id: string;
  readonly worktreePath: string;
}

/** What the outside world actually shows, collected by the caller. */
export interface ObservedState {
  readonly containerIds: readonly string[];
  readonly worktreePaths: readonly string[];
  readonly sessions: readonly ObservedSession[];
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

  const discrepancies: string[] = [];

  // STATE-007 (2): cross-check the record against real worktrees,
  // containers, and sessions — regardless of lease state. Reality does not
  // care what the lease says.
  if (!observed.worktreePaths.includes(run.workspace.worktreePath)) {
    discrepancies.push(`recorded worktree ${run.workspace.worktreePath} is not observed`);
  }

  const containerId = run.workspace.containerId;
  if (containerId !== undefined && !observed.containerIds.includes(containerId)) {
    discrepancies.push(`recorded container ${containerId} is not observed`);
  }

  const sessionId = run.workspace.agentSessionId;
  if (sessionId !== undefined) {
    const session = observed.sessions.find((candidate) => candidate.id === sessionId);
    if (session === undefined) {
      discrepancies.push(`recorded session ${sessionId} is not observed`);
    } else if (session.worktreePath !== run.workspace.worktreePath) {
      // Fault-injection scenario 12: a session attached to a different
      // worktree than recorded — resuming it would corrupt another run.
      discrepancies.push(
        `session ${sessionId} points at worktree ${session.worktreePath}, ` +
          `not the recorded ${run.workspace.worktreePath}`,
      );
    }
  }

  // STATE-007 (1): expired or missing lease on an active run means the
  // previous owner may have died mid-flight.
  if (run.lease === undefined) {
    discrepancies.push("active run has no lease");
  } else if (run.lease.expiresAt <= now) {
    let leaseReason = `lease expired at ${run.lease.expiresAt}`;
    // STATE-007 (3): a duplicate attempt must never be started while the
    // previous attempt's fate is unknown.
    if (containerId !== undefined && observed.containerIds.includes(containerId)) {
      leaseReason +=
        `; container ${containerId} is still running; ` +
        "duplicate start forbidden until a decision is made";
    }
    discrepancies.push(leaseReason);
  }

  // STATE-007 (4): any discrepancy means unconfirmed state — a human
  // decision is required. Never resume silently.
  if (discrepancies.length > 0) {
    return {
      runId: run.id,
      kind: "mark_needs_decision",
      reason: `${discrepancies.join("; ")}; attempt fate unknown`,
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
