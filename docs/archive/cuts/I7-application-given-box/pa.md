# I7-application-given-box — PA Review

Reviewer: 小川 (PA hat, fresh cold-read). Date: 2026-05-30.
Cut size per plan: Medium (touches data contract + splitter heuristic + render).

Read for this review: `plan.md`, `agent-entrypoint.md`, ADR 0007,
`docxSplitter.mjs` (`extractApplicationParagraphs` L886, `isWritingStandardLine`
L874, caller L977), `paperAsset.ts` (`PaperWritingTask` L198),
`packageBuilder.mjs` (application emission L533-576, continuation L578-609),
`writingPageModel.mjs` + `.d.ts`/`.d.mts`, `WritingPaperPage.tsx`,
`writingPaperViewAdapter.ts`, `verify-i6-writing-render.mjs`, `verify-i5`,
`verify-paper-asset-v1.mjs`, `validator.mjs` strip path + `paper-asset-v1.schema.json`,
real data `paper-960d0f8d/versions/v1/paper-asset.json`.

---

## Verdict

**APPROVE WITH MUST FIX**

The direction is right and the cut is correctly sliced (parse → contract → render,
each step independently verifiable). The data-contract shape is safe against the
existing validators and consumers — I traced the strip-unknown-fields path and the
schema, and confirmed `applicationGiven` will not be silently dropped (see
Data-contract notes). The render migration is low-regression because I6 already
folds raw starters into `givenLines`; this cut only renames/splits that channel.

The blocking issues are all in **parsing-heuristic robustness** and **verification
adequacy**, not in direction. The "trailing run of整行无 CJK = given" rule is correct
for the 重庆 paper (verified line-by-line) but is under-guarded for the other paper
shapes the importer must already ingest as complete whole papers.

---

## Product Principle

The teacher is reading/printing an A4 mock paper. The given letter skeleton
(`Dear Chris, … Yours, / Li Hua`) belongs *inside* the answer box, top-pinned and
bottom-pinned, because that is where the student writes — not stacked above the box
mixed into the Chinese 情境 prompt. This reduces "is this prompt or is this what I
copy into my answer" confusion and matches the gold reference. The cut serves the
A4 paper; it does not add an AI panel. In scope.

---

## Exact UX / Architecture Model

Confirmed against real data `paper-960d0f8d`:

- 情境 (stays in `passage.paragraphs`, renders in PaperSurface passage slot):
  4 CJK lines (title + (1)/(2)/(2) requirements; inline `(Open Day)` does not
  disqualify the line because it is CJK overall).
- given skeleton (moves to `task.applicationGiven`, renders in answer box):
  `["Dear Chris,", "I’m Li Hua, a student reporter for our school newspaper.",
  "Yours,", "Li Hua"]`.
- closing-word split at `Yours,` → `top = [Dear Chris,, I’m Li Hua…]`,
  `bottom = [Yours,, Li Hua]`. Matches the Browser QA expectation exactly.

Render channel: `buildWritingPageModel` answerBox block changes
`{ label, givenLines }` → `{ label, givenTop, givenBottom }`. Continuation:
`givenTop = continuationStarters` (today's `givenLines`), `givenBottom = []` —
behavior-preserving. Application: `givenTop/givenBottom` from `task.applicationGiven`,
both `[]` when the field is absent.

---

## Must Fix Before DEV

### MF1 — The given-skeleton heuristic has no guardrail against a 情境 that legitimately ends in non-CJK lines; "trailing run of整行无 CJK" can over-capture.

Concrete risks the bare rule misfires on:

1. **English example / note inside the prompt with no given skeleton.** An
   application prompt may end with a parenthetical English note, a word like
   `(120 words)`, a quoted English slogan/motto, or a sample expression line — all
   "整行无 CJK", all *not* a given skeleton. The bare rule would pull them into
   `applicationGiven` and *remove them from the 情境*, corrupting the prompt.
2. **All-English給定 with no closing word that is genuinely a single标题 line**
   vs. a 情境 English line — the rule cannot tell them apart without a positive
   signal.
3. **Bilingual given line** (e.g. a 标题 with a Chinese gloss): a real title line
   containing any CJK would be wrongly *excluded* from the skeleton, splitting one
   logical skeleton across the 情境/box boundary.

Required disposition: add a **positive-signal guardrail**, locked in `plan.md`, so
a trailing non-CJK run is only treated as given when it looks like a letter/title
skeleton, AND cap/anchor it. Minimum acceptable guard (PA-proposed, PO to confirm):
- treat the trailing non-CJK run as `applicationGiven` only if it either (a)
  contains a salutation line (`Dear …` / `To …` / `Hi …`) anywhere in the run, OR
  (b) contains a closing word from the locked list, OR (c) is a single line that
  reads as a title; AND
- when none of these signals is present, fall back to **no `applicationGiven`**
  (empty box, 情境 intact) — the safe default the plan already chose for the
  no-given case.

This converts the rule from "any trailing English = given" (deletes legit prompt
content) to "trailing English that looks like a letter/title = given" (fails safe).
DEV must not ship the bare "末尾整行无 CJK" rule without this guard.

### MF2 — Verification does not cover the over-capture / mis-detection failure modes; the 3 fixtures only prove the happy paths.

The plan's 3 fixtures (信件型 / 标题型 / 无给定) all assume the trailing-English run
*is* given. None proves the dangerous case: a 情境 that ends in a legitimate
non-CJK line must NOT be eaten. The continuation real-DOCX in `verify-i5` is 成都七中,
a *different* paper from the 重庆 one the rule was derived from — so "it works on the
one paper" is the only evidence today.

Required disposition: `plan.md` Verification must add at least these fixtures, and
the splitter verify must assert them:
- **F4 negative-guard**: application content whose last line is a legit English
  note/slogan with no salutation and no closing word → `applicationGiven` NOT set,
  情境 paragraphs unchanged (no removal).
- **F5 salutation-only / no-closing-word letter**: `Dear …` present but no
  `Yours/Sincerely/…` → all of the skeleton goes to `top`, `bottom = []`, and the
  skeleton is still removed from 情境 (proves the salutation positive signal from
  MF1 and the "no closing word but it IS a letter" path).
- Keep the existing assertion that inline `(Open Day)`-style夹注 on a CJK line is
  NOT mistaken for given.

### MF3 — Continuation regression must be pinned by an assertion, not assumed; the I6 verify currently asserts the OLD `givenLines` key.

`verify-i6-writing-render.mjs` L72 / L91 assert `appBox.givenLines.length === 0`
and `contBox.givenLines === STARTERS`. The moment Step 3 renames `givenLines` →
`givenTop`/`givenBottom`, those two assertions go stale/false. The plan says "扩
verify-i6 或新增 verify-i7" but does not state that the renamed keys and the
continuation behavior-preservation must be re-pinned, nor that the stale
`givenLines` assertions must be migrated (not deleted-and-forgotten).

Required disposition: `plan.md` Verification must require that the continuation
case is re-asserted on the new model — `givenTop === continuationStarters`,
`givenBottom === []` — and that the application empty-box case asserts
`givenTop === [] && givenBottom === []`. Also lock that the `.d.ts` AND `.d.mts`
both change in lockstep (two copies exist; a drift between them is a silent type
hole). The starter-instruction-folding path in `writingPageModel.mjs` (the
`b.text === starterText` skip) must remain — continuation starters still arrive
via `task.continuationStarters`, not via a new given field, so that fold is
untouched. State this explicitly so DEV does not "unify" continuation onto
`applicationGiven` (which would be scope creep into Forbidden continuation parsing).

---

## Must Fix -> Plan Disposition Checklist

| PA item | `pa.md` required disposition | `plan.md` handling required | Status |
| --- | --- | --- | --- |
| MF1 | Add positive-signal guardrail to the detection rule (salutation/closing-word/title signal; fail safe to no-given) | Edit **Locked Product Decisions → 检测规则**: trailing non-CJK run is given *only* with a salutation/closing-word/title signal; otherwise no `applicationGiven`. Add a Forbidden line: do not ship bare "末尾整行无 CJK". | open |
| MF2 | Add negative-guard + salutation-only fixtures to splitter verify | Edit **Must Do Step 1 verify** and **Verification**: add F4 (legit trailing English NOT eaten, 情境 intact) and F5 (salutation, no closing word → all top, removed from 情境). | open |
| MF3 | Re-pin continuation no-regression on the renamed model; keep starter fold; `.d.ts`+`.d.mts` lockstep | Edit **Must Do Step 3 / Verification**: assert continuation `givenTop===starters & givenBottom===[]`, app empty `givenTop===[] & givenBottom===[]`; note `givenLines`→`givenTop/Bottom` rename migrates the stale i6 asserts; add Forbidden: do not route continuation through `applicationGiven`. | open |

---

## Should Watch

1. **Single real paper basis.** The rule is validated against exactly one paper
   (重庆巴蜀). The 成都七中 real-DOCX in `verify-i5` exercises continuation, not the
   application given-skeleton split. Once MF1's guard lands, re-run the splitter on
   any other available application DOCX before RM to catch a second-paper surprise.
   Non-blocking because the guard fails safe (no-given) on shapes it can't classify.
2. **`writingTask.instruction` will lose the given lines** (packageBuilder L555
   joins `paragraphs`, and given lines leave `paragraphs`). I grepped consumers:
   `instruction` renders in App.tsx detail copy (L4179) and group section labels —
   none depends on the letter skeleton being present, and the A4 writing view reads
   `passage.paragraphs`, not `instruction`. Acceptable. Watch that no future
   "copy full prompt" feature assumes `instruction` still contains the skeleton.
3. **`para-…-app-title` id semantics.** `extractApplicationParagraphs` names index 0
   `…-title` and the view adapter labels paragraph 0 「标题」. After removing trailing
   given lines, index 0 is still the first 情境 line, so labels stay correct. No
   action; just confirming the id scheme survives removal.
4. **Closing-word list is line-start, case-insensitive.** `Best` alone is broad
   (could match a sentence starting "Best of luck …"). Low risk inside a given
   skeleton, but if MF1's guard is salutation-anchored this is moot. Watch only.

---

## Allowed Files

- `server/paper-import-ai/docxSplitter.mjs` (Step 1 — `extractApplicationParagraphs`
  + helpers; signature → `{ paragraphs, applicationGiven, error }`; caller L977).
- `app/src/domain/paperAsset.ts` (Step 2 — `PaperWritingTask.applicationGiven?`).
- `server/paper-import-ai/packageBuilder.mjs` (Step 2 — write
  `writingTasks[appTaskId].applicationGiven`; passage = 情境 only).
- `app/src/features/paper-intelligence/writingPageModel.mjs` +
  `writingPageModel.d.ts` + `writingPageModel.d.mts` (Step 3 — answerBox model).
- `app/src/features/paper-intelligence/WritingPaperPage.tsx` +
  `writingPaperPage.css` (Step 3 — top/bottom render).
- `scripts/verify-i7-application-given.mjs` (new) or extend
  `verify-i6-writing-render.mjs`; register in `scripts/verify-ci.mjs` + README.

## Forbidden Files

- reading / 七选五 / 完形 / 语法填空 parse + render.
- `shared/papersurface/**`, PaperSurface kernel.
- `extractContinuationContent` (continuation parsing). Render-layer field rename is
  allowed; the continuation **data channel** (`task.continuationStarters`) and its
  instruction-fold must stay as-is. Do NOT route continuation through
  `applicationGiven`.
- export / print path.
- harness reducer / state / data fetch / URL / cross-component sync.

## Static Verify Requirements

- Step 1: splitter verify with **5** fixtures — 信件型(top+bottom), 标题型(top only),
  无给定(field absent, 情境 intact), **F4 legit-trailing-English-not-eaten**,
  **F5 salutation-no-closing-word**; plus 情境-removal and inline-夹注-not-misjudged
  assertions.
- Step 2: `node scripts/verify-ci.mjs` green (includes `verify-paper-asset-v1`,
  `verify-c7-*`, `verify-i5`); app typecheck green. Confirm `verify-i5` real-DOCX
  application assertion (`app.paragraphs.length > 0`) still passes after given
  removal (it will — 成都七中 情境 lines remain).
- Step 3: render-model verify asserts application `givenTop`/`givenBottom` from
  `applicationGiven`, application empty-box `[] / []`, and continuation
  `givenTop === starters && givenBottom === []` (no visual/behavior change).
  Migrate the stale `givenLines` assertions in `verify-i6`.

## Browser QA Matrix

| Case | Expected result |
| --- | --- |
| 重庆应用文（信件型） | 框内：上 `Dear Chris,`+开头句、下 `Yours,`/`Li Hua`、中间留白；情境区不再有这些行 |
| 标题型应用文（page-11 标尺） | 框内：标题贴顶、无下行、留白；情境完整 |
| 无给定的应用文 | 空框（`applicationGiven` 不设）；情境完整未被裁剪 |
| **情境末尾含合法英文行（无称呼/无结束语）** | 该行留在情境，空框；未被误吃 (proves MF1 guard) |
| 读后续写 | 与 I6 一致：两段开头句进框 `givenTop`，视觉不变（回归） |

## DEV Readiness

DEV-ready after MF1–MF3 are recorded in `plan.md`. All seven readiness facts are
stateable: teacher action (read/print A4 with given skeleton in the box), before/after
(skeleton above box mixed in 情境 → inside box top/bottom-pinned), current boundary
(application given only), future boundary (box write-area sizing, ranges/分页, model
answer render all deferred), allowed/forbidden files (above), verify scripts (above),
browser QA (above). Steps are correctly dependency-ordered (1→2→3); Step 1 can start
immediately once MF1's guard is locked.

## Open PO Decisions

1. **MF1 guard policy**: confirm the positive-signal set (salutation `Dear/To/Hi…`,
   closing-word list, single-line title) and the fail-safe (no-given) for
   unclassifiable trailing English. (1 decision — within the ≤3 limit.)

No other open PO decisions. Verdict stands at APPROVE WITH MUST FIX.
