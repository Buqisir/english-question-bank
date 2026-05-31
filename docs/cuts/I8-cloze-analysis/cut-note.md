# I8 Cut Note — 完形填空 AI 解析生成

Closed: 2026-05-30. PR #168. Branch `i8-cloze-analysis-plan`.

## What shipped

The AI 讲评/解析 **generation** layer for 完形填空 (cloze). At paper-import time,
the one-click analysis now also generates a validated `cloze-analysis-v1` JSON for
one standard 高考完形 section (q41–q55, 15 blanks, A–D), bundled into the asset as
`analyses/cloze-analysis-v1.json`.

Generation-only. The render surface + completeness-gated `完形解析` entry are
deferred to **I9-cloze-analysis-surface** (the seam is the stable JSON contract).

## Teaching model (the contract)

Two axes + a highlightable evidence layer:

- **Collocation Fit (搭配合理)** — universal; per-option (the distractor work).
  Correct option gets *why-it-fits*; distractors get only a *context-meaning
  gloss* (never "why wrong").
- **POS Signature (词性特有考点)** — optional locking move per POS
  (verb→action-sequence, noun→semantic-field, adj/adverb→affective-consistency,
  phrase→contextual-composition). Marked only when it genuinely applies.
- **Evidence** — exact, highlightable passage/option substrings (≥1
  collocation-partner per blank); closed `type` vocabulary distinct from
  `signalSide`.

Binding spec: `cloze-analysis-v1.contract.md`. Rationale: `decisions.md`.

## Files

- `prompts/cloze-analysis-v1.md` (new)
- `server/paper-import-ai/analyzeCloze.mjs` (new — build messages, validate, retry, server-stamp meta)
- `server/paper-import-ai/routes.mjs` (analyze-cloze route + publish threading)
- `server/paper-import-ai/packageBuilder.mjs` (clozeAnalysis + required-when-present `cloze_analysis_required`)
- `server/paper-import/validator.mjs` (`cloze-analysis-v1` in `PAPER_IMPORT_SCHEMA_VERSIONS`; no `schemas/**` change — AJV skips when no schema file)
- `server/paper-import/storage.mjs` (clozeAnalysis pass-through in all three artifact functions)
- `app/src/services/paperImportAi.ts`, `app/src/features/paper-import-ai/PaperImportAiWorkbench.tsx` (one-click includes cloze; thread clozeAnalysis to publish)
- `scripts/verify-i8-cloze-analysis.mjs` (new; registered in `scripts/verify-ci.mjs`)
- `CONTEXT.md` (+ Cloze Blank, Analysis terms)

## Gates

- **PA** (`pa-reviewer`): APPROVE WITH MUST FIX. MF-1 (analysis persistence is
  split across validator + storage, not just packageBuilder) and MF-2 (owner
  decision: required-when-present; supersedes I3's interim non-blocking stance)
  folded. `pa.md`.
- **Step 6 real-paper QA** (3 papers, live gpt-5.5): surfaced + fixed two prompt
  defects — signature over-application (action-sequence guard; fires 0× across 3
  papers, ~11–13/15 blanks carry no signature) and a `type`/`signalSide`
  confusion (all 3 papers re-run PASS). meta provenance is server-stamped, not
  AI-supplied.
- **CR** (`cr-reviewer`): APPROVE WITH MUST FIX. MF-1 (verify-i8's
  `assertPackageBuilder` was sync + unawaited → four blocking-case assertions
  floated uncounted) fixed; count 71→75, summary prints last. `cr.md`.
- **Browser QA**: workbench parses cloze, one-click analysis includes the cloze
  leg and succeeds end-to-end (完形就绪), 4/4 families analyzed, 答案无冲突.
  (Required launching the dev server via `zsh` so it sources `~/.zshenv` for the
  relay env — fixed in the untracked `.claude/launch.json`.)
- **PO QA**: owner accepted (teaching quality + behavior). 验收合格.

## Verification

- `node scripts/verify-i8-cloze-analysis.mjs` — 75 checks, green; registered in
  `verify-ci`.
- `node scripts/verify-ci.mjs` — green. `npm run build --prefix app` — OK.

## Follow-ups (not in I8)

- **I9-cloze-analysis-surface**: render in PaperSurface (focus-per-blank, reuse
  right analysis pad + clue highlight) + completeness-gated `完形解析` entry.
- C7 manual re-publish path does not enforce required-when-present (only the AI
  import path does, mirroring seven-choices); I9 availability gate must hide the
  entry when analysis is absent/incomplete.
- `correctFit.optionLabel` absent escapes the answer-conflict check
  (contract-permitted; answer-key.json stays authoritative).
