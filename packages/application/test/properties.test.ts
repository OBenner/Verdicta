// Copyright 2026 The Verdicta Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { RUN_STATUSES, VERDICTS, type RunStatus } from "@verdicta/contracts";

import { canTransition } from "../src/run-machine.js";
import { computeVerdict, type CheckOutcome, type VerdictInput } from "../src/verdict.js";

/**
 * Property-style tests over finite domains (exhaustive enumeration instead
 * of random generation — no extra dependency required).
 */

const TERMINAL: readonly RunStatus[] = ["completed", "cancelled", "failed"];

function reachableFrom(start: RunStatus): ReadonlySet<RunStatus> {
  const seen = new Set<RunStatus>([start]);
  const queue: RunStatus[] = [start];
  while (queue.length > 0) {
    const current = queue.pop();
    if (current === undefined) break;
    for (const next of RUN_STATUSES) {
      if (!seen.has(next) && canTransition(current, next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

describe("run machine — structural properties", () => {
  it("liveness: every non-terminal status can reach at least one terminal status", () => {
    for (const status of RUN_STATUSES) {
      if (TERMINAL.includes(status)) continue;
      const reachable = reachableFrom(status);
      const reachesTerminal = TERMINAL.some((terminal) => reachable.has(terminal));
      expect(reachesTerminal, `${status} must reach a terminal status`).toBe(true);
    }
  });

  it("cancelling reaches only cancelled (specification section 8.1)", () => {
    const reachable = reachableFrom("cancelling");
    expect([...reachable].sort()).toEqual(["cancelled", "cancelling"].sort());
  });

  it("absorbing: nothing is reachable from a terminal status", () => {
    for (const terminal of TERMINAL) {
      expect(reachableFrom(terminal).size).toBe(1);
    }
  });

  it("the transition graph has no edge into queued", () => {
    for (const from of RUN_STATUSES) {
      expect(canTransition(from, "queued"), `${from} → queued`).toBe(false);
    }
  });
});

describe("computeVerdict — precedence properties over the input domain", () => {
  const outcomes: readonly CheckOutcome[] = [
    { kind: "exit", code: 0 },
    { kind: "exit", code: 1 },
    { kind: "not_run" },
    { kind: "timeout" },
    { kind: "unknown" },
  ];

  function* inputs(): Generator<VerdictInput> {
    for (const executionAllowed of [true, false]) {
      for (const mandatoryApprovalsSatisfied of [true, false]) {
        for (const outcome of outcomes) {
          for (const changePolicy of ["required", "allowed", "forbidden"] as const) {
            for (const hasDiff of [true, false]) {
              for (const forbiddenPathsModified of [true, false]) {
                for (const warnings of [true, false]) {
                  yield {
                    policy: { executionAllowed },
                    mandatoryApprovalsSatisfied,
                    mandatoryChecks: ["check-1"],
                    checks: [{ id: "check-1", outcome }],
                    changes: { changePolicy, hasDiff, forbiddenPathsModified },
                    review: {
                      nonAutomatableCriteriaRemaining: false,
                      warnings,
                      materialLimitations: false,
                    },
                  };
                }
              }
            }
          }
        }
      }
    }
  }

  it("the verdict is always one of the four specified values", () => {
    for (const input of inputs()) {
      expect(VERDICTS).toContain(computeVerdict(input));
    }
  });

  it("VER-001 dominance: policy refusal or missing approval always yields blocked", () => {
    for (const input of inputs()) {
      if (!input.policy.executionAllowed || !input.mandatoryApprovalsSatisfied) {
        expect(computeVerdict(input)).toBe("blocked");
      }
    }
  });

  it("passed implies all gates clean (necessary conditions of VER-006)", () => {
    for (const input of inputs()) {
      if (computeVerdict(input) !== "passed") continue;
      expect(input.policy.executionAllowed).toBe(true);
      expect(input.mandatoryApprovalsSatisfied).toBe(true);
      for (const id of input.mandatoryChecks) {
        const check = (input.checks ?? []).find((candidate) => candidate.id === id);
        expect(check?.outcome).toEqual({ kind: "exit", code: 0 });
      }
      expect(input.changes?.forbiddenPathsModified).toBe(false);
      expect(input.review?.warnings).toBe(false);
    }
  });

  it("failed never coexists with blocked conditions (blocked wins)", () => {
    for (const input of inputs()) {
      const blocked = !input.policy.executionAllowed || !input.mandatoryApprovalsSatisfied;
      if (blocked) {
        expect(computeVerdict(input)).not.toBe("failed");
      }
    }
  });
});

/**
 * ADR-0003 fitness functions: the verdict ruleset is a pure, fixed-order,
 * closed function over evidence — the same evidence must always yield the
 * same verdict, and a later rule must never mask an earlier blocked/failed.
 */
describe("computeVerdict — ADR-0003 fixed-order ruleset properties", () => {
  const allOutcomes: readonly CheckOutcome[] = [
    { kind: "exit", code: 0 },
    { kind: "exit", code: 1 },
    { kind: "not_run" },
    { kind: "timeout" },
    { kind: "unknown" },
  ];
  const cleanOutcome: CheckOutcome = { kind: "exit", code: 0 };
  const dirtyOutcomes = allOutcomes.filter(
    (outcome) => !(outcome.kind === "exit" && outcome.code === 0),
  );

  function* richInputs(): Generator<VerdictInput> {
    for (const executionAllowed of [true, false]) {
      for (const mandatoryApprovalsSatisfied of [true, false]) {
        for (const outcome of allOutcomes) {
          for (const reportReadable of [true, false]) {
            for (const changePolicy of ["required", "allowed", "forbidden"] as const) {
              for (const hasDiff of [true, false]) {
                for (const forbiddenPathsModified of [true, false]) {
                  for (const nonAutomatableCriteriaRemaining of [true, false]) {
                    for (const warnings of [true, false]) {
                      for (const materialLimitations of [true, false]) {
                        yield {
                          policy: { executionAllowed },
                          mandatoryApprovalsSatisfied,
                          mandatoryChecks: ["check-1"],
                          checks: [{ id: "check-1", outcome, reportReadable }],
                          changes: { changePolicy, hasDiff, forbiddenPathsModified },
                          review: {
                            nonAutomatableCriteriaRemaining,
                            warnings,
                            materialLimitations,
                          },
                        };
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  function isBlocked(input: VerdictInput): boolean {
    return !input.policy.executionAllowed || !input.mandatoryApprovalsSatisfied;
  }

  function isCheckDirty(input: VerdictInput): boolean {
    for (const id of input.mandatoryChecks) {
      const check = (input.checks ?? []).find((candidate) => candidate.id === id);
      if (!check) return true;
      if (check.outcome.kind !== "exit" || check.outcome.code !== 0) return true;
      if (check.reportReadable === false) return true;
    }
    return false;
  }

  function isChangeDirty(input: VerdictInput): boolean {
    if (!input.changes) return false;
    const { changePolicy, hasDiff, forbiddenPathsModified } = input.changes;
    return (
      forbiddenPathsModified ||
      (changePolicy === "required" && !hasDiff) ||
      (changePolicy === "forbidden" && hasDiff)
    );
  }

  function isReviewDirty(input: VerdictInput): boolean {
    if (!input.review) return false;
    const { nonAutomatableCriteriaRemaining, warnings, materialLimitations } = input.review;
    return nonAutomatableCriteriaRemaining || warnings || materialLimitations;
  }

  it("VER-006 determinism: the same evidence always yields the same verdict (ADR-0003 rule 3)", () => {
    for (const input of richInputs()) {
      const snapshot = structuredClone(input);
      const first = computeVerdict(input);
      const second = computeVerdict(input);
      expect(second).toBe(first);
      // Purity: the function must not mutate its evidence.
      expect(input).toEqual(snapshot);
    }
  });

  it("VER-003 masking: a dirty mandatory check yields failed regardless of later rules", () => {
    for (const input of richInputs()) {
      if (isBlocked(input)) continue;
      if (!isCheckDirty(input)) continue;
      expect(
        computeVerdict(input),
        `dirty check must not be masked by changes/review state: ${JSON.stringify(input.changes)} ${JSON.stringify(input.review)}`,
      ).toBe("failed");
    }
  });

  it("VER-003 fires for every non-clean outcome kind, not just exit!=0", () => {
    for (const outcome of dirtyOutcomes) {
      const input: VerdictInput = {
        policy: { executionAllowed: true },
        mandatoryApprovalsSatisfied: true,
        mandatoryChecks: ["check-1"],
        checks: [{ id: "check-1", outcome }],
      };
      expect(computeVerdict(input), `outcome ${outcome.kind}`).toBe("failed");
    }
  });

  it("VER-003 fires when a declared mandatory check is absent from the evidence", () => {
    const input: VerdictInput = {
      policy: { executionAllowed: true },
      mandatoryApprovalsSatisfied: true,
      mandatoryChecks: ["check-1"],
      checks: [{ id: "check-other", outcome: cleanOutcome }],
    };
    expect(computeVerdict(input)).toBe("failed");
  });

  it("VER-004 masking: change-policy violations yield failed, never needs_review (ADR-0003 rule 2)", () => {
    for (const input of richInputs()) {
      if (isBlocked(input) || isCheckDirty(input)) continue;
      if (!isChangeDirty(input)) continue;
      expect(computeVerdict(input)).toBe("failed");
    }
  });

  it("VER-005 reaches needs_review only when every earlier gate is clean", () => {
    let sawNeedsReview = false;
    for (const input of richInputs()) {
      if (computeVerdict(input) === "needs_review") {
        sawNeedsReview = true;
        expect(isBlocked(input)).toBe(false);
        expect(isCheckDirty(input)).toBe(false);
        expect(isChangeDirty(input)).toBe(false);
        expect(isReviewDirty(input)).toBe(true);
      }
    }
    expect(sawNeedsReview, "the enumeration must actually produce needs_review").toBe(true);
  });

  it("VER-006 biconditional: all gates clean iff passed", () => {
    let sawPassed = false;
    for (const input of richInputs()) {
      const allClean =
        !isBlocked(input) && !isCheckDirty(input) && !isChangeDirty(input) && !isReviewDirty(input);
      if (allClean) {
        sawPassed = true;
        expect(computeVerdict(input)).toBe("passed");
      } else {
        expect(computeVerdict(input)).not.toBe("passed");
      }
    }
    expect(sawPassed, "the enumeration must actually produce passed").toBe(true);
  });
});
