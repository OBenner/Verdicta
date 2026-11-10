# Security Policy

## Supported versions

Verdicta is in pre-release development. No stable release is currently
supported. Security fixes are applied to the current `main` branch; older
commits and development branches are not maintained as supported versions.

This policy applies to Verdicta itself. External coding agents, model
providers, Docker, operating systems, and repositories under test have their
own security policies and maintainers.

## Report a vulnerability

Report suspected Verdicta vulnerabilities privately through a GitHub Security
Advisory:

**[Open a private security report](https://github.com/OBenner/Verdicta/security/advisories/new)**

Do **not** use public issues, pull requests, discussions, or commit comments
for undisclosed vulnerabilities.

A useful report includes:

- the affected Verdicta commit or version;
- the affected component and security boundary;
- the observed impact and a minimal reproduction;
- relevant operating system, Node.js, Docker, adapter, and agent versions;
- safe logs or diagnostics with all secrets and personal data removed;
- a suggested mitigation, if one is available.

Use synthetic repositories and secret canaries for reproduction. Never attach
real credentials, private source code, authentication cookies, or unredacted
EvidenceBundles. If sensitive material is essential to confirm a report, state
that fact in the advisory without including the material; the maintainer will
arrange an appropriate private exchange.

## Scope

Security reports are especially relevant when they demonstrate:

- execution outside Docker or another violation of the worker isolation
  boundary;
- access to the host home, Docker socket, another worktree, or a forbidden
  network destination;
- disclosure or persistence of credentials in SQLite, logs, API responses, or
  evidence;
- modification of a frozen TaskContract, verifier commands, policy, or approval
  by repository content or agent output;
- bypass, reuse after expiry, or parameter substitution of an approval;
- a false `passed` verdict caused by missing, corrupted, or unexecuted
  mandatory checks;
- modification of a finalized EvidenceBundle without detection;
- unauthorized modification of the original branch, automatic merge or push,
  or loss of preserved evidence;
- duplicate execution or unsafe automatic resume after an uncertain failure.

### Threat-model boundaries

The following are outside the MVP security guarantee:

- a compromised Docker daemon;
- a compromised operating-system kernel;
- a malicious machine administrator;
- a malicious local operator, who is part of the trusted computing base;
- vulnerabilities entirely inside an external agent, model provider, or the
  repository under test.

A report may still be useful when these conditions expose a separate Verdicta
defect. The normative threat model and security requirements are documented in
`docs/development/security-and-secrets.md`.

## Safe research

Security testing must be limited to systems and repositories you own or are
explicitly authorized to test. Do not access another person's data, disrupt
services, exfiltrate real secrets, run destructive payloads against shared
infrastructure, or use a report to demand payment.

Stop testing once the vulnerability and its impact are demonstrated. Use the
smallest reproduction that establishes the issue.

## Review and coordinated disclosure

The maintainer reviews the advisory, reproduces the issue where possible,
assesses its effect on Verdicta's trust boundaries, and coordinates remediation
with the reporter. Status and clarifying questions are communicated through the
private advisory.

Do not publish technical details or exploit code until a fix or mitigation is
available and the maintainer and reporter have agreed on disclosure. If the
report is outside Verdicta's scope, the maintainer may recommend the appropriate
upstream project or a non-security issue instead.

Reporter credit is optional and can be given in release notes or the advisory
with the reporter's consent. Verdicta does not currently operate a bug bounty
program, and no reward is promised.

## Security expectations for contributors

Security fixes must preserve the fail-closed behavior and include regression
tests appropriate to the affected boundary. Do not weaken Docker isolation,
network profiles, secret handling, evidence integrity, or verdict rules to make
a reproduction or test pass. Changes to those rules require the review process
described in `AGENTS.md` and the normative development documents.
