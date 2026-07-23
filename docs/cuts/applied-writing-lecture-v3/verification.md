# applied-writing-lecture-v3 · Verification Ledger

## PM baseline (2026-07-22)

- Remote fetched: `github/main@1deec0f`.
- PM branch/worktree:
  `codex/applied-writing-lecture-v3-20260722-01` /
  `/Users/huangxuewei/Projects/wt-applied-writing-lecture-v3`.
- Approved prototype archive pushed as
  `github/codex/applied-writing-lecture-prototype-archive-20260722@f64038f`.
- Current main scan: no `reviewCard`, `reviewMarks`, `lectureAnnotation`,
  `WritingAnswerBoxReview`, or `WritingReviewAnnotationStage`; application
  analysis renders only in the right rail.
- Preserved local worktree `/Users/huangxuewei/Projects/wt-applied-writing-lecture`
  remains at `f64038f`; its pre-existing untracked `.superpowers/` is untouched.

## Evidence rules

Every execution role appends exact branch, HEAD, dirty-state expectation,
command, exit code, and concise result. Historical B2 verify/CR/QA cannot prove
this plan. Payload parity proves feasibility only; final browser evidence must
come from the production React surface at the exact DEV head.

## Current verdict

PM contract commit `def933be06aa171710bfb6d012a7639e30e245e7` is pushed on
`github/codex/applied-writing-lecture-v3-20260722-01`; worktree was clean after
push. Fresh formal PA is the unique next role. No runtime verification has run
and no DEV authorization exists.

## Fresh verification — AWL-V3-VERIFY-20260723-01 (2026-07-23)

Release runtime/data head under test:
`017164dc4697f6131747202b9a0c51b7d3593829`.

Activation was re-proved before the first verification write: after `git fetch
github`, repository root was
`/Users/huangxuewei/.codex/worktrees/f8ab/english-question-bank`, source ref
`github/codex/applied-writing-lecture-v3-20260722-01` resolved exactly to the
release head, that head was an ancestor of `HEAD`, and the worktree was clean.
The verification activation record was then committed as `4109c52`; its only
changes are cut-local routing artifacts. `git diff --quiet <release> HEAD --
schemas app server scripts` exited 0, so every runtime/data command below ran
against the release head's unchanged runtime/data tree.

### Scope and locked packets

- `git diff --name-only github/main@1deec0f..release` shows exactly the 16
  plan-allowed runtime/data files. No forbidden runtime/data path and no
  seventeenth runtime/data file is present.
- `paper-2022-i.application.json` SHA-256:
  `5618d5156a669a1eb82ceece0b86f5095067bd02324ce0d601c3d55990b65037`.
- `paper-2024-i.application.json` SHA-256:
  `39fd2fcd84fe61e49f96ffbf80728657774cd81d75461b6917f5ebb2abea35af`.

### Cold-run command ledger

| Command | Exit | Result |
| --- | ---: | --- |
| `node --check server/writing-analysis/writingAnalysisBackfillService.mjs` | 0 | syntax valid |
| `node scripts/verify-restart3-teacher-analysis.mjs` | 0 | 148 passed / 0 failed; includes application publish/persistence and continuation-exclusion cases |
| `node scripts/verify-lecture-panel-css.mjs` | 0 | all checks passed |
| `npm -C app exec tsc -- --noEmit` | 1 | `tsc` printed CLI help rather than selecting a project; this is the plan-named command's actual exit, not a green typecheck claim |
| `node docs/cuts/applied-writing-lecture-v3/qa/payload-parity/verify.mjs` | 0 | 2022 and 2024 each pass 5/5 review, 4/4 highlight, literal anchors, and exact persisted packet parity |
| `node docs/cuts/applied-writing-lecture-v3/qa/dp2-applied-writing-lecture-v3.mjs` | 0 | both pilots/tabs, 794 x 472 stage, 612 x 458 frame, narrow teardown, continuation teardown, and malformed-present rejection pass |
| `git diff --check` | 0 | clean worktree |
| `pnpm -C app run verify:all` | 1 | `PASS 82 / SKIP 1 / FAIL 3`; build/typecheck inside the suite succeeded |

The full suite independently reproduces the three named failures:
`scripts/verify-similar-v2.mjs`, `scripts/verify-paper-assets-consistency.mjs`,
and `scripts/verify-genre-truth.mjs`. They are outside the cut's 16
runtime/data paths; this verification does not attribute or repair them.

Additional release-diff observation (not a substitute for the plan-named
clean-worktree command): `git diff --check github/main@1deec0f..release`
exits 2 because the two newly added OFL license texts contain source trailing
whitespace at `OFL-Shantell-Sans.txt:21` and `OFL-Xiaolai.txt:22`.

## Verification verdict

**RELEASE GATE NON-GREEN.** The exact plan-named TypeScript command exits 1
and `verify:all` exits 1 with the three independently reproduced out-of-cut
failures. Cut-local behavioral, payload, CSS, DP-2 browser, scope, and locked
packet checks pass. This is a gate condition for CR/RM/merge, not permission to
alter runtime/data in verification.

## PM handoff diagnosis — routing correction (2026-07-23)

This diagnosis does not replace the fresh verification ledger or change its
non-green verdict. It explains what the fresh CR must attack.

- The plan-named `npm -C app exec tsc -- --noEmit` is not a valid project
  typecheck in this environment: both the verifier and PM reproduction exit 1
  after printing TypeScript CLI help. From `app/`, `pnpm exec tsc --noEmit`
  exits 0. The full suite's build/typecheck phase also passed. `plan.md` now
  names the working equivalent `pnpm -C app exec tsc --noEmit` for any future
  exact-head verification; this does not rewrite the original exit code.
- The verifier worktree's gitignored `data/question-bank.sqlite` is not the
  current main checkout's database. It has SHA-256 `eed006fe...da0d8f40`,
  9 passages, and source types `{real_exam, mock_exam, self_made}`. The main
  checkout database has SHA-256 `6189c579...ceba435`, 273 passages, and source
  types `{real_exam, mock_exam}`.
- Against the verifier worktree database, the three isolated failures reproduce:
  `verify-similar-v2` fails only its optional real-DB source-type corroboration;
  `verify-paper-assets-consistency` reports all 33 served asset directories as
  DB orphans; `verify-genre-truth` compares 273 decisions with the 9-passage
  database. Against the current main checkout/database, the same three scripts
  exit 0 (`83/0`, `199/0`, and `12/0`).
- Clean CI checkouts omit the gitignored database, so these scripts skip their
  local-DB corroboration phases. Fresh CR must decide whether the evidence is
  sufficient or whether a new exact-head verification run in a prepared,
  current-data worktree is a Must Fix. PM does not turn the original red result
  green.
- The release diff still has two independent `git diff --check` findings in the
  imported OFL texts. They remain CR input, not silently waived license-file
  exceptions.
