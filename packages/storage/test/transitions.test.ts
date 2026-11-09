// Copyright 2026 The Verdicta Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import type { Run } from "@verdicta/contracts";
import type { TransitionEvent } from "@verdicta/application";

import { openDatabase } from "../src/database.js";
import { getRun, saveRun } from "../src/runs.js";
import { listTransitionEvents, persistTransition } from "../src/transitions.js";

const NOW = "2026-11-09T12:00:00.000Z";

function makeRun(overrides: Partial<Run> = {}): Run {
  return {
    id: "run-1",
    contractId: "contract-1",
    contractSchemaVersion: 1,
    status: "queued",
    runtime: { adapterId: "headless-cli", adapterVersion: "0.1.0", agentVersion: "1.0.0" },
    workspace: { worktreePath: "/w/run-1", branch: "verdicta/run-1" },
    attempts: [],
    repairRounds: [],
    createdAt: "2026-11-09T11:59:00.000Z",
    updatedAt: "2026-11-09T11:59:00.000Z",
    ...overrides,
  };
}

function makeEvent(overrides: Partial<TransitionEvent> = {}): TransitionEvent {
  return {
    runId: "run-1",
    fromStatus: "queued",
    toStatus: "preparing",
    at: NOW,
    owner: "coordinator-1",
    ...overrides,
  };
}

/**
 * Specification section 10.1: the status change and its associated event
 * are written atomically.
 */
describe("persistTransition — atomic status + event write", () => {
  it("persists the new run state and the event together", () => {
    const db = openDatabase(":memory:");
    saveRun(db, makeRun({ lease: VALID_LEASE }));

    const newRun = makeRun({ status: "preparing", updatedAt: NOW, lease: VALID_LEASE });
    persistTransition(db, newRun, makeEvent(), CTX);

    expect(getRun(db, "run-1")?.status).toBe("preparing");
    const events = listTransitionEvents(db, "run-1");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      fromStatus: "queued",
      toStatus: "preparing",
      at: NOW,
      owner: "coordinator-1",
    });
    db.close();
  });

  it("rolls back the run update when the event write fails", () => {
    const db = openDatabase(":memory:");
    saveRun(db, makeRun({ lease: VALID_LEASE }));

    // Event references a different run id: the FK violation must abort the
    // whole transaction, leaving the stored run untouched.
    const newRun = makeRun({ status: "preparing", updatedAt: NOW, lease: VALID_LEASE });
    const badEvent = makeEvent({ runId: "missing-run" });

    expect(() => persistTransition(db, newRun, badEvent, CTX)).toThrow();

    expect(getRun(db, "run-1")?.status).toBe("queued");
    expect(listTransitionEvents(db, "run-1")).toHaveLength(0);
    db.close();
  });
});

const VALID_LEASE = { owner: "coordinator-1", expiresAt: "2026-11-09T13:00:00.000Z" } as const;
const CTX = { owner: "coordinator-1", now: NOW } as const;

function catchTransitionError(fn: () => void): { code?: string; message: string } {
  try {
    fn();
  } catch (error) {
    return error as { code?: string; message: string };
  }
  throw new Error("Expected persistTransition to throw, but it succeeded");
}

/**
 * STATE-003/STATE-004, ADR-0006 rule 1: storage re-verifies the lease
 * against the stored run inside the same transaction as the write. A stale
 * or foreign lease must abort the whole transaction — even when the
 * in-memory Run was valid when the caller read it (TOCTOU).
 */
describe("persistTransition — lease-checked write (STATE-003/004)", () => {
  it("rejects the write when the stored lease has expired", () => {
    const db = openDatabase(":memory:");
    saveRun(
      db,
      makeRun({ lease: { owner: "coordinator-1", expiresAt: "2026-11-09T11:59:59.000Z" } }),
    );

    const newRun = makeRun({ status: "preparing", updatedAt: NOW, lease: VALID_LEASE });
    const error = catchTransitionError(() => persistTransition(db, newRun, makeEvent(), CTX));

    expect(error.code).toBe("lease_expired");
    expect(getRun(db, "run-1")?.status).toBe("queued");
    expect(listTransitionEvents(db, "run-1")).toHaveLength(0);
    db.close();
  });

  it("rejects the write when the stored lease changed owner after the caller read it", () => {
    const db = openDatabase(":memory:");
    // TOCTOU: the caller holds a valid-looking in-memory run, but another
    // coordinator took over the lease before the write.
    saveRun(
      db,
      makeRun({ lease: { owner: "coordinator-2", expiresAt: "2026-11-09T13:00:00.000Z" } }),
    );

    const newRun = makeRun({ status: "preparing", updatedAt: NOW, lease: VALID_LEASE });
    const error = catchTransitionError(() => persistTransition(db, newRun, makeEvent(), CTX));

    expect(error.code).toBe("lease_owned_by_other");
    expect(getRun(db, "run-1")?.status).toBe("queued");
    expect(listTransitionEvents(db, "run-1")).toHaveLength(0);
    db.close();
  });

  it("rejects the write when the stored run has no lease", () => {
    const db = openDatabase(":memory:");
    saveRun(db, makeRun());

    const newRun = makeRun({ status: "preparing", updatedAt: NOW, lease: VALID_LEASE });
    const error = catchTransitionError(() => persistTransition(db, newRun, makeEvent(), CTX));

    expect(error.code).toBe("lease_missing");
    expect(getRun(db, "run-1")?.status).toBe("queued");
    expect(listTransitionEvents(db, "run-1")).toHaveLength(0);
    db.close();
  });

  it("persists status and event when the stored lease is valid for the caller", () => {
    const db = openDatabase(":memory:");
    saveRun(db, makeRun({ lease: VALID_LEASE }));

    const newRun = makeRun({ status: "preparing", updatedAt: NOW, lease: VALID_LEASE });
    persistTransition(db, newRun, makeEvent(), CTX);

    expect(getRun(db, "run-1")?.status).toBe("preparing");
    expect(listTransitionEvents(db, "run-1")).toHaveLength(1);
    db.close();
  });
});
