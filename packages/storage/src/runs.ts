// Copyright 2026 The Verdicta Authors
// SPDX-License-Identifier: Apache-2.0

import type { Run } from "@verdicta/contracts";

import type { VerdictaDatabase } from "./database.js";

interface RunRow {
  readonly payload: string;
}

export function saveRun(db: VerdictaDatabase, run: Run): void {
  db.raw()
    .prepare(
      `INSERT INTO runs (id, status, payload, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         status = excluded.status,
         payload = excluded.payload,
         updated_at = excluded.updated_at`,
    )
    .run(run.id, run.status, JSON.stringify(run), run.createdAt, run.updatedAt);
}

export function getRun(db: VerdictaDatabase, id: string): Run | undefined {
  const row = db.raw().prepare("SELECT payload FROM runs WHERE id = ?").get(id) as
    RunRow | undefined;
  if (row === undefined) return undefined;
  return JSON.parse(row.payload) as Run;
}
