// Copyright 2026 The Verdicta Authors
// SPDX-License-Identifier: Apache-2.0

import type { Run, RunStatus, Verdict } from "@verdicta/contracts";

import { canTransition } from "./run-machine.js";

export interface TransitionOutcome {
  readonly verdict?: Verdict;
  readonly terminalReason?: string;
}

export interface TransitionContext {
  readonly owner: string;
  /** Current time, UTC ISO-8601. Passed explicitly — never read from the clock. */
  readonly now: string;
  readonly outcome?: TransitionOutcome;
}

export type TransitionErrorCode =
  | "invalid_transition"
  | "lease_missing"
  | "lease_expired"
  | "lease_owned_by_other"
  | "verdict_required";

export interface TransitionError {
  readonly code: TransitionErrorCode;
  readonly message: string;
}

export type TransitionResult =
  | { readonly ok: true; readonly run: Run }
  | { readonly ok: false; readonly error: TransitionError };

export function applyTransition(run: Run, to: RunStatus, ctx: TransitionContext): TransitionResult {
  if (!canTransition(run.status, to)) {
    return {
      ok: false,
      error: {
        code: "invalid_transition",
        message: `Transition ${run.status} → ${to} is not allowed`,
      },
    };
  }

  // STATE-003: a status change requires a valid, unexpired lease.
  if (run.lease === undefined) {
    return {
      ok: false,
      error: { code: "lease_missing", message: "Run has no lease" },
    };
  }
  // ISO-8601 UTC strings compare lexicographically.
  if (run.lease.expiresAt <= ctx.now) {
    return {
      ok: false,
      error: {
        code: "lease_expired",
        message: `Lease expired at ${run.lease.expiresAt}`,
      },
    };
  }
  // STATE-004: a stale lease must never move a run owned by someone else.
  if (run.lease.owner !== ctx.owner) {
    return {
      ok: false,
      error: {
        code: "lease_owned_by_other",
        message: `Lease is owned by ${run.lease.owner}, not ${ctx.owner}`,
      },
    };
  }

  // STATE-001: "completed" must carry a Verdict, including failed/blocked.
  if (to === "completed" && ctx.outcome?.verdict === undefined) {
    return {
      ok: false,
      error: {
        code: "verdict_required",
        message: "Transition to completed requires a verdict",
      },
    };
  }

  return {
    ok: true,
    run: {
      ...run,
      status: to,
      updatedAt: ctx.now,
      ...(ctx.outcome?.verdict !== undefined ? { verdict: ctx.outcome.verdict } : {}),
      ...(ctx.outcome?.terminalReason !== undefined
        ? { terminalReason: ctx.outcome.terminalReason }
        : {}),
    },
  };
}
