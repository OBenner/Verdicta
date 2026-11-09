// Copyright 2026 The Verdicta Authors
// SPDX-License-Identifier: Apache-2.0

import type { Run } from "@verdicta/contracts";
import type { TransitionContext, TransitionEvent } from "@verdicta/application";

import type { VerdictaDatabase } from "./database.js";
import { getRun, saveRun } from "./runs.js";

export type LeaseCheckErrorCode =
  "run_not_found" | "lease_missing" | "lease_expired" | "lease_owned_by_other";

/**
 * Thrown when the lease re-verification inside the write transaction fails
 * (STATE-003/STATE-004, ADR-0006 rule 1). The whole transaction is rolled
 * back — no partial writes.
 */
export class LeaseCheckError extends Error {
  readonly code: LeaseCheckErrorCode;

  constructor(code: LeaseCheckErrorCode, message: string) {
    super(message);
    this.name = "LeaseCheckError";
    this.code = code;
  }
}

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
 *
 * ADR-0006 rule 1: this is the only transition entry point storage
 * exposes. The lease owner token and expiry are re-verified against the
 * *stored* run inside the same transaction as the write (STATE-003,
 * STATE-004) — closing the TOCTOU window between the caller's read and
 * the write. A stale or foreign lease aborts the whole transaction.
 */
export function persistTransition(
  db: VerdictaDatabase,
  run: Run,
  event: TransitionEvent,
  ctx: TransitionContext,
): void {
  const raw = db.raw();
  raw.exec("BEGIN");
  try {
    const stored = getRun(db, run.id);
    if (stored === undefined) {
      throw new LeaseCheckError("run_not_found", `Run ${run.id} does not exist`);
    }
    if (stored.lease === undefined) {
      throw new LeaseCheckError("lease_missing", `Run ${run.id} has no lease`);
    }
    // ISO-8601 UTC strings compare lexicographically.
    if (stored.lease.expiresAt <= ctx.now) {
      throw new LeaseCheckError(
        "lease_expired",
        `Lease of run ${run.id} expired at ${stored.lease.expiresAt}`,
      );
    }
    if (stored.lease.owner !== ctx.owner) {
      throw new LeaseCheckError(
        "lease_owned_by_other",
        `Lease of run ${run.id} is owned by ${stored.lease.owner}, not ${ctx.owner}`,
      );
    }
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
