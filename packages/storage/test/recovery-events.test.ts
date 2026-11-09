// Copyright 2026 The Verdicta Authors
// SPDX-License-Identifier: Apache-2.0

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import type { Run } from "@verdicta/contracts";

import { openDatabase } from "../src/database.js";
import { listRecoveryEvents, recordRecoveryEvent } from "../src/recovery-events.js";
import { saveRun } from "../src/runs.js";

function makeRun(overrides: Partial<Run> = {}): Run {
  return {
    id: "run-1",
    contractId: "contract-1",
    contractSchemaVersion: 1,
    status: "running",
    runtime: { adapterId: "headless-cli", adapterVersion: "0.1.0", agentVersion: "1.0.0" },
    workspace: { worktreePath: "/w/run-1", branch: "verdicta/run-1" },
    attempts: [],
    repairRounds: [],
    createdAt: "2026-11-09T11:00:00.000Z",
    updatedAt: "2026-11-09T11:00:00.000Z",
    ...overrides,
  };
}

describe("recovery events — schema v2 migration", () => {
  it("creates the recovery_events table", () => {
    const db = openDatabase(":memory:");

    const tables = db
      .raw()
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as { name: string }[];

    expect(tables.map((t) => t.name)).toContain("recovery_events");
    db.close();
  });

  it("migrates a v1 database without losing data", () => {
    const dir = mkdtempSync(join(tmpdir(), "verdicta-migration-"));
    const file = join(dir, "v1.db");

    // Build a v2 database, then roll it back to a simulated v1 state.
    const setup = openDatabase(file);
    setup.raw().exec("DROP TABLE recovery_events");
    setup.raw().exec("DELETE FROM schema_migrations WHERE version = 2");
    saveRun(setup, makeRun());
    setup.close();

    const migrated = openDatabase(file);
    const tables = migrated
      .raw()
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as { name: string }[];
    const run = migrated.raw().prepare("SELECT id FROM runs WHERE id = 'run-1'").get() as
      { id: string } | undefined;
    const version = migrated
      .raw()
      .prepare("SELECT MAX(version) AS v FROM schema_migrations")
      .get() as { v: number };
    migrated.close();

    expect(tables.map((t) => t.name)).toContain("recovery_events");
    expect(run?.id).toBe("run-1");
    expect(version.v).toBe(2);
  });
});

describe("recordRecoveryEvent / listRecoveryEvents (STATE-007.6)", () => {
  it("persists a recovery event linked to its run", () => {
    const db = openDatabase(":memory:");
    saveRun(db, makeRun());

    recordRecoveryEvent(db, {
      runId: "run-1",
      kind: "mark_needs_decision",
      reason: "lease expired at 2026-11-09T11:55:00Z; attempt fate unknown",
      recordedAt: "2026-11-09T12:00:00.000Z",
    });

    const events = listRecoveryEvents(db, "run-1");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      runId: "run-1",
      kind: "mark_needs_decision",
      recordedAt: "2026-11-09T12:00:00.000Z",
    });
    db.close();
  });

  it("keeps events of different runs separate", () => {
    const db = openDatabase(":memory:");
    saveRun(db, makeRun());
    saveRun(db, makeRun({ id: "run-2" }));

    recordRecoveryEvent(db, {
      runId: "run-1",
      kind: "safe_to_resume",
      reason: "no attempt started",
      recordedAt: "2026-11-09T12:00:00.000Z",
    });

    expect(listRecoveryEvents(db, "run-1")).toHaveLength(1);
    expect(listRecoveryEvents(db, "run-2")).toHaveLength(0);
    db.close();
  });
});
