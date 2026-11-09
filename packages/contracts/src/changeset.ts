// Copyright 2026 The Verdicta Authors
// SPDX-License-Identifier: Apache-2.0

/**
 * ChangeSet: the concrete code outcome of a run, captured independently of
 * anything the agent claims (specification section 7.4).
 */

export interface ChangedFile {
  readonly path: string;
  readonly changeKind: "added" | "modified" | "deleted" | "renamed";
  readonly binary: boolean;
}

export interface PathPolicyViolation {
  readonly path: string;
  readonly rule: string;
  readonly detail?: string;
}

export interface ChangeSet {
  readonly repository: string;
  readonly baseRevision: string;
  readonly headCommit: string;
  readonly branch: string;
  readonly commits: readonly string[];
  /** SHA-256 of the full diff artifact in the artifact store. */
  readonly diffHash: string;
  readonly changedFiles: readonly ChangedFile[];
  readonly untrackedFiles: readonly string[];
  readonly pathPolicyViolations: readonly PathPolicyViolation[];
  /** Reference to the preserved worktree for human review. */
  readonly worktreeRef: string;
}
