// Copyright 2026 The Verdicta Authors
// SPDX-License-Identifier: Apache-2.0

/**
 * EvidenceBundle: the versioned, content-addressed proof package of a run.
 * Immutable after finalization (EVID-002); correcting a result creates a
 * new bundle linked to the previous one.
 */

export const EVIDENCE_BUNDLE_SCHEMA_VERSION = 1 as const;

export interface ExecutedCheck {
  readonly command: readonly string[];
  readonly exitCode: number | "timeout" | "unknown";
  readonly durationMs: number;
  /** Artifact refs; stdout and stderr are stored separately. */
  readonly stdoutRef?: string;
  readonly stderrRef?: string;
  readonly machineReportRef?: string;
}

export interface VersionInfo {
  readonly verdicta: string;
  readonly adapter: string;
  readonly agent: string;
  readonly dockerImageDigest?: string;
}

export interface ApprovalEvent {
  readonly requestedAt: string;
  readonly action: string;
  readonly parametersHash: string;
  readonly decision: "approved" | "denied" | "expired";
  readonly decidedAt?: string;
}

export interface PolicyRuleResult {
  readonly ruleId: string;
  readonly outcome: "pass" | "fail" | "warn";
  readonly detail?: string;
}

/**
 * The agent's own summary. Always unverified: it is a comment, never a
 * condition for any state transition (specification section 5.3).
 */
export interface AgentSummary {
  readonly text: string;
  readonly unverified: true;
}

export interface ArtifactEntry {
  readonly path: string;
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly mimeType: string;
}

export interface EvidenceBundle {
  readonly schemaVersion: typeof EVIDENCE_BUNDLE_SCHEMA_VERSION;
  readonly id: string;
  readonly runId: string;
  /** Links to the previous bundle when this one corrects a result. */
  readonly supersedesBundleId?: string;
  readonly contractId: string;
  readonly contractHash: string;
  readonly baseRevision: string;
  readonly headRevision: string;
  readonly versions: VersionInfo;
  /** Environment description with secret values removed. */
  readonly environmentDescription: string;
  readonly executedChecks: readonly ExecutedCheck[];
  readonly approvals: readonly ApprovalEvent[];
  readonly policyResults: readonly PolicyRuleResult[];
  readonly agentSummary?: AgentSummary;
  readonly limitations: readonly string[];
  /** Manifest: every artifact with its SHA-256 (offline-verifiable). */
  readonly manifest: readonly ArtifactEntry[];
}
