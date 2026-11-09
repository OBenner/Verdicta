# Security and Secrets

Normative security rules for Verdicta. Stable requirement IDs use the
`SEC-*` prefix; tests reference them directly.

## 1. Threat model

Trusted: the local operator, the Verdicta core, the SQLite/artifact store,
and the Docker daemon.

Untrusted:

- code and instructions inside the repository under test;
- agent output and log content;
- dependencies downloaded by the project;
- external MCP servers;
- content of issues, documents, and any other context sources.

**[SEC-003]** External text is data, never instructions, for the policy
engine or the verifier. Changing the `TaskContract`, verifier commands, or
policy requires a local user action.

Out of scope for the MVP (documented, not silently ignored): a compromised
Docker daemon, a compromised OS kernel, or a malicious machine
administrator.

## 2. Isolation

**[SEC-001]** A git worktree isolates Git changes only. It does not stop a
process from reading the host filesystem, the network, or other worktrees.
Agents and verification commands therefore run in Docker.

**[SEC-002]** Absence of Docker is a blocking `verdicta doctor` error.
Falling back to host execution is forbidden — fail closed.

**[SEC-005]** Baseline worker restrictions (every attempt, no exceptions):

- non-root user inside the container;
- read-only root filesystem with explicit writable mounts only;
- `cap_drop=ALL`;
- no Docker socket, no broad host-home mounts;
- CPU, memory, PID, and wall-time limits;
- only the explicitly selected worktree and minimal credential mounts;
- no inheritance of the full host environment;
- a distinct container identity per attempt.

## 3. Network

**[SEC-006]** Supported profiles:

- `none` — networking disabled;
- `allowlist` — outbound traffic only to explicitly permitted provider /
  package / MCP endpoints via an egress policy (default);
- `full` — unrestricted outbound traffic; requires a separate approval at
  run creation.

The active profile is recorded in the evidence. When `full` is selected,
Verdicta does not promise protection against DNS-based tunneling and must
visibly present the weakened boundary.

## 4. Secrets and authentication

- The core has no model API key in the main flow. The agent authenticates
  with its own CLI/OAuth login; an adapter may prepare limited ephemeral
  credentials for a specific worker through the `SecretProvider`.
- If a CLI login cannot be safely transferred into a worker, the user may
  explicitly provide an agent API key via the OS keychain or a one-time
  environment input. Those are the agent's credentials, not the core's.

**[SEC-007]** Secret-handling rules:

1. Never mount the entire host home directory.
2. Never write secret values to SQLite, task text, logs, diff metadata, or
   the `EvidenceBundle`.
3. Pass only the credential material the worker actually needs, only for
   the duration of the run.
4. Never persist environment values into evidence.
5. Mask secret values in the UI and API.
6. Apply redaction to known secrets and common token formats.
7. Redaction is protection against accidental leakage, not proof that
   leakage through arbitrary output is impossible — documentation and UI
   copy must say so honestly.
8. Delete ephemeral credential material during worker cleanup.

## 5. Prompt injection and log handling

- Logs are rendered in the Web UI as escaped data — never interpreted as
  HTML or Markdown with active content.
- Instructions contained in repository content, issues, agent output, or
  documents must not be able to alter the `TaskContract`, the verifier
  commands, or policy. The verifier and policy engine run outside the
  agent's control (**[SEC-004]**); an agent-writable workspace cannot
  change the current run's verification rules.
- Approvals bind to a run, a specific action, a hash of the parameters, and
  an expiry. Changing the command, path, network destination, or secret
  requires a new decision. "Always allow" is not supported in the MVP; an
  expired approval is never executed.

## 6. Security regression tests

Mandatory, in addition to the fault-injection suite:

- isolation attempts (host home, Docker socket, sibling worktree,
  forbidden network address) are blocked and recorded in evidence;
- a secret canary provided only to the worker appears nowhere in SQLite,
  logs, API responses, or the `EvidenceBundle` after the run;
- log payloads containing markup/script are rendered inert in the Web UI;
- an approval reused after parameter change or expiry is rejected.

## 7. Reporting

Suspected security issues in Verdicta itself are reported privately to the
maintainer, not filed as public issues, until a public security policy is
published with the first release.
