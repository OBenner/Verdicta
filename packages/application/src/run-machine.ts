// Copyright 2026 The Verdicta Authors
// SPDX-License-Identifier: Apache-2.0

import type { RunStatus } from "@verdicta/contracts";

/**
 * The Run state machine (STATE-001, specification section 8.1).
 *
 * Terminal statuses (completed, cancelled, failed) have no outgoing
 * transitions. Only the run coordinator may apply transitions, guarded by
 * a lease (STATE-003) — this module is the pure rule set, not the
 * transactional executor.
 */
const TRANSITIONS: Readonly<Record<RunStatus, readonly RunStatus[]>> = {
  queued: ["preparing", "cancelling", "failed"],
  preparing: ["running", "cancelling", "failed"],
  running: ["verifying", "awaiting_approval", "cancelling", "failed"],
  awaiting_approval: ["running", "cancelling", "failed"],
  verifying: ["completed", "repairing", "cancelling", "failed"],
  repairing: ["running", "cancelling", "failed"],
  cancelling: ["cancelled"],
  cancelled: [],
  completed: [],
  failed: [],
};

export function canTransition(from: RunStatus, to: RunStatus): boolean {
  return TRANSITIONS[from].includes(to);
}
