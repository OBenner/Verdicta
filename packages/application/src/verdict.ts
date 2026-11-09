// Copyright 2026 The Verdicta Authors
// SPDX-License-Identifier: Apache-2.0

import type { ChangePolicy, Verdict } from "@verdicta/contracts";

export interface PolicyDecision {
  readonly executionAllowed: boolean;
  readonly reason?: string;
}

/** Outcome of an independently re-executed check (never the agent's claim). */
export type CheckOutcome =
  | { readonly kind: "exit"; readonly code: number }
  | { readonly kind: "not_run" }
  | { readonly kind: "timeout" }
  | { readonly kind: "unknown" };

export interface CheckResult {
  /** Check identifier from the TaskContract's verification command list. */
  readonly id: string;
  readonly outcome: CheckOutcome;
  /** Defaults to true when no machine report is required/produced. */
  readonly reportReadable?: boolean;
}

export interface ChangeSummary {
  readonly changePolicy: ChangePolicy;
  readonly hasDiff: boolean;
  readonly forbiddenPathsModified: boolean;
}

export interface ReviewSignals {
  readonly nonAutomatableCriteriaRemaining: boolean;
  readonly warnings: boolean;
  readonly materialLimitations: boolean;
}

export interface VerdictInput {
  readonly policy: PolicyDecision;
  readonly mandatoryApprovalsSatisfied: boolean;
  /**
   * Ids of the checks the TaskContract declares mandatory. Authoritative:
   * a declared mandatory check without a corresponding executed, readable
   * result in `checks` yields "failed" (VER-003, specification 15.3).
   */
  readonly mandatoryChecks: readonly string[];
  readonly checks?: readonly CheckResult[];
  readonly changes?: ChangeSummary;
  readonly review?: ReviewSignals;
}

export function computeVerdict(input: VerdictInput): Verdict {
  // VER-001: policy refusal or missing/rejected mandatory approval.
  if (!input.policy.executionAllowed || !input.mandatoryApprovalsSatisfied) {
    return "blocked";
  }

  // VER-003: a mandatory check declared by the TaskContract that is absent
  // from the evidence, did not run, errored, timed out, has an unknown exit
  // status, or produced an unreadable mandatory report.
  const resultsById = new Map((input.checks ?? []).map((check) => [check.id, check]));
  for (const id of input.mandatoryChecks) {
    const check = resultsById.get(id);
    if (!check) return "failed";
    if (check.outcome.kind === "exit" && check.outcome.code === 0) {
      if (check.reportReadable === false) return "failed";
      continue;
    }
    return "failed";
  }

  // VER-004: forbidden paths modified, mandatory diff missing, or a diff
  // present under changePolicy=forbidden.
  if (input.changes) {
    const { changePolicy, hasDiff, forbiddenPathsModified } = input.changes;
    if (forbiddenPathsModified) return "failed";
    if (changePolicy === "required" && !hasDiff) return "failed";
    if (changePolicy === "forbidden" && hasDiff) return "failed";
  }

  // VER-005: non-automatable criteria, warnings, or material limitations
  // remain after all hard gates.
  if (input.review) {
    const { nonAutomatableCriteriaRemaining, warnings, materialLimitations } = input.review;
    if (nonAutomatableCriteriaRemaining || warnings || materialLimitations) {
      return "needs_review";
    }
  }

  // VER-006: all previous rules passed.
  return "passed";
}
