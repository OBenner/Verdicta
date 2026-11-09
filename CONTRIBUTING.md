# Contributing to Verdicta

Thank you for your interest in Verdicta — a local-first control plane that
delegates coding tasks to external agents and returns verifiable evidence
instead of promises.

This document is the human-facing entry point. If you are an automated
coding agent, read `AGENTS.md` first instead.

## Ground rules

1. **The specification is the source of truth.** The product and
   architecture specification lives at the repository root
   (`Verdicta-проект.txt`, in Russian). The English documents under
   `docs/development/` are normative working rules derived from it.
   Conflicts must be reported, not silently resolved.
2. **Evidence over claims.** Never state that a check passed unless you
   actually ran it. This is the product's core principle and applies to its
   own development.
3. **Small, scoped changes.** One change does one thing. No drive-by
   refactoring.
4. **No automatic merge or push.** Not in the product, and not in its
   development workflow without an explicit request.

## Repository layout (target)

```text
apps/cli          — command-line client
apps/server       — local service (API, coordination, recovery)
apps/web          — React + Vite web UI
packages/*        — contracts, application, storage, git-workspace,
                    sandbox, runtime, verifier, evidence, policy, adapters
docs/development/ — normative development rules
docs/adr/         — architecture decision records
```

The repository is scaffolded and pre-feature: the workspace layout above
exists, the gates run, but Verdicta's runtime behavior is not implemented
yet.

## Running the gates

Requirements: Node.js 24 and pnpm 12 (via corepack or a global install).

```text
pnpm install        # install workspace dependencies
pnpm verify         # format:check + lint + typecheck + test + build
pnpm format         # normalize formatting before committing
pnpm -r test        # tests only
pnpm --filter @verdicta/web dev   # Web UI dev server (loopback)
```

Run `pnpm verify` before opening a PR and report its real output. A claim
that checks passed without an actual run violates the project's core
principle.

## Development rules

The normative documents under `docs/development/` are mandatory reading
before touching the corresponding subsystem:

- `architecture-and-invariants.md` — module boundaries, domain purity,
  `Run.status` vs `Verdict`, idempotency, leases, recovery, and the
  requirement ID registry (`STATE-*`, `SEC-*`, `EVID-*`, `VER-*`).
- `coding-conventions.md` — TypeScript strict mode, typed errors,
  cancellation, transactions, logging, API naming.
- `testing-and-verification.md` — TDD policy, test levels, fault injection,
  fail-closed scenarios, honesty rules for verification claims.
- `security-and-secrets.md` — threat model, Docker isolation, secret
  handling, network profiles, prompt-injection handling.
- `git-and-review.md` — commit format, branch discipline, PR readiness,
  ADR policy.

Style rules that a formatter or linter can enforce are enforced by tools,
not rewritten as prose. The documents explain principles; tooling enforces
them.

## Commits and pull requests

We use [Conventional Commits](https://www.conventionalcommits.org/):
`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`, etc. See
`docs/development/git-and-review.md` for the full rules, including the
prohibition on pushing or rewriting published history without an explicit
request.

## Decision records

Significant architectural decisions get an ADR in `docs/adr/` based on
`docs/adr/template.md`. Minor fixes do not. When in doubt, ask.

## License

Verdicta is licensed under Apache-2.0. By contributing, you agree that your
contributions are licensed under the same terms. Verdicta is an independent
implementation and must not include code, prompts, storage schemas, or UI
design copied from any other project. Be especially careful with
copyleft-licensed (e.g. AGPL) prior art in this problem space — it is
incompatible with this repository.
