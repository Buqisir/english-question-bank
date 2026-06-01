# I13 Cut Note — 语法填空解析 · 第一刀「生成」(slice 1, generation)

Status: slice 1 ready for RM merge (PM→PA→DEV→CR→generation-smoke all green). 2026-05-31.

## What shipped (slice 1 — generation only, mirrors I8 cloze)

New AI-derived data contract `grammar-fill-analysis-v1` + generation + publish persistence:
- **Facet KB (teaching IP)**: `grammar-fill-facets-v1.md` — whole 考点 tree aligned with PO
  (16 assignable leaves: given verb finite/non-finite, noun, adjective, derivation×3, pronoun,
  numeral; no-hint preposition, article, pronoun, conjunction×4). Architecture: framework is
  **static** (not AI-generated); AI per blank only picks `facetKey`, 代入 (`reason`), highlights
  `evidence`.
- **Contract**: `grammar-fill-analysis-v1.contract.md` — per-blank JSON (facetKey, blankType,
  hint, answer, role/path for non-finite, evidence, teachingNote). No distractors.
- **Generation**: `analyzeGrammarFill.mjs` (+ prompt `prompts/grammar-fill-analysis-v1.md`,
  registry `grammar-fill-facets-v1.json`, route `analyze-grammar-fill`). C1 FROZEN 4-op
  answer-match (trim/collapse-ws/lowercase/split-`/`; NO stem/fuzzy). C2 16-leaf membership +
  parent rejection + blank_type match.
- **Persistence**: packageBuilder mandatory-publish guard + validator schemaVersion lift +
  storage on-disk write of `analyses/grammar-fill-analysis-v1.json` + client data-plumbing.
- **Verifier**: `verify-i13-grammar-fill-analysis.mjs` (124 checks, asserts on-disk persistence),
  CI-registered; sibling fixtures i1/i2/i3/i4/i5/i8 updated for the mandatory guard.

## Gates

- PA (fresh Opus): APPROVE w/ 4 MF, all compressed into plan.md (`pa.md`).
- DEV (Sonnet high): 124 checks, full I8 footprint (14 files + 5 sibling fixtures).
- CR (fresh Opus): APPROVE, 0 blocking MF, mutation 5/6 (6th double-guarded, not fake-green) (`cr.md`).
- Generation smoke (gpt-5.5, real 石室中学 paper): **10/10 answers match key, 19/19 evidence
  substrings resolve, facets pedagogically correct** (non-finite role/path, derivation
  verb-to-noun, clauses), reason follows the PO framework. (Smoke used hints derived from the
  passage parens — identical to what the now-merged hint fix extracts.)

## Dependency landed alongside

`fix(grammar-fill): extract hint prompts in real NN._____(word) format` (PR #174, merged to main,
then merged into this branch). Pre-existing I4 parse bug found during the smoke:
`extractGrammarFillPrompts` missed the underscore gap, so hints were empty on ~all 33 real papers
(every given-word blank mislabeled no-hint). Fixed separately so I13 feeds on correct hints.

## Deferred (NOT this slice)

- **Render surface + entry gate** (the I9-equivalent) — a later slice.
- **⚠️ Render-slice Follow-up Gate** (CR): `evidence.signalText` is validated against parse-time
  bytes (`normalizePassageText`), but the stored passage gets an extra `normalizeGrammarFillText`
  pass at publish — the render slice MUST validate evidence against the **stored** bytes or the
  highlight silently fails (I11 indexOf failure mode). Logged in the contract + watch ledger.
- **Full framework bodies** in the facet registry JSON (slice 1 ships only leaf keys + blank_type
  for validation; render slice resolves facetKey → framework text).
- SW: the AI's clause-type call on appositive `that` (59) leaned noun-clause (defensible); revisit
  if PO wants relative-clause for appositive that-clauses.

## Decisions (owner-confirmed)
A evidence vocab approved · B minimal 16-leaf registry now, framework bodies render-slice ·
C answer-match frozen 4-op (no fuzzy) · D grammar-fill analysis MANDATORY at publish.
