// Copyright 2026 The Verdicta Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import {
  RUN_STATUSES,
  TASK_CONTRACT_SCHEMA_VERSION,
  VERDICTS,
  type RunStatus,
  type TaskContract,
  type Verdict,
} from "../src/index.js";

describe("RunStatus vocabulary (STATE-001)", () => {
  it("contains exactly the ten specified technical statuses", () => {
    expect([...RUN_STATUSES].sort()).toEqual(
      [
        "awaiting_approval",
        "cancelled",
        "cancelling",
        "completed",
        "failed",
        "preparing",
        "queued",
        "repairing",
        "running",
        "verifying",
      ].sort(),
    );
  });

  it("keeps the technical axis free of verdict values", () => {
    const verdictSet: ReadonlySet<string> = new Set(VERDICTS);
    for (const status of RUN_STATUSES) {
      // "failed" exists on both axes by design (STATE-001): a Run failure is
      // infrastructure, a Verdict failure is about the code. Everything else
      // must stay disjoint.
      if (status === "failed") continue;
      expect(verdictSet.has(status)).toBe(false);
    }
  });
});

describe("Verdict vocabulary (section 7.6)", () => {
  it("contains exactly the four specified values", () => {
    expect([...VERDICTS].sort()).toEqual(["blocked", "failed", "needs_review", "passed"].sort());
  });

  it("type-checks a Verdict assignment", () => {
    const verdict: Verdict = "needs_review";
    const status: RunStatus = "completed";
    expect(verdict).toBe("needs_review");
    expect(status).toBe("completed");
  });
});

describe("TaskContract round-trip (EVID-001)", () => {
  const sample: TaskContract = {
    schemaVersion: TASK_CONTRACT_SCHEMA_VERSION,
    id: "contract-sample-001",
    contentHash: "",
    goal: "Fix the off-by-one error in the pagination helper",
    repository: { path: "/srv/fixtures/pagination", baseRevision: "a".repeat(40) },
    acceptanceCriteria: ["pnpm test passes", "no changes outside src/pagination"],
    verificationCommands: [{ command: ["pnpm", "test"], timeoutMs: 120_000, mandatory: true }],
    allowedPaths: ["src/pagination/**"],
    changePolicy: "required",
    networkProfile: "allowlist",
    networkAllowlist: ["registry.npmjs.org"],
    limits: {
      wallTimeMs: 1_800_000,
      memoryMb: 4096,
      maxAttempts: 2,
      maxRepairRounds: 1,
    },
    delivery: {
      createLocalBranch: true,
      preserveWorktree: true,
      allowMerge: false,
      allowPush: false,
    },
    requiresApprovals: true,
  };

  it("serializes and deserializes without losing content", async () => {
    const { createHash } = await import("node:crypto");
    // The content hash covers the contract *content*; the hash field itself
    // is excluded, otherwise the value could never be embedded.
    const hashContent = (contract: TaskContract): string => {
      const { contentHash: _omitted, ...content } = contract;
      return createHash("sha256").update(JSON.stringify(content), "utf8").digest("hex");
    };

    const withHash: TaskContract = { ...sample, contentHash: hashContent(sample) };
    const parsed = JSON.parse(JSON.stringify(withHash)) as TaskContract;

    expect(parsed).toEqual(withHash);
    expect(hashContent(parsed)).toBe(withHash.contentHash);
  });
});
