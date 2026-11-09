// Copyright 2026 The Verdicta Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import type { Run } from "@verdicta/contracts";

import { openDatabase } from "../src/database.js";
import { getRun, saveRun } from "../src/runs.js";

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

describe("saveRun / getRun", () => {
  it("persists a run and reads it back with the payload intact", () => {
    const db = openDatabase(":memory:");
    const run = makeRun();

    saveRun(db, run);
    const loaded = getRun(db, "run-1");

    expect(loaded).toEqual(run);
    db.close();
  });

  it("returns undefined for an unknown run id", () => {
    const db = openDatabase(":memory:");

    expect(getRun(db, "missing")).toBeUndefined();
    db.close();
  });

  it("upserts: saving the same id updates status and updated_at", () => {
    const db = openDatabase(":memory:");
    saveRun(db, makeRun());

    const updated = makeRun({ status: "preparing", updatedAt: "2026-11-09T12:01:00.000Z" });
    saveRun(db, updated);

    const loaded = getRun(db, "run-1");
    expect(loaded?.status).toBe("preparing");
    expect(loaded?.updatedAt).toBe("2026-11-09T12:01:00.000Z");
    db.close();
  });
});
