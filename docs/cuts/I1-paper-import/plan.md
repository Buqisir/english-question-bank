# I1 Plan — Paper Import Workbench (DOCX → Analysis Preview → Save)

## Cut Size

Medium.

Touches data contract (new `DOCX → sections` shape between server parser and
import UI), product boundary (new `/paper-import` page), and external API
boundary (new outbound calls to DeepSeek Pro / GPT-5.5). Does not change
existing analysis JSON contracts, prompts, or Surface UI.

## Objective

Replace the current "copy passage out of DOCX → paste into chat → save JSON by
hand" workflow with a local workbench that takes a full test paper DOCX, picks
out the 七选五 and 阅读理解 sections, runs the existing analysis prompts via an
external LLM API, previews the resulting JSON, and lets the owner save it to
`public/paper-assets/`.

V0 audience is the owner alone. Not a teacher self-service product (that would
be the C7 / 层二 cut).

## Locked Product Decisions

- Scope: 七选五 + 阅读理解. Other question types (听力 / 完形 / 作文 …) are
  out of scope for I1. They may appear in the parser's `skipped` list with a
  reason but are never sent to an LLM.
- Input: a full test paper DOCX (one file = one paper). No PDF, no plain text,
  no image input in I1.
- Parser strategy: local rules only (heading match, numbering match, section
  markers). No LLM fallback for splitting. Sections the parser cannot classify
  go into `skipped` with a `reason` field; the owner inspects them manually
  before deciding whether to extend rules.
- Save semantics: preview first; nothing lands on disk until the owner clicks
  save per group.
- UI entry: a new standalone page at route `/paper-import` (or equivalent
  view key). Do not splice this entry into `DraftPaperWorkbench` or
  `PaperIntelligence` harness.
- External API providers: DeepSeek Pro and GPT-5.5 are the two cost-effective
  options the owner allows. Sonnet 4.6 is excluded for cost. Default is
  DeepSeek Pro to match the existing question-bank steward integration.
- Prompt reuse: 七选五 reuses `prompts/seven-choices-analysis-v1.md`. 阅读理解
  reuses the existing reading-parse prompt currently used by the project. I1
  does not introduce a new prompt or modify either prompt.
- Output target: `public/paper-assets/<paperId>/` directory tree, matching
  whatever shape the existing seven-choices and reading analysis fixtures use.
  Confirm exact filenames during PA.
- Out of scope for I1: directory watching, batch queues, background daemons,
  re-runs / retries, version diffing, multi-user, auth, deploy.

## Must Do (Step-by-Step)

The work is split into four sequential steps. Each step produces a usable
artifact and a verification signal. Do not start Step N+1 until Step N's
verification passes for at least 3 representative DOCX papers the owner
provides.

### Step 1 — Paper Splitter (local, no LLM)

- New server endpoint or script: parses a DOCX and returns:
  `{ sevenChoicesSections: [{ rawText, startMarker, endMarker }],
     readingSections: [{ rawText, startMarker, endMarker, passageOrder }],
     skipped: [{ rawText, reason }] }`.
- No LLM call. Pure heading / numbering / regex rules.
- Decision: server-side parsing (Node) using an existing DOCX library
  (e.g. `mammoth`) — confirm choice during PA.
- Verification: run against ≥ 3 owner-supplied test paper DOCX files. Splitter
  must locate every 七选五 / 阅读理解 section the owner expects, OR put the
  miss into `skipped` with a parseable reason. False positives (calling
  non-target content 七选五 / 阅读理解) are blocking; false negatives that land
  in `skipped` are acceptable.

### Step 2 — `/paper-import` Page Skeleton (no LLM)

- New route / view: `/paper-import`. Drag a DOCX onto the drop zone → POST to
  Step 1 endpoint → display the returned sections grouped by type with raw
  text preview and a `skipped` panel.
- No `Analyze` button yet, no API calls.
- Verification: drag the same ≥ 3 papers in via the UI; the page shows the
  same partition Step 1 produced; the skipped panel surfaces unparseable
  sections with their reason.

### Step 3 — External API Call + JSON Preview

- Per identified section, add an `Analyze` button: it sends the section's raw
  text to the appropriate prompt template (七选五 or 阅读理解) via the chosen
  provider, and displays the parsed JSON result inline.
- Provider selection: page-level radio / dropdown, options `deepseek-pro`
  and `gpt-5.5`. Default `deepseek-pro`.
- API keys read from existing env / config mechanism already used by
  `question-bank-steward` and reading parse server flows. Do not invent a new
  secrets path.
- Verification: for each of ≥ 3 papers, analyze every identified section;
  preview JSON shape matches the existing analysis fixtures structurally
  (same top-level keys, same per-question keys). No save yet.

### Step 4 — Save to paper-assets

- Each previewed group has a `Save` button → POST to a server endpoint that
  writes the JSON to the target location under `public/paper-assets/`.
- The save endpoint must refuse to overwrite an existing file unless the UI
  explicitly passes a confirmation flag (avoids silently overwriting analyses
  the owner has hand-edited).
- Verification: save outputs are byte-identical in shape to the existing
  fixtures used by PaperSurface; loading the saved paper through
  PaperSurface renders correctly.

## Forbidden

- Do not modify `prompts/seven-choices-analysis-v1.md` or any reading prompt.
- Do not change `seven-choices-analysis-v1` JSON contract or any analysis JSON
  shape consumed by PaperSurface.
- Do not modify `shared/papersurface/**`.
- Do not modify `app/src/domain/**`, `schemas/**`, or any `*Adapter.ts`.
- Do not add `/paper-import` as a sub-view of `DraftPaperWorkbench` or
  `PaperIntelligence`. Keep it independent.
- Do not call Sonnet 4.6 from this cut.
- Do not introduce batch / directory-watch / queue infrastructure.
- Do not invent new analysis output filenames or directory structures —
  match what PaperSurface currently consumes.
- Do not commit any DOCX with copyrighted full passages into the repo for
  fixtures. Use one synthetic or owner-cleared paper for automated tests.
- Do not store API keys in repo or fixtures.

## Suggested Files (adjust during PA / DEV)

- `server/api.mjs` or a new sibling module: paper-import endpoints.
- `server/paperImport/docxSplitter.mjs` (new): Step 1 implementation.
- `server/paperImport/analyzeSection.mjs` (new): Step 3 API call wrapper.
- `server/paperImport/savePaperAsset.mjs` (new): Step 4 file writer.
- `app/src/features/paper-import/` (new directory): `/paper-import` route,
  drop zone, section list, preview, provider picker.
- `app/src/app/router.ts` (or current route registry): add `/paper-import`
  view.
- `scripts/verify-i1-paper-import-*.mjs` (new, per step): one verifier per
  step is preferred over a single mega verifier.
- This cut directory for PA / CR / cut-note files.

## Verification

Required before each step's commit:

- The step's own static verifier (see Suggested Files).
- For Step 2 / 3 / 4: browser smoke check of `/paper-import` with at least
  one owner-supplied DOCX.
- `npm run build --prefix app` clean.
- `git diff --check` clean.
- No new file under forbidden directories.

Browser QA (Steps 2–4):

- Drop DOCX → sections render with correct count.
- Skipped panel lists unparseable sections with reason text.
- Analyze button on a 七选五 section → JSON preview shape matches a known
  good fixture.
- Analyze button on an 阅读理解 section → JSON preview shape matches a known
  good fixture.
- Save button writes to expected paper-assets path; opening that paper in
  PaperSurface renders it normally.
- Provider switch (deepseek-pro ↔ gpt-5.5) actually changes which API the
  network panel hits.

## External Review

Run Codex PA before Step 1 DEV starts. PA scope is in `pa-prompt.md` (to be
written next). PA must cover:

- Data contract for the splitter output and the save endpoint.
- DOCX parsing library choice and known failure modes.
- Whether existing seven-choices / reading analysis prompts can accept raw
  section text directly, or need any normalization first.
- Secrets handling for the two external providers.
- Risk that I1 leaks scope into the future C7 (teacher self-service) cut.

## PA Follow-Up Decisions

_(empty — to be filled after Codex PA returns.)_

Last synced: 2026-05-26 by 小川 PM grill. Open items from external review:
none yet.
