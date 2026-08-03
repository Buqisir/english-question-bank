# DEV Prompt — I5 Writing AI Import

Cut: `I5-writing-ai-import` — land the already-built writing import (应用文 +
读后续写) by closing the three PA Must Fix items.
Role: DEV (Sonnet). Implement only. The plan is the contract; do not re-decide it.
Branch: `codex/i5-writing-ai-import`.

> **ROUND 2 (current).** Round 1 (`fd52a78`) closed tasks 1–3 but CR-lite found
> `verify-ci` is **red** (round 1's report wrongly claimed EXIT 0). Now do
> **`plan.md` §DEV round 2, tasks 4–6** (fix the verify-i1-analysis four-family
> fixture → verify-ci 0; remove dead scope-guard bodies in the two verify-i1 scripts;
> register verify-i5 in verify-ci). All execution rules below still apply.
> **Before reporting `verify-ci` green this time, actually run it and paste your own
> EXIT code** — the round-1 report's false green is exactly what CR caught.

## Assignment

Implement DEV tasks 1–3 in `plan.md` exactly as written. These are land blockers
from a completed PA cold read — direction, contract, and boundary are already
APPROVED, so do not redesign anything. Your bar is: all required verify scripts
green with no bypass, forbidden scope untouched.

Verify your baseline first:

- `git fetch`; confirm `git rev-parse --show-toplevel` = repo root and branch =
  `codex/i5-writing-ai-import` (carries merge `2fcca09`, grill `41dab1b`, PA/compress
  `b78f593`). If not, stop with `ESCALATION: BRANCH CONFLICT`.

## Must Read

- `docs/cuts/I5-writing-ai-import/plan.md` — **the execution contract** (DEV tasks
  1–3, Verification, Forbidden scope). Read it as authoritative.
- `docs/cuts/I5-writing-ai-import/pa.md` — the why behind each task (esp. §Sanity-check
  for the exact reject-fixture ordering, and §Q3 for the publish hole).
- `docs/adr/0007-writing-import-data-contract.md` — the two locked decisions you must
  not weaken.
- `scripts/verify-i2-seven-choices-ai-import.mjs`, `scripts/verify-i4-grammar-fill-ai-import.mjs`
  (`:219-229` is the six-family fixture template).

## The three tasks (full detail in `plan.md` §DEV tasks — do not duplicate, follow it)

1. **verify-i2 → six-family, full.** Add writing groups to `scFixtureParseResult()`
   **and pass them via the builder *arguments*** into the four builds that must pass the
   gate (`:552`, `:576`, `:591`, `:606`); leave `:619` omitting them; add two new
   rejects (missing application / missing continuation). The builder reads
   `applicationGroup`/`continuationGroup` from its **options arg, not `parseResult`** —
   adding to the fixture alone is a no-op.
2. **Remove per-cut scope guards from `verify:all`.** Delete the
   `assertAllowedScope`/`assertForbiddenScope` calls from `main()` in
   `verify-i2/i3/i4/i5` and the `writingPaperViewAdapter` hand-patch at `verify-i3:79`.
   **Do not whitelist siblings.** Keep every behavioural/contract assertion.
3. **Writing DB-publish test.** Prove a six-family package (incl. both writing groups)
   round-trips `publishPaperImportPackage` → DB with the writing group at
   `group_type='writing'` and a `questionId`-less writing QA link. Extend
   `verify-c7-paper-import-publish.mjs` to six families **or** add the assertion to
   `verify-i5`.

## Forbidden scope (from `plan.md` — confirm explicitly in your report)

- `shared/papersurface/`, `app/src/shared-ui/papersurface/` — untouched.
- `schemas/paper-import/*`, `app/src/domain/paperAsset.ts` — already admit writing on
  `main`; no change needed or allowed.
- Do not weaken six-family enforcement (`packageBuilder.mjs:209-212`) — PO-locked.
- Landed I1–I4 runtime contracts beyond the `verify-i2` fixture and the scope-guard
  removals.

## Verify before reporting

Run and summarize (names + pass/fail counts only, no raw logs):

- `verify-i2` (six-family, no bypass), `verify-i3`, `verify-i4`, `verify-i5`,
  `verify-c7-paper-import-publish` (if extended), `verify:all` / `verify-ci`.
- Confirm: `grep github/main...HEAD` over the scripts `verify-ci` runs returns nothing.
- `git diff --check` clean.

Browser QA is **required but a later gate** (browser QA + PO QA before RM, matrix in
`plan.md` §Verification). You are not running it; just confirm the workbench still
builds/typechecks. Note in your report that browser QA #1–6 remain to run.

## Commit / PR

Commit on `codex/i5-writing-ai-import` with a clear `fix(I5): …` / `test(I5): …`
message per task. **Do not push or open a PR** — stop after local commits + the
completion report and let the PO approve the push. (PR URL field: `pending PO push`.)

## Escalation

If you cannot proceed, stop with one line — do not write a half-done change set:

- `ESCALATION: CONTEXT INSUFFICIENT — <what is missing>`
- `ESCALATION: BRANCH CONFLICT — <pwd / branch mismatch>`
- `ESCALATION: SPEC CONTRADICTS — <plan vs code disagreement>`
- `ESCALATION: SCOPE UNCLEAR — <what plan does not answer>`

If a task turns out larger than its plan wording (e.g. the publish test needs a real DB
harness that does not exist), stop and report it rather than expanding scope silently.

## Completion report

Reply in chat with the completion report only, following
`docs/agents/dev-completion-report-template.md` (one fenced `text` block, ≤60 lines,
verify summaries not raw logs, forbidden scopes confirmed explicitly, known risks
listed). Then this PM session compresses → CR-lite → browser/PO QA → RM.
