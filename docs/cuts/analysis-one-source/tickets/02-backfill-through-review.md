# 02 — Backfills go through review, so the rail and the 解析 PDF stay together

Status: accepted 2026-11-25; not started
Blocked by: none
Next on PASS: Owner acceptance; production check only with Owner authorization
Terminal: no

## Problem

- The 解析 PDF is frozen at review time. It is stored in the blob store with
  the review bundle and tied to `analysisDigest`. The on-demand
  companion-analysis route is retired (410).
- The lecture rail reads the served sidecars under `analyses/` on every load.
- Supported route: `scripts/import-pipeline/lecture-redo.mjs prepare / merge
  [--only …] / push`. It builds a new review revision, re-renders
  `products/analysis.pdf`, and goes through review and promotion. The rail and
  the PDF change together.
- Side door: `scripts/import-pipeline/writing-analysis-driver.mjs persist`
  calls `persistWritingAnalysisGroup`
  (`server/writing-analysis/writingAnalysisBackfillService.mjs`). That writes
  `analyses/writing-analysis-v1.json` in place, with no review, no new digest
  and no new PDF. If those files reach the server (for example through the
  legacy `pull-run-push.mjs`, whose `rsync -a` overwrites existing paper
  assets), the rail shows the new writing lecture while the frozen 解析 PDF
  keeps the old one. This was found by reading the code; it has not been
  reproduced on production.

## What to build

1. Close the side door. `persistWritingAnalysisGroup` (and so the driver)
   refuses a paper that has a review-backed publication. The error names the
   paper and points to `lecture-redo.mjs --only application` or
   `--only continuation`. Papers with no review record (legacy, no frozen 解析
   PDF) keep the current behaviour.
2. Drift check, read-only. Add a script that, for each published review-backed
   paper, compares the served sidecars with the sealed review projection. It
   reuses `assertPaperImportAnalysisSidecars`, which the publisher already runs
   at promotion. It reports `same` or `differs: <file>` per paper. It never
   writes.
3. Documentation. Add one line to `docs/agents/cloud-lecture-review.md` and to
   the driver header: after a paper is released, any analysis change, a single
   type included, goes through `lecture-redo`. Update both writing specs where
   they describe the backfill route.

## Acceptance criteria

- [ ] Test: persist on a fixture paper with a review publication is refused
  with the lecture-redo hint, and no file is written.
- [ ] Test: persist on a legacy fixture paper still writes as before.
- [ ] Test: the drift check reports `same` on an untouched fixture and
  `differs: writing-analysis-v1.json` after the file is edited.
- [ ] `node scripts/verify-ci.mjs` passes; the existing driver and
  writing-analysis verifiers still pass.
- [ ] With Owner authorization only: run the drift check against production,
  read-only, and record the result per paper in Linear. Fixing any drift is a
  separate decision.

## Files

`server/writing-analysis/writingAnalysisBackfillService.mjs`,
`scripts/import-pipeline/writing-analysis-driver.mjs`, a new
`scripts/verify-analysis-sidecar-drift.mjs` (name open), its tests,
`docs/agents/cloud-lecture-review.md`,
`docs/cuts/application-writing-v4/spec.md`,
`docs/cuts/continuation-writing-v3/spec.md`.
