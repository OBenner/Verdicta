// Copyright 2026 The Verdicta Authors
// SPDX-License-Identifier: Apache-2.0

/**
 * Run: the technical execution of one TaskContract version.
 *
 * `RunStatus` (technical axis) and `Verdict` (outcome axis) are deliberately
 * separate; no code path may collapse them. See STATE-001/STATE-002 in
 * docs/development/architecture-and-invariants.md.
 */

export const RUN_STATUSES = [
  "queued",
  "preparing",
  "running",
  "awaiting_approval",
  "verifying",
  "repairing",
  "cancelling",
  "cancelled",
  "completed",
  "failed",
] as const;

export type RunStatus = (typeof RUN_STATUSES)[number];

export const VERDICTS = ["passed", "needs_review", "blocked", "failed"] as const;

export type Verdict = (typeof VERDICTS)[number];

/** A lease guards every status transition: owner + expiry (STATE-003/004). */
export interface Lease {
  readonly owner: string;
  readonly expiresAt: string; // UTC ISO-8601
}

export interface RuntimeSelection {
  readonly adapterId: string;
  readonly adapterVersion: string;
  readonly agentVersion: string;
}

export interface WorkspaceIdentifiers {
  readonly worktreePath: string;
  readonly branch: string;
  readonly containerId?: string;
  readonly agentSessionId?: string;
}

export interface Attempt {
  readonly attemptNumber: number;
  readonly startedAt: string; // UTC ISO-8601
  readonly finishedAt?: string;
  readonly reason?: string;
}

export interface RepairRound {
  readonly roundNumber: number;
  readonly verifierFeedbackRef: string; // artifact reference
  readonly startedAt: string;
  readonly finishedAt?: string;
}

export interface ResourceUsage {
  readonly wallTimeMs?: number;
  readonly peakMemoryBytes?: number;
  readonly cpuSeconds?: number;
}

export interface Run {
  readonly id: string;
  readonly contractId: string;
  readonly contractSchemaVersion: number;
  readonly status: RunStatus;
  readonly runtime: RuntimeSelection;
  readonly workspace: WorkspaceIdentifiers;
  readonly lease?: Lease;
  readonly attempts: readonly Attempt[];
  readonly repairRounds: readonly RepairRound[];
  readonly usage?: ResourceUsage;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** Why the run reached a terminal state; required for terminal statuses. */
  readonly terminalReason?: string;
  /** Filled only when status === "completed" (STATE-001). */
  readonly changeSetRef?: string;
  readonly evidenceBundleRef?: string;
  readonly verdict?: Verdict;
}
