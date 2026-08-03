# CR-lite — CI feedback-loop repair (PR #187)

Reviewer: 小川 (CR-lite, cold read). Date: 2026-06-04.
Branch: `chore/ci-feedback-loop-repair` → base `main`. Baseline: `github/main` @ d8f48f1.
Tier: bounded medium (CI orchestrator + one verify guard). CI-gate correctness is the risk.

## Changed Scope

This branch carries **two commits**:

1. `5a9330b` — **the actual cut.** `scripts/verify-ci.mjs` (collect mode + summary),
   `scripts/verify-i16a-teaching-dimension-search.mjs` (existsSync guard → exit 2),
   plus `plan.md` and the brief. Matches the plan's DEV contract exactly.
2. `5f4ab29` — **PR #186's content, stacked underneath.** `AGENTS.md` (184-line
   rewrite), `.claude/hooks/guard-contract-files.mjs`, `.claude/settings.json`,
   `docs/agents/external-agents.md`, `docs/cuts/_brief-tdd-difficulty-calibration.md`,
   `scripts/verify-cut-artifacts.mjs`. This is byte-identical to the live head of
   `github/chore/agents-md-consolidation` (the open PR #186) — `#187` is cleanly
   stacked on `#186`, not divergent.

The cut's `plan.md` Forbidden scope (line 61) says verbatim: **"No touching #186's
files (AGENTS.md, hooks, verify-cut-artifacts)."** The brief (line 42) says #186
should become "反馈环修好后第一个干净合的 PR" — i.e. #186 merges *separately, first*.
The diff vs `main` violates that because the branch is stacked rather than branched
from `main`.

## Findings

### Must Fix

**MF-1 — Merge-ordering hazard: #187 will drag #186 into `main` if squash-merged first.**
GitHub reports #187 as MERGEABLE against `main` *now*. Because the branch is stacked
on #186's exact head commit, a squash-merge of #187 today lands all of #186's content
(the AGENTS.md rewrite, the PreToolUse contract-guard hook, `verify-cut-artifacts.mjs`)
into `main` as a side effect — without #186 ever being merged-as-reviewed, and in
direct violation of this cut's stated Forbidden scope. Required before merge, pick one:
  - (a) Merge **#186 first**; then #187's diff vs `main` collapses to only commit
    `5a9330b` (the clean CI repair). This is the brief's intended order. **Preferred.**
  - (b) Rebase `chore/ci-feedback-loop-repair` onto `main` dropping `5f4ab29`, so #187
    contains only its own commit.

  Note this is a **merge-process** Must Fix, not a code defect in the CI repair itself.
  The #186 content is identical to its own PR and is independently benign (the hook is
  `ask`, not `deny`, and is local tooling only — no CI/runtime effect). But it must not
  ride into `main` through this PR.

### Should Watch

- **SW-1 — i16a guard checks only `paper-asset.json`, not the 4 sibling `analyses/*.json`.**
  Guard at line 60 gates on `paper-asset.json`; reads at lines 85/113/143/211 read
  `analyses/*.json` under the same `base960`. On CI the whole `versions/v1` dir is
  absent so the guard skips cleanly (proven in CI: i16a SKIPped). Only a *partial*
  local fixture (asset present, an analysis missing) would ENOENT-crash — an unlikely
  local-only state. Acceptable for this cut; does not block.
- **SW-2 — SKIP is honest but "not really tested" persists** until the root-fix
  (in-repo minimal fixture) lands. Plan defers this correctly (Out of scope §). The
  summary surfaces it loudly (`SKIPPED ... not actually tested`), so the gap stays
  visible. No action this cut.

## Self-Review Blind Spots

- I judged MF-1 as process not code; if the project's intent is for #187 to be the
  vehicle that lands #186 (i.e. #186 abandoned), then MF-1 dissolves — but nothing in
  plan/brief says that, and both PRs are open targeting `main`, so I treat the stack
  as a hazard. A human PO decision on merge order resolves it.
- I did not deep-review #186's AGENTS.md rewrite or the hook logic beyond benign-ness;
  that review belongs to PR #186, not here.

## Verification Evidence (re-run, not copied)

- **Collect-mode exit logic (read, not trusted):** `result.status ?? 1` → signal-killed
  child (status `null`) classifies as FAIL, not SKIP. Uncaught throw → node exit 1 →
  FAIL. Only exact exit 2 → SKIP. `process.exit(failed.length>0?1:0)` reaches exit 1 on
  any real FAIL. Preflight stays hard-fail. Correct.
- **Exit-code-2 collision check:** grep of all 39 registry scripts — only `i16a` uses
  exit 2. `verify-cut-artifacts.mjs` also uses exit 2 but is **not in the registry**, so
  no collision. SKIP convention is unambiguous.
- **Registry integrity:** diff of verify-ci.mjs shows **no** add/remove/reorder of the
  scripts list — only orchestration logic changed.
- **i16a local (fixture present):** exit 0, 66 passed / 0 failed — real test still runs.
- **i16a SKIP sim (fixture moved aside):** exit 2 + `SKIP verify-i16a: off-repo fixture
  absent` — guard fires before any off-repo read; fixture restored.
- **Real CI gate (run 26993126362, PR push):** GREEN, 45s. Workflow `verify.yml` →
  `pnpm run verify:all` → `verify-ci.mjs` (fix runs in the real gate). CI log shows:
  `===== verify summary =====` / `PASS 38 / SKIP 1 / FAIL 0`, i16a listed under SKIPPED,
  and **i16b / i16c / search-thinking-toggle ran after i16a and passed** — the
  previously-hidden scripts (implementer's blind spot) are now proven green in CI.

## Failure / Attack Angle

- *Could collect mode go green while broken?* A child that should fail would need to
  exit exactly `2` to be swallowed as SKIP. Verified no registry script except i16a
  exits 2, and i16a only exits 2 behind a real `existsSync` guard. A crash/throw exits
  1 → FAIL. No misclassification path found.
- *Branch-local green?* The opposite of this repo's usual trap — this fix is proven on
  the *clean* CI machine (i16a SKIPped there), not only locally. Good.
- *The live attack here is the stack* (MF-1): a future RM squash-merging #187 before
  #186 silently lands an entire other PR's governance + hook changes into `main`,
  bypassing #186's own review. That is the concrete way this PR causes harm.

## Residual Risk

Low for the CI repair itself (proven green in the real gate, logic verified by read +
re-run). The residual risk is entirely in merge ordering (MF-1).

## Recommendation

**APPROVE WITH MUST FIX.**

The CI feedback-loop repair (commit `5a9330b`) is correct, in scope, and proven green
in the real CI gate — it genuinely restores the merge gate without buying green by
weakening any check. Mergeable only after **MF-1** is resolved: ensure #187 does not
carry #186 into `main` (merge #186 first, or rebase #187 onto `main` dropping `5f4ab29`).
