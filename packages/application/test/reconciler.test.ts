// Copyright 2026 The Verdicta Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import type { Run } from "@verdicta/contracts";

import { reconcileAll, reconcileRun, type ObservedState } from "../src/reconciler.js";

const NOW = "2026-11-09T12:00:00.000Z";

const NOTHING_OBSERVED: ObservedState = {
  containerIds: [],
  worktreePaths: [],
  sessions: [],
};

/** Reality fully consistent with makeRun's default workspace. */
const CONSISTENT_OBSERVED: ObservedState = {
  containerIds: [],
  worktreePaths: ["/w/run-1"],
  sessions: [],
};

function makeRun(overrides: Partial<Run> = {}): Run {
  return {
    id: "run-1",
    contractId: "contract-1",
    contractSchemaVersion: 1,
    status: "running",
    runtime: { adapterId: "headless-cli", adapterVersion: "0.1.0", agentVersion: "1.0.0" },
    workspace: { worktreePath: "/w/run-1", branch: "verdicta/run-1" },
    lease: { owner: "coordinator-1", expiresAt: "2026-11-09T12:05:00.000Z" },
    attempts: [],
    repairRounds: [],
    createdAt: "2026-11-09T11:00:00.000Z",
    updatedAt: "2026-11-09T11:00:00.000Z",
    ...overrides,
  };
}

/**
 * STATE-007: on service start the reconciler classifies every non-terminal
 * run. Runs that are already terminal, or still held by a live lease,
 * require no recovery action.
 */
describe("reconcileRun — no action needed", () => {
  it.each(["completed", "cancelled", "failed"] as const)(
    "returns no_action for terminal status %s",
    (status) => {
      const run = makeRun({ status, verdict: "passed", terminalReason: "done" });

      const decision = reconcileRun(run, NOTHING_OBSERVED, NOW);

      expect(decision.kind).toBe("no_action");
      expect(decision.runId).toBe("run-1");
    },
  );

  it("returns no_action while the lease is still valid", () => {
    const run = makeRun(); // lease expires at 12:05, NOW is 12:00

    const decision = reconcileRun(run, CONSISTENT_OBSERVED, NOW);

    expect(decision.kind).toBe("no_action");
  });
});

/**
 * STATE-007 (1, 4): a lease whose owner expired means the previous
 * coordinator may have died mid-flight. The fate of the attempt is
 * unknown — mark it as requiring a human decision. Never resume silently.
 */
describe("reconcileRun — expired lease", () => {
  it("marks an active run with an expired lease as needing a decision", () => {
    const run = makeRun({
      lease: { owner: "coordinator-1", expiresAt: "2026-11-09T11:55:00.000Z" }, // before NOW
    });

    const decision = reconcileRun(run, NOTHING_OBSERVED, NOW);

    expect(decision.kind).toBe("mark_needs_decision");
    expect(decision.reason).toContain("lease");
  });

  it("marks an active run without any lease as needing a decision", () => {
    const run = makeRun({ lease: undefined });

    const decision = reconcileRun(run, NOTHING_OBSERVED, NOW);

    expect(decision.kind).toBe("mark_needs_decision");
  });
});

/**
 * STATE-007 (2, 3): records are cross-checked against real containers,
 * sessions, and worktrees. A duplicate attempt must never be started
 * while the previous attempt's fate is unknown.
 */
describe("reconcileRun — cross-check with observed reality", () => {
  const expiredLease = { owner: "coordinator-1", expiresAt: "2026-11-09T11:55:00.000Z" };

  it("reports when the recorded container is no longer observed", () => {
    const run = makeRun({
      lease: expiredLease,
      workspace: {
        worktreePath: "/w/run-1",
        branch: "verdicta/run-1",
        containerId: "container-abc",
      },
    });

    const decision = reconcileRun(run, NOTHING_OBSERVED, NOW);

    expect(decision.kind).toBe("mark_needs_decision");
    expect(decision.reason).toContain("container-abc");
    expect(decision.reason).toContain("not observed");
  });

  it("reports when the recorded container is still running (duplicate start forbidden)", () => {
    const run = makeRun({
      lease: expiredLease,
      workspace: {
        worktreePath: "/w/run-1",
        branch: "verdicta/run-1",
        containerId: "container-abc",
      },
    });
    const observed: ObservedState = {
      containerIds: ["container-abc"],
      worktreePaths: ["/w/run-1"],
      sessions: [],
    };

    const decision = reconcileRun(run, observed, NOW);

    expect(decision.kind).toBe("mark_needs_decision");
    expect(decision.reason).toContain("still running");
  });
});

/**
 * STATE-007 (2): records are cross-checked against real worktrees and
 * sessions too, not only containers — regardless of lease state. A record
 * claiming an active attempt whose worktree or session is gone means the
 * attempt's fate is unknown.
 */
describe("reconcileRun — worktree and session cross-checks", () => {
  const validLease = { owner: "coordinator-1", expiresAt: "2026-11-09T12:05:00.000Z" };

  it("marks an active run whose recorded worktree is gone, even with a valid lease", () => {
    const run = makeRun({ lease: validLease });

    const decision = reconcileRun(run, NOTHING_OBSERVED, NOW);

    expect(decision.kind).toBe("mark_needs_decision");
    expect(decision.reason).toContain("/w/run-1");
    expect(decision.reason).toContain("not observed");
  });

  it("marks an active run whose recorded session is not observed", () => {
    const run = makeRun({
      lease: validLease,
      workspace: {
        worktreePath: "/w/run-1",
        branch: "verdicta/run-1",
        agentSessionId: "sess-1",
      },
    });
    const observed: ObservedState = {
      containerIds: [],
      worktreePaths: ["/w/run-1"],
      sessions: [],
    };

    const decision = reconcileRun(run, observed, NOW);

    expect(decision.kind).toBe("mark_needs_decision");
    expect(decision.reason).toContain("sess-1");
    expect(decision.reason).toContain("not observed");
  });

  it("marks a session pointing at a foreign worktree (fault-injection scenario 12)", () => {
    const run = makeRun({
      lease: validLease,
      workspace: {
        worktreePath: "/w/run-1",
        branch: "verdicta/run-1",
        agentSessionId: "sess-1",
      },
    });
    const observed: ObservedState = {
      containerIds: [],
      worktreePaths: ["/w/run-1"],
      sessions: [{ id: "sess-1", worktreePath: "/w/foreign" }],
    };

    const decision = reconcileRun(run, observed, NOW);

    expect(decision.kind).toBe("mark_needs_decision");
    expect(decision.reason).toContain("sess-1");
    expect(decision.reason).toContain("/w/foreign");
    expect(decision.reason).toContain("/w/run-1");
  });

  it("marks an active run whose recorded container is gone, even with a valid lease", () => {
    const run = makeRun({
      lease: validLease,
      workspace: {
        worktreePath: "/w/run-1",
        branch: "verdicta/run-1",
        containerId: "container-abc",
      },
    });
    const observed: ObservedState = {
      containerIds: [],
      worktreePaths: ["/w/run-1"],
      sessions: [],
    };

    const decision = reconcileRun(run, observed, NOW);

    expect(decision.kind).toBe("mark_needs_decision");
    expect(decision.reason).toContain("container-abc");
    expect(decision.reason).toContain("not observed");
  });

  it("returns no_action when lease and reality are fully consistent", () => {
    const run = makeRun({
      lease: validLease,
      workspace: {
        worktreePath: "/w/run-1",
        branch: "verdicta/run-1",
        containerId: "container-abc",
        agentSessionId: "sess-1",
      },
    });
    const observed: ObservedState = {
      containerIds: ["container-abc"],
      worktreePaths: ["/w/run-1"],
      sessions: [{ id: "sess-1", worktreePath: "/w/run-1" }],
    };

    const decision = reconcileRun(run, observed, NOW);

    expect(decision.kind).toBe("no_action");
  });
});

/**
 * Fault-injection scenario 8 (docs/development/testing-and-verification.md
 * section 4): the service died after creating the worktree but before
 * recording the container id. On restart the attempt's fate is unknown —
 * a duplicate start is forbidden until a human decides.
 */
describe("reconcileRun — death after worktree creation, before container-id write", () => {
  it("marks the run as needing a decision, never safe_to_resume", () => {
    const run = makeRun({
      status: "preparing",
      lease: { owner: "coordinator-1", expiresAt: "2026-11-09T11:55:00.000Z" },
      workspace: { worktreePath: "/w/run-1", branch: "verdicta/run-1" }, // no containerId
    });
    const observed: ObservedState = {
      containerIds: [],
      worktreePaths: ["/w/run-1"], // the worktree really exists
      sessions: [],
    };

    const decision = reconcileRun(run, observed, NOW);

    expect(decision.kind).toBe("mark_needs_decision");
    expect(decision.reason).toContain("lease expired");
    expect(decision.kind).not.toBe("safe_to_resume");
  });
});

/**
 * STATE-007 (5): only safe idempotent operations are resumed. A queued
 * run never started an attempt — dispatching it again is idempotent.
 */
describe("reconcileRun — safe resume", () => {
  it("marks a queued run as safe_to_resume even with an expired lease", () => {
    const run = makeRun({
      status: "queued",
      lease: { owner: "coordinator-1", expiresAt: "2026-11-09T11:55:00.000Z" },
    });

    const decision = reconcileRun(run, NOTHING_OBSERVED, NOW);

    expect(decision.kind).toBe("safe_to_resume");
    expect(decision.reason).toContain("no attempt started");
  });
});

/**
 * STATE-007 (6): discrepancies found during reconciliation are recorded as
 * recovery events. reconcileAll produces exactly the actionable decisions
 * for a set of runs — quiet runs produce nothing.
 */
describe("reconcileAll — actionable decisions only", () => {
  it("returns decisions only for runs that need them", () => {
    const terminal = makeRun({
      id: "run-terminal",
      status: "completed",
      verdict: "passed",
      terminalReason: "done",
    });
    const healthy = makeRun({ id: "run-healthy" }); // valid lease
    const expired = makeRun({
      id: "run-expired",
      lease: { owner: "coordinator-1", expiresAt: "2026-11-09T11:55:00.000Z" },
    });
    const queued = makeRun({ id: "run-queued", status: "queued", lease: undefined });

    const decisions = reconcileAll([terminal, healthy, expired, queued], CONSISTENT_OBSERVED, NOW);

    expect(decisions.map((d) => d.runId).sort()).toEqual(["run-expired", "run-queued"]);
    expect(decisions.find((d) => d.runId === "run-expired")?.kind).toBe("mark_needs_decision");
    expect(decisions.find((d) => d.runId === "run-queued")?.kind).toBe("safe_to_resume");
  });

  it("returns an empty list when everything is quiet", () => {
    const healthy = makeRun({ id: "run-healthy" });

    expect(reconcileAll([healthy], CONSISTENT_OBSERVED, NOW)).toEqual([]);
  });
});
