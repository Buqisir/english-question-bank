# PA Review — I9 完形填空解析 render 面 + 入口 gate

Reviewer: PA (independent, fresh context). Branch `i9-cloze-analysis-surface`,
HEAD `9c0a2de`. Verified against the real code, not the plan's claims.

## Verdict

**APPROVE WITH MUST FIX.**

The direction is right and the cut is correctly scoped (render + entry gate, no
schema/I8/contract change, no `shared/papersurface/**` change). The teacher task
is clear and the reuse story is real — every machinery the plan names exists and
mostly fits. But two blockers are hidden by the plan's wording: the availability
gate as described will **never** mark a cloze analysis complete (the shared
completeness check is hard-coded to the wrong key), and the harness cloze branch
**short-circuits before any analysis fetch**, so "upgrade clozePaperViewAdapter"
is not enough — the harness load path itself must be restructured and several
harness branches (`activeEvidenceKind`, the seed effect, the focus-intent
handler) are paper-asset-shaped and will not see a cloze analysis model. Three
more items must be locked as decisions, not left to DEV.

## Product Principle

The teacher is doing focus-per-blank 讲评 of 完形填空: for one blank, why the
answer fits, what each distractor means, and where in the passage the proof
lives. This reduces teacher work (no manual re-explanation) and keeps the A4
paper primary — the passage stays the surface, one blank's card is the single
active explanation. It does not turn PaperSurface into an AI dashboard: no
scores, no competing panels, one card per blank. This belongs in the current
product stage (I8 already ships the reviewed JSON; I9 is the consume side).

## Exact UX / Architecture Model

- **Before:** a cloze group in PaperSurface renders the I3 plain paper view
  (`buildClozePaperView`), right pad empty of analysis; no `完形解析` entry on
  the group card.
- **After:** when a complete `cloze-analysis-v1.json` exists, the cloze group
  card shows a `完形解析` entry → PaperSurface opens with blank 41 focused; the
  right pad shows one blank's card (pos + optional signature, correctFit.reason,
  distractor glosses, evidence rows, teachingNote) + group overview/affectiveArc;
  clicking an evidence row highlights its `signalText` in the passage via the
  existing `data-paper-evidence-id` + cross-column `PaperIntelligenceEvidenceLine`
  path (the **paper-asset** highlight machinery, NOT the seven-choices overlay);
  option-side evidence (phrase blanks) is highlighted **inside the rendered
  option text in the card** via a panel-internal `<mark>` (mirroring the existing
  `renderOptionTextWithSignals` in `SevenChoicesAnalysisPanel.tsx`), not in the
  passage. When no analysis exists, the I3 plain view still renders and no entry
  shows.
- **Highlight kind:** all 5 evidence types collapse to ONE PaperEvidence `kind`.
  `PaperEvidence.kind` already accepts `'support' | 'trap' | 'context'`
  (`shared/papersurface/types.d.ts:402`) so no taxonomy change is needed.

## Must Fix Before DEV

### MF-1 — Availability gate is keyed to the wrong field; cloze will never gate true

`server/search/paperSurfaceAvailability.mjs:56-59` hard-codes the completeness
check as `Boolean(analysis?.questions?.[questionId])`. Cloze analysis keys its
per-blank entries under **`blanks`**, not `questions` (contract §Top-Level Shape;
confirmed in `scripts/verify-i8-cloze-analysis.mjs:145,191`). A plain mirror of
the seven-choices config into `analysisConfigs` (as Step 4 describes) will pass
`groupType: 'cloze'` and `targetGroups`, then check `analysis.questions[qid]`,
find nothing, and **always hide the entry**. There is no second completeness
branch (grep confirms `analysis?.questions` is the only one).

Risk: silent fake-unavailability — the feature renders nothing in production and
no error fires; Step 6 browser QA would catch it late, after build.

Required disposition: `plan.md` Step 4 must record that
`addAvailabilityForAnalysis` is made config-aware — add a per-config
`entryMapKey` (`'questions'` for reading/seven-choices, `'blanks'` for cloze) and
read `analysis?.[config.entryMapKey]?.[questionId]`. The verifier (Step 5) must
assert a complete cloze analysis yields a `完形解析` href AND that an analysis
missing one blank hides it — using the **blanks** key, with reading/seven-choices
unchanged.

### MF-2 — Harness cloze branch short-circuits before fetching analysis; the I3 fallback path must be restructured, not just "upgraded"

`PaperIntelligencePaperSurfaceHarness.tsx:317-329` currently returns the plain
`buildClozePaperView` model immediately for any `groupType === 'cloze'`, before
the analysis-fetch block (L361-413) is ever reached. Step 3's "fetch the analysis;
if present build the model, else fall back to plain view" therefore requires
rewriting this branch to: (a) attempt `analyses/cloze-analysis-v1.json`,
(b) on ok+valid, build the cloze analysis model, (c) on absent/invalid, fall back
to `buildClozePaperView`. The plan's "upgrade the adapter" framing understates
that the **harness load effect** is the file that gates the fallback.

Additionally, three harness branches are paper-asset/seven-choices-shaped and
will not handle a cloze analysis model as written:

- `activeEvidenceKind` (L736-748): L738 returns `null` whenever `clozeModel` is
  set, and L742-746 reads `analysisView.distractors/supportEvidenceId` (the
  legacy shape). A cloze analysis model needs its own branch returning the
  uniform kind (e.g. `'support'`) when `activeEvidenceId` resolves, or the
  cross-column line draws with no kind.
- the seed effect (L757-781) seeds `paperAssetAnalysisView?.supportEvidenceId`;
  for cloze this is undefined, so no default evidence is seeded on blank focus.
- the focus-intent handler (L799-803) casts the entry to
  `PaperAssetQuestionAnalysisView` and reads `.supportEvidenceId`; a cloze view
  shape will not satisfy this.

Risk: the plan reads as a clean "dispatch a panel" add, but it is a multi-point
harness integration. If DEV treats it as adapter-only, the fallback breaks or the
highlight/line never activates.

Required disposition: `plan.md` Step 3 must enumerate the harness touch points:
(1) restructure the cloze load branch to fetch-then-fallback; (2) add a cloze
branch to `activeEvidenceKind`; (3) add cloze handling to the seed effect and the
focus-intent handler (or document why the cloze model deliberately reuses the
same `analysisByQuestionId` shape with `supportEvidenceId`). The verifier (Step 5)
must assert: cloze group with analysis dispatches the cloze panel; cloze group
without analysis renders the plain view (fallback intact); questionId focus opens
the matching blank and seeds an active evidence id.

### MF-3 — Three under-specified decisions must be locked, not left to DEV

The plan defers product/contract decisions DEV must not invent:

1. **Uniform kind choice.** The plan says "e.g. `context` or `support`." These
   are not equivalent: PaperSurface paints `context` and `support` with
   different inline styles, and the cross-column `EvidenceLine`'s
   `activeEvidenceKind` prop only accepts `'support' | 'trap' | null`
   (`preview/paperIntelligenceEvidenceLine.tsx:120`) — passing `'context'` falls
   back to the green default with no `pi-line-path--*` class. Lock **`support`**
   for both the PaperEvidence kind and the line kind so the inline mark and the
   line palette agree. (If the PO wants a distinct cloze color, that is deferred
   polish and out of scope here.)

2. **Option-side evidence treatment.** The plan says "decide one consistent
   treatment; document it." There is a precedent —
   `SevenChoicesAnalysisPanel.tsx:233-262 renderOptionTextWithSignals` does
   exactly this (panel-internal `<mark>` over the matched substring inside the
   option string). Lock: option-side evidence renders as an in-card `<mark>` over
   the matched `signalText` inside the rendered option text; it does NOT produce
   a passage `data-paper-evidence-id` and does NOT drive the cross-column line.

3. **Multi-occurrence / unscoped evidence range.** Cloze evidence has no
   paragraphId (contract: cloze is one continuous passage, no paragraph
   anchoring). The seven-choices/paper-asset locators disambiguate by paragraphId;
   cloze cannot. `findAllTextRanges` highlights ALL occurrences of a short
   `signalText` across the whole passage, so a 1-2 word `signalText` (the
   contract permits 1-8 words) can highlight in unrelated sentences. Lock the
   intended behavior — highlight all occurrences (acceptable for a teaching cue)
   OR first-occurrence only — and have the verifier exercise a fixture where the
   same short `signalText` appears twice.

Risk: each of these, left open, produces visible rework or inconsistent highlight
behavior found only in browser QA.

Required disposition: add all three to `plan.md` Locked Decisions and reflect (1)
and (3) in the Step 5 verifier assertions; reflect (2) in Step 2's panel standard.

## Must Fix -> Plan Disposition Checklist

| Must Fix | Required `plan.md` disposition |
| --- | --- |
| MF-1 | Step 4: record `addAvailabilityForAnalysis` becomes config-aware via per-config `entryMapKey` (`blanks` for cloze); Step 5 verifier asserts complete-vs-incomplete using the `blanks` key, reading/seven-choices unchanged. |
| MF-2 | Step 3: enumerate harness touch points — restructure cloze load branch (fetch→fallback), add cloze branch to `activeEvidenceKind`, handle cloze in seed effect + focus-intent handler; Step 5 verifier asserts dispatch, fallback intact, focus seeds evidence. |
| MF-3 | Locked Decisions: (1) uniform kind = `support` (evidence + line); (2) option-side = in-card `<mark>` mirroring `renderOptionTextWithSignals`, no passage anchor; (3) multi-occurrence rule chosen + verifier fixture. Reflect (1)(3) in Step 5, (2) in Step 2. |

## Should Watch

- **Verifier should run as a real Node module test, not source-string grep.** The
  seven-choices availability verifier (`verify-i0e`) calls the real
  `createPaperSurfaceAnalysisAvailability` against fixtures. Step 5 should do the
  same for the cloze gate so MF-1's `blanks` keying is proven behaviorally, not
  by `availabilitySource.includes(...)`. Non-blocking but strongly preferred.
- **Group overview/affectiveArc placement.** Plan says "pad header or left rail."
  The left rail today hosts the insight-chip / passage-structure detail
  (harness L1009-1041, 1092-1109). Putting cloze overview in the pad header is
  the lower-risk choice (no rail interaction). Not a blocker, but if DEV reaches
  for the rail, watch for collision with the insight-chip machinery.
- **Adapter location.** Adding a new `clozeAnalysisSurfaceAdapter.ts` (mirroring
  `sevenChoicesSurfaceAdapter.ts`) is cleaner than overloading
  `clozePaperViewAdapter.ts`, since the plain-view builder must remain intact as
  the fallback. Either is acceptable; flagging so DEV does not entangle them.
- **`__41__` inside an evidence range.** Confirmed safe: real cloze passages use
  inline `__41__` tokens (verified in `paper-960d0f8d`), the contract forbids
  markers inside `signalText`, and `segmentPaperText` keeps the marker within a
  sentence. The Step 1 "marker never inside a range" assertion is appropriate as
  a guard; not a blocker.

## Allowed Files

- `app/src/features/paper-intelligence/clozePaperViewAdapter.ts` (keep plain-view
  builder intact) or new `clozeAnalysisSurfaceAdapter.ts`
- `app/src/features/paper-intelligence/ClozeAnalysisPanel.tsx` (new)
- `app/src/features/paper-intelligence/PaperIntelligencePaperSurfaceHarness.tsx`
  (load branch, `activeEvidenceKind`, seed effect, focus-intent handler, right-pad
  dispatch)
- `server/search/paperSurfaceAvailability.mjs` (config-aware completeness)
- `scripts/verify-i9-cloze-analysis-surface.mjs` (new) + `scripts/verify-ci.mjs`
  + `scripts/README.md`
- CSS for the cloze panel / option `<mark>` (scoped, alongside the new panel)

## Forbidden Files

- `shared/papersurface/**` (tokens, anchorKeys, types, segmentPaperText, the
  PaperSurface module) — confirmed unnecessary; `kind: 'support'` already exists.
- I8 generation/contract: `prompts/cloze-analysis-v1.md`, `analyzeCloze.mjs`,
  `docs/cuts/I8-cloze-analysis/cloze-analysis-v1.contract.md`, any `schemas/**`.
- `app/src/concierge/ConciergeGroupCard.tsx` and `server/api.mjs` serialization
  (L1200-1202, 1291-1293) — generic passthrough; no change needed once
  availability emits a cloze entry.
- The seven-choices / reading panels and `useSevenChoicesPaperHighlights.ts`.
- Do not commit generated `app/public/paper-assets/**`.

## Static Verify Requirements

- Adapter: maps a fixture `cloze-analysis-v1` (15 blanks under `blanks`) into the
  model; every required field present; passage-side evidence ranges located via
  `signalText`; a blank marker never falls inside a located range; group
  overview + affectiveArc present.
- Multi-occurrence fixture (MF-3.3): a short `signalText` present twice resolves
  per the locked rule.
- Option-side fixture (MF-3.2): a phrase blank with `signalSide: 'option'`
  produces an in-card mark, not a passage range.
- Panel: renders correctFit, every distractor gloss, every evidence row (with
  `data-pi-evidence-id` / `data-pi-question-id`), pos/signature header,
  teachingNote.
- Harness: cloze+analysis dispatches the cloze panel; cloze-without-analysis
  renders the plain view; questionId focus opens the matching blank and seeds an
  active evidence id; `activeEvidenceKind` resolves to the uniform kind for cloze.
- Availability (behavioral, real module): complete cloze → `完形解析` href
  targeting blank 41; incomplete/missing → no entry; reading/七选五 unchanged.
- `node scripts/verify-i9-cloze-analysis-surface.mjs` green and registered in
  `verify-ci.mjs`; `node scripts/verify-i8-cloze-analysis.mjs` and
  `verify-paper-intelligence-paper-surface-harness.mjs` still green;
  `git diff --check`; `npm run build --prefix app`.

## Browser QA Matrix

The plan's matrix (plan.md L173-182) is adequate. Add two cases tied to the Must
Fix items:

| Case | Expected |
| --- | --- |
| Complete cloze analysis | `完形解析` entry shows (MF-1); opens blank 41 card with pos/signature, correctFit, glosses, evidence, teachingNote; group overview visible |
| Click an evidence row | passage highlights the `signalText`; cross-column line draws with the uniform (`support`) palette (MF-3.1) |
| Switch focused blank | card + highlights update to the new blank; new blank's support evidence seeded (MF-2 seed) |
| Phrase blank, option-side evidence | matched substring highlighted **inside the option text in the card**, not the passage (MF-3.2) |
| Cloze group WITHOUT analysis | plain cloze paper view still renders (I3 fallback intact, MF-2); no `完形解析` entry |
| Short `signalText` appearing twice | highlights per the locked rule (MF-3.3) |
| Reading / 七选五 groups | entries + panels unchanged |

## DEV Readiness

Conditionally ready. With MF-1, MF-2, MF-3 folded into `plan.md`, all DEV-readiness
elements are statable: teacher action (focus-per-blank 讲评), before/after, cut
boundary, future boundary (colored type-differentiation deferred), allowed/
forbidden files, verify assertions, browser QA. Do not hand to DEV until the three
Must Fix dispositions are recorded — MF-1 and MF-2 in particular are silent-failure
paths the adapter-only framing would miss.

## Open PO Decisions

None blocking. MF-3's three items are PA-recommended locks, not PO questions
(precedent + type constraints make the right choice clear). If the PO wants a
distinct cloze highlight color instead of reusing `support`, that is a deferred
polish cut, not in scope. (0 of 3 budget used.)
