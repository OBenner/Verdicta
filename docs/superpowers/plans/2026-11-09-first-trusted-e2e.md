# First Trusted End-to-End Run Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one complete local run in which a real external coding agent changes a fixture repository in an isolated worktree and Docker worker, Verdicta independently re-executes the mandatory checks, and the user receives a preserved branch, ChangeSet, EvidenceBundle, and deterministic Verdict through the CLI.

**Architecture:** Keep `contracts` pure and put all orchestration in `packages/application` behind ports. Infrastructure packages implement those ports; `packages/runtime` owns the vendor-neutral `AgentRuntime` port and `packages/adapters` owns vendor translation. `apps/server` contains a single composition-root module that wires implementations, while its HTTP handlers and the CLI remain thin adapters with no domain decisions.

**Tech Stack:** Node.js 24 LTS, TypeScript strict ESM, pnpm workspaces, Vitest, Node `node:sqlite`, Git CLI, Docker CLI, Node `node:http`, SHA-256 content-addressed files.

## Global Constraints

- Node version floor is `>=24 <25`; package manager is `pnpm@12.18.0`.
- TypeScript uses `strict: true`, ESM, and explicit `.js` extensions in relative imports.
- Add no external dependency in this stage. Use Node built-ins and the existing workspace packages.
- Every new source file starts with `// Copyright 2026 The Verdicta Authors` and `// SPDX-License-Identifier: Apache-2.0`.
- `Run.status` values, `Verdict` values, allowed transitions, and verdict rule order are unchanged.
- Agent and verification commands run in Docker. Host execution fallback is forbidden.
- Every attempt uses a distinct worktree, branch, and container identity.
- Workers use a non-root user, read-only root filesystem, `cap_drop=ALL`, no Docker socket, no broad home mount, explicit resource limits, and no inherited host environment.
- The core and local UI require no model API key. Adapter credentials are ephemeral and never enter domain objects, SQLite, logs, API responses, or evidence.
- `networkProfile=full` requires an explicit run-creation approval. No approval means no run.
- The agent summary is unverified data and never affects a transition or verdict.
- A missing, unreadable, timed-out, or unknown mandatory check never yields `passed`.
- The server binds only to `127.0.0.1` or `::1`; no remote-listen option is added.
- Automatic merge, push, PR publication, and protected-branch modification are forbidden.
- Each task updates documentation and requirement-traceability exceptions affected by its tests.
- Run `pnpm verify` before reporting any task complete. Commit steps below are for the future Developer, not executed while writing this plan.

---

## File Structure

| Path                                       | Responsibility                                                               |
| ------------------------------------------ | ---------------------------------------------------------------------------- |
| `packages/application/src/ports.ts`        | Vendor-neutral workspace, sandbox, verifier, evidence, and persistence ports |
| `packages/application/src/run-service.ts`  | Create, read, and execute runs through lease-guarded transitions             |
| `packages/runtime/src/agent-runtime.ts`    | Stable `AgentRuntime` port and capability types                              |
| `packages/git-workspace/src/workspace.ts`  | Real Git worktree, branch, revision, and diff lifecycle                      |
| `packages/sandbox/src/docker.ts`           | Docker preflight and restricted worker lifecycle                             |
| `packages/evidence/src/artifact-store.ts`  | SHA-256 artifact persistence and manifest verification                       |
| `packages/evidence/src/bundle.ts`          | Finalized bundle serialization and offline integrity checks                  |
| `packages/adapters/src/headless-cli.ts`    | First pinned CLI profile and structured-output translation                   |
| `packages/adapters/src/contract-suite.ts`  | Reusable adapter acceptance scenarios                                        |
| `packages/verifier/src/independent.ts`     | Mandatory command re-execution and evidence capture                          |
| `packages/verifier/src/changeset.ts`       | Real diff, changed-path, and forbidden-path collection                       |
| `packages/storage/src/contracts.ts`        | Immutable TaskContract persistence                                           |
| `packages/storage/src/artifacts.ts`        | Artifact and finalized-bundle indexes with write-after-finalize rejection    |
| `apps/server/src/http.ts`                  | Loopback HTTP transport over the application service                         |
| `apps/server/src/composition.ts`           | Sole infrastructure wiring point in an app                                   |
| `apps/cli/src/cli.ts`                      | CLI argument parsing, HTTP calls, and result rendering                       |
| `apps/server/test/trusted-run.e2e.test.ts` | Executable fixture acceptance matrix                                         |

## Task 1: Record the composition-root boundary

**Files:**

- Modify: `docs/adr/0004-single-application-service-thin-clients.md`
- Modify: `docs/adr/0005-loopback-http-sse-no-auth-mvp.md`
- Test: `apps/server/test/boundaries.test.ts`

**Interfaces:**

- Produces: `apps/server/src/composition.ts` is the only app module permitted to import infrastructure implementations. It exports `createComposedService(config: ServerConfig): Promise<ApplicationService>`.
- Consumes: the later `ApplicationService` interface from Task 7.

- [ ] **Step 1: Write the failing architecture test**

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("ADR-0004 app composition boundary", () => {
  it("allows infrastructure imports only in the server composition root", () => {
    const http = readFileSync(new URL("../src/http.ts", import.meta.url), "utf8");
    const cli = readFileSync(new URL("../../cli/src/cli.ts", import.meta.url), "utf8");
    const forbidden = /@verdicta\/(storage|sandbox|adapters|git-workspace|evidence|verifier)/;
    expect(http).not.toMatch(forbidden);
    expect(cli).not.toMatch(forbidden);
  });
});
```

- [ ] **Step 2: Run the test and confirm the missing modules make it fail**

Run: `pnpm --filter @verdicta/server test -- test/boundaries.test.ts`
Expected: FAIL because `apps/server/src/http.ts` and `apps/cli/src/cli.ts` do not exist.

- [ ] **Step 3: Record the precise boundary in ADR-0004**

Add this rule to the proposed ADR before implementation:

```markdown
7. `apps/server/src/composition.ts` is the sole app composition root. It may
   import infrastructure solely to construct the `ApplicationService`. It
   contains no route handling, state transition, verdict, policy, or evidence
   logic. Every other app module remains forbidden from importing storage,
   sandbox, adapters, git-workspace, evidence, or verifier implementations.
```

Add a corresponding note to ADR-0005 that HTTP composition does not relax the loopback-only rule. Do not mark either ADR accepted; acceptance follows verified implementation under architecture governance.

- [ ] **Step 4: Add transport-only skeletons and run the boundary test**

```ts
// apps/server/src/http.ts
import type { ApplicationService } from "@verdicta/application";

export interface HttpTransport {
  readonly service: ApplicationService;
}

// apps/cli/src/cli.ts
export interface CliTransport {
  readonly baseUrl: string;
}
```

Add the existing workspace dependency `@verdicta/application` to both app manifests. Run the boundary test again and expect PASS.

- [ ] **Step 5: Run all repository checks**

Run: `pnpm verify`
Expected: all existing format, lint, build, typecheck, and test gates pass.

- [ ] **Step 6: Commit**

```bash
git add docs/adr/0004-single-application-service-thin-clients.md docs/adr/0005-loopback-http-sse-no-auth-mvp.md apps/server apps/cli
git commit -m "docs: define server composition root boundary"
```

## Task 2: Define AgentRuntime and implement the Git workspace port

**Files:**

- Create: `packages/runtime/src/agent-runtime.ts`
- Modify: `packages/runtime/src/index.ts`
- Create: `packages/application/src/ports.ts`
- Modify: `packages/application/src/index.ts`
- Create: `packages/git-workspace/src/workspace.ts`
- Modify: `packages/git-workspace/src/index.ts`
- Modify: `packages/git-workspace/package.json`
- Test: `packages/git-workspace/test/workspace.test.ts`
- Modify: `packages/contracts/test/requirement-traceability.test.ts`

**Interfaces:**

- Produces: `AgentRuntime`, `RuntimeProbe`, `RuntimeCapabilities`, `RuntimeSession`, `RuntimeResult`, `WorkspacePort`, `WorkspaceHandle`, `createGitWorkspacePort()`.
- Consumes: existing `TaskContract` and `WorkspaceIdentifiers` from `@verdicta/contracts`.

- [ ] **Step 1: Write failing real-Git integration tests**

```ts
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createGitWorkspacePort } from "../src/workspace.js";

it("creates a separate branch at the exact base and preserves the original branch", async () => {
  const fixture = await createFixtureRepository();
  const port = createGitWorkspacePort({ gitBinary: "git" });
  const before = await fixture.currentRevision();
  const handle = await port.create(
    {
      repositoryPath: fixture.path,
      baseRevision: before,
      runId: "run-1",
      attemptNumber: 1,
      worktreesRoot: await mkdtemp(join(tmpdir(), "verdicta-wt-")),
    },
    new AbortController().signal,
  );
  expect(handle.baseRevision).toBe(before);
  expect(handle.branch).toBe("verdicta/run-1-attempt-1");
  expect(await fixture.currentRevision()).toBe(before);
  expect(await fixture.currentBranch()).toBe(fixture.initialBranch);
  await port.remove(handle, new AbortController().signal);
});
```

The fixture helper must initialize its own repository, create an initial commit, configure a local test identity, and invoke real Git. It must not copy assets from another project.

- [ ] **Step 2: Run the integration test and verify RED**

Run: `pnpm --filter @verdicta/git-workspace test -- test/workspace.test.ts`
Expected: FAIL because `createGitWorkspacePort` is not exported.

- [ ] **Step 3: Define the ports and implement the minimal real-Git adapter**

```ts
export interface WorkspaceHandle {
  readonly worktreePath: string;
  readonly branch: string;
  readonly baseRevision: string;
}

export interface CreateWorkspaceInput {
  readonly repositoryPath: string;
  readonly baseRevision: string;
  readonly runId: string;
  readonly attemptNumber: number;
  readonly worktreesRoot: string;
}

export interface WorkspacePort {
  create(input: CreateWorkspaceInput, signal: AbortSignal): Promise<WorkspaceHandle>;
  captureDiff(handle: WorkspaceHandle, destinationPath: string, signal: AbortSignal): Promise<void>;
  remove(handle: WorkspaceHandle, signal: AbortSignal): Promise<void>;
}
```

Use `spawn` with argument arrays, never shell interpolation. Resolve `baseRevision` with `git rev-parse --verify`, create with `git worktree add -b <branch> <path> <baseRevision>`, stream `git diff --binary <baseRevision>` into `destinationPath`, and remove only through an explicit call to `remove`. `AgentRuntime` declares the specification operations `probe`, `prepareAuthentication`, `start`, `sendInstruction`, `resolveApproval`, `cancel`, `resume`, `streamEvents`, and `inspectSession`; every operation accepts an `AbortSignal`, and `probe` returns adapter/agent versions plus capabilities.

- [ ] **Step 4: Run the integration test and verify GREEN**

Run: `pnpm --filter @verdicta/git-workspace test -- test/workspace.test.ts`
Expected: PASS; the original branch and revision remain unchanged after creation and explicit cleanup.

- [ ] **Step 5: Run package and repository checks**

Run: `pnpm --filter @verdicta/runtime test && pnpm --filter @verdicta/application test && pnpm verify`
Expected: all executed commands exit 0. Remove no requirement exception unless a test now contains the corresponding requirement ID.

- [ ] **Step 6: Commit**

```bash
git add packages/runtime packages/application packages/git-workspace packages/contracts/test/requirement-traceability.test.ts
git commit -m "feat: add runtime port and git workspace lifecycle"
```

## Task 3: Implement fail-closed restricted Docker workers

**Files:**

- Create: `packages/sandbox/src/docker.ts`
- Modify: `packages/sandbox/src/index.ts`
- Modify: `packages/sandbox/package.json`
- Modify: `packages/application/src/ports.ts`
- Test: `packages/sandbox/test/docker.test.ts`
- Modify: `packages/contracts/test/requirement-traceability.test.ts`

**Interfaces:**

- Consumes: `WorkspaceHandle` from Task 2 and `ResourceLimits` from contracts.
- Produces: `SandboxPort`, `WorkerHandle`, `WorkerCommandResult`, `createDockerSandbox()`.

- [ ] **Step 1: Write failing Docker preflight and restriction tests**

```ts
it("SEC-001 SEC-002 SEC-005 fails closed and applies baseline restrictions", async () => {
  const sandbox = createDockerSandbox({ dockerBinary: "missing-docker-binary" });
  await expect(sandbox.probe(new AbortController().signal)).rejects.toMatchObject({
    code: "docker_unavailable",
  });

  const runner = new RecordingCommandRunner();
  const restricted = createDockerSandbox({ dockerBinary: "docker", runner });
  await restricted.start(validWorkerInput, new AbortController().signal);
  expect(runner.arguments).toEqual(
    expect.arrayContaining(["--read-only", "--cap-drop=ALL", "--network=none"]),
  );
  expect(runner.arguments.join(" ")).not.toContain("docker.sock");
  expect(runner.arguments.join(" ")).not.toContain(process.env.HOME ?? "home-not-set");
});
```

The real-Docker integration test additionally inspects the created container and asserts a non-root user, memory limit, PID limit, unique container name, and the single worktree mount. It is mandatory on a Docker-enabled stage runner, not replaced by the recording test.

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm --filter @verdicta/sandbox test -- test/docker.test.ts`
Expected: FAIL because the sandbox implementation does not exist.

- [ ] **Step 3: Implement the sandbox port and Docker adapter**

```ts
export type WorkerExitCode = number | "timeout" | "unknown";

export interface WorkerCommandResult {
  readonly exitCode: WorkerExitCode;
  readonly durationMs: number;
  readonly stdoutPath: string;
  readonly stderrPath: string;
}

export interface SandboxPort {
  probe(signal: AbortSignal): Promise<{ readonly dockerVersion: string }>;
  start(input: StartWorkerInput, signal: AbortSignal): Promise<WorkerHandle>;
  exec(
    worker: WorkerHandle,
    command: readonly string[],
    timeoutMs: number,
    signal: AbortSignal,
  ): Promise<WorkerCommandResult>;
  stop(worker: WorkerHandle, signal: AbortSignal): Promise<void>;
}
```

Construct `docker run` with explicit arguments for `--user`, `--read-only`, `--cap-drop=ALL`, `--pids-limit`, `--memory`, CPU limit, tmpfs for temporary files, selected network mode, and only `/work` plus approved ephemeral credential mounts. Set `--env` only from an explicit allowlist. Capture stdout/stderr as files, classify deadline expiry as `timeout`, and classify a missing process exit event as `unknown`.

- [ ] **Step 4: Run unit and real-Docker tests**

Run: `pnpm --filter @verdicta/sandbox test`
Expected: PASS on a Docker-enabled machine; absence of Docker fails the real-Docker test with a blocking diagnostic and must not trigger a host fallback.

- [ ] **Step 5: Remove only newly covered traceability exceptions and verify**

Remove the `SEC-001`, `SEC-002`, and `SEC-005` exceptions only when the test source references those IDs and exercises the rules. Run `pnpm verify`; expected PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/sandbox packages/application/src/ports.ts packages/contracts/test/requirement-traceability.test.ts
git commit -m "feat: add restricted Docker worker lifecycle"
```

## Task 4: Build content-addressed evidence with offline verification

**Files:**

- Create: `packages/evidence/src/artifact-store.ts`
- Create: `packages/evidence/src/bundle.ts`
- Modify: `packages/evidence/src/index.ts`
- Modify: `packages/evidence/package.json`
- Create: `packages/storage/src/artifacts.ts`
- Modify: `packages/storage/src/database.ts`
- Modify: `packages/storage/src/index.ts`
- Modify: `packages/application/src/ports.ts`
- Test: `packages/evidence/test/artifact-store.test.ts`
- Test: `packages/evidence/test/bundle.test.ts`
- Test: `packages/storage/test/artifacts.test.ts`
- Modify: `packages/contracts/test/requirement-traceability.test.ts`

**Interfaces:**

- Produces: `ArtifactStore.putFile`, `ArtifactStore.verify`, `finalizeBundle`, `verifyBundleOffline`, and storage functions that reject appends after finalization.
- Consumes: existing `ArtifactEntry` and `EvidenceBundle` contracts.

- [ ] **Step 1: Write failing hash, corruption, and finalize-once tests**

```ts
it("EVID-002 EVID-003 detects corruption and rejects writes after finalization", async () => {
  const store = createArtifactStore({ root: tempStore });
  const entry = await store.putFile(sourceFile, "text/plain");
  expect(entry.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(entry.path).not.toContain(tempStore);

  await finalizeBundle(validBundleInput);
  await expect(finalizeBundle(validBundleInput)).rejects.toMatchObject({
    code: "bundle_already_finalized",
  });

  await writeFile(join(bundleDirectory, entry.path), "corrupted");
  await expect(verifyBundleOffline(bundleDirectory)).resolves.toMatchObject({
    ok: false,
    code: "artifact_hash_mismatch",
  });
});
```

- [ ] **Step 2: Run evidence and storage tests and verify RED**

Run: `pnpm --filter @verdicta/evidence test && pnpm --filter @verdicta/storage test -- test/artifacts.test.ts`
Expected: FAIL because the artifact and bundle APIs are absent.

- [ ] **Step 3: Implement streaming SHA-256 storage and immutable finalization**

```ts
// packages/application/src/ports.ts — ports, with implementations in evidence.
export interface ArtifactStore {
  putFile(sourcePath: string, mimeType: string): Promise<ArtifactEntry>;
  verify(entry: ArtifactEntry): Promise<boolean>;
}

export interface EvidencePort {
  finalize(bundle: EvidenceBundle, directory: string): Promise<EvidenceBundle>;
  verifyOffline(directory: string): Promise<OfflineVerification>;
}

export interface OfflineVerification {
  readonly ok: boolean;
  readonly code?:
    "manifest_invalid" | "artifact_missing" | "artifact_hash_mismatch" | "verdict_mismatch";
}
```

Store bytes under a two-character SHA-256 prefix and the remaining hash, using relative paths only. Write new content to a temporary file, fsync and rename it, then insert its index row. A bundle directory contains `bundle.json`, `contract.json`, `changeset.json`, `verdict.json`, and referenced artifacts. Finalization computes the manifest and a canonical bundle hash in one SQLite transaction; subsequent writes raise `bundle_already_finalized`. JSONL is export-only and is not read by `verifyBundleOffline`.

- [ ] **Step 4: Run evidence and storage tests and verify GREEN**

Run: `pnpm --filter @verdicta/evidence test && pnpm --filter @verdicta/storage test`
Expected: PASS, including modified-manifest, missing-artifact, corrupted-artifact, and double-finalize cases.

- [ ] **Step 5: Update traceability and run all checks**

Remove `EVID-002` and `EVID-003` exceptions only when corresponding tests reference and enforce them. Run `pnpm verify`; expected PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/evidence packages/storage packages/contracts/test/requirement-traceability.test.ts
git commit -m "feat: add immutable content-addressed evidence bundles"
```

## Task 5: Implement the first headless CLI adapter and contract suite

**Files:**

- Create: `packages/adapters/src/headless-cli.ts`
- Create: `packages/adapters/src/contract-suite.ts`
- Create: `packages/adapters/src/ephemeral-credentials.ts`
- Modify: `packages/adapters/src/index.ts`
- Modify: `packages/adapters/package.json`
- Modify: `packages/application/src/ports.ts`
- Test: `packages/adapters/test/headless-cli.test.ts`
- Test: `packages/adapters/test/contract-suite.test.ts`
- Modify: `packages/contracts/test/requirement-traceability.test.ts`

**Interfaces:**

- Consumes: `AgentRuntime` from Task 2, `SandboxPort` from Task 3, and the ephemeral credential rules of ADR-0007.
- Produces: `createHeadlessCliAdapter(config)`, `runAdapterContractSuite(adapter, fixture)`, the `SecretProvider` port in `packages/application/src/ports.ts`, and its adapter-specific implementation with per-attempt `prepare`/`cleanup` operations.

- [ ] **Step 1: Write failing structured-output and capability tests**

```ts
it("rejects unknown structured output and never treats an agent success claim as verification", async () => {
  const adapter = createHeadlessCliAdapter(scriptedConfig({ output: "not-json\n" }));
  await expect(adapter.start(validStartInput, new AbortController().signal)).rejects.toMatchObject({
    code: "runtime_protocol_error",
  });
});

it("STATE-005 STATE-008 publishes honest capabilities and verifies resume identity", async () => {
  const probe = await adapter.probe(new AbortController().signal);
  expect(probe.capabilities).toEqual(expectedCapabilities);
  await expect(
    adapter.resume(sessionWithDifferentWorktree, new AbortController().signal),
  ).rejects.toMatchObject({ code: "session_identity_mismatch" });
});
```

The reusable suite covers `probe`, `start`, structured events, approval behavior, cancellation, resume identity, and version mismatch. An unsupported operation must return an explicit capability refusal; it must not be silently skipped in a run that requires it.

- [ ] **Step 2: Run adapter tests and verify RED**

Run: `pnpm --filter @verdicta/adapters test`
Expected: FAIL because the adapter and suite are absent.

- [ ] **Step 3: Implement the pinned headless CLI profile**

```ts
export interface HeadlessCliConfig {
  readonly adapterId: "codex-headless-cli";
  readonly adapterVersion: string;
  readonly supportedAgentVersions: readonly string[];
  readonly executable: string;
  readonly structuredOutputFormat: "jsonl";
}

export interface SecretProvider {
  prepare(
    runId: string,
    attemptNumber: number,
    signal: AbortSignal,
  ): Promise<EphemeralCredentialMount>;
  cleanup(mount: EphemeralCredentialMount, signal: AbortSignal): Promise<void>;
}
```

Use the selected real Codex CLI's documented machine-readable output and version probe; pin the accepted version in configuration and evidence. Parse JSONL with schema validation at the adapter boundary. Translate vendor events into runtime events, and never put vendor types into contracts. Prepare the smallest credential directory required by the CLI from an explicit one-time operator input, mount it read-only, and delete it in `finally`. If `full` networking is configured, require a run-creation approval token bound to the contract hash; otherwise refuse startup.

- [ ] **Step 4: Run scripted and real-adapter suites**

Run: `pnpm --filter @verdicta/adapters test`
Expected: all scripted contract scenarios PASS without external credentials.

Run: `VERDICTA_REAL_AGENT_CONFIG=/absolute/path/agent-config.json pnpm --filter @verdicta/adapters test -- test/contract-suite.real.test.ts`
Expected: the real pinned agent executes every critical scenario; any unsupported critical scenario blocks a support claim. Credential values are absent from captured output.

- [ ] **Step 5: Update traceability and run all checks**

Remove `STATE-005` or `STATE-008` exceptions only when their tests actually enforce those rules. Run `pnpm verify`; expected PASS. Do not claim a real-agent scenario that was not executed.

- [ ] **Step 6: Commit**

```bash
git add packages/adapters packages/runtime packages/application packages/contracts/test/requirement-traceability.test.ts
git commit -m "feat: add first headless CLI runtime adapter"
```

## Task 6: Independently verify checks and capture the ChangeSet

**Files:**

- Create: `packages/verifier/src/independent.ts`
- Create: `packages/verifier/src/changeset.ts`
- Modify: `packages/verifier/src/index.ts`
- Modify: `packages/verifier/package.json`
- Test: `packages/verifier/test/independent.test.ts`
- Test: `packages/verifier/test/changeset.test.ts`
- Modify: `packages/contracts/test/requirement-traceability.test.ts`

**Interfaces:**

- Consumes: frozen `TaskContract`, `SandboxPort`, `WorkspacePort`, `ArtifactStore`, and `WorkerHandle`.
- Produces: `VerifierPort.verify(...): Promise<VerificationResult>` and `captureChangeSet(...): Promise<ChangeSet>`.

- [ ] **Step 1: Write failing fail-closed verification tests**

```ts
it("VER-003 SEC-004 executes every mandatory command independently and fails closed", async () => {
  const sandbox = new ScriptedSandbox([
    { exitCode: 0, stdout: "agent claims success" },
    { exitCode: 1, stdout: "independent failure" },
  ]);
  const result = await verifier.verify(validVerificationInput, new AbortController().signal);
  expect(sandbox.executed[1].command).toEqual(["pnpm", "test"]);
  expect(result.checks[0].exitCode).toBe(1);
  expect(result.agentSummaryUsed).toBe(false);
});

it.each(["timeout", "unknown"])("does not pass a mandatory %s result", async (exitCode) => {
  const result = await verifierForExit(exitCode).verify(validVerificationInput, signal);
  expect(result.checks[0].exitCode).toBe(exitCode);
});
```

Add real-Git tests proving that forbidden paths are derived from the actual diff and that an agent-written file cannot replace the frozen verifier command list.

- [ ] **Step 2: Run verifier tests and verify RED**

Run: `pnpm --filter @verdicta/verifier test`
Expected: FAIL because verifier exports are absent.

- [ ] **Step 3: Implement independent execution and ChangeSet capture**

```ts
export interface VerificationResult {
  readonly checks: readonly ExecutedCheck[];
  readonly limitations: readonly string[];
}

export interface VerifierPort {
  verify(input: VerifyInput, signal: AbortSignal): Promise<VerificationResult>;
}
```

Read commands only from the persisted contract identified by `contractId` and `contentHash`. Execute each mandatory command through `SandboxPort.exec`, even if an earlier command fails. Stream stdout/stderr and any required machine report into `ArtifactStore`; set `machineReportRef` only after reading and validating the report. Capture `git diff --binary`, commits, head revision, changed files, untracked files, and forbidden-path violations from Git. The agent summary is accepted only as `AgentSummary` with `unverified: true`.

- [ ] **Step 4: Run verifier tests and verify GREEN**

Run: `pnpm --filter @verdicta/verifier test`
Expected: PASS for nonzero exit, timeout, unknown status, missing report, malformed report, forbidden path, required missing diff, and forbidden non-empty diff cases.

- [ ] **Step 5: Update traceability and run all checks**

Remove `SEC-004` and `VER-007` exceptions only if tests explicitly cover those requirements. Run `pnpm verify`; expected PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/verifier packages/application/src/ports.ts packages/contracts/test/requirement-traceability.test.ts
git commit -m "feat: independently verify checks and capture changes"
```

## Task 7: Orchestrate the run through the application service

**Files:**

- Create: `packages/application/src/run-service.ts`
- Modify: `packages/application/src/ports.ts`
- Modify: `packages/application/src/run-coordinator.ts`
- Modify: `packages/application/src/index.ts`
- Create: `packages/storage/src/contracts.ts`
- Modify: `packages/storage/src/database.ts`
- Modify: `packages/storage/src/index.ts`
- Modify: `packages/application/package.json`
- Test: `packages/application/test/run-service.test.ts`
- Test: `packages/storage/test/contracts.test.ts`

**Interfaces:**

- Produces: `ApplicationService.createRun`, `getRun`, `executeNext`, and `getEvidence`; `RunStore`; immutable `saveContract`/`getContract`.
- Consumes: every earlier port and the existing `applyTransition`, `persistTransition`, and `computeVerdict`.

- [ ] **Step 1: Write failing orchestration tests**

```ts
it("STATE-002 STATE-003 runs the full pipeline and keeps agent success separate from verification", async () => {
  const service = createRunService(
    fakePorts({
      agentSummary: "all checks passed",
      independentExitCode: 1,
    }),
  );
  const run = await service.createRun(validCreateRunInput);
  await service.executeNext(new AbortController().signal);
  const completed = await service.getRun(run.id);
  expect(completed.status).toBe("completed");
  expect(completed.verdict).toBe("failed");
  expect(completed.changeSetRef).toBeDefined();
  expect(completed.evidenceBundleRef).toBeDefined();
  expect(fakePorts.workspace.removeCalls).toBe(0);
});

it("persists the original immutable contract for verifier use", async () => {
  const created = await service.createRun(validCreateRunInput);
  await expect(
    service.createRun({ ...validCreateRunInput, contract: changedContractWithSameId }),
  ).rejects.toMatchObject({ code: "contract_hash_mismatch" });
  expect(await service.getContract(created.contractId)).toEqual(validCreateRunInput.contract);
});
```

- [ ] **Step 2: Run application tests and verify RED**

Run: `pnpm --filter @verdicta/application test -- test/run-service.test.ts`
Expected: FAIL because `createRunService` and `ApplicationService` are absent.

- [ ] **Step 3: Implement the service and extend terminal outcomes with references**

```ts
export interface ApplicationService {
  createRun(input: CreateRunInput): Promise<Run>;
  getRun(id: string): Promise<Run>;
  executeNext(signal: AbortSignal): Promise<Run | undefined>;
  getContract(contractId: string): Promise<TaskContract>;
  getEvidence(runId: string): Promise<EvidenceBundle>;
}

export interface TransitionOutcome {
  readonly verdict?: Verdict;
  readonly terminalReason?: string;
  readonly changeSetRef?: string;
  readonly evidenceBundleRef?: string;
}
```

Extend `applyTransition` to copy the two references when present and add coordinator tests for them; do not change transitions or verdict rules. `createRun` verifies the contract hash, probes the runtime, reserves deterministic worktree/branch names, and persists the immutable contract and queued run. `executeNext` performs `queued → preparing → running → verifying → completed`, creates exactly one attempt, computes the verdict solely from independent results and actual changes, finalizes evidence, and preserves the worktree and branch. Infrastructure exceptions map to technical `failed` with a safe terminal reason. All transitions use the stored lease owner and `persistTransition`.

- [ ] **Step 4: Run application and storage tests and verify GREEN**

Run: `pnpm --filter @verdicta/application test && pnpm --filter @verdicta/storage test`
Expected: PASS for success, failed checks, missing checks, forbidden paths, policy blocking, infrastructure failure, stale lease rejection, and immutable contract cases.

- [ ] **Step 5: Run all repository checks**

Run: `pnpm verify`
Expected: PASS with no new state or verdict values.

- [ ] **Step 6: Commit**

```bash
git add packages/application packages/storage packages/contracts/test/requirement-traceability.test.ts
git commit -m "feat: orchestrate trusted runs through application service"
```

## Task 8: Expose the run through loopback HTTP and the CLI

**Files:**

- Create: `apps/server/src/http.ts`
- Create: `apps/server/src/composition.ts`
- Modify: `apps/server/src/index.ts`
- Modify: `apps/server/package.json`
- Create: `apps/cli/src/cli.ts`
- Modify: `apps/cli/src/index.ts`
- Modify: `apps/cli/package.json`
- Test: `apps/server/test/http.test.ts`
- Test: `apps/server/test/boundaries.test.ts`
- Test: `apps/cli/test/cli.test.ts`

**Interfaces:**

- Consumes: `ApplicationService` and all concrete infrastructure ports.
- Produces: `POST /v1/runs`, `GET /v1/runs/:id`, `GET /v1/runs/:id/evidence`, `verdicta run <contract.json>`, `verdicta status <runId>`, and `verdicta evidence <runId>`.

- [ ] **Step 1: Write failing HTTP and CLI contract tests**

```ts
it("binds loopback only and returns the same status, verdict, and evidence id", async () => {
  const server = await createHttpServer({ service: fakeService, host: "127.0.0.1", port: 0 });
  expect(server.address().address).toBe("127.0.0.1");
  const created = await postJson(server.url("/v1/runs"), validWireRun);
  const status = await getJson(server.url(`/v1/runs/${created.id}`));
  const evidence = await getJson(server.url(`/v1/runs/${created.id}/evidence`));
  expect(status.evidenceBundleRef).toBe(evidence.id);
  expect(status.verdict).toBe("passed");
});
```

The CLI test starts a local fake HTTP service, invokes the built CLI with `spawn`, and compares parsed JSON output with API DTOs. Add a rejection test for a non-loopback host and safe error mapping that contains no stack trace or secret value.

- [ ] **Step 2: Run app tests and verify RED**

Run: `pnpm --filter @verdicta/server test && pnpm --filter @verdicta/cli test`
Expected: FAIL because HTTP and CLI entry points are absent.

- [ ] **Step 3: Implement thin transports and the single composition root**

```ts
export interface ServerConfig {
  readonly host: "127.0.0.1" | "::1";
  readonly port: number;
  readonly databasePath: string;
  readonly artifactRoot: string;
  readonly worktreesRoot: string;
  readonly agentConfigPath: string;
}

export async function createComposedService(config: ServerConfig): Promise<ApplicationService>;
```

Use `node:http` with a request-size limit and explicit DTO validation. Route handlers call only `ApplicationService`; they do not import storage or compute verdicts. Only `composition.ts` constructs the database, artifact store, Git workspace, Docker sandbox, adapter, verifier, and application service. CLI uses `parseArgs` and `fetch`, prints structured JSON, and exits nonzero for usage, infrastructure, blocked, and failed outcomes according to a documented mapping.

- [ ] **Step 4: Build and run the HTTP/CLI contract tests**

Run: `pnpm --filter @verdicta/server test && pnpm --filter @verdicta/cli test && pnpm --filter @verdicta/server test -- test/boundaries.test.ts`
Expected: PASS, including loopback binding and forbidden-import checks.

- [ ] **Step 5: Run all repository checks**

Run: `pnpm verify`
Expected: PASS; no remote bind option and no direct SQLite access from CLI or HTTP handlers.

- [ ] **Step 6: Commit**

```bash
git add apps/server apps/cli
git commit -m "feat: expose trusted runs through loopback API and CLI"
```

## Task 9: Automate the first trusted-run acceptance matrix

**Files:**

- Create: `apps/server/test/fixtures/create-fixture-repository.ts`
- Create: `apps/server/test/fixtures/scripted-agent.ts`
- Create: `apps/server/test/trusted-run.e2e.test.ts`
- Create: `apps/server/test/trusted-run.real-agent.e2e.test.ts`
- Modify: `apps/server/package.json`
- Create: `docs/development/first-trusted-run.md`

**Interfaces:**

- Consumes: the composed service, real Git, real Docker, CLI, and offline bundle verification.
- Produces: executable success and fail-closed acceptance scenarios plus a manual real-agent release gate.

- [ ] **Step 1: Write the failing end-to-end success scenario**

```ts
it("returns passed only after independent checks and preserves evidence and the original branch", async () => {
  const fixture = await createFixtureRepository({ defect: "sum-off-by-one" });
  const original = await fixture.revisionAndBranch();
  const result = await runCli(["run", fixture.contractPath]);
  expect(result.verdict).toBe("passed");
  expect(result.changeSet.headCommit).not.toBe(original.revision);
  expect(await fixture.revisionAndBranch()).toEqual(original);
  expect(await verifyBundleOffline(result.evidenceDirectory)).toEqual({ ok: true });
  expect(fixture.mergeOrPushOccurred()).toBe(false);
});
```

Create the fixture independently with a reproducible defect, a failing test, a frozen verification command, and a scripted agent that applies a known fix inside its Docker worktree. The scripted agent validates orchestration only; it is not evidence of real-agent support.

- [ ] **Step 2: Run the success scenario and verify RED against the previous stage**

Run: `pnpm --filter @verdicta/server test -- test/trusted-run.e2e.test.ts`
Expected: the new acceptance test fails until the complete composition is connected; capture the actual failing stage rather than weakening the assertion.

- [ ] **Step 3: Complete the acceptance matrix and real-agent gate**

```ts
it.each([
  ["agent claims success but independent test fails", "failed"],
  ["mandatory report is missing", "failed"],
  ["mandatory report is malformed", "failed"],
  ["mandatory exit status is unknown", "failed"],
  ["mandatory command cannot be re-executed", "failed"],
  ["forbidden path is modified", "failed"],
])("%s", async (_scenario, expectedVerdict) => {
  const result = await executeScenario(_scenario);
  expect(result.verdict).toBe(expectedVerdict);
  expect(result.preservedBranch).toBe(true);
  expect(result.originalBranchChanged).toBe(false);
  expect(result.mergeOrPushOccurred).toBe(false);
});
```

Add `test:e2e:real-agent`, which uses the pinned real Codex CLI, its ephemeral credentials, the same fixture, and the same assertions. Record adapter, agent, and Docker image versions in the generated bundle. If full networking is required, the fixture must prove that absence of explicit approval blocks creation.

- [ ] **Step 4: Execute scripted Docker E2E and the real-agent gate**

Run: `pnpm --filter @verdicta/server test -- test/trusted-run.e2e.test.ts`
Expected: every scripted matrix scenario PASS on real Git and Docker.

Run: `pnpm --filter @verdicta/server test:e2e:real-agent`
Expected: the real external agent produces a fix, independent checks decide the verdict, offline evidence verification passes, and the original branch remains unchanged. If credentials or Docker are unavailable, report the stage gate as not demonstrated; do not substitute the scripted result.

- [ ] **Step 5: Document exact commands and run all checks**

In `docs/development/first-trusted-run.md`, record fixture setup, real-agent configuration without secrets, commands, expected verdicts, evidence locations, and the scripted-versus-real distinction. Run `pnpm verify`; expected PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/server docs/development/first-trusted-run.md
git commit -m "test: add trusted end-to-end acceptance matrix"
```

## Task 10: Close requirement gates and review the stage

**Files:**

- Modify: `packages/contracts/test/requirement-traceability.test.ts`
- Modify: `AGENTS.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/adr/0002-docker-worktree-execution-model.md`
- Modify: `docs/adr/0004-single-application-service-thin-clients.md`
- Modify: `docs/adr/0005-loopback-http-sse-no-auth-mvp.md`
- Modify: `docs/adr/0008-evidencebundle-lifecycle.md`
- Modify: `docs/adr/0009-agentruntime-port-capability-adapters.md`

**Interfaces:**

- Consumes: executed results from Tasks 1–9.
- Produces: an evidence-based stage review with accurate current-phase documentation and ADR statuses.

- [ ] **Step 1: Check requirement coverage without inventing evidence**

Run: `pnpm --filter @verdicta/contracts test -- test/requirement-traceability.test.ts`
Expected: PASS with exceptions only for requirements still lacking tests. Every removed exception must correspond to an executed test containing the requirement ID.

- [ ] **Step 2: Inspect the complete diff and capability claims**

Run: `git diff --check && git status --short`
Expected: no whitespace errors and no unrelated files. Confirm that no document claims cancellation E2E, secret canary coverage, network-isolation E2E, Web UI parity, a second agent, or repair rounds.

- [ ] **Step 3: Update current-phase and ADR documentation**

Change only statements demonstrated by Tasks 1–9. Update `AGENTS.md` from stub status to the actual implemented packages and commands. Mark Stage 1 complete in `docs/ROADMAP.md` only if both scripted Docker E2E and the real-agent gate passed. Under architecture governance, move an ADR from `proposed` to `accepted` only after its implementation and contract tests have been reviewed; otherwise leave it proposed and record the remaining evidence.

- [ ] **Step 4: Run the complete verification suite**

Run: `pnpm verify`
Expected: `format:check`, lint, build, typecheck, and all tests exit 0.

Run: `pnpm --filter @verdicta/server test -- test/trusted-run.e2e.test.ts`
Expected: the complete scripted real-Git/real-Docker acceptance matrix passes again in the final change context.

Run: `pnpm --filter @verdicta/server test:e2e:real-agent`
Expected: the real-agent acceptance gate passes again in the final change context, or Stage 1 remains incomplete with the exact limitation reported.

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md docs/ROADMAP.md docs/adr packages/contracts/test/requirement-traceability.test.ts
git commit -m "docs: record first trusted run verification status"
```

## Stage 1 Exit Decision

Stage 1 is complete only when all of the following are observed:

- The successful real-agent scenario returns `passed` after independent checks.
- The false-success, missing-evidence, unknown-status, and forbidden-path scenarios cannot return `passed`.
- The result contains a preserved local branch, ChangeSet, EvidenceBundle, and Verdict.
- Offline bundle verification succeeds.
- The original branch remains unchanged and no merge or push occurs.
- `pnpm verify` and both E2E commands have real passing output in the final change context.

Cancellation, crash-recovery E2E, secret canaries, network-isolation E2E, Web UI, the second reference agent, and repair rounds remain Stage 2/3 work and are not implied by completion of this plan.
