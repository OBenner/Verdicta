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
    saveRun(db, makeRun());

    const newRun = makeRun({ status: "preparing", updatedAt: NOW });
    persistTransition(db, newRun, makeEvent());

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
    saveRun(db, makeRun());

    // Event references a different run id: the FK violation must abort the
    // whole transaction, leaving the stored run untouched.
    const newRun = makeRun({ status: "preparing", updatedAt: NOW });
    const badEvent = makeEvent({ runId: "missing-run" });

    expect(() => persistTransition(db, newRun, badEvent)).toThrow();

    expect(getRun(db, "run-1")?.status).toBe("queued");
    expect(listTransitionEvents(db, "run-1")).toHaveLength(0);
    db.close();
  });
});
