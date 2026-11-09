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
                    checks: [{ mandatory: true, outcome }],
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
      for (const check of input.checks ?? []) {
        if (check.mandatory) {
          expect(check.outcome).toEqual({ kind: "exit", code: 0 });
        }
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
