# figure-render — CR (fresh-context, cold diff read)

Reviewer: CR (Opus, un-anchored). Range: `git diff d239358..HEAD` (4 commits:
impl 76dc087 + guardrail fix b7b77f5 + QA fix 4a0de10 + QA evidence 8057729).
Worktree `/Users/huangxuewei/Projects/eqb-wt-figure-render`, branch
`cut/figure-render`. Baseline confirmed (includes E3 5de239e via main).

## Verdict

**APPROVE WITH MUST FIX** (1 Must Fix — a stale scope-guard left RED + a false
"green" in the DEV record; NOT a runtime / data / export defect). 4 Should Watch.
The product code is correct, proven, and in scope; the sole blocker is
verification hygiene (MF-1). This is a contract-face cut reviewed from-strength;
the product surface survives it.

Single most important line: the P0 is genuinely closed on all four render faces
with a single shared marker resolver — no fifth hand-rolled copy, no surface left
emitting a raw token, and the "no-manifest → placeholder, never silent-hide,
never raw token" rule is enforced identically on every face and proven on real
data (incl. a real PDF byte-delta and a real unzipped DOCX media part). The one
Must Fix is not about that code — it is a scope-guard the cut's authorized edits
tripped, which the DEV report wrongly recorded as passing.

## Must Fix

### MF-1 — Reconcile the stale `verify-paper-surface-module-v1.mjs` scope guard; correct the false green in the DEV/QA record.

`node scripts/verify-paper-surface-module-v1.mjs` exits **1** in this worktree:
`111 passed, 2 failed`. Two `FORBIDDEN_PATHS` diff-guards (the branch-scope
allowlists at L203-238, diffed against `merge-base(github/main)...HEAD`, i.e.
committed HEAD) fire on this cut's edits:

- `^server/` → offenders: `server/api.mjs`, `server/draft-paper/draftPaperStore.mjs`,
  `server/exports/exportImplementation.mjs`, `server/figures/paperFigures.mjs`.
- `^app/src/features/paper-intelligence/` → offender:
  `paperAssetSurfaceAdapter.ts`. **(The coordinator flagged only the server
  dimension; this PI-dimension trip is a second, separate failure.)**

Why this is Must Fix (and precisely what it is NOT):
- It is **not** an architecture violation. The guard's real decoupling
  assertions all PASS — "No import from server/", "Segmenter has no imports",
  "PaperSurface does not reference server/". PaperSurface.tsx still imports
  nothing from server; the adapter imports `shared/figures/resolveFigureMarker`
  (a shared module), not server. The boundary that matters is intact. All the
  edits are plan-authorized (adapter/print/docx are in Allowed; the server
  plumbing is the DEV-declared "beyond literal Allowed" necessary plumbing).
- It **is** a verification-integrity blocker: the script is **not registered in
  `verify-ci.mjs`**, so `verify:all` (73 green) never runs it and the RED is
  invisible at the merge gate. The DEV report claims this script is **113/0 /
  exit 0** — that is a **stale/false green** (DEV ran it before committing; the
  guard only diffs committed HEAD). Per the CR accountability contract, a
  protection the real gate never runs, left RED, plus a false pass-count in the
  record, is a "misleading-on-a-clean-machine green" — merging it silently
  bequeaths a broken guard to the next PaperSurface-module cut, which will hit
  2 pre-existing failures it cannot attribute.

**Adjudicated disposition (option (a), corrected — NOT (b)):** narrowing the
wiring (option b) is not viable — server-side figure embedding genuinely
requires touching `api.mjs` (thread `paperAssetsDir`) and a server helper, so
the crossing is unavoidable and legitimate. Reconcile the guard, following the
render-fidelity F2 precedent the script itself documents at L196-206:

1. Add `paperAssetSurfaceAdapter.ts` to
   `ALLOWED_DOWNSTREAM_PAPER_INTELLIGENCE_FILES` with a `figure-render/plan.md`
   citation. This is semantically correct and consistent — that set already
   lists the PaperSurface adapters (`adapter/index.ts`, `piToPaperTextMap.ts`,
   …), and this file is the paper-asset→PaperSurface adapter.
2. Do **NOT** dump the four server files into `ALLOWED_DOWNSTREAM_SERVER_FILES`.
   That set is semantically "server files authorized to consume
   `shared/papersurface/tokens.mjs` + `blankPattern.mjs`" — `print-renderer.mjs`
   / `docxRenderer.mjs` belong there; `api.mjs` / `draftPaperStore.mjs` /
   `exportImplementation.mjs` / `paperFigures.mjs` do NOT consume papersurface
   tokens (they consume `shared/figures/*` or just thread params). Pooling them
   there permanently mis-labels them and over-exempts the huge `api.mjs` under a
   false rationale. Instead add a **separately-named** set (e.g.
   `ALLOWED_FIGURE_RENDER_SERVER_FILES`) with a `figure-render/plan.md` citation,
   OR'd into the `^server/` exemption at L228, so api.mjs's exemption is
   narrowly and truthfully attributed to figure-embed plumbing and stays
   independently auditable.
3. Correct the record: the DEV completion report / qa-notes must not carry
   "verify-paper-surface-module-v1 113/0"; after step 1-2 it should read
   green **because it was reconciled**, and CR/PA should note the prior claim
   was stale.

Editing this one guard script to extend its allowlists is in-bounds as a
guard-reconciliation (the render-fidelity cut set the exact precedent, cited in
the script), not scope creep. Re-run to green before merge.

## PA-loop closure verification (the 4 MF)

Each MF checked against code, not the report's prose:

- **MF-2 (详情页 `<pre>` face)** — CLOSED. `QuestionGroupDetailView.tsx:366-391`
  now renders `buildPassageSegments(...).map(...)`; figure segments emit
  `<img>` + a `passage-figure-flattened-text` `<pre>` (PO-2 double-store kept,
  §8 网站面), placeholder segments emit `〔表格：见原卷〕`, text segments the
  unchanged `<pre>`. `passageFigureSegments.ts` short-circuits to ONE unsplit
  text segment when `figures.length === 0` (verify §3 asserts byte-identity to
  pre-cut). Marker stripped from the flattened sidecar (QA-fix 2).
- **MF-3 (DOCX 4 emit sites + no silent降级)** — CLOSED. `pushDocxPassageLine`
  is called at all four sites (exam/handout × blocks/legacy: L771, L825, L939,
  L1012). Real PNG embed via hand-rolled OOXML (`<w:drawing>` + `word/media` part
  + rels + `[Content_Types]` png default, all conditional on `images.length>0`).
  Student试卷 embeds the PNG (no text降级); a manifest-hit whose PNG can't be
  read/parsed degrades to the placeholder card, never a raw token, never a
  silent drop (docxRenderer L668-672). verify-figure-render §5 unzips the real
  .docx at every one of the 4 sites and asserts media-byte-size == source PNG.
- **MF-4 (paragraph/line granularity + invariant)** — CLOSED. `resolveFigureMarker`
  decides "this WHOLE unit is a figure" only when trimmed text *starts with* a
  manifest marker; callers replace the whole unit (never a substring hide). The
  invariant is asserted two ways: import-time `verify-nck1-standard.mjs` F1b
  (marker paragraph-initial + exactly-one-paragraph) and — the one that actually
  runs in `verify-ci` — `verify-figure-render.mjs` §1 against PUBLISHED
  paper-assets (`matches.length===1` + `startsWith`, hard-fail). I confirmed §1
  would fail if a marker went mid-paragraph.
- **MF-1_PA (wave split / E3 boundary)** — moot; E3 merged, single serial cut,
  baseline includes 5de239e. Recorded in plan.

## Changed scope / forbidden respected

Confirmed from the diff file list (not the report): NO touch to `paper-asset.json`,
`figures/**`, `figures/manifest.json` (data-side read-only), NO touch to
`draftPaperPreviewHtml.ts`. Single shared resolver `shared/figures/resolveFigureMarker.mjs`
(+ `.d.ts`/`.d.mts` parity pair) is imported by all four faces — verified each of
adapter / passageFigureSegments / print-renderer / docxRenderer imports it; there
is no fifth copy.

The three "beyond literal Allowed" wiring touches are minimal and clean (they are
the subject of MF-1's scope-guard reconciliation, but the edits themselves are
correct and necessary):
- `server/api.mjs`: threads the already-existing `paperAssetsDir` binding
  (defined L55) into `createExportImplementation` + `createDocxRenderer`, and adds
  the `images` out-param to the two forwarding wrappers. Nothing else.
- `server/exports/exportImplementation.mjs`: optional `paperAssetsDir` (default
  null → pre-cut byte-identical); `imageMode` is an INTERNAL arg (never read from
  `input`, so not attacker-controllable); `images` out-param + tempdir PNG copy
  for the PDF path. Note (positive): `images` is only populated in `imageMode:'file'`,
  and the public HTML route runs `'web'`, so no server filesystem path
  (`absoluteSourcePath`) can leak to a client through the HTML export response.
- `server/draft-paper/draftPaperStore.mjs`: the one PDF caller overrides to
  `'file'` + copies PNGs into the Vivliostyle tempdir. `copyFileSync` imported.

## Additivity / behavior-rule compliance

- PaperSurface prop `figure` is optional; the figure branch fires only when the
  adapter set it; every non-figure paragraph renders the unchanged sentence path.
  verify §2 asserts omitting `figures` yields zero `.figure` paragraphs.
- `buildPrintHtml` / `buildDocumentXml` without `paperAssetsDir` never call the
  resolver at all — verify asserts the raw token stays unchanged (byte-identical),
  i.e. the additive default is proven, not assumed.
- Caption never rendered on any face (checked all four; verify asserts it per-face,
  PA SW-4).
- No-manifest-hit → placeholder card on all four faces (verify exercises the real
  no-manifest paper-2020-bing group with a synthetic token).

## Guardrail-turnover audit (fake-green / weakening check)

The 4 modified verify scripts were NOT weakened:
- `verify-classic-retire-2` / `verify-analysis-layering` useState guardrail:
  DEV's claim is TRUE — the old `\buseState\s*\(` regex genuinely cannot match
  `useState<T>(` (a `<` follows, not `(`/ws), so it was a silent false-pass. New
  `\buseState\s*[<(]` counts all calls and asserts EXACTLY 1, plus classic-retire-2
  pins that one to `figuresState`. This is a strengthening.
- `verify-classic-retire-2` passage-text negative-lookbehind widened 40→1000 chars
  = STRICTER (larger window scanned for `isOwnerView`), not looser.
- `verify-c8` / `verify-h5g` exact-source-signature regexes: natural turnover for
  the `images = []` param; the assertions still prove what they proved.
- `verify-h5g` also ADDS a real-asset figure-embed test (`assertRealAssetFigureEmbed`).

`verify-figure-render.mjs` is registered in `verify-ci.mjs` (the gate actually runs
it). It is manifest-driven / zero-hardcode, exercises all 4 faces + all 4 DOCX
sites on real data, unzips the real .docx, and — crucially — builds a REAL PDF
with vs without the image copy and asserts a byte-size delta, so the exact
QA-caught broken-image class cannot silently regress.

## Verification evidence (re-run here, not copied)

- `node scripts/verify-figure-render.mjs` → **81 passed, 0 failed** (real
  Vivliostyle PDF delta ran, not skipped; real DOCX unzip asserted).
- `verify-classic-retire-2` 66/0 · `verify-analysis-layering` 19/0 ·
  `verify-h5g-docx-renderer` 97 checks · `verify-c8-draft-paper-render-model` 30/0.
- `npx tsc --noEmit` (app) → exit 0, clean.
- `node scripts/verify-paper-surface-module-v1.mjs` → **111 passed, 2 failed,
  exit 1** (the MF-1 scope-guard trip; NOT in verify-ci, so verify:all is
  unaffected — which is exactly the problem MF-1 names).
- `verify-nck1-standard.mjs` F1b: can't run standalone here (needs the
  uncommitted import-staging tree `scripts/import-pipeline/papers/<id>/`); it is
  an import-time gate. Its CI-facing equivalent is verify-figure-render §1
  (published data), which ran green. No coverage gap.

## Self-review blind spots (for any later Big CR)

- I did NOT run a real browser/DOM render of PaperSurface or the detail page —
  the PaperSurface figure branch is proven by source-structure assertions
  (existing verify-paper-surface precedent) + the owner-QA notes, not a headless
  render. The React-render correctness rests on QA item 2/3.
- I did not independently re-open the exported .docx/.pdf in Word/LibreOffice for
  visual fidelity; I trust the QA artifacts (07/08) + the byte-level zip/media
  assertions. Layout fidelity (table not clipped, within版心) is owner-QA territory.
- I did not audit whether OTHER unregistered verify scripts (beyond
  verify-paper-surface-module-v1) carry branch-scope guards that this cut's
  server/PI edits also trip. If a Big CR runs, grep the unregistered scripts for
  `FORBIDDEN_PATHS` / `merge-base` guards before trusting verify:all.
- The module-level-singleton concern (SW-1) I reasoned about but did not
  stress-test with a concurrent double-instance harness.

## Should Watch (non-blocking)

- **SW-1 — module-level `paperAssetsDir` + `docxFigureDocPrCounter` in
  docxRenderer.mjs.** `createDocxRenderer` mutates a MODULE-LEVEL `let`, not an
  instance closure; a second instance with a different config resets it for all.
  Production instantiates exactly once, and this merely extends the SAME
  pre-existing pattern `groupTypeLabels`/`optionalString` already use — not a
  regression this cut introduces. DEV self-reported it; the verify script even
  works around it. Fine to merge; worth a future ticket if a second renderer
  instance ever appears.
- **SW-2 — PaperBrowsePage threads `figures`/`assetBase` into the READING
  adapter branch only.** A future manifest figure inside a cloze/七选五/语法填空
  group would still emit a raw token on the browse卷面 + 讲评 harness PaperSurface
  (the print/docx/detail faces resolve by groupId server-side and cover all
  types). No such data exists today (whole-library sweep: 1 marker-bearing group,
  and it's reading). Latent-only; note it when non-reading figures arrive.
- **SW-3 — detail page fires 1–2 manifest fetches per paper-asset detail open**
  (a 404 + a fallback fetch for the 32 no-manifest papers), degrading to `[]`.
  Functionally correct; produces console 404 noise. Cosmetic.
- **SW-4 — stale header comment.** `QuestionGroupDetailView.tsx` header still
  says "zero internal useState"; the cut adds one (the inline comment at L160 and
  the guardrail assertion both acknowledge the exception, so the invariant is not
  actually unguarded — only the file-top prose is stale). Trivial doc drift.

## Failure / attack angle considered

- Could a green be bought by an assertion that never runs the real path? No —
  verify-figure-render imports the REAL adapter/segments/print/docx modules and
  the REAL factory wiring api.mjs uses, unzips the REAL .docx, and builds a REAL
  PDF. The PDF byte-delta specifically defeats a "src string looks right but image
  is broken" false-green (the exact QA-caught bug).
- Could a green be misleading because a real gate never runs it? YES — that is
  MF-1: verify-paper-surface-module-v1 is unregistered, RED, and the DEV report
  claimed it green. Recorded and blocked.
- Could the token survive on a face the verify doesn't touch? All four faces are
  exercised on real data + a whole-library anti-pattern sweep asserts no render
  output anywhere contains `[表: fig-` / `[图: fig-`.
- Could a future mixed-paragraph marker silently eat prose? Blocked at import
  (F1b) AND at publish-time CI (verify §1); render-time also only ever replaces a
  whole unit, never a substring.
