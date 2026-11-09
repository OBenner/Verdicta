// Copyright 2026 The Verdicta Authors
// SPDX-License-Identifier: Apache-2.0

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { openDatabase } from "../src/database.js";

describe("openDatabase — schema migrations", () => {
  it("creates the schema_migrations table and records the current version", () => {
    const db = openDatabase(":memory:");

    const version = db.raw().prepare("SELECT MAX(version) AS v FROM schema_migrations").get() as {
      v: number;
    };

    expect(version.v).toBeGreaterThanOrEqual(1);
    db.close();
  });

  it("creates runs and transition_events tables", () => {
    const db = openDatabase(":memory:");

    const tables = db
      .raw()
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);

    expect(names).toContain("runs");
    expect(names).toContain("transition_events");
    db.close();
  });

  it("is idempotent: reopening the same file re-applies nothing and keeps data", () => {
    const dir = mkdtempSync(join(tmpdir(), "verdicta-storage-"));
    const file = join(dir, "test.db");

    const first = openDatabase(file);
    const appliedFirst = first
      .raw()
      .prepare("SELECT COUNT(*) AS c FROM schema_migrations")
      .get() as { c: number };
    first
      .raw()
      .exec(
        "INSERT INTO runs (id, status, payload, created_at, updated_at) VALUES ('r1', 'queued', '{}', '2026-11-09T00:00:00Z', '2026-11-09T00:00:00Z')",
      );
    first.close();

    const second = openDatabase(file);
    const appliedSecond = second
      .raw()
      .prepare("SELECT COUNT(*) AS c FROM schema_migrations")
      .get() as { c: number };
    const run = second.raw().prepare("SELECT id FROM runs WHERE id = 'r1'").get() as
      { id: string } | undefined;
    second.close();

    expect(appliedSecond.c).toBe(appliedFirst.c);
    expect(run?.id).toBe("r1");
  });
});
