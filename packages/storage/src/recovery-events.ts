// Copyright 2026 The Verdicta Authors
// SPDX-License-Identifier: Apache-2.0

import type { RecoveryDecisionKind } from "@verdicta/application";

import type { VerdictaDatabase } from "./database.js";

export interface RecoveryEvent {
  readonly runId: string;
  readonly kind: RecoveryDecisionKind;
  readonly reason: string;
  /** UTC ISO-8601, supplied by the caller — never read from the clock here. */
  readonly recordedAt: string;
}

interface RecoveryEventRow {
  readonly run_id: string;
  readonly kind: string;
  readonly reason: string;
  readonly recorded_at: string;
}

/** STATE-007 (6): every reconciliation discrepancy is recorded. */
export function recordRecoveryEvent(db: VerdictaDatabase, event: RecoveryEvent): void {
  db.raw()
    .prepare(
      `INSERT INTO recovery_events (run_id, kind, reason, recorded_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(event.runId, event.kind, event.reason, event.recordedAt);
}

export function listRecoveryEvents(db: VerdictaDatabase, runId: string): readonly RecoveryEvent[] {
  const rows = db
    .raw()
    .prepare(
      `SELECT run_id, kind, reason, recorded_at
       FROM recovery_events WHERE run_id = ? ORDER BY id`,
    )
    .all(runId) as unknown as RecoveryEventRow[];

  return rows.map((row) => ({
    runId: row.run_id,
    kind: row.kind as RecoveryDecisionKind,
    reason: row.reason,
    recordedAt: row.recorded_at,
  }));
}
