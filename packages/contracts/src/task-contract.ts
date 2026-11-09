// Copyright 2026 The Verdicta Authors
// SPDX-License-Identifier: Apache-2.0

/**
 * TaskContract: the immutable, versioned specification of a unit of work.
 * Once a run starts, the contract is frozen; any change creates a new
 * version (EVID-001).
 */

export const TASK_CONTRACT_SCHEMA_VERSION = 1 as const;

export type ChangePolicy = "required" | "allowed" | "forbidden";

export type NetworkProfile = "none" | "allowlist" | "full";

export interface VerificationCommand {
  readonly command: readonly string[];
  readonly timeoutMs: number;
  /** Expected machine-readable report format, if any (e.g. "junit", "tap"). */
  readonly machineReport?: string;
  readonly mandatory: boolean;
}

export interface ResourceLimits {
  readonly wallTimeMs: number;
  readonly memoryMb: number;
  readonly cpuShares?: number;
  readonly maxPids?: number;
  readonly maxAttempts: number;
  readonly maxRepairRounds: number;
}

export interface DeliveryRules {
  /** Always true in the MVP: create a local branch, preserve the worktree. */
  readonly createLocalBranch: true;
  readonly preserveWorktree: true;
  /** Always false in the MVP: merge and push are forbidden by design. */
  readonly allowMerge: false;
  readonly allowPush: false;
}

export interface TaskContract {
  readonly schemaVersion: typeof TASK_CONTRACT_SCHEMA_VERSION;
  readonly id: string;
  /** SHA-256 of the canonical serialized contract content. */
  readonly contentHash: string;
  readonly goal: string;
  readonly context?: string;
  readonly repository: {
    readonly path: string;
    readonly baseRevision: string;
  };
  readonly acceptanceCriteria: readonly string[];
  readonly verificationCommands: readonly VerificationCommand[];
  readonly allowedPaths?: readonly string[];
  readonly forbiddenChanges?: readonly string[];
  readonly changePolicy: ChangePolicy;
  readonly networkProfile: NetworkProfile;
  /** Allowlisted egress endpoints; required when networkProfile === "allowlist". */
  readonly networkAllowlist?: readonly string[];
  readonly allowedMcpServers?: readonly string[];
  readonly limits: ResourceLimits;
  readonly delivery: DeliveryRules;
  readonly requiresApprovals: boolean;
  readonly dataClassification?: string;
  readonly evidenceRetentionDays?: number;
}
