// Copyright 2026 The Verdicta Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import type { Run } from "@verdicta/contracts";

import { applyTransition } from "../src/run-coordinator.js";

const NOW = "2026-11-09T12:00:00.000Z";
const OWNER = "coordinator-1";

function makeRun(overrides: Partial<Run> = {}): Run {
  return {
    id: "run-1",
    contractId: "contract-1",
    contractSchemaVersion: 1,
    status: "queued",
    runtime: { adapterId: "headless-cli", adapterVersion: "0.1.0", agentVersion: "1.0.0" },
    workspace: { worktreePath: "/w/run-1", branch: "verdicta/run-1" },
    lease: { owner: OWNER, expiresAt: "2026-11-09T12:05:00.000Z" },
    attempts: [],
    repairRounds: [],
    createdAt: "2026-11-09T11:59:00.000Z",
    updatedAt: "2026-11-09T11:59:00.000Z",
    ...overrides,
  };
}

describe("applyTransition — happy path", () => {
  it("applies an allowed transition when the caller holds a valid lease", () => {
    const run = makeRun();

    const result = applyTransition(run, "preparing", { owner: OWNER, now: NOW });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.run.status).toBe("preparing");
      expect(result.run.updatedAt).toBe(NOW);
      // untouched fields are preserved
      expect(result.run.id).toBe(run.id);
      expect(result.run.lease).toEqual(run.lease);
    }
  });

  it("does not mutate the input run", () => {
    const run = makeRun();

    applyTransition(run, "preparing", { owner: OWNER, now: NOW });

    expect(run.status).toBe("queued");
    expect(run.updatedAt).toBe("2026-11-09T11:59:00.000Z");
  });
});

/**
 * A successful transition yields a domain event alongside the new Run.
 * Storage persists the pair "status change + event" atomically
 * (specification section 10.1); the event is also what the reconciler and
 * the evidence bundle consume later.
 */
describe("applyTransition — transition events", () => {
  it("returns an event describing the transition", () => {
    const result = applyTransition(makeRun(), "preparing", { owner: OWNER, now: NOW });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.event).toEqual({
        runId: "run-1",
        fromStatus: "queued",
        toStatus: "preparing",
        at: NOW,
        owner: OWNER,
      });
    }
  });

  it("includes verdict and terminal reason in terminal events", () => {
    const run = makeRun({
      status: "cancelling",
      lease: { owner: OWNER, expiresAt: "2026-11-09T12:05:00.000Z" },
    });

    const result = applyTransition(run, "cancelled", {
      owner: OWNER,
      now: NOW,
      outcome: { terminalReason: "cancelled by operator" },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.event.toStatus).toBe("cancelled");
      expect(result.event.terminalReason).toBe("cancelled by operator");
    }
  });

  it("produces no event for a rejected transition", () => {
    const result = applyTransition(makeRun(), "running", { owner: OWNER, now: NOW });

    expect(result.ok).toBe(false);
    expect("event" in result).toBe(false);
  });
});

describe("applyTransition — invalid transitions are rejected", () => {
  it("rejects a transition the state machine forbids (queued → running)", () => {
    const result = applyTransition(makeRun(), "running", { owner: OWNER, now: NOW });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("invalid_transition");
    }
  });

  it("rejects any transition from a terminal status (completed)", () => {
    const run = makeRun({ status: "completed", verdict: "passed" });

    const result = applyTransition(run, "running", { owner: OWNER, now: NOW });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("invalid_transition");
    }
  });
});

/**
 * STATE-003: transitions are guarded by a lease with an owner and an
 * expiry. Without a valid lease no status change may happen.
 */
describe("applyTransition — lease guards (STATE-003)", () => {
  it("rejects the transition when the run has no lease", () => {
    const run = makeRun({ lease: undefined });

    const result = applyTransition(run, "preparing", { owner: OWNER, now: NOW });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("lease_missing");
    }
  });

  it("rejects the transition when the lease has expired", () => {
    const run = makeRun({
      lease: { owner: OWNER, expiresAt: "2026-11-09T11:55:00.000Z" }, // before NOW
    });

    const result = applyTransition(run, "preparing", { owner: OWNER, now: NOW });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("lease_expired");
    }
  });

  /**
   * STATE-004: a stale lease must never complete (or otherwise move) a run
   * that now belongs to another owner.
   */
  it("rejects the transition when the caller is not the lease owner", () => {
    const run = makeRun({
      status: "verifying",
      lease: { owner: "coordinator-2", expiresAt: "2026-11-09T12:05:00.000Z" },
    });

    const result = applyTransition(run, "completed", { owner: OWNER, now: NOW });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("lease_owned_by_other");
    }
  });
});

/**
 * STATE-001: "completed" means the pipeline reached a decision and MUST
 * carry a Verdict — including "failed" or "blocked".
 */
describe("applyTransition — completed requires a verdict (STATE-001)", () => {
  const verifyingRun = () =>
    makeRun({
      status: "verifying",
      lease: { owner: OWNER, expiresAt: "2026-11-09T12:05:00.000Z" },
    });

  it("rejects completed without a verdict", () => {
    const result = applyTransition(verifyingRun(), "completed", { owner: OWNER, now: NOW });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("verdict_required");
    }
  });

  it("accepts completed with a verdict and records it", () => {
    const result = applyTransition(verifyingRun(), "completed", {
      owner: OWNER,
      now: NOW,
      outcome: { verdict: "failed", terminalReason: "mandatory test suite failed" },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.run.status).toBe("completed");
      expect(result.run.verdict).toBe("failed");
      expect(result.run.terminalReason).toBe("mandatory test suite failed");
    }
  });
});

/**
 * Every terminal transition (completed, cancelled, failed) must record why
 * the run ended — a terminal status without a reason is unexplainable to
 * the operator and to the reconciler.
 */
describe("applyTransition — terminal transitions require a reason", () => {
  const activeRun = () =>
    makeRun({
      status: "running",
      lease: { owner: OWNER, expiresAt: "2026-11-09T12:05:00.000Z" },
    });

  it("rejects cancelled without a terminal reason", () => {
    const result = applyTransition(activeRun(), "cancelling", { owner: OWNER, now: NOW });
    expect(result.ok).toBe(true);

    const cancelling = makeRun({
      status: "cancelling",
      lease: { owner: OWNER, expiresAt: "2026-11-09T12:05:00.000Z" },
    });
    const finished = applyTransition(cancelling, "cancelled", { owner: OWNER, now: NOW });

    expect(finished.ok).toBe(false);
    if (!finished.ok) {
      expect(finished.error.code).toBe("terminal_reason_required");
    }
  });

  it("rejects failed without a terminal reason", () => {
    const result = applyTransition(activeRun(), "failed", { owner: OWNER, now: NOW });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("terminal_reason_required");
    }
  });

  it("rejects an empty terminal reason", () => {
    const result = applyTransition(activeRun(), "failed", {
      owner: OWNER,
      now: NOW,
      outcome: { terminalReason: "   " },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("terminal_reason_required");
    }
  });

  it("accepts a terminal transition with a reason and records it", () => {
    const result = applyTransition(activeRun(), "failed", {
      owner: OWNER,
      now: NOW,
      outcome: { terminalReason: "docker daemon unavailable" },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.run.status).toBe("failed");
      expect(result.run.terminalReason).toBe("docker daemon unavailable");
    }
  });
});
