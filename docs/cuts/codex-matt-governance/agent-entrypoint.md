# codex-matt-governance · live state

This file is the sole authoritative live-state snapshot for this cut.
Historical relay records live in `relay-history.md` and are non-authoritative.

## Identity

- Cut id: `codex-matt-governance`
- Cut size: `large governance`
- Lifecycle state: `active`
- Active role: `fresh CR`
- Source branch: `codex/codex-matt-governance-readme-ci-fix-20260722-01`
- Current worktree: `/Users/huangxuewei/.codex/worktrees/144f/english-question-bank`
- Released input head: `0318460c48fa36c8c8dda0eb397f9a1eb2b93b1b`

## Current evidence

- Live-state migration exact-head verification:
  `docs/cuts/codex-matt-governance/verification.md#live-state-migration-exact-head-verification--2026-07-22`
- Canonical formal re-review verdict:
  `docs/cuts/codex-matt-governance/cr.md#live-state-migration-formal-re-review--2026-07-22`
- RM activation preflight: current worktree and repository root match; the
  worktree was clean; `HEAD` and the source branch both resolved to the
  released input head.
- RM release preflight recovery: with explicit owner authorization, the prior
  local `main` commits and uncommitted workspace were preserved on
  `codex/rescue-main-pre-governance-20260722-01`; the required main checkout is
  now clean and exactly aligned with `github/main`.
- RM exact-head release check: TypeScript passed, but `verify:all` returned
  PASS 84 / SKIP 1 / FAIL 1. The sole failure is
  `verify-architecture-housekeeping.mjs`: the live-state verifier is registered
  in `verify-ci.mjs` but its `scripts/README.md` row has no `Runs in CI? = yes`
  field.
- Fix DEV activation preflight: this worktree and repository root match; it was
  clean; `HEAD` and the source branch both resolved to the released input head.
- Verification activation preflight: this worktree and repository root match;
  it was clean; `HEAD` and the named source branch both resolved to
  `d6c65eb52cc30c382c6d7253e64f00c73565262e`.
- README CI-registry parity verification at released input head
  `d6c65eb52cc30c382c6d7253e64f00c73565262e`: `git diff --check` exited 0;
  `node scripts/verify-architecture-housekeeping.mjs` exited 0
  (PASS 72 / FAIL 0).
- CR activation preflight: this worktree and repository root match; it was
  clean; `HEAD` and the named source branch both resolved to
  `0318460c48fa36c8c8dda0eb397f9a1eb2b93b1b`.
- README CI-registry parity fresh CR verdict: `APPROVE`; zero unresolved Must
  Fix findings. Canonical report:
  `docs/cuts/codex-matt-governance/cr.md#readme-ci-registry-parity-fix-fresh-cr--2026-07-22`.

## RM stop record

- Role: `top-level fresh RM closeout only`
- Configured model: `gpt-5.6-sol`
- Thinking: `high`
- Canonical verdict: `MERGEABLE with zero unresolved Must Fix`
- Large artifact gate: `PASS 4 / FAIL 0`
- Release gate: `FAIL`
- Stop signal: `rule-conflict`
- Blocker: fixing the CI registry/documentation parity failure requires a DEV
  edit outside RM write authority; merging with a red full suite is forbidden.
- Preserved scope: no production change or write to
  `wt-applied-writing-lecture` is authorized.

## Fix DEV dispatch

- Dispatch id: `codex-matt-governance-readme-ci-fix-20260722-01`
- State: `closed`
- Role: `fresh Fix DEV`
- Configured model: `gpt-5.6-terra`
- Selected model: `gpt-5.6-terra`
- Requested thinking: `medium`
- Availability source: `Codex create_thread capability on local host`
- Supported-thinking evidence: `gpt-5.6-terra supports medium`
- Eligibility proof: `configured primary is the sole same-family/same-grade candidate`
- Substitution reason: `none`
- Creation attempt: `argument validation rejected duplicate projectId; no task created`
- Retry policy: `one corrected creation call only`
- Created thread: `019f8c94-7c3a-7232-aba8-5e00ec1a21c7`
- Host: `local`
- Successor worktree: `/Users/huangxuewei/.codex/worktrees/a471/english-question-bank`
- Ready-held proof: `clean worktree; HEAD and source branch both resolved to d5b1808671e569e7cf0e1560b818eaa291036d03`
- Release contract: `the predecessor-final commit carrying this record; no later predecessor worktree write`
- Activation proof: `released input adopted cleanly; sole writer acquired by fresh Fix DEV`
- Scope: `scripts/README.md CI registry parity only, plus own routing state`
- Forbidden: `all external-audit observations, governance rule redesign, product/runtime, production, and wt-applied-writing-lecture`

## Verification dispatch

- Dispatch id: `codex-matt-governance-readme-ci-fix-verification-20260722-01`
- State: `closed`
- Role: `fresh non-implementing verification`
- Configured model: `gpt-5.6-terra`
- Requested thinking: `medium`
- Availability source: `Codex create_thread capability on local host`
- Supported-thinking evidence: `gpt-5.6-terra supports medium`
- Eligibility proof: `configured primary is the sole same-family/same-grade candidate`
- Substitution reason: `none`
- Creation attempt: `argument validation rejected duplicate top-level projectId; no task created`
- Retry policy: `one corrected creation call only`
- Created thread: `019f8c98-6670-7223-ac59-2e6f0e2f916e`
- Host: `local`
- Successor worktree: `/Users/huangxuewei/.codex/worktrees/60db/english-question-bank`
- Ready-held proof: `fresh verification proved clean worktree; HEAD and named source branch both resolved to 45e55710621202eb94aec5c630e31d2ef76d8ef2`
- Release contract: `predecessor-final commit carries this record; no later Fix DEV worktree write`
- Activation proof: `released input adopted cleanly; sole writer acquired by fresh verification`
- Result: `PASS`; exact implementation head verified:
  `d6c65eb52cc30c382c6d7253e64f00c73565262e`.
- Scope: `bind real exit-code evidence to the exact Fix DEV head only`
- Forbidden: `implementation, README changes, verifier/governance changes, product/runtime, production, and wt-applied-writing-lecture`

## CR dispatch

- Dispatch id: `codex-matt-governance-readme-ci-fix-cr-20260722-01`
- State: `active`
- Role: `fresh CR`
- Configured model: `gpt-5.6-sol`
- Requested thinking: `high`
- Availability source: `Codex create_thread capability on local host`
- Supported-thinking evidence: `gpt-5.6-sol supports high`
- Eligibility proof: `configured primary is the sole same-family/same-grade candidate`
- Substitution reason: `none`
- Creation attempt: `created successfully`
- Created thread: `019f8c9b-195f-7190-bcc9-f12fd71abfb3`
- Host: `local`
- Successor worktree: `/Users/huangxuewei/.codex/worktrees/144f/english-question-bank`
- Ready-held proof: `clean detached worktree; HEAD and named source branch both resolved to 23464685f1f5240f783a70511a3807a937e9308a`
- Release contract: `predecessor-final commit carries this record; no later verification worktree write`
- Activation proof: `released input adopted cleanly; sole writer acquired by fresh CR`
- Scope: `cold-read the README CI registry parity fix and exact-head verification evidence`
- Forbidden: `implementation, README changes, verifier/governance changes, product/runtime, production, and wt-applied-writing-lecture`

## Next Action

1. Record and release exactly one top-level fresh RM successor under the
   write-held / predecessor-final-commit protocol, then end this CR task.
