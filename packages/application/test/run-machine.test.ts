// Copyright 2026 The Verdicta Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { RUN_STATUSES } from "@verdicta/contracts";

import { canTransition } from "../src/run-machine.js";

/**
 * STATE-001: the Run state machine follows the specification's lifecycle.
 * Allowed transitions (specification section 8.1):
 *
 *   queued → preparing → running → verifying → completed
 *   running → awaiting_approval → running
 *   verifying → repairing → running
 *   active states → cancelling → cancelled
 *   active states → failed
 */
describe("canTransition — allowed transitions (STATE-001)", () => {
  it.each([
    ["queued", "preparing"],
    ["preparing", "running"],
    ["running", "verifying"],
    ["verifying", "completed"],
    ["running", "awaiting_approval"],
    ["awaiting_approval", "running"],
    ["verifying", "repairing"],
    ["repairing", "running"],
  ] as const)("allows %s → %s", (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  it.each([
    "queued",
    "preparing",
    "running",
    "awaiting_approval",
    "verifying",
    "repairing",
  ] as const)("allows %s → cancelling and cancelling → cancelled", (from) => {
    expect(canTransition(from, "cancelling")).toBe(true);
    expect(canTransition("cancelling", "cancelled")).toBe(true);
  });

  it.each([
    "queued",
    "preparing",
    "running",
    "awaiting_approval",
    "verifying",
    "repairing",
  ] as const)("allows %s → failed (infrastructure failure)", (from) => {
    expect(canTransition(from, "failed")).toBe(true);
  });
});

describe("canTransition — forbidden transitions (STATE-001)", () => {
  it.each(["completed", "cancelled", "failed"] as const)(
    "terminal status %s has no outgoing transitions",
    (terminal) => {
      for (const target of RUN_STATUSES) {
        expect(canTransition(terminal, target)).toBe(false);
      }
    },
  );

  it("rejects self-transitions for every status", () => {
    for (const status of RUN_STATUSES) {
      expect(canTransition(status, status)).toBe(false);
    }
  });

  it.each([
    ["queued", "running"], // must pass through preparing
    ["queued", "verifying"],
    ["preparing", "verifying"],
    ["verifying", "running"], // only repairing returns to running
    ["awaiting_approval", "verifying"], // approval resolution returns to running
    ["cancelling", "running"], // cancellation cannot be undone
    ["repairing", "completed"], // repair must re-verify
    ["repairing", "verifying"],
  ] as const)("rejects %s → %s", (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });
});
