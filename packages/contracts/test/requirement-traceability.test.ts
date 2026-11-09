// Copyright 2026 The Verdicta Authors
// SPDX-License-Identifier: Apache-2.0

// Requirement traceability gate (architecture-governance.md, Layer 1):
// every requirement ID defined in the normative documents must be
// referenced by at least one test, or carry a recorded exception below.
// Adding an ID to the docs without a test fails CI.
//
// This file is excluded from the reference scan, so the exception keys
// below do not count as coverage.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

const NORMATIVE_DOCS = [
  "docs/development/architecture-and-invariants.md",
  "docs/development/security-and-secrets.md",
];

// Recorded exceptions, per architecture-governance.md Layer 1: a rule is
// "at risk" until it has a gate or a conscious, recorded exception. Each
// entry states why there is no test yet and what removes the exception.
const EXCEPTIONS: Record<string, string> = {
  "VER-000": "enforced by the boundaries.yml CI grep gate, not a test",
  "ARCH-001": "alias of VER-000; enforced by the boundaries.yml CI grep gate",
  "SEC-001": "Docker-only execution — test arrives with ADR-0002 (packages/sandbox)",
  "SEC-002": "doctor blocking error — test arrives with ADR-0002 (packages/sandbox)",
  "SEC-003": "external text is data — test arrives with the policy engine (packages/policy)",
  "SEC-004": "verifier runs outside agent control — test arrives with packages/verifier",
  "SEC-005": "worker restrictions — test arrives with ADR-0002 (packages/sandbox)",
  "SEC-006": "network profiles — test arrives with ADR-0002 (packages/sandbox)",
  "SEC-007": "secret handling — test arrives with ADR-0007 (SecretProvider)",
  "STATE-002": "definition-level status semantics — asserted when the reporting layer exists",
  "STATE-005": "transient-retry classification — test arrives with packages/runtime",
  "STATE-006": "per-attempt evidence — test arrives with ADR-0008 (EvidenceBundle lifecycle)",
  "STATE-008": "session resume — test arrives with ADR-0009 (agent adapters)",
  "EVID-002": "finalize-once bundle — storage contract test planned in ADR-0008",
  "EVID-003": "JSONL export-only — test arrives with the evidence export path",
  "VER-007": "LLM review findings — test arrives with packages/verifier",
};

// Definition pattern: **[ID]** or **[ID / ALIAS]** at rule headings.
const DEFINITION =
  /\*\*\[((?:VER|SEC|STATE|EVID|ARCH)-\d{3})(?:\s*\/\s*((?:VER|SEC|STATE|EVID|ARCH)-\d{3}))?\]\*\*/g;
const ID_BODY = /^(VER|SEC|STATE|EVID|ARCH)-\d{3}$/;

function collectDefinedIds(): { id: string; reserved: boolean }[] {
  const ids = new Map<string, boolean>();
  for (const doc of NORMATIVE_DOCS) {
    const lines = readFileSync(join(REPO_ROOT, doc), "utf8").split("\n");
    for (const line of lines) {
      for (const match of line.matchAll(DEFINITION)) {
        for (const group of [match[1], match[2]]) {
          if (group && ID_BODY.test(group) && !ids.has(group)) {
            ids.set(group, /\(reserved\)/i.test(line));
          }
        }
      }
    }
  }
  return [...ids.entries()].map(([id, reserved]) => ({ id, reserved }));
}

function collectTestFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectTestFiles(full));
    } else if (entry.name.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

function collectTestSources(): string[] {
  const files: string[] = [];
  for (const scope of ["packages", "apps"]) {
    for (const entry of readdirSync(join(REPO_ROOT, scope), {
      withFileTypes: true,
    })) {
      if (!entry.isDirectory()) continue;
      try {
        files.push(...collectTestFiles(join(REPO_ROOT, scope, entry.name, "test")));
      } catch {
        // Package without a test directory.
      }
    }
  }
  const self = fileURLToPath(import.meta.url);
  return files
    .filter((file) => file !== self)
    .map((file) => readFileSync(file, "utf8"));
}

function isReferenced(sources: string[], id: string): boolean {
  const needle = new RegExp(`\\b${id}\\b`);
  return sources.some((source) => needle.test(source));
}

describe("requirement traceability (architecture-governance.md Layer 1)", () => {
  it("every documented requirement ID is tested or has a recorded exception", () => {
    const sources = collectTestSources();
    const uncovered = collectDefinedIds()
      .filter(({ reserved }) => !reserved)
      .map(({ id }) => id)
      .filter((id) => !isReferenced(sources, id) && !(id in EXCEPTIONS));

    expect(
      uncovered,
      `requirement IDs without a test reference or a recorded exception: ${uncovered.join(", ")}`,
    ).toEqual([]);
  });

  it("every recorded exception refers to an existing documented ID", () => {
    const defined = new Set(collectDefinedIds().map(({ id }) => id));
    const stale = Object.keys(EXCEPTIONS).filter((id) => !defined.has(id));

    expect(
      stale,
      `exceptions for IDs not defined in the normative docs: ${stale.join(", ")}`,
    ).toEqual([]);
  });

  it("no recorded exception is already covered by a test (remove it instead)", () => {
    const sources = collectTestSources();
    const redundant = Object.keys(EXCEPTIONS).filter((id) =>
      isReferenced(sources, id),
    );

    expect(
      redundant,
      `exceptions whose ID is now covered by a test — delete the entry: ${redundant.join(", ")}`,
    ).toEqual([]);
  });
});
