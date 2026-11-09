// Copyright 2026 The Verdicta Authors
// SPDX-License-Identifier: Apache-2.0

import type { Run } from "@verdicta/contracts";
import type { TransitionEvent } from "@verdicta/application";

import type { VerdictaDatabase } from "./database.js";
import { saveRun } from "./runs.js";

interface EventRow {
  readonly run_id: string;
  readonly from_status: string;
  readonly to_status: string;
  readonly at: string;
  readonly owner: string;
  readonly verdict: string | null;
  readonly terminal_reason: string | null;
}

/**
 * Specification section 10.1: the status change and its associated event
 * are written atomically — one transaction, no "update now, event later".
 */
export function persistTransition(db: VerdictaDatabase, run: Run, event: TransitionEvent): void {
  const raw = db.raw();
  raw.exec("BEGIN");
  try {
    saveRun(db, run);
    raw
      .prepare(
        `INSERT INTO transition_events
           (run_id, from_status, to_status, at, owner, verdict, terminal_reason)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        event.runId,
        event.fromStatus,
        event.toStatus,
        event.at,
        event.owner,
        event.verdict ?? null,
        event.terminalReason ?? null,
      );
    raw.exec("COMMIT");
  } catch (error) {
    raw.exec("ROLLBACK");
    throw error;
  }
}

export function listTransitionEvents(
  db: VerdictaDatabase,
  runId: string,
): readonly TransitionEvent[] {
  const rows = db
    .raw()
    .prepare(
      `SELECT run_id, from_status, to_status, at, owner, verdict, terminal_reason
       FROM transition_events WHERE run_id = ? ORDER BY id`,
    )
    .all(runId) as unknown as EventRow[];

  return rows.map((row) => ({
    runId: row.run_id,
    fromStatus: row.from_status as TransitionEvent["fromStatus"],
    toStatus: row.to_status as TransitionEvent["toStatus"],
    at: row.at,
    owner: row.owner,
    ...(row.verdict !== null ? { verdict: row.verdict as TransitionEvent["verdict"] } : {}),
    ...(row.terminal_reason !== null ? { terminalReason: row.terminal_reason } : {}),
  }));
}
