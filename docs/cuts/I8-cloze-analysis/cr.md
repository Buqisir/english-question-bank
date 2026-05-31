# I8 完形填空 AI 解析生成 — CR (code review)

Reviewer: CR (小川 persona, fresh/independent context — did not implement)
PR: #168 · Branch `i8-cloze-analysis-plan` · Baseline `main` @ `83b240f`
Date: 2026-05-30
Review level: Large (data contract + new facet vocab + runtime `paper-import-ai`
path + publish persistence). Generation-only; render surface + entry gate are I9
(verified deferred, not flagged as a gap).

## Verdict

**APPROVE WITH MUST FIX.**

The cut is correctly sliced, in scope, and the publish wiring is complete and
correct across all four modules (validator allow-list, storage three-function
pass-through, packageBuilder required-when-present, route + workbench threading).
The validator rules match the contract, the verifier exercises real behavior
(disk write, C7 round-trip, answer-conflict non-retry counting), and verify-ci is
green with verify-i8 registered. One Must Fix is a verifier structural defect that
prints "PASSED" before four blocking-case assertions have settled and leaves them
uncounted/floating; it relies on Node's default unhandled-rejection-throws to fail
CI on regression, which is fragile. The production code is sound.

## Changed Scope

22 files, +2642/-24. Matches the plan's Allowed Files exactly:

- New: `prompts/cloze-analysis-v1.md`, `server/paper-import-ai/analyzeCloze.mjs`,
  `scripts/verify-i8-cloze-analysis.mjs`, cut docs.
- Wiring: `packageBuilder.mjs`, `routes.mjs`, `validator.mjs`, `storage.mjs`,
  `paperImportAi.ts`, `PaperImportAiWorkbench.tsx`.
- Verifier fixture updates: `verify-i1/i2/i3/i4/i5` (add `clozeAnalysis` to
  cloze-bearing package fixtures), `verify-ci.mjs`, `scripts/README.md`.

Forbidden scope confirmed untouched from the diff file list: no `schemas/**`, no
`app/public/paper-assets/**`, no `analyzeSevenChoices.mjs`, no
`seven-choices-analysis-v1.md`, no `paper-asset-v1`. `git diff --check` clean.
Only uncommitted artifact is untracked `.claude/launch.json` (not part of PR).

## Findings

### Must Fix

**MF-1 — verify-i8 prints PASSED before four blocking-case assertions settle;
they are floating, uncounted promises (`scripts/verify-i8-cloze-analysis.mjs`
lines 627, 643, 660, 680).**

`assertPackageBuilder()` is a synchronous function called without `await` in
`main()` (line 812). Inside it, the four required-when-present / mismatch blocking
checks call `assertRejects(...)` (which returns a Promise) WITHOUT `await` or
`return`. Result: `main()` logs `I8 cloze analysis verify PASSED: 71 checks`
BEFORE those four checks resolve, and their `ok -` lines print after the summary
(reproduced on this branch — see Verification Evidence). They are not in the 71
count.

Why this is a Must Fix, not Should Watch: these four are the assertions that prove
the cut's central new gate (`cloze_analysis_required`, paperId mismatch,
targetGroups mismatch). If that gate regressed so a missing/invalid cloze analysis
no longer blocked, the `assertRejects` body would throw "expected rejection but
resolved" as an *unhandled rejection*. On the current Node (v25, default
`--unhandled-rejections=throw`) that does crash with exit 1, so CI catches it
today — but the protection is accidental: it depends on the Node default flag and
on the throw escaping as unhandled rather than being swallowed, and the misleading
"PASSED" is exactly the kind of fake-green this repo has been bitten by.

Fix: make `assertPackageBuilder` (and `assertStorageDiskWrite` if it shares the
pattern — it is already `await`-free but synchronous-only, OK) `async`, `await`
each `assertRejects(...)`, and `await assertPackageBuilder()` in `main()`. After
the fix the four checks must be counted in the summary total and print before it.
No production-code change required.

### Should Watch (non-blocking)

- **`correctFit.optionLabel` absent escapes the answer-conflict check**
  (`analyzeCloze.mjs:218-223`). The conflict guard fires only when `correctLabel`
  is truthy. An AI analysis that omits `optionLabel` cannot conflict-block. This
  matches the contract ("optionLabel … when present") and seven-choices precedent
  (`answer-key.json` stays authoritative), so it does not block. Recorded so a
  future tightening (require `optionLabel` for cloze) is a conscious decision, not
  a silent gap.

- **C7 manual re-publish path does not enforce required-when-present**
  (`validator.mjs:524-528`). `validateParsedBundle` passes `clozeAnalysis` through
  with only a paperId-mismatch warning; the `cloze_analysis_required` block lives
  only in `packageBuilder` (the AI import path). This is the documented boundary
  and exactly mirrors how seven-choices analysis is handled (also not required in
  `validateParsedBundle`). Sound — the manual path historically allows partial
  bundles. Recorded because the asymmetry is load-bearing for I9: a hand-assembled
  C7 republish could ship a cloze paper without analysis. Acceptable for I8.

- **meta provenance is stamped in two places.** `analyzeCloze.stampMeta` sets
  `model`/`reviewedBy`/`reviewedAt`; `packageBuilder` re-asserts
  `generatedBy`/`promptVersion`/`reviewStatus`/`importMode` while spreading
  `...clMeta` first (so the stamped fields survive to disk — verified at
  `packageBuilder.mjs:465-480`, identical to seven-choices). A C7 manual publish of
  an analysis that never went through `stampMeta` would lack `model`/`reviewedAt`;
  same boundary seven-choices has. Not a blocker.

## Self-Review Blind Spots

- **Real-paper teaching quality (Step 6).** I reviewed the validator and prompt
  statically; I did not run a real provider. Whether collocation reasoning reads
  true, signatures are not over-applied (esp. the `action-sequence` guard), and
  phrase-blank option-side evidence works end-to-end is owner/PO QA, not CR's to
  judge. The unit fixtures use `pos: 'verb'` with passage-side evidence only — the
  option-side / phrase path is exercised only by the negative test
  (`option-side signalText not in options`), not a positive phrase fixture. If Big
  CR wants belt-and-suspenders, confirm Step 6 actually exercised a phrase blank
  (plan SW-3) — I could not verify that from the diff (generated assets correctly
  not committed).

- **passageText exact-substring across paragraph joins.** The validator joins
  paragraphs with `\n` (`analyzeCloze.mjs:169`). A `signalText` that legitimately
  spans a paragraph boundary would fail the substring check. Low risk (the prompt
  asks for 1–8 word chunks), but I did not prove it cannot bite a real paper.

## Verification Evidence

Re-run on this branch (not copied from any report):

- `node scripts/verify-i8-cloze-analysis.mjs` → exit 0, "PASSED: 71 checks", BUT
  four `ok -` lines (`I8 blocks publish when cloze analysis missing`, paperId
  mismatch, targetGroups missing, no-cloze-group) print AFTER the summary —
  confirming the floating-promise defect (MF-1).
- `node scripts/verify-ci.mjs` → "CI verify passed", 391 `ok -` lines, all
  sub-verifiers `0 failed`; `==> scripts/verify-i8-cloze-analysis.mjs` confirmed
  present in the run (registration in `verify-ci.mjs:42` verified).
- Read changed assertions and confirmed they fail on regression: verify-i3's
  inverted assertion (`I3 cloze analysis file present`) is a necessary consequence
  of the new required-when-present gate (without the new `clozeAnalysis` fixture,
  packageBuilder throws `cloze_analysis_required`) — not a weakened check. The
  i3/i2/i4/i5 "missing answer key" / "conflict" / family-completeness blocking
  tests all still supply a valid `clozeAnalysis`, so each isolates its own failure
  and the original blocking patterns are intact.
- Forbidden scope confirmed from `git diff --name-only` (none of
  schemas/paper-assets/seven-choices touched). `git diff --check` clean.
- packageBuilder ordering verified: `cloze_answer_missing` (line 391) runs before
  `cloze_analysis_required` (line 397), so the i3 missing-answer test resolves to
  the answer-key error as intended.
- Reproduced the floating-promise masking in isolation: a regressed blocking case
  prints "PASSED" then crashes with exit 1 via unhandled rejection on Node 25.

## Failure / Attack Angle

The realistic failure is a future DEV (or a refactor) weakening the
`cloze_analysis_required` block in `packageBuilder` — e.g. making it a warning, or
short-circuiting when `clozeAnalysis` is null. Because verify-i8's four guards are
floating/uncounted and print "PASSED" first, a casual reader running the verifier
sees green and the failing exit code is easy to miss in a long CI log (it does not
appear next to a `FAIL` marker — it surfaces as a raw unhandled-rejection stack
after the summary). On a Node configured with `--unhandled-rejections=warn` the
regression would pass silently. MF-1 closes this by making the guards awaited and
counted. Secondary angle: a hand-built C7 republish (Should Watch #2) can ship a
cloze paper with no analysis, surfacing in I9 as a broken 完形解析 entry — out of
I8 scope but worth an I9 availability note.

## Residual Risk

Low on production code: the wiring is complete, mirrors a proven precedent, and is
disk-proven by the verifier. The residual risk is concentrated in (a) verifier
robustness (MF-1) and (b) teaching-quality / phrase-path empirical proof, which is
PO/owner QA per the plan. No data-contract or persistence defect found.

## Recommendation

**APPROVE WITH MUST FIX.** Mergeable once MF-1 is closed: make
`assertPackageBuilder` async, `await` the four `assertRejects` blocking checks, and
`await assertPackageBuilder()` in `main()` so they are counted and settle before
the PASSED summary. Production code requires no change.
