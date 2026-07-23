# codex-matt-governance · live state

This file is the sole authoritative live-state snapshot for this cut.
Historical relay records live in `relay-history.md` and are non-authoritative.

## Identity

- Cut id: `codex-matt-governance`
- Cut size: `large governance`
- Lifecycle state: `active`
- Active role: `RM recovery dispatcher`
- Source branch: `codex/codex-matt-governance-live-state-migration-20260722-01`
- Current worktree: `/Users/huangxuewei/.codex/worktrees/d483/english-question-bank`
- Released input head: `9d8137764bcce0f5fd1f0cfba8439d2e674c149f`

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
- State: `release-authorized`
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
- Scope: `scripts/README.md CI registry parity only, plus own routing state`
- Forbidden: `all external-audit observations, governance rule redesign, product/runtime, production, and wt-applied-writing-lecture`

## Next Action

1. Release the predecessor-final commit to the recorded fresh Fix DEV, wait
   only for its durable activation acknowledgement, then end this task.
