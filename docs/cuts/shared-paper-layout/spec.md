# Shared paper layout

## Current pagination decision — standard reflow, not facsimile

The latest Owner decision is recorded in `docs/product/exam-paper-format-standards.md`
§3b. Both eight-page editions prioritize complete groups; grammar and application
normally share. A long A is a local exception, not permission to abandon later
group rhythm. Normal eight-page papers keep a compact cover; listening-excluded
eight-page papers omit generic cover chrome based on the source Consumption's
Listening selection (including when those groups were already unselected).
Ten pages prefer protected natural flow, not the all-group-start seed.
Body geometry, fonts, source text, ordinary Print/Screen and preview cache stay fixed.

`fixedPagePdfPlanner.mjs` now ranks meaningful group splits for eight pages,
tries the grammar/application-sharing seed and its local merges before an
exact-page natural state can exhaust the search budget, and prefers fewer
forced breaks for equal quality. It protects listening chrome and seven-choice
option banks in derived PDF CSS. Both selected and rendered group sequences
must be complete, ordered, and same-source before fixed export.

Earlier pagination/cover reports below are chronological evidence, not the
latest product policy. No Ship or production mutation is authorized by this record.

### Current reflow verification (2026-09-10)

- Owner clarified the operating model: bounded automatic pagination followed by
  pre-publication Owner QA; do not expand search complexity merely to solve
  every outlier. Prioritize low-cost, per-paper agent correction and resubmission.
  Existing Review issues already carry revision, surface, page and semantic
  anchors, and `review.mjs status/reply/push --resolves` closes the feedback loop.
  **Missing, not implemented:** Review PDF still uses direct Chromium printing,
  not friendly8/friendly10; no revision-bound per-paper pagination plan is
  preserved through promotion. Required bridge is exact-edition preview plus
  a narrowly validated presentation plan and local render/evidence command,
  reusing Review revisions rather than inventing another approval system.
- Both real nine-group variants render exactly eight pages with every normalized
  group text and the decoded A figure retained. Special eight: A1–2, B2, C3,
  D4, seven5, cloze6, grammar/application7, continuation8. Normal eight retains
  the compact cover and has additional local B2–3 and cloze5–6 fragments.
  Both eight-page contact sheets were visually inspected for clipping/overlap.
  Evidence: `.amp/in/artifacts/friendly-reflow/{normal8,special8}/`.
- Focused planner, real bank pagination, and visible export-warning tests pass.
  Real bank testing distinguishes protected `[2]` from relaxed `[1,2]` pages,
  and rejects an oversized individual option. Paged removes source style tags;
  fixed-export validation therefore receives its mode from input HTML, not
  from a post-pagination style query. Independent focused review found no blocker.
- Ten-page whole-bank relaxation is tried only after protected profiles fail;
  actual split-bank and cross-face counts are returned to the download message.
  The shared 24-render budget reserves remaining profiles without limiting the
  first natural search to four renders.
- **Ten-page real-paper QA remains unclosed:** the full long-A/listening local
  composition has not reached ten pages within the bound (natural result 11).
  The short listening harness now passes exact ten in 18 renders after skipping
  redundant starts already on a separate page; this is not real-paper QA.
  The long-A failure does not prove mathematical impossibility or count as a
  successful ten-page deliverable. Do not alter source text or shrink body
  typography to manufacture a pass. The composition is local QA, not an import
  approval or publication. Diagnostics remain in `friendly-reflow/normal10`.
- `pnpm -C app verify:all`: 172 PASS / 1 SKIP / 0 FAIL; the skipped external
  i16a teaching-dimension fixture is absent. Focused planner tests were rerun
  after the final search-only adjustment. No push, merge, or deployment.

## Owner outcome

Screen scrolls continuously; Print and PDF paginate. All three use the same
paper typography and layout rules, so correcting one shared rule improves
every consumer. Finish the complete scope below before returning to Ship.
The Owner paused Ship after the initial reading CSS extraction.

## Scope and acceptance

1. Share the actual paper layout implementation, not only numeric tokens.
   Cover Reading, Seven Choices, Cloze, Grammar Fill, Application Writing,
   Continuation Writing, and the currently supported Listening projection.
   Screen interaction and paper pagination remain surface responsibilities.
   Existing source-measured figure-option layout remains authoritative.
2. Use the same licensed font files in Screen and Print/PDF. Wait for fonts
   before layout/pagination and validate real font loading. Do not copy system
   Times New Roman or Songti files without redistribution rights.
3. Separate renderer evolution from immutable paper content. A compatible
   styling correction must not require reimport or renewed semantic approval.
   Keep historical source, confirmation, semantic digests and saved PDFs intact.
   Preserve explicit compatibility checks rather than bypassing authority.
4. Exercise real production consumers with representative question families,
   long/wrapped options, tables/figures, optional material, Student/Teacher,
   Screen width changes and Print/PDF page boundaries. Shared-rule mutation
   checks must demonstrate that consumer-local overrides cannot silently
   defeat a common correction. Verify content/answer visibility separately.

## Boundary evidence

- `PaperSurface.css` and `print-renderer.mjs` still own parallel layout rules;
  writing also uses `writingPaperPage.css`.
- Text A-D `layoutPlan` is derived in `consumerProjection.mjs` and excluded
  from the semantic signature. It is a useful renderer boundary, not a reason
  to mutate published Question Groups.
- `abcdLayout.mjs` binds a plan to typography/metrics; this compatibility check
  must be replaced deliberately if renderer ownership changes, not removed.
- Existing immutable typography/rhythm artifacts and manifests are historical
  evidence; do not edit them in place to make a new renderer pass validation.
- `paginationRenderer.mjs` already generates paginated HTML and PDF from the
  same Chromium page. Retain this pipeline.

## Status

Shared layout implementation is now extracted on `refactor/shared-reading-layout`,
not shipped. `readingLayout.css` owns Reading passage/table/figure/framed-column
rules; `paperLayout.css` owns the other passage rhythms, option banks, A–D modes,
Cloze cells, Listening grid, headings and writing response structure. Screen
consumers import these files; Print embeds them before the same-page Paged.js/PDF
pipeline. Local styles retain surface calibration, interaction, responsive chrome
and physical pagination; source-measured option placement remains authoritative.

The initial extraction was not the end of the Owner's formatting request.
The universal-rule follow-up below supersedes its historical empty-continuation
description. No claim is made that unstructured old application givens have
been source-corrected, or that every historical raw legacy fallback was migrated.

Owner decision (2026-09-08): use TeX Gyre Termes 2.609 for English and Source
Han Serif CN 2.003 for Chinese across Screen, Print and server PDF. Do not
prefer locally installed Times New Roman, SimSun or Songti. Owner QA and
automated verification use this same pair. Continuous screen scrolling versus
physical print pagination remains intentional. The Owner accepts a shared-font
calibration, not a promise to preserve every proprietary-font line break.

The original font files, upstream copyright/license documents, download
provenance and integrity checks are retained in `app/public/fonts/paper/`.
This asset archive is a prerequisite, not evidence that every production
consumer has migrated. Preserve the historical typography/metrics authority
until its explicit successor and real-consumer verification are complete.

## Verification boundary

### Runtime font migration (implemented, not shipped)

All role tokens and section-heading runtime now select the pinned pair.
`PaperFontGate` mounts geometry consumers only after six hash-checked faces
load; failure produces an explicit error instead of OS-font layout. Print
HTML embeds the identical bytes and the existing same-page PDF pipeline waits
for fonts before pagination. Full OTF embedding adds roughly 32 MB to standalone
HTML; network/production latency remains to be measured, not claimed improved.

Option metrics have an explicit renderer-only successor, generated from the
bundled regular faces with fonttools 4.59.2. Shared CSS disables shaping features
not represented by that advance model. Old plans fail digest compatibility;
fresh projections regenerate plans without touching semantic publications.
The format-standards index records this narrow font-policy precedence; no
historical authority artifact is rewritten. This font migration does not claim
the remaining duplicated layout CSS has already been extracted.

Focused verification (2026-09-08):

- PASS `python3 scripts/generate-paper-font-metrics.py --check` and
  `node scripts/verify-paper-font-assets.mjs`: original hashes, six real faces,
  and failure before pagination/PDF when an unused declared face is broken.
- PASS `node scripts/verify-paper-canonical-abcd-layout.mjs --actual-artifacts`:
  option placement, wrap/boundary cases and physical PDF coordinates with the
  bundled pair, without resolving proprietary host fonts.
- PASS `node scripts/verify-ticket-31-canary-whole-paper-export.mjs --actual-artifacts`:
  four existing Publications, 33 total groups, Screen at 1280/390px and eight
  Student/Teacher Paged.js PDFs. CDP inspects actual glyph providers; damaged
  font responses produce the error state and zero mounted paper content.
- PASS `node scripts/verify-universal-nck1-publish.mjs`: active Listening
  whole-paper/detail Screen, 20 questions / 60 options, Student/Teacher Print
  font providers and PDF output; no student transcript/answer leakage.
- PASS focused foundation, Cloze/Grammar consumption and framed-column rendered
  checks; the initial paper-pack SSR/declaration/pagination failures were fixed.
- Independent Standards/Spec review: no blocking findings. Its suggested
  negative font-load pagination check was added and passed.
- Final `pnpm -C app verify:all`: 169 PASS / 1 SKIP / 3 FAIL, 1276.6s;
  build/TypeScript passed. The three failures are the same pre-existing local
  data failures listed below; the skip still lacks the external fixture.
  All migration-induced failures from the earlier paper pack are resolved.
  Complete changed-path classification is `unknown-fallback` / pack `all`
  (new font/archive/metrics paths); no narrower Ship claim is made.
  `git diff --check` and staged diff check pass; historical `standards/` and
  `test-fixtures/` files are unchanged. No commit, push, merge or deployment.

Owner QA is prepared on the managed `font-migration-qa` service (5194):
[whole-paper QA](https://t-03gttyx2w33plfb65i28vq1rf-p20104.onamp.dev/canonical-consumption-qa.html?paperId=paper-960d0f8d).
Worktree `/home/user/workspace/repo`, branch `refactor/shared-reading-layout`,
uncommitted candidate based on `5458e8c7f01d6e547d9d632d0d76fb0266641d23`.
Real clicks into Writing and back to Reading worked; six faces were loaded,
nine groups were present, and the browser reported no runtime errors.
Representative inspected Screen, narrow Screen, Writing and Listening images
and Student/Teacher PDFs are in `.amp/in/artifacts/font-migration/`.
Owner checks: judge the selected Chinese/English pairing across reading and
writing, then compare the supplied Student PDF. Owner acceptance remains open.

### Completed layout extraction (2026-09-09, verification below)

Consumer-local copies of shared structure have been removed rather than covered
by a second overlay. Runtime CSSOM mutation tests edit the loaded shared rules
without adding priority overrides, then inspect real Screen, Print and Paged.js
computed styles. The first immutable canary requires ten layout roles across all
non-Listening families; the self-contained active Listening fixture requires its
grid role. The prior Reading framed-columns mutation test remains in place.

The empty Continuation response box now moves intact at a page boundary; tests
assert every resulting writing box lies inside its page area. This intentionally
can add a page instead of clipping writable space. Narrow-screen navigation clears
the desktop centering transform; real geometry checks require it below the header
and within the viewport. The source prompt's repeated item (2) remains unchanged.

Independent review found one overly broad group-spacing selector; it was narrowed
to Seven Choices/Cloze/Grammar Fill, preserving Reading/Listening spacing. Flow
spacing assertions run before pagination because Paged.js resets split-fragment
margins by design. Automated source/authority checks are not relaxed: inactive
Listening checks ignore shared CSS only, still checking all emitted content and
attributes for forbidden occurrences.

Final layout verification:

- PASS `node scripts/verify-ticket-31-canary-whole-paper-export.mjs --actual-artifacts`:
  four immutable papers / 33 groups, ten required shared-rule mutations on the
  complete first paper in Screen/Print/Paged.js, eight Student/Teacher PDFs,
  every writing box inside its page, 390px rail below header and inside viewport.
- PASS `LISTENING_QA_ARTIFACT_DIR=.amp/in/artifacts/font-migration/listening node scripts/verify-universal-nck1-publish.mjs`:
  active Listening shared grid mutation in Screen/Print/production Paged.js,
  20 questions / 60 options, two PDF versions, Student answer/transcript isolation.
- PASS `python3 scripts/generate-paper-font-metrics.py --check` and
  `node scripts/verify-paper-font-assets.mjs`: reproducible metrics, original
  font/license integrity, six loaded faces, broken-font failure before pagination.
- FAIL `pnpm -C app verify:paper`: 89 PASS / 0 SKIP / 2 FAIL, 944.4s.
  Only `verify-paper-assets-consistency` and `verify-genre-truth` fail, matching
  the previously recorded local database fixture mismatches.
- FAIL `pnpm -C app verify:all`: 168 PASS / 1 SKIP / 4 FAIL, 1217.5s.
  Three failures are the prior local-data mismatches (`verify-similar-v2`,
  `verify-paper-assets-consistency`, `verify-genre-truth`). The external
  `verify-i16a-teaching-dimension-search` fixture remains missing, so SKIP is
  not PASS. The fourth failure was the old `verify-lecture-panel-css` scanner
  ignoring styles imported from outside `app/src`.
- PASS `node scripts/verify-lecture-panel-css.mjs` after its test-only fix:
  it follows actual relative CSS imports, without an added allowlist. An
  in-memory negative control removing the shared continuation-row selector
  correctly fails. No renderer changed after the full run; the full suite was
  not repeated after this scanner-only fix. Do not report the full run as green.
- PASS independent Standards/Spec review follow-up: group-spacing finding resolved.
- PASS `git diff --check`, staged diff check, and Impeccable detector (`[]`).
  Complete 50-path machine classification: `unknown-fallback`, pack `all`.

Visual QA has inspected desktop Reading, full Application response, narrow
navigation, the final Continuation PDF box and production Listening PDF. No
overlap or page-edge clipping was observed. The legacy Continuation fixture's
starters remain in preceding question text; its answer rectangle is deliberately
empty. Viewport-edge continuation of a scrolling passage is intentional.
Owner acceptance is still open; Ship remains paused.

Use focused real-consumer checks during implementation, then the repository's
shared-renderer final gates and one independent Standards/Spec review of the
complete candidate. Do not change local database contents to make unrelated
checks pass. The first extraction's full run had three local-data failures
(`verify-similar-v2`, `verify-paper-assets-consistency`, `verify-genre-truth`)
and one missing external-fixture skip (`verify-i16a-teaching-dimension-search`).

### Universal-rule follow-up (2026-09-09, not shipped)

Renderer-only manifest v53 selects Screen v41 / Print-PDF v42. Import/publish
still select v52; accepted v36 and immutable publication/source/confirmation
closures are unchanged. The shared continuation presentation function partitions
exactly two validated source starter refs into the response for current
consumers, without changing the signed semantic projection. Historical consumer
refs preserve placement. Missing/abnormal refs and opaque application sources
without explicit given roles remain unguessed and are not newly blocked.
The June 2022 Zhejiang source fixture contains three refs, including a repeated
starter; this is evidence for source correction, not permission to deduplicate.

Common CSS owns writing title/closing alignment (local Screen copies removed),
long heading/cell wrapping, and figure aspect-preserving printable-height fit
including captions. Production Paged rendering validates actual atomic boxes,
fragments and descendant horizontal/vertical bounds before returning HTML/PDF.
Oversized frames, starters or captions produce `PAPER_LAYOUT_OVERFLOW`, not a
silently cropped artifact. It does not claim every arbitrary input can fit a
fixed physical answer rectangle.

Current checks:

- PASS `node scripts/generate-paper-presentation-authority.mjs --check`.
- PASS `node scripts/verify-paper-canonical-legacy-opaque-writing-rendered-behavior.mjs --actual-artifacts`:
  historical/current application + two-ref/three-ref continuation fixtures,
  explicit historical consumer preservation, bad consumer digest rejection,
  unchanged semantic object, real Screen, Print and six production Paged PDFs
  retaining all source text. The generator check runs inside this verifier.
- PASS `node scripts/verify-paper-canonical-framed-columns-rendered.mjs --actual-artifacts`:
  long heading, long unbroken cell, tall 1:6 image with caption, rejection of
  oversized single-paragraph frame, starter and caption.
- PASS `node scripts/verify-ticket-31-canary-whole-paper-export.mjs --actual-artifacts`:
  four immutable papers / 33 groups / eight Student-Teacher production PDFs;
  shared-rule mutations, page bounds, font identity and Student answer isolation.
- FAIL `pnpm -C app verify:paper`: 89 PASS / 0 SKIP / 2 FAIL, 978.8s;
  `verify-paper-assets-consistency` and `verify-genre-truth` retain the recorded
  local data failures. The descendant-bound refinement landed during this run;
  its targeted regression and canaries above were rerun afterward.
- Independent Standards/Spec review found missing migration/index documentation
  and incomplete vertical descendant overflow checks. Both were fixed; focused
  independent follow-up found no remaining failure and reran writing checks PASS.
- FAIL `pnpm -C app verify:all`: 169 PASS / 1 SKIP / 3 FAIL, 1349.8s.
  Build/typecheck and changed renderer checks passed. Remaining failures are
  the recorded local-data mismatches: `verify-similar-v2`,
  `verify-paper-assets-consistency`, and `verify-genre-truth`. The external
  `verify-i16a-teaching-dimension-search` fixture is unavailable (SKIP, not PASS).
  No source code changed after this run began; only this verification record
  was reconciled. The complete suite is not green.
- PASS `python3 scripts/generate-paper-font-metrics.py --check` and
  `node scripts/verify-paper-font-assets.mjs`: original font/license checksums,
  reproducible metrics, six real faces on Screen/Print/Paged PDF, broken-font
  rejection before output.
- PASS staged and unstaged `git diff --check`. Complete 62-path classifier
  result: `unknown-fallback`, pack `all`; no narrower risk or Ship claim.

Inspected artifacts: `.amp/in/artifacts/font-migration/universal-writing/`.
Screen and full Paged continuation screenshots show both starters inside one
intact box; stress pages show wrapped heading/cell, image bottom and caption.
The first Paged viewport capture was incomplete, so it was replaced with an
inspected complete-page capture. Large blank space between starters is writable
space, not missing content. At 390px Chromium width, document scrollWidth is
390; directory bounds are x=12..378, y=131, below header bottom y=99. This is
browser narrow-width QA, not a real mobile-device claim.

QA Ready: yes. Managed `font-migration-qa` was restarted with this candidate,
using copied immutable fixture data, no login or production writes. Exact
[whole-paper page](https://t-03gttyx2w33plfb65i28vq1rf-p20104.onamp.dev/canonical-consumption-qa.html?paperId=paper-960d0f8d)
opens at Reading; clicking Writing / second section reaches the two-starter
response. Six pinned faces loaded. Owner checks the writing layout and chosen
font pair; acceptance and Ship remain open, with no commit/push/deploy.

### Seven Choices legacy blank residue repair

The golden-reference follow-up is limited to the three-piece blank defect.
The frozen legacy adapter consumed the middle `__NN__` of `_____NN_____`,
leaving three literal underscores on each side of the validated blank. Those
residues wrapped at 37/39; the atomic CSS blank itself did not split.

Current Screen/Print consumers now share a presentation-only repair for exactly
paired, immediately adjacent three-underscore residues in Seven Choices.
Asymmetric markers, different counts, whitespace-separated markers and other
families remain untouched. Source, signed semantic projections, historical
consumer contracts, Publications and saved PDFs are unchanged. The current
materialization producer already consumes the full marker and needs no change.

- PASS `node scripts/verify-paper-canonical-seven-choices-rendered-behavior.mjs`:
  positive/negative marker cases, frozen canary, historical behavior and
  unchanged semantic signature.
- PASS `node scripts/generate-paper-presentation-authority.mjs --check`.
- PASS `node scripts/verify-ticket-31-canary-whole-paper-export.mjs --actual-artifacts`:
  four papers / 33 groups / eight production Student-Teacher PDFs. Real DOM
  checks cover five unique blanks, no residue, single-fragment bounds and
  number containment on Screen, Print and Paged output.
- Independent bounded Standards/Spec review approved the repair; no blockers.
- PASS staged and unstaged `git diff --check`.

## Listening and fixed-page PDF continuation (2026-09-09)

Work continues in the separate `feature/listening-golden-layout` worktree at
`/home/user/workspace/listening-golden-layout`, based on fetched main
`08ebb647ff911cfac9554069c9c4280c3fef06df`. The original worktree and its
uncommitted font/common-layout changes were preserved. No Ship, deployment,
production write, paper promotion, or import claim transfer occurred.

Implemented boundaries:

- Fixed fonts remain TeX Gyre Termes 2.609 and Source Han Serif CN 2.003.
- Golden Listening measurements are recorded under
  `docs/product/exam-paper-format-reference/listening-measurements.md` and its
  reproducible JSON/Python companion. Golden source page count is not the
  requested output page count.
- Full, same-source papers own the golden title and three notices. Family
  selection order is not mistaken for visible slot order; an 8-page selection
  can omit both Listening slots from an 11-slot source. Partial/mixed drafts
  do not acquire the cover or fixed-page eligibility.
- Listening short-section instructions preserve source-explicit 仅读一遍;
  absence defaults to twice. DOCX/OCR materialization and immutable historical
  source-asset/legacy question JSON paths are covered. Playback audio is not
  modified or looped. Existing immutable source/canonical bytes are not changed.
- Shared measured A-C placement chooses three columns or a complete vertical
  set. Screen and Print consume the same placement. Rendered verification
  caught and repaired a dropped Screen plan and a missing Print grid selector.
- Draft student PDF export has isolated `friendly8`/`friendly10` paths.
  Natural preview/cache, standalone Print HTML, and normal exports remain
  separate. Source question numbering is preserved when excluding Listening.
- Fixed-page search compares natural flow and group-start breaks, including
  same-page-count redistributions. It is deterministic and capped at 24 renders,
  retains summaries rather than every candidate PDF, and never changes body
  size/line height/margins/answer geometry. A planned group moves with preceding
  heading/instruction chrome. A tiny opening fragment is permitted across an
  A3 face; substantial non-Listening group splits are a soft penalty, not a
  rejection. Exact-page candidates with fewer crossings win; remaining
  crossings are returned to the UI as a visible export warning.
  Listening sections may span faces, but individual Listening questions are
  checked as atomic rendered blocks. A section is not one enormous question.
- A failed bounded search reports failure rather than claiming mathematical
  impossibility. The UI preserves the specific fixed-layout diagnostic instead
  of replacing it with an unhelpful retry message. It does not ask teachers to
  delete questions or reorder a source paper just to satisfy page count.

Executed focused evidence:

- PASS `node scripts/verify-listening-golden-layout.mjs`.
- PASS `node scripts/verify-historical-listening-playback-source-binding.mjs`.
- PASS `node scripts/verify-friendly-fixed-page-planner.mjs`.
- PASS `node scripts/verify-draft-pagination-renderer.mjs`: 25/25.
- PASS `node scripts/verify-universal-nck1-publish.mjs`: actual Screen,
  playback, Student/Teacher Print and Paged PDF; fresh artifacts captured with
  `LISTENING_QA_ARTIFACT_DIR=.scratch/listening-final`.
- PASS `node scripts/verify-friendly-fixed-page-rendered.mjs
  .scratch/listening-final`: actual 8-page/9-group and 10-page/11-group PDFs,
  complete group text and order retained. Four renders / 36.5s and seven
  renders / 63.8s respectively on this Orb. These are complete publication
  integration fixtures with abbreviated exam text, not proof that every real
  exam fits. No fake PDF bytes or simulated page counts in this check.
- PASS `node scripts/verify-paper-canonical-cloze-grammar-consumption.mjs`
  after repairing cover-related suppression of the Reading heading.
- PASS `pnpm -C app exec tsc --noEmit`, renderer authority generation check,
  and `git diff --check`.
- Chromium component clicks: both menu items send the correct `pageLayout`;
  Teacher mode hides both; known eligibility errors appear verbatim. Network
  responses were fixture-controlled for this component check, not a claim of
  successful live production downloads. Temporary harness and service removed.
- Independent Standards/Spec inspection found the full-paper gate, selection
  order and historical playback-source gaps; the implementation above addresses
  them. Shared-font/common-layout historical records above remain historical.

Cover bounds and real-paper evidence:

- Following Owner rejection of the low eight-page title, eight-page PDF now
  uses 0pt extra title-top padding and 18pt title-to-notices spacing by default.
  This preserves paper margins and gives Reading A more of page 1. Ten-page
  PDF retains 72/72 → 54/72 → 54/54pt search, title-up first and earlier-profile
  tie preference. These are layout choices, not physical measurements from
  the cropped gold. Body spacing and natural Screen/Print remain unchanged.
- Inspected comparison: `.amp/in/artifacts/listening-layout/cover-normal-tight-proposal.png`
  (left normal, right proposed tighter); body wrapping is unchanged.
- Final fixed-page real-paper QA, including long/multimodal Reading A,
  now passes on the complete 2026-I nine-group source, with all group text,
  source order and the 1780×348 Reading A image retained in eight PDF pages.
  The revised 0/18pt cover uses 17 candidates. A's full passage and table fit
  page 1, but its questions remain on page 2. B spans 2–3 (one crossing warning).
  This is improvement, not a claim that A's entire group fits page 1.
- Real ten-page QA now uses `prepare-friendly-real-listening-qa.mjs`: the same
  real nine groups plus 20 listening questions/60 options from hash-bound
  accepted source JSON, via the shared projection and Print renderer. It is
  explicitly a local composition, not an import approval or publication.
  `verify-friendly-real-paper.mjs --pages 10 --html
  .scratch/friendly-real-listening/full-listening-input.html` retains all text
  and the image in ten pages, selecting 54/54pt after 24 candidates. B and D
  still cross faces. No arbitrary oversized-input fit guarantee is made.
- Revised screenshots are in `.amp/in/artifacts/listening-layout-revised/`.
  Inspected all ten pages: no clipping/overlap, but listening section-two
  instructions and the Seven Choices option set split across pages. These are
  recorded QA shortcomings, not final Owner acceptance. Reading A's legacy
  source also repeats table content as prose below the image; retained rather
  than silently deleting content to fit. Source deduplication is separate work.
- Revised gate: `pnpm -C app verify:changed` selected `unknown-fallback / all`:
  172 PASS / 1 SKIP / 0 FAIL, 1348.8s. The missing external i16a fixture remains
  SKIP. Focused planner, real 8/10-page renders, source preparation, typecheck
  and diff checks pass. Independent continuation review found stale records
  (corrected above), no runtime blocker. This is not Owner visual acceptance.
- Initial `verify:paper`: 90 PASS / 0 SKIP / 1 FAIL (Reading heading regression
  above, repaired and focused rerun PASS).
- Final `pnpm -C app verify:all`: 172 PASS / 1 SKIP / 0 FAIL, 1363.6s.
  `verify-i16a-teaching-dimension-search.mjs` was skipped because its external
  fixture is absent; SKIP is not PASS. New fixed-page scripts are also run
  explicitly above, rather than implied by existing pack membership.
- PASS `node scripts/verify-friendly-export-warning.mjs`: actual route header
  and component click verify the client displays two crossing groups after a
  fixture-controlled PDF download. This is not a production download test.
- Inspected real eight-page PDF pages 1–2: cover, Reading A image/prose/questions
  and B opening are legible without clipping or overlap. Outputs and measured
  cover/body geometry are under `.amp/in/artifacts/listening-layout-final/`.

Inspected `font-migration/seven-fixed-screen.png`, `seven-fixed-print.png` and
`seven-fixed-pdf.png`: all five blanks are complete; no detached strokes at
37/39. The first Screen viewport clipped the bottom near 40; a taller capture
was inspected to confirm its underline. Managed QA was restarted with the new
candidate; the existing whole-paper QA URL opens at Reading, then clicking
七选五 reaches the affected group. No production writes or Ship occurred.

Fresh final gates for this repair (no subsequent source changes):

- FAIL `pnpm -C app verify:paper`: 89 PASS / 0 SKIP / 2 FAIL, 1004.1s.
  Existing `verify-paper-assets-consistency` and `verify-genre-truth` local-data
  failures remain; changed renderer checks pass.
- FAIL `pnpm -C app verify:all`: 169 PASS / 1 SKIP / 3 FAIL, 1281.3s.
  Existing `verify-similar-v2`, `verify-paper-assets-consistency` and
  `verify-genre-truth` local-data failures remain. The off-repo
  `verify-i16a-teaching-dimension-search` fixture is absent (SKIP, not PASS).
  The complete suite is not green; no database was changed to suppress failures.

### Rejected heading numeral optical-bottom calibration (historical evidence)

Owner rejected the following 0.05em candidate: matching ink bottoms is NOT the
golden-reference relationship. Its PASS results prove its then-written checks,
not visual acceptance. This section and its screenshots are historical only;
the natural-inline correction below supersedes the claimed alignment target.

Owner identified sunk `5 / 2.5 / 12.5` in the Seven Choices section heading.
The pinned Termes + Source Han font runtime inherited the historical Song
`0.1em` numeral offset. Actual heading raster comparison showed digits below
Han with that offset and slightly above Han with zero. `0.05em` aligns their
visible lower edges; unequal glyph heights are expected. Golden page 8 supplies
the visual relationship, not an absolute screenshot-pixel-to-A4 conversion.

The shared heading runtime now applies this one font calibration on Screen,
Print and PDF, including other section headings. It does not alter content,
font bytes, sizes, weights, line height or immutable typography. Print's
inter-heading spacing compensation explicitly retains the historical contract
value so changing numeral ink position cannot move whole headings. Existing
Publications and saved PDFs remain untouched; newly rendered output changes.

- PASS `node scripts/verify-paper-canonical-foundation.mjs`: live calibration
  and unchanged historical contract adapter (including poison case).
- PASS independent `node scripts/verify-print-renderer.mjs`: 95/95.
- PASS `node scripts/generate-paper-presentation-authority.mjs --check`.
- PASS `node scripts/verify-ticket-31-canary-whole-paper-export.mjs --actual-artifacts`:
  four papers / 33 groups / eight production PDFs; every rendered numeric
  heading's offset checked on Screen, Print and Paged, alongside existing
  font identity, blank integrity, page bounds and answer-isolation checks.
- Independent Standards/Spec review approved after reconciling the old
  authority-only wording with the narrowly documented pinned-font calibration.

Inspected `font-migration/heading-fixed-detail.png`, `heading-fixed-screen.png`
and fresh student PDF page 5 raster: digits no longer sink, with no heading
overlap. Live Screen and Print report 0.7px at 14px (0.05em). Managed QA was
restarted; the same whole-paper URL and 七选五 directory click reach this state.
The 2x Print screenshot's thresholded ink bottoms for `5`, `题`, `2.5`, `分`,
`12.5`, `分` all occur at y=907; this measures this local raster only.
No Ship/deployment.

Final verification:

- FAIL `pnpm -C app verify:paper`: 89 PASS / 0 SKIP / 2 FAIL, 1040.6s.
  Existing local-data failures: assets consistency and genre truth.
- FAIL `pnpm -C app verify:all`: 168 PASS / 1 SKIP / 4 FAIL, 1330.8s.
  The same three local-data failures (similar-v2, assets consistency, genre
  truth), the same missing external i16a fixture SKIP, plus the old documentation
  assertion in `verify-generated-docx-output-deleted.mjs` that demanded the
  superseded authority-only baseline wording.
- PASS `node scripts/verify-generated-docx-output-deleted.mjs` after updating
  that assertion to require both historical authority preservation and the
  narrowly bounded pinned-font calibration. Only this test changed after the
  full run; runtime code did not. The full suite was not rerun or reported green.
- PASS staged and unstaged `git diff --check`.

### Natural inline numerals across question types (current candidate)

Owner explicitly rejected bottom alignment and requested all question types.
Current live heading offset is zero: natural inline text placement with the
pinned Termes/Source Han pair, not equal ink bottoms or centered glyph boxes.
All heading counts, integers, decimals and scores use the shared runtime.
Listening/Reading question IDs, Cloze question IDs and options, Seven Choices/
Cloze/Grammar blank numbers, writing instruction numbers and body numerals
already had natural placement and are not gratuitously shifted. Shared DOM
checks now reject nonzero top offsets, transforms and non-baseline vertical
alignment on question/blank numeral elements as well as shifted headings.
Existing blank-rule geometry and historical heading-spacing compensation stay
unchanged. No source, font bytes, semantic artifacts or saved PDFs are rewritten.

The standard and documentation verifier now explicitly reject the former
bottom-matching target. Earlier 0.05em screenshots and pixel-bottom measurements
above are rejected historical evidence, not acceptance of the current candidate.

- PASS foundation and generated-DOCX-output-deleted focused checks.
- PASS renderer-only authority generator reproducibility check.
- PASS `node scripts/verify-ticket-31-canary-whole-paper-export.mjs --actual-artifacts`:
  four papers / 33 groups / eight production PDFs; numeric headings, question
  IDs and blanks checked on real Screen, Print and Paged output.
- PASS `node scripts/verify-universal-nck1-publish.mjs`, including a second
  artifact-enabled run using `LISTENING_QA_ARTIFACT_DIR`: active Listening's
  20 questions on Screen and Student/Teacher Print/PDF, plus captured/absent
  source states. No manual shift was introduced to Listening question IDs.
- Independent bounded Standards/Spec review: no blockers; verified scope,
  natural-inline policy, historical preservation and direct consumers.

Inspected Screen screenshots `digits-natural-{seven,cloze,grammar,writing}-screen.png`,
`digits-natural-print.png`, actual PDF rasters for pages 1/5/6/7/8, and fresh
Listening Screen/PDF artifacts under `digits-natural-listening/`. Scores and
counts remain in their heading lines; digits need not reach Han ink bottoms.
One PDF media parser incorrectly described detached numbers based on text
extraction order; `pdftotext -layout` and actual raster inspection refuted that
claim. Viewport-truncated option rows are not missing PDF content. Existing
duplicated writing instruction numbering is source content and remains outside
this vertical-position repair.

Owner QA: the managed service was restarted; the existing whole-paper QA URL,
then directory buttons 七选五 / 完形填空 / 语法填空 / 写作 reach the checked states.
Compare `digits-gold-detail.png` against `digits-natural-detail.png`; the pair
shows relative glyph placement, not a physical-size measurement. No Ship or
deployment.

Final gates (runtime and tests unchanged during both runs):

- FAIL `pnpm -C app verify:paper`: 89 PASS / 0 SKIP / 2 FAIL, 1026.6s;
  existing `verify-paper-assets-consistency` and `verify-genre-truth` failures.
- FAIL `pnpm -C app verify:all`: 169 PASS / 1 SKIP / 3 FAIL, 1340.1s;
  existing `verify-similar-v2`, `verify-paper-assets-consistency`, and
  `verify-genre-truth` local-data failures. External i16a fixture remains absent
  (SKIP, not PASS). No new failing verifier; the full suite is not green.
- PASS staged and unstaged `git diff --check`.
