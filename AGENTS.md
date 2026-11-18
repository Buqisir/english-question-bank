# Agent Instructions

This repository builds the English Question Bank workbench at `eqbank.cc`.
`AGENTS.md` is the operational entrypoint. Historical cuts record past work.

## Start safely

- Follow the Owner’s current request and the accepted spec or Linear ticket.
  Keep adjacent work out of scope and record durable decisions in the spec,
  ticket, or ADR.
- Before editing, verify the requested worktree, branch, HEAD and allowed dirty
  files. Preserve other work. Never stash, clean, reset, rebase, merge, or delete
  someone else’s changes.
- Use separate worktrees for parallel code changes with independent write
  surfaces and validation. Coordinate dependent tasks in order. Parallel paper
  imports can share one worktree. Each Agent writes only its paper’s directories
  under `scripts/import-pipeline/papers/` and `imports/ocr-proofread/`.
- Use `origin`, pnpm in `app/`, and npm in `server/`. For a fresh worktree, use
  `bash scripts/setup-worktree.sh`.

## Goal authorization

- A bounded Owner goal authorizes the requested work, including diagnosis, health
  checks and agreed recovery when in scope. Ordinary code delivery has standing
  authority. Honor “先别推”, “先别上”, and “停自动部署”.
- Production actions must be covered by Owner authorization. Migration, schema,
  DB/R2 operations, paper promotion and host changes need separate explicit
  authorization. Check [production records](docs/cuts/launch-deploy/go-live-record.md)
  before an authorized action. Never run `scripts/pull-run-push.mjs` against
  production without authorization for that operation.
- Ask before expanding privileges, secret access, the target environment, or
  irreversible scope. Keep secrets out of repositories, logs, prompts and
  reusable memory. Keep account data, private student data and full copyrighted
  passages out of reusable memory.
- For an UNKNOWN result, reconcile the same operation read-only using supported
  status checks and receipts. Preserve evidence and locks. Never replay an
  UNKNOWN operation or restore pre-traffic data after traffic reopens.

## Verify the changed risk

- Inspect the affected behavior and its direct consumers. Run the narrowest
  checks that cover them, including an exact-page interaction for visible UI
  changes and real affected Screen/Print/PDF output for shared renderer changes.
  Review the diff with `git diff --check`. Reuse GitHub Actions Full/E2E and rerun
  only local checks invalidated by a change. Report skips as skips.
- High-risk changes such as auth, server admission, persistence, question-to-answer
  mapping, import upload tooling and the shared Paper contract require an
  independent Astra review of the candidate before push.
- See [testing cadence](docs/agents/testing-cadence.md) for focused commands and
  handling red main, and [review levels](docs/agents/review-levels.md) for review.

## Ship to main

- Trunk-based delivery is the default. Work on a task branch based on current
  `origin/main`. Check main CI at startup and before pushing. Synchronize and
  review the clean committed candidate before `git push origin HEAD:refs/heads/main`.
  While main is red, only push a fix or revert. Never force-push or bypass protection.
- Open a PR only for CI and deployment tooling: `.github/workflows/`,
  `scripts/ci-pr-plan.mjs`, `.agents/setup`, the pack/planner logic in
  `scripts/verify-ci.mjs`, deployment scripts, controllers and host configuration.
  Require independent Astra review and complete green PR CI before merge.
  Check-list additions and removals in `scripts/verify-ci.mjs` or
  `scripts/lib/verificationShards.mjs` go directly to main after another Agent
  reviews them for unintended coverage loss. Other high-risk changes also go
  directly to main after review.
- Follow the pushed SHA’s natural main run and reconcile delivery. Record the
  commit or PR, what changed, verification and live status in Linear. See
  [Ship](.agents/ship.md) for PR details.

## GitHub Actions CI authority

The natural `.github/workflows/verify.yml` run is the CI authority. Check the
latest attempt for the reviewed PR candidate or exact main SHA. `verify` and
`e2e` must succeed. Deploy only the current `origin/main` SHA after every job
in the latest attempt of its natural Verify run succeeds. See the
[workflow](.github/workflows/verify.yml) and
[ADR-0026](docs/adr/0026-github-actions-ci-authority.md) for CI details.

## Owner Mac deployment

- GitHub Actions `Deploy` is the primary website deployment path after latest
  main is green. Follow deployment pauses and use `production-reviewed` with
  Owner approval for protected persistence-path changes. See
  [ADR-0027](docs/adr/0027-owner-local-website-deployment.md) for pause, rollback
  and reviewed deployment.
- For the Owner Mac backup, fetch and fast-forward the clean
  `~/Projects/eqb-deploy` main clone, then run
  `scripts/local-deploy.sh deploy --owner-said-deploy-latest`. Keep the Mac
  private key in Keychain and use the restricted controller path. For reviewed
  persistence-path changes, use `--code-only` only after confirming the complete
  production-to-target diff requires no migration, schema or data operation.

## Owner QA

For visible changes, prepare and smoke-check the exact service, data/login, URL
and initial state for Owner QA after deployment. On `eqbank.cc` use the Agent
accounts (`agent-local` on the Mac, `agent-cloud` in cloud sessions). Agents never
approve, publish or delete others’ data. See the
[Owner QA template](docs/agents/owner-qa-handoff-template.md).

## Product and import boundaries

- Preserve `Source -> Passage -> Question Group -> Question -> Paper Set -> Export`.
  Use the vocabulary in [CONTEXT.md](CONTEXT.md) and the relevant ADRs. Keep
  teacher workflows passage-first. Use [PRODUCT.md](PRODUCT.md), the relevant
  [steering note](docs/steering/README.md) and
  [UI guidance](docs/agents/ui-collaboration.md) for product and design decisions.
- Screen, internal Print HTML and PDF use the same Canonical Paper and
  version-bound source references. Preserve historical bindings. Follow the
  [paper format standards](docs/product/exam-paper-format-standards.md) and the
  [PDF product contract](docs/product/paper-pdf-products-v1.md). Three question
  PDFs omit answers and `answerOnly` uses source-backed answers and references.
- The backend import pipeline produces Canonical Paper. The website consumes it
  and has no import UI. Start with the [import contract](docs/import/agent-contract.md)
  and [NCK1 standard](docs/product/nck1-paper-standard.md).
- Import hard gates are question text, numbering, options, official answers and
  their question mapping, audio and images. Note missing soft items such as
  scoring tables, model-answer illustrations, listening segment markers,
  metadata and analysis details without blocking review.
- For recognition problems, compare against the source page and use existing
  declarations. Change code for incorrect visible output. Keep already submitted
  papers out of routine revalidation.
