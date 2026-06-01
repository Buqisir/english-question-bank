# PA Review — I14 语法填空解析 render 面 + 入口 gate

Reviewer: 小川 (PA, fresh context). Date: 2026-05-31.
Plan under review: `docs/cuts/I14-grammar-fill-analysis-surface/plan.md`.
Verified against actual code (not plan claims):
`server/paper-import-ai/packageBuilder.mjs` (`normalizeGrammarFillText`),
`server/paper-import-ai/normalizePassageText.mjs` (parse-time Rules 1–5),
`server/search/paperSurfaceAvailability.mjs`,
`app/src/features/paper-intelligence/clozeAnalysisSurfaceAdapter.ts`,
`grammarFillPaperViewAdapter.ts`,
`PaperIntelligencePaperSurfaceHarness.tsx` (state ~222, branches 325–390,
surfaceData ~741, paperAssetAnalysisView ~768, activeEvidenceKind ~799),
and `docs/cuts/I13-grammar-fill-analysis/grammar-fill-analysis-v1.contract.md`.

## Verdict

**APPROVE WITH MUST FIX** — one Must Fix (GATE-1 sentenceId consistency).
Direction, boundary, and data contract are sound. The cut is correctly sliced
(consume-only render + one availability config), mirrors a proven I9 path, and
touches no generation/contract/schema code. GATE-1 and GATE-2 are
contract-blessed. One real rework risk: the GATE-1 locate function can produce
sentenceIds that the rendered textMap does not contain, and the highlight would
silently fail to draw — the exact "fake availability / state drift" class PA
must catch. It is a plan-spec hole, not a redesign, so it folds into one Must Do
bullet + one verifier assertion.

## Product Principle

PaperSurface stays a teacher 讲评 workbench: focus-per-blank, the PO's static
考点框架 (IP) plus the AI's 代入, evidence rows that highlight the passage. No AI
dashboard, no competing panels, no new evidence taxonomy. The framework is
static (anti-hallucination, locked I13). This reduces teacher work (one click →
the blank's reasoning + located evidence) and serves the A4 paper. Correct
posture.

## Exact UX / Architecture Model

- Consume-only: I14 reads the stable I13 `grammar-fill-analysis-v1.json`, adds
  no fields, changes no generation/publish/schema code.
- Client facet framework registry (16 leaf facets, transcribed from the KB) +
  drift guard against `grammar-fill-facets-v1.json` keys. Single source of truth
  for the *teaching IP body* stays in the KB; the registry is a faithful copy
  guarded against key-set drift. Acceptable: the alternative (extend the server
  JSON with framework bodies) would push PO teaching prose into a server
  validation registry, which is worse coupling. The drift guard covers key-set
  divergence; transcription fidelity is a PO-QA spot-check (correctly flagged).
- New adapter mirrors `clozeAnalysisSurfaceAdapter.ts` shape
  (`{report, passageStructures, surfaceData, analysisByQuestionId, groupView,
  defaultQuestionId}`), new panel mirrors `ClozeAnalysisPanel.tsx`, new harness
  state `grammarFillAnalysisModel` mirrors `clozeAnalysisModel`.
- GATE-1: whitespace-tolerant locate self-contained in the new adapter (does not
  touch I9 `findAllTextRanges` or the shared renderer). Confirmed correct in
  direction (see below).
- Availability: one `analysisConfigs` entry; `entryMapKey: 'blanks'`, completeness
  = every group `questionIds` entry present under `analysis.blanks`. Verified the
  mechanism is general (`paperSurfaceAvailability.mjs:67-71` reads
  `analysis[entryMapKey][questionId]` over the asset's own `group.questionIds`,
  no hardcoded q56–q65). Config-only is correct.

GATE-1 whitespace-only claim — independently verified and confirmed:
parse-time `normalizePassageText` already converts full-width punctuation/parens
→ half-width, em-dashes, curly quotes, and inserts space-after-punctuation BEFORE
the AI quotes `signalText`. The publish-time `normalizeGrammarFillText` then, on
already-parse-normalized English signalText regions (no blank markers per
contract line 194, no CJK), nets to whitespace-only divergence (blank-number
double-spacing + 3+space collapse + idempotent space-after-punct). The
non-whitespace rules (`\d{2}` punctuation strip, `\d{2}(` paren spacing, trailing
CJK strip) only fire on blank markers or end-of-passage CJK, never inside a valid
signalText. So the tolerant match is sufficient AND necessary. Direction holds.

## Must Fix Before DEV

### MF-1 — GATE-1 locate must return sentenceIds the rendered textMap actually contains

Concrete risk: the highlight silently fails to draw even when the locate
function "finds" the range. The cross-column evidence line keys off
`PaperTextRange.sentenceId`; the line only draws if that sentenceId exists in the
`surfaceData.textMap` the surface renders. Two precedents build the textMap
DIFFERENTLY:

- cloze (`clozeAnalysisSurfaceAdapter.ts:205-226`) segments **per paragraph** and
  keys sentences `${p.paragraphId}-s${i}`.
- grammar-fill plain (`grammarFillPaperViewAdapter.ts:110-120`) **joins all
  paragraphs with `\n\n`** and runs `segmentPaperText` over the whole blob, taking
  the segmenter's own paragraph/sentence ids.

The plan (Step 1) says the locate function returns ranges "in the stored sentence
text" but never pins WHICH textMap the new analysis adapter builds, nor that the
locate function must search and key against THAT SAME textMap. If the adapter
builds its textMap one way and the locate function its offsets another way (or
reuses the plain-view join while the contract `signalText` was validated against
per-paragraph `normalizePassageText` bytes), sentenceIds mismatch and the GATE-1
highlight resolves to a nonexistent sentence — the I11 silent-fail mode the cut
exists to kill, re-introduced one layer up.

Required disposition: the plan must lock that (a) the new analysis adapter builds
its `surfaceData.textMap` by the **same construction** the locate function
searches over (single chosen method — recommend per-paragraph keying like cloze,
since contract `signalText` is an exact substring of parse-time *per-paragraph*
passage text, not the `\n\n`-joined blob), and (b) the verifier asserts every
located range's `sentenceId` exists in the built `textMap` (not just that an
offset was found). This is a Must Do clarification + one verifier assertion; no
redesign.

## Must Fix -> Plan Disposition Checklist

| Must Fix | Required plan.md disposition |
| --- | --- |
| MF-1 GATE-1 sentenceId consistency | Step 1: add a locked bullet — the analysis adapter's `surfaceData.textMap` and the GATE-1 locate function MUST use one and the same textMap construction (recommend per-paragraph, sentenceId `${paragraphId}-s{i}`, matching the bytes `signalText` was validated against); never reuse the plain-view `\n\n`-join unless the locate searches that exact map. Step 5 / Verification: add an assertion that every located evidence `range.sentenceId` exists in the built `textMap` (prove the line can draw, not only that an offset matched). Add a Browser QA note under the GATE-1 row: confirm the cross-column line actually renders, not just that a range was computed. |

## Should Watch

- **SW-1 Transcription fidelity (16 facets).** The drift guard checks key-set
  equality only; verbatim correctness of the 考点框架 prose vs the KB is a PO-QA
  spot-check. Already flagged in the plan. Do not promote to a machine check this
  cut; just ensure PO QA explicitly eyeballs all 16 (especially the non-finite
  形变表). Non-blocking.
- **SW-2 `paperAssetAnalysisView` memo (harness ~768).** Confirmed: the new model
  must early-return null there (like `clozeAnalysisModel`) BEFORE the
  `paperAssetModel ?? clozeModel ?? grammarFillModel` chain, else an entry could
  be cast to `PaperAssetQuestionAnalysisView`. Plan calls this out; just verify
  the early-return is present in the static harness check. Non-blocking (plan
  already enumerates it).
- **SW-3 Effect dependency arrays.** Plan says update every dep array listing
  `clozeAnalysisModel`. The seed/default-focus effect dep array at ~736 lists
  `clozeAnalysisModel` but NOT `clozeModel`/`grammarFillModel`; DEV must mirror
  exactly the cloze membership (add `grammarFillAnalysisModel` wherever
  `clozeAnalysisModel` appears). Stale-closure focus bug if missed; caught by the
  harness focus unit test. Non-blocking.
- **SW-4 `signalSide: 'stem'`.** Contract allows rare `stem`. Plan says treat like
  passage (locate in passage). Fine; just ensure a stem signalText that is NOT in
  the passage yields zero ranges gracefully (no throw), same as an unlocatable
  passage quote. Non-blocking.
- **SW-5 Multi-occurrence highlight-all.** Inherited I9 rule; grammar-fill carries
  no paragraphId so a short signalText may match unrelated sentences. Accepted,
  deterministic, fixture-covered. Watch only that PO QA does not read an
  over-match as a bug. Non-blocking.

## Allowed Files

- `app/src/features/paper-intelligence/grammarFillFacetRegistry.ts` (new)
- `app/src/features/paper-intelligence/grammarFillAnalysisSurfaceAdapter.ts` (new)
- `app/src/features/paper-intelligence/GrammarFillAnalysisPanel.tsx` (new)
- `app/src/features/paper-intelligence/PaperIntelligencePaperSurfaceHarness.tsx`
- `server/search/paperSurfaceAvailability.mjs` (config entry only)
- `scripts/verify-i14-grammar-fill-analysis-surface.mjs` (new) +
  `scripts/verify-ci.mjs` + `scripts/README.md`
- Panel CSS (reuse/extend cloze panel classes; 阿澈 UI call; NOT
  `shared/papersurface/**`, NOT print/export styling).

## Forbidden Files

- `shared/papersurface/**` (tokens, anchorKeys, types, `segmentPaperText`,
  PaperSurface module, shared blank renderer).
- I13 contract, `prompts/grammar-fill-analysis-v1.md`, `analyzeGrammarFill.mjs`,
  `normalizePassageText.mjs`, `packageBuilder.mjs` (incl. `normalizeGrammarFillText`),
  any generation/publish code.
- `schemas/**`, docxSplitter / grammar-fill group shape (q56–q65).
- I9 `findAllTextRanges`, any cloze/reading/seven-choices adapter/panel.
- The evidence-kind taxonomy (uniform `support`).
- Generated `app/public/paper-assets/**`, `.claude/launch.json`.

## Static Verify Requirements

- Registry: exactly 16 keys == server `grammar-fill-facets-v1.json` keys;
  non-finite has a `table`; every `framework.steps` non-empty.
- Adapter: fixture → model with all 10 blanks; group overview present;
  framework+labelZh resolved per facetKey; role/path only on non-finite; throws
  on schemaVersion/paperId/group-type mismatch and unknown facetKey.
- GATE-1: normalize-divergence fixture (a trigger word adjacent to `  56  ` +
  a 3+space run) where parse-time-validated `signalText` FAILS plain `indexOf`
  but the tolerant match locates it; blank markers never inside a returned range;
  repeated-`signalText` multi-occurrence covered.
- **GATE-1 (MF-1):** every located `range.sentenceId` exists in the built
  `surfaceData.textMap` (the line can actually draw).
- Harness: grammarFill WITH analysis dispatches the new panel; WITHOUT analysis
  renders plain view (I10 fallback intact); questionId focus opens the matching
  blank; the analysis model does not cast through `paperAssetAnalysisView`.
- Availability: complete (10/10) yields `语法解析` href to blank 56; one missing
  hides it; reading/七选五/完形 unchanged.
- `verify-i14` registered in `verify-ci`; `git diff --check`.

## Browser QA Matrix

Plan's matrix is adequate. Add one assertion to the GATE-1 row:

| Case | Expected |
| --- | --- |
| Complete analysis | `语法解析` entry; opens blank 56 card: blankType + hint + 考点框架 + 代入 reason + evidence + teachingNote; overview visible |
| Non-finite blank | role（成分）+ path（快路/慢路）; 形变表 renders |
| Click evidence row | passage highlights `signalText`; cross-column line draws |
| **GATE-1 adjacent-to-blank evidence** | highlight resolves on the normalize-diverged stored passage AND the cross-column line actually renders (not just a computed range) — MF-1 |
| Switch blank | card + highlights update |
| WITHOUT analysis | plain view renders (I10 `  56  ` markers intact); no entry |
| Student version | analysis hidden (Super Teacher boundary) |
| Reading / 七选五 / 完形 | entries + panels unchanged |

## DEV Readiness

Ready after MF-1 is folded. All readiness facts are stated: teacher action
(one-click per-blank 讲评), before/after (plain-only → fetch+fallback analysis
surface), current boundary (render + one availability config, consume-only),
future boundary (no contract/generation/schema change; I10 sentence-initial
limitation explicitly out of scope), allowed/forbidden files, verify scripts, and
QA matrix. Mirror target (I9) is proven. The harness touch-point enumeration
matches the actual cloze wiring I inspected.

## Open PO Decisions

0 blocking. (Entry label `语法解析` final wording is an 阿澈 UI call, not a PO
gate; transcription fidelity is PO QA, not a pre-DEV decision.)

## Self-Review Blind Spots

- I verified the GATE-1 whitespace-only claim by reading both normalization
  passes, but I did NOT run a real published grammar-fill asset through both
  passes on live bytes — the proof is by rule analysis, not execution. Step 6
  browser QA on a real normalize-diverged paper remains load-bearing; if a rule
  I judged "blank-marker-only" fires unexpectedly on real corpus signalText, the
  tolerant match could still miss. Low risk, but it is an analytical, not
  empirical, confirmation.
- I did not deep-read the panel CSS surface; the "reuse/extend cloze classes"
  claim is taken on the plan's word. If the cloze panel classes are tightly
  coupled to cloze-only structure (distractor glosses, affectiveArc), the new
  panel may need more CSS than "reuse" implies — a polish risk, not a boundary
  risk, so left as DEV/阿澈 territory.
- I confirmed the harness touch points exist at the cited lines but did not trace
  every one of the ~9 enumerated edits to completion; I spot-checked state,
  branch, surfaceData, paperAssetAnalysisView, activeEvidenceKind. The dep-array
  membership (SW-3) is the most likely silent miss.
