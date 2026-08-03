# Plan — CI feedback-loop repair (止血)

Source brief: `docs/cuts/_brief-ci-feedback-loop-repair.md`
Cut size: **bounded medium** (changes the CI orchestrator `verify-ci.mjs`; no
schema / data contract / product boundary / teaching interpretation).
Flow: Sync → PM grill (done) → plan.md → DEV → verify (local + GitHub green) →
CR-lite → RM. No browser QA (no user-visible surface).

## Problem (evidence)

- main has been red since #181. The merge gate is dead → "假合".
- Root cause A: `verify-i16a-teaching-dimension-search.mjs:56-57` unconditionally
  reads the **gitignored** off-repo fixture
  `app/public/paper-assets/paper-960d0f8d/versions/v1/paper-asset.json`. CI is a
  clean checkout → `ENOENT` crash. (Confirmed in run 26992260250.)
- Root cause B: `verify-ci.mjs:69-70` `process.exit` on the first failure. i16a is
  script #36/39, so i16b / i16c / search-thinking-toggle **never run in CI** —
  their true status is hidden.
- Empirically only i16a crashes. The other 6 paper-assets-referencing registry
  scripts read git-tracked `latest/` data or self-generate, and all PASS in CI.

## Decisions (PM grill, owner-confirmed 2026-06-04)

1. **Skip scope: only `verify-i16a`.** It is the sole off-repo crasher (razor —
   do not touch scripts that already pass).
2. **Honest SKIP, surfaced in the summary.** A guarded script that finds its
   off-repo fixture absent exits with code **2** (= skip convention). `verify-ci.mjs`
   counts SKIP separately from PASS and lists skipped scripts, so "缺数据没真测"
   stays visible (per brief's warning that skip ≠ tested).

## Changes (DEV contract)

### 1. `scripts/verify-ci.mjs` — collect mode + summary
- `run()` returns the child exit status instead of calling `process.exit`.
- **Preflight stays hard-fail**: if a preflight step (`git diff --check`, app
  build/typecheck) returns non-zero, print which step failed and `process.exit` —
  a broken build makes the script results meaningless.
- **scripts loop = collect mode**: run every registered script, record
  `{ script, status }`, never exit early.
- Define `const SKIP_EXIT_CODE = 2`. Classify each result:
  - `status === 0` → PASS
  - `status === SKIP_EXIT_CODE` → SKIP
  - else → FAIL
- Final summary block: `PASS n / SKIP s / FAIL m`; list SKIPPED script names
  ("off-repo fixture absent") and FAILED script names (with exit code).
- `process.exit(failed.length > 0 ? 1 : 0)` — SKIP does not fail CI.

### 2. `scripts/verify-i16a-teaching-dimension-search.mjs` — existsSync guard
- After computing `base960` (line ~56), before the first `readJson`, check
  `existsSync(path.join(base960, 'paper-asset.json'))`.
- If absent: `console.warn('SKIP verify-i16a: off-repo fixture absent (paper-960d0f8d/versions/v1)')`
  then `process.exit(2)`. (Import `existsSync` from `node:fs` if not already.)
- When the fixture is present (local dev), behaviour is unchanged — still a real test.

## Forbidden scope

- No product/UI/contract files (domain · schema · `*Adapter.ts` · PaperSurface ·
  `server/**` · paper-assets · print/export). Only the two scripts above + this
  plan + the brief.
- No re-ordering / removal of registry scripts. No change to what any script
  asserts. No touching #186's files (AGENTS.md, hooks, verify-cut-artifacts).

## Verify

- Local: `node scripts/verify-ci.mjs` runs the **full** scripts loop (no early
  exit) and prints the summary; with local fixture present, i16a PASSes.
- SKIP path (local sim): move `paper-960d0f8d` aside, run `verify-i16a` →
  exit 2 + SKIP line; restore. (iCloud backup exists as safety net.)
- Authoritative: push branch → GitHub `Verify` runs full suite, i16a SKIPs
  (CI genuinely lacks the data), summary shows the real status of i16b / i16c /
  search-thinking-toggle, and the job goes **green** (or surfaces a real bug to
  triage separately — not silently hidden).

## Out of scope (defer — do NOT mix into this cut)

- 根治: commit a minimal in-repo `paper-asset.json` fixture so i16a really tests
  in CI instead of skipping. Separate cut (brief §5).

## After

- CI feedback loop restored → re-check **PR #186**; under healthy CI it goes green
  and becomes the first clean merge. Then start the TDD difficulty-calibration cut.
