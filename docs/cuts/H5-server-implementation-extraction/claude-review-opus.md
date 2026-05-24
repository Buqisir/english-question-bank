# H5 Claude PA-lite Review — Server Implementation Extraction

Reviewer: Claude (Sonnet, acting as PA-lite, single shot)
Baseline: `github/main` at `af5688e`
Branch under review: `codex/h5-pa-lite-prompt`
Date: 2026-05-24

## 1. Verdict

**APPROVE WITH MUST FIX — narrow to a single export slice (H5-A), only.**

H5 should not be opened as an umbrella. Two reasons:

1. H1's own closing rule says "H5 — Server Implementation Extraction:
   only if needed by a product cut. Do not start just to chase line
   count." The currently named near-term product work (阅读理解
   prompt 收敛、cloze / seven-choices 字段契约、similarity facet
   schema、model eval 脚本) does not require implementation locality
   in `server/api.mjs`. It mostly adds new analysis variants and new
   tables, not refactors of existing route owners.
2. A bounded H5-A export-only slice is still defensible as
   **preparation for the next AI-parse work**, because once cloze /
   seven-choices prompt 重写 lands, new save / fetch helpers will
   accumulate. Keeping export extraction as a small, low-risk pilot
   establishes the pattern (move impl into owner module + add a
   run-form regression) without committing to broader H5 scope.

Treat H5-A as the **only** sanctioned slice in this cut. If H5-A
ships cleanly, the team can re-evaluate H5-B against a named product
trigger — but H5-A's success does not auto-authorise more extraction.

## 2. Recommended First Slice

**Export implementation (H5-A).**

Move from `server/api.mjs` into `server/exports/`:

- `exportDocx` (lines ~6104–6196)
- `exportPdf` (lines ~6197–6213)
- `exportPrintHtml` (lines ~6214–6244)
- `exportPrintPdf` (lines ~6245–6310)
- `sendBinary` (lines ~512–525)
- `sendDocx` (lines ~526–534)
- `sendPdf` (lines ~535–543)

Why this slice:

- **Smallest surface**. ~240 implementation lines, 4 main functions
  plus 3 sender helpers. An order of magnitude smaller than legacy
  import (~2400 lines) or AI parse (very large span 7269–9311+).
- **Stable existing context seam**. `server/exports/exportRoutes.mjs`
  already declares exactly 8 context functions
  (`exportDocx`, `exportPdf`, `exportPrintHtml`, `exportPrintPdf`,
  `sendDocx`, `sendPdf`, `sendJson`, `readJsonBody`). Five of these
  are export-specific implementations; three are shared infrastructure.
  This is the cleanest "module owns its own implementations" boundary
  in the codebase.
- **No AI, no DB schema, no teaching interpretation**. Pure
  data-to-bytes transformations. The byte output is the contract.
- **No prompt-version coupling**. Unlike AI parse, no rewrite is
  pending. The implementation today is the implementation tomorrow.
- **Strongest existing regression coverage**. Five export-touching
  verify scripts already exist:
  `verify-exam-export.mjs`,
  `verify-paper-export-flow.mjs`,
  `verify-paper-export-payload.mjs`,
  `verify-print-pdf-export-flow.mjs`,
  `verify-print-renderer.mjs`.
- **Print renderer is already module-owned**
  (`server/print-renderer.mjs`). Moving export implementations into
  `server/exports/` follows the same ownership model and does not
  require new architectural decisions.
- **Behaviour-preserving by construction**. Same input data → same
  output bytes is testable to byte-equality. No room for "subtle
  regression."

## 3. Why Not The Other Slices

### Legacy import — DO NOT extract first

- ~10× larger surface (2400+ lines vs ~240).
- Mixes file IO, DOCX/PDF parsing, AND AI-backed helpers
  (`generateImportBundleDraft`, `generateAnswerAlignmentDraft`).
- The AI-backed pieces overlap with the cloze / seven-choices prompt
  rewrite the team has already named as the real debt. Moving this
  code now means moving code that will be rewritten soon —
  double work.
- Verify coverage is thinner. C7 paper-import verify covers the
  newer publish pipeline, not the legacy `import-files` / `import-bundles`
  / `import-batches` flow.
- Risk: medium-high. Behaviour-preserving extraction across 14
  context functions including AI calls is hard to prove with a single
  PR.

### AI parse — DO NOT extract first

- Largest surface (reading / cloze / grammar / seven-choices save +
  fetch + provider routing + DeepSeek call wrappers, spanning roughly
  lines 739–9311 with gaps).
- Touches AI output contracts and teaching interpretation — explicitly
  flagged by the H5 entrypoint as higher risk.
- Prompt-level work is in flight: aread prompt is still 收敛 across
  multiple paper sources; cloze / seven-choices prompts need to be
  rewritten to align with the facet schema. Extracting AI parse
  implementation before those contracts stabilise will force a second
  refactor.
- Verify coverage is weakest for behaviour preservation here —
  saved-parse JSON shape is the contract, but no run-form check
  asserts that calling the extracted function with a fixed input
  returns byte-identical parsed-JSON. Building that guard is itself a
  bigger task than the extraction.

### "Other" — no clear candidate

The remaining clusters (paper-asset normalisation, draft search
context, topic-label canonicalisation) are smaller but more deeply
intertwined with `getQuestionGroupDetail` and the database. They lack
the clean owner-module shape that export has. Skip.

## 4. Must Fix Before DEV

1. **Name the product trigger, or accept the "pilot" framing.**
   The H1 cut-note explicitly says do not start H5 just to chase line
   count. If the PO believes H5-A is a behaviour-preserving pilot to
   establish the extraction pattern *before* the next AI-parse rewrite,
   record that intent in
   `docs/cuts/H5-server-implementation-extraction/decisions.md` with
   `Last synced` and `Open items from external review`. If no trigger
   can be named, the correct action is to defer H5-A to the next AI-parse
   cut and not open this work.

2. **Capture byte-identical fixtures before extraction.**
   Before the first implementation diff lands, snapshot the bytes
   returned by `exportDocx`, `exportPdf`, `exportPrintHtml`, and
   `exportPrintPdf` for at least:
   - 1 small paper-set student version
   - 1 small paper-set teacher version
   - 1 print-html sample
   - 1 print-pdf sample

   Store snapshots as fixtures the new H5-A verify script can compare
   against. Without this, the run-form regression is impossible to
   prove.

3. **Forbid edits to `server/print-renderer.mjs` and the export
   route shells.** H5-A is a move-only diff. `print-renderer.mjs`
   stays where it is. `server/exports/exportRoutes.mjs` keeps the
   same `defineRoute` shape; only its imports change (from `context.*`
   wired from api.mjs, to direct imports from the new
   implementation module).

## 5. Should Watch

These do not block H5-A but should be recorded in
`docs/paper-surface-watch-ledger.md` or the cut's own watch ledger:

- **Context seam evolution**. After H5-A, the `context` object passed
  through router will lose 5 export-related fields. Codex should
  confirm no other route module reads `context.exportDocx` etc.
  (grep before merge).
- **Cross-module dependency on `getQuestionGroupDetail`**.
  `exportDocx` internally calls `getQuestionGroupDetail`. The
  extracted module will need to import this from api.mjs (or from a
  future question-bank/questionGroupDetail module). Decide now
  whether to import-from-api or to thread it through a small
  constructor parameter. Recommendation: constructor parameter
  (`createExportImplementation({ getQuestionGroupDetail })`) to avoid
  a circular import.
- **Future H5-B trigger discipline**. If H5-A succeeds, do not let
  it become the justification for H5-B / H5-C / etc. Each future H5-x
  slice must name its own product trigger. Without this discipline,
  H5 becomes the H1-style umbrella that H1's closing rule explicitly
  warned against.

## 6. Allowed / Forbidden Files

### Allowed

- `server/exports/exportImplementation.mjs` (new, or extend
  `exportRoutes.mjs` in-place if simpler — DEV decides)
- `server/api.mjs` (remove the 7 moved functions; add a single import
  + adjust the `routeContext` wiring)
- `scripts/verify-h5a-export-implementation.mjs` (new, run-form)
- `scripts/verify-ci.mjs` (one-line registry add for the new script)
- `scripts/README.md` (one-line index entry)
- `docs/cuts/H5-server-implementation-extraction/decisions.md`
- `docs/cuts/H5-server-implementation-extraction/dev-notes-h5-a.md`
- `docs/cuts/H5-server-implementation-extraction/cr-lite-h5-a.md`
- `docs/cuts/H5-server-implementation-extraction/cut-note.md` (on
  closeout)

### Forbidden

- `server/print-renderer.mjs` — keep untouched
- `server/router/index.mjs` — no router shape change
- `server/exports/exportRoutes.mjs` — only the imports change; the
  `defineRoute` calls stay byte-identical (this is essential for the
  byte-equality regression to mean anything)
- Other route owner modules (`server/imports/`, `server/paper-import/`,
  `server/question-bank/`, `server/draft-paper/`, `server/my-space/`,
  `server/search/`) — out of scope
- `app/**` — no UI change
- `data/sql/schema.sql` — no DB schema change
- `schemas/**` — no JSON contract change
- `prompts/**`, `server/prompts/**` — no prompt change
- `app/public/paper-assets/**` — no fixture change to reviewed data
- Any AI-parse code path (`callDeepSeek*`, `saveReadingParseResult`,
  `saveClozeParseResult`, etc.) — out of scope

## 7. Verify Requirements

### Existing scripts (must continue to pass unchanged)

- `node scripts/verify-exam-export.mjs`
- `node scripts/verify-paper-export-flow.mjs`
- `node scripts/verify-paper-export-payload.mjs`
- `node scripts/verify-print-pdf-export-flow.mjs`
- `node scripts/verify-print-renderer.mjs`
- `npm run verify:all --prefix app`
- `node scripts/verify-architecture-housekeeping.mjs`

### New required guard: `scripts/verify-h5a-export-implementation.mjs`

Must be **run-form**, not grep-form. Use
`scripts/lib/verifyScope.mjs`. The script must:

1. Import the extracted module:
   `import { exportDocx, exportPdf, exportPrintHtml, exportPrintPdf } from '../server/exports/exportImplementation.mjs'`
2. For each of the 4 functions, call with a fixed fixture input
   (the Must Fix #2 snapshots above) and assert byte-identical output
   against the stored snapshot.
3. Assert that `server/api.mjs` no longer defines `exportDocx`,
   `exportPdf`, `exportPrintHtml`, `exportPrintPdf` (negative
   grep — this guards against accidental duplication).
4. Assert that `server/exports/exportRoutes.mjs` no longer references
   `context.exportDocx` (or whichever names are moved to direct
   import), proving the seam migration is complete.
5. Register in `scripts/verify-ci.mjs` so it runs in CI.

### What does NOT need verifying in H5-A

- No browser QA (no user-visible behaviour change).
- No app-build behavioural diff (app only consumes export endpoints
  by URL, not by import path).
- No DB or schema regression — none touched.

## 8. Rollback Boundary

H5-A must be a **single PR, single revert**.

Rollback is `git revert <H5-A merge commit>`. The revert must:

- Restore the 7 functions to their original locations in
  `server/api.mjs`.
- Remove the new `server/exports/exportImplementation.mjs`.
- Remove `scripts/verify-h5a-export-implementation.mjs` and its
  `verify-ci.mjs` registry entry.

If the diff cannot fit in one PR while preserving this property,
**stop and re-slice**. Do not split H5-A into H5-A1 / H5-A2. A
multi-PR extraction destroys the single-revert guarantee, which is
the entire justification for picking export as a low-risk first slice.

Expected diff envelope:

- `server/api.mjs`: ~-260 lines (functions out + ~10 lines for import + wiring)
- `server/exports/exportImplementation.mjs`: ~+250 lines
- `server/exports/exportRoutes.mjs`: ~±20 lines (context refs → direct refs)
- `scripts/verify-h5a-export-implementation.mjs`: ~+150 lines new
- `scripts/verify-ci.mjs`: +1 line
- `scripts/README.md`: +1 line
- `docs/cuts/H5-server-implementation-extraction/*.md`: planning
  artefacts

Total: roughly +500 / −280 lines. If the actual diff materially
exceeds this envelope, treat as a signal that H5-A has grown beyond
its sanctioned scope and pause.

## 9. Open PO Decisions

Exactly 2. Both must be resolved before DEV starts.

1. **Is H5-A justified as a pilot for the upcoming AI-parse rewrite?**
   If yes, record the trigger in `decisions.md`. If no, defer H5
   entirely and route Codex to the next product cut.

2. **Where does the extracted module live: `exportImplementation.mjs`
   alongside `exportRoutes.mjs`, or merged into a single
   `exportRoutes.mjs` with internal helpers?**
   Recommendation: separate file, because separation makes the
   byte-equality test target unambiguous and the route module stays
   pure dispatch. But this is a small style call PO can override.

---

```text
Report path: docs/cuts/H5-server-implementation-extraction/claude-review-opus.md
Verdict: APPROVE WITH MUST FIX
Recommended first slice: Export implementation (H5-A)
Must Fix count: 3
Open PO Decisions count: 2
```
