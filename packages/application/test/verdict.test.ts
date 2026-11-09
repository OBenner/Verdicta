// Copyright 2026 The Verdicta Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import { computeVerdict, type VerdictInput } from "../src/verdict.js";

/**
 * VER-001: if policy forbids execution, or a mandatory approval is missing
 * or rejected — the verdict is "blocked".
 */
describe("computeVerdict — VER-001 blocked", () => {
  it("returns blocked when policy forbids execution", () => {
    const input: VerdictInput = {
      policy: { executionAllowed: false, reason: "network profile full requires approval" },
      mandatoryApprovalsSatisfied: true,
      mandatoryChecks: [],
    };

    expect(computeVerdict(input)).toBe("blocked");
  });

  it("returns blocked when a mandatory approval is missing or rejected", () => {
    const input: VerdictInput = {
      policy: { executionAllowed: true },
      mandatoryApprovalsSatisfied: false,
      mandatoryChecks: [],
    };

    expect(computeVerdict(input)).toBe("blocked");
  });
});

/**
 * VER-003: a mandatory check that did not run, errored, timed out, or
 * produced an unreadable mandatory report means "failed". The agent's own
 * claim is irrelevant — only independently executed checks count.
 */
describe("computeVerdict — VER-003 failed checks", () => {
  const base = {
    policy: { executionAllowed: true },
    mandatoryApprovalsSatisfied: true,
  } as const;

  it("returns failed when a mandatory check exited non-zero", () => {
    const input: VerdictInput = {
      ...base,
      mandatoryChecks: ["check-1"],
      checks: [{ id: "check-1", outcome: { kind: "exit", code: 1 } }],
    };

    expect(computeVerdict(input)).toBe("failed");
  });

  it("returns failed when a mandatory check was never run", () => {
    const input: VerdictInput = {
      ...base,
      mandatoryChecks: ["check-1"],
      checks: [{ id: "check-1", outcome: { kind: "not_run" } }],
    };

    expect(computeVerdict(input)).toBe("failed");
  });

  it("returns failed when a mandatory check timed out", () => {
    const input: VerdictInput = {
      ...base,
      mandatoryChecks: ["check-1"],
      checks: [{ id: "check-1", outcome: { kind: "timeout" } }],
    };

    expect(computeVerdict(input)).toBe("failed");
  });

  it("returns failed when a mandatory check's exit status is unknown", () => {
    const input: VerdictInput = {
      ...base,
      mandatoryChecks: ["check-1"],
      checks: [{ id: "check-1", outcome: { kind: "unknown" } }],
    };

    expect(computeVerdict(input)).toBe("failed");
  });

  it("returns failed when a mandatory machine report is unreadable", () => {
    const input: VerdictInput = {
      ...base,
      mandatoryChecks: ["check-1"],
      checks: [
        {
          id: "check-1",
          outcome: { kind: "exit", code: 0 },
          reportReadable: false,
        },
      ],
    };

    expect(computeVerdict(input)).toBe("failed");
  });
});

/**
 * VER-003 / specification section 15.3 ("no evidence — no passed"): the
 * engine receives the mandatory check list declared by the TaskContract.
 * A declared mandatory check that has no executed, readable result in the
 * evidence must yield "failed" — even when zero results were recorded at
 * all, and even when every recorded result exited 0.
 */
describe("computeVerdict — VER-003 mandatory checks absent from evidence", () => {
  const base = {
    policy: { executionAllowed: true },
    mandatoryApprovalsSatisfied: true,
  } as const;

  it("returns failed when a declared mandatory check has no recorded result at all", () => {
    const input: VerdictInput = {
      ...base,
      mandatoryChecks: ["lint"],
      checks: [],
    };

    expect(computeVerdict(input)).toBe("failed");
  });

  it("returns failed when only a subset of the declared mandatory checks ran", () => {
    const input: VerdictInput = {
      ...base,
      mandatoryChecks: ["lint", "test", "typecheck"],
      checks: [
        { id: "lint", outcome: { kind: "exit", code: 0 } },
        { id: "typecheck", outcome: { kind: "exit", code: 0 } },
      ],
    };

    expect(computeVerdict(input)).toBe("failed");
  });

  it("returns failed when the recorded results cover only non-mandatory checks", () => {
    const input: VerdictInput = {
      ...base,
      mandatoryChecks: ["test"],
      checks: [{ id: "optional-benchmark", outcome: { kind: "exit", code: 0 } }],
    };

    expect(computeVerdict(input)).toBe("failed");
  });

  it("returns passed when every declared mandatory check ran clean", () => {
    const input: VerdictInput = {
      ...base,
      mandatoryChecks: ["lint", "test"],
      checks: [
        { id: "lint", outcome: { kind: "exit", code: 0 } },
        { id: "test", outcome: { kind: "exit", code: 0 } },
        { id: "optional-benchmark", outcome: { kind: "exit", code: 1 } },
      ],
    };

    expect(computeVerdict(input)).toBe("passed");
  });
});

/**
 * VER-004: forbidden paths modified, a mandatory diff missing
 * (changePolicy=required), or any diff under changePolicy=forbidden
 * means "failed". An empty diff is acceptable only under
 * changePolicy=allowed or forbidden.
 */
describe("computeVerdict — VER-004 change policy", () => {
  const base = {
    policy: { executionAllowed: true },
    mandatoryApprovalsSatisfied: true,
    mandatoryChecks: ["check-1"],
    checks: [{ id: "check-1", outcome: { kind: "exit", code: 0 } }],
  } as const;

  it("returns failed when changePolicy=required and the diff is empty", () => {
    const input: VerdictInput = {
      ...base,
      changes: { changePolicy: "required", hasDiff: false, forbiddenPathsModified: false },
    };

    expect(computeVerdict(input)).toBe("failed");
  });

  it("returns failed when changePolicy=forbidden and a diff exists", () => {
    const input: VerdictInput = {
      ...base,
      changes: { changePolicy: "forbidden", hasDiff: true, forbiddenPathsModified: false },
    };

    expect(computeVerdict(input)).toBe("failed");
  });

  it("returns failed when forbidden paths were modified", () => {
    const input: VerdictInput = {
      ...base,
      changes: { changePolicy: "allowed", hasDiff: true, forbiddenPathsModified: true },
    };

    expect(computeVerdict(input)).toBe("failed");
  });

  it("does not fail an empty diff under changePolicy=allowed", () => {
    const input: VerdictInput = {
      ...base,
      changes: { changePolicy: "allowed", hasDiff: false, forbiddenPathsModified: false },
    };

    expect(computeVerdict(input)).not.toBe("failed");
  });
});

/**
 * VER-005: non-automatable acceptance criteria, warnings, or material
 * limitations remaining after all hard gates mean "needs_review".
 */
describe("computeVerdict — VER-005 needs_review", () => {
  const base = {
    policy: { executionAllowed: true },
    mandatoryApprovalsSatisfied: true,
    mandatoryChecks: ["check-1"],
    checks: [{ id: "check-1", outcome: { kind: "exit", code: 0 } }],
    changes: { changePolicy: "required", hasDiff: true, forbiddenPathsModified: false },
  } as const;

  it("returns needs_review when non-automatable acceptance criteria remain", () => {
    const input: VerdictInput = {
      ...base,
      review: {
        nonAutomatableCriteriaRemaining: true,
        warnings: false,
        materialLimitations: false,
      },
    };

    expect(computeVerdict(input)).toBe("needs_review");
  });

  it("returns needs_review when warnings were recorded", () => {
    const input: VerdictInput = {
      ...base,
      review: {
        nonAutomatableCriteriaRemaining: false,
        warnings: true,
        materialLimitations: false,
      },
    };

    expect(computeVerdict(input)).toBe("needs_review");
  });

  it("returns needs_review when material limitations exist", () => {
    const input: VerdictInput = {
      ...base,
      review: {
        nonAutomatableCriteriaRemaining: false,
        warnings: false,
        materialLimitations: true,
      },
    };

    expect(computeVerdict(input)).toBe("needs_review");
  });
});

/**
 * VER-006: passed only after every previous rule passes.
 * Rule precedence (specification section 11): rules apply in a fixed
 * order to the full result set — an earlier blocked/failed can never be
 * hidden by a later passing rule.
 */
describe("computeVerdict — VER-006 passed and rule precedence", () => {
  const clean: VerdictInput = {
    policy: { executionAllowed: true },
    mandatoryApprovalsSatisfied: true,
    mandatoryChecks: ["check-1"],
    checks: [{ id: "check-1", outcome: { kind: "exit", code: 0 } }],
    changes: { changePolicy: "required", hasDiff: true, forbiddenPathsModified: false },
    review: {
      nonAutomatableCriteriaRemaining: false,
      warnings: false,
      materialLimitations: false,
    },
  };

  it("returns passed only when all gates are clean", () => {
    expect(computeVerdict(clean)).toBe("passed");
  });

  it("blocked takes precedence over failed checks", () => {
    const input: VerdictInput = {
      ...clean,
      mandatoryApprovalsSatisfied: false,
      mandatoryChecks: ["check-1"],
      checks: [{ id: "check-1", outcome: { kind: "exit", code: 1 } }],
    };

    expect(computeVerdict(input)).toBe("blocked");
  });

  it("failed takes precedence over needs_review signals", () => {
    const input: VerdictInput = {
      ...clean,
      mandatoryChecks: ["check-1"],
      checks: [{ id: "check-1", outcome: { kind: "timeout" } }],
      review: {
        nonAutomatableCriteriaRemaining: true,
        warnings: true,
        materialLimitations: true,
      },
    };

    expect(computeVerdict(input)).toBe("failed");
  });
});
