# I13 — 语法填空解析 · 第一刀「生成」(grammar-fill analysis generation)

`cut size: large; touches schema / data contract / product boundary / teaching interpretation: yes`

New AI-derived data contract (`grammar-fill-analysis-v1`) + generation module +
publish wiring, **directly mirroring I8 完形 (cloze) generation**. Render surface +
entry gate are a **later slice** (like I9 was for cloze). Large cut → PA before DEV
(fresh Opus), CR before merge.

Authority (read these, not chat):
- Teaching model / 考点框架库: `docs/cuts/I13-grammar-fill-analysis/grammar-fill-facets-v1.md`
  (PO 黄学伟's IP; whole考点 tree aligned 2026-05-31; 11 facets).
- Data contract: `docs/cuts/I13-grammar-fill-analysis/grammar-fill-analysis-v1.contract.md`.
- Mirror target (I8): `server/paper-import-ai/analyzeCloze.mjs`, `prompts/cloze-analysis-v1.md`,
  the `analyze-cloze` route (`routes.mjs:125-133`), packageBuilder cloze block
  (`packageBuilder.mjs:~397-478`), `scripts/verify-i8-cloze-analysis.mjs`.

## Goal (LOCKED — slice 1, generation only)

At import time, generate reviewed per-blank analysis for the 10 语法填空 blanks (q56–q65)
conforming to `grammar-fill-analysis-v1`, store it in the published package like cloze
analysis. **Architecture (locked with PO):** the per-考点 solving framework is **static**
(facet KB), **not AI-generated**; the AI per blank only ① assigns `facetKey` ② 代入 the
framework (`reason`) ③ highlights `evidence`. No render this slice.

## Critical constraints (verified this session — design around)

### C1 — answer-match: FROZEN 4-op normalization, alternative-aware. (MF-4 — data contract)

Unlike cloze (answer = single letter A–D, trivially exact), grammar-fill `answerKey` is the
**inflected free-text answer word(s)** parsed from the answer docx
(`docxSplitter.mjs:124-142 parseGrammarFillAnswers` → e.g. `wore` / `the` / `to rent` /
**`were worn`** multi-word, real per `verify-i4`). It can carry ① **alternatives** (`whether/if`,
`because/as`); ② **sentence-initial capitalization** (`Whether` vs `whether`); ③ **multi-word**
answers (first-class, not noise).

The validator's answer-match (contract §Answer Authority) is a **CLOSED, FROZEN normalization**
— exactly these **four ops, no more**:
1. trim; 2. collapse internal whitespace to single space; 3. lowercase; 4. split answerKey on
`/` into branches (trim each). The AI answer matches iff its normalized form equals **any**
normalized branch.

**FORBIDDEN normalization (the wrong-accept hazard):** NO punctuation-strip, NO stemming/
lemmatization, NO edit-distance/fuzzy. These would let `worn` wrongly pass for `wore`. Compare
against the *literal normalized answer-key branches only*; anything else **blocks (non-retryable),
never overwrites**. (Sentence-initial-capitalization re-application is a render-slice concern.)
The verifier MUST lock: `whether/if`✓, `Whether`/`whether`✓, `were worn`✓ (multi-word),
`worn`-for-`wore`✗ (no lemmatization), genuine wrong answer ✗.

### C2 — `facetKey` validated by membership against a registry, framework NOT embedded. (high)

Per PO decision B: slice 1 ships a **minimal machine-readable registry**
`server/paper-import-ai/grammar-fill-facets-v1.json` = the list of valid **leaf** `facet_key`s
(+ each leaf's `blank_type`), transcribed from the facet KB. The validator checks: `facetKey` ∈
registry, and the leaf's `blank_type` matches the blank's `blankType`. Framework bodies stay in
the KB / are a **render-slice** concern (NOT embedded per-blank → anti-hallucination, DRY).
`role`/`path` required iff `facetKey === grammar-fill.given.verb.non-finite`.

**The registry has 16 LEAVES, not 11** (MF / PA correction — the "11 facets" count conflated
parents with leaves). `derivation` splits into 3 (`noun-to-adj` / `verb-to-noun` / `verb-to-adj`)
and `conjunction` into 4 (`coordinating` / `relative-clause` / `noun-clause` / `adverbial-clause`).
The 16: given.verb.finite, given.verb.non-finite, given.noun, given.adjective,
given.derivation.{noun-to-adj, verb-to-noun, verb-to-adj}, given.pronoun, given.numeral,
no-hint.preposition, no-hint.article, no-hint.pronoun,
no-hint.conjunction.{coordinating, relative-clause, noun-clause, adverbial-clause}.
**Parent nodes (`grammar-fill`, `.given`, `.given.verb`, `.given.derivation`, `.no-hint`,
`.no-hint.conjunction`) are NOT valid `facetKey`s** — the validator rejects a parent used as a leaf.

### C3 — `meta` server-stamped, blanks keyed by the 10 grammar questionIds. (mirror cloze)

The analyze module overwrites `meta` after generation (generatedBy / model / promptVersion /
reviewStatus:reviewed / reviewedBy:"" / reviewedAt) — model must not self-report. `blanks` keys
MUST exactly equal the grammar-fill group's 10 questionIds; `targetGroups` is exactly the one
grammar-fill groupId. `evidence.signalText` MUST be an exact substring of the grammar-fill
passage and contain no blank marker (`  56  ` / `(wear)`).

## Implementation contract (DEV scope — `server/**` + `prompts/` + `scripts/` assigned here)

Mirror I8 cloze structure. DEV touches:

### Step 1 — `prompts/grammar-fill-analysis-v1.md`
The generation prompt, built from the contract + facet KB. Must steer the AI to: pick `facetKey`
from the taxonomy (given the hint's POS / position), 代入 the framework in `reason`, emit
`role`/`path` for non-finite, highlight syntactic-trigger `evidence` (exact passage substrings),
output the produced `answer`. Mirror `prompts/cloze-analysis-v1.md` tone/structure.

### Step 2 — `server/paper-import-ai/grammar-fill-facets-v1.json`
Minimal registry: array of `{ facet_key, blank_type }` for all 11 leaves (transcribe from the
KB taxonomy table). Used by the validator for membership + blank_type match (C2). No framework
bodies.

### Step 3 — `server/paper-import-ai/analyzeGrammarFill.mjs`
Export `analyzeGrammarFillImportCandidate({ paper, group, providerId, ... })` mirroring
`analyzeCloze.mjs`. Build prompt → call provider → parse JSON → **validate against the contract**
(all §Validation Rules: schemaVersion, paperId, targetGroups, 10 blank keys, required fields,
blankType/hint consistency, facetKey membership + blank_type match, role/path conditionality,
**C1 normalized answer-match**, evidence exact-substring + no-marker, overview present) →
server-stamp `meta`. Blocking errors are non-retryable (esp. answer mismatch).

### Step 4 — route `POST /api/paper-import-ai/analyze-grammar-fill` (`routes.mjs`)
Mirror the `analyze-cloze` route (L125-133): inject `analyzeGrammarFill` service, read JSON body,
call, return. Register alongside the others.

### Step 5 — `packageBuilder.mjs` — wire `grammarFillAnalysis` (MANDATORY, decision D)
Add a `grammarFillAnalysis` param to `buildPaperImportAiPackageFiles` and a block mirroring the
cloze block (~L397-478): **mandatory guard** — when a grammar-fill group exists and
`grammarFillAnalysis` is missing, `throw issue('grammar_fill_analysis_required', …)` (mirror
L397-399); then validate paperId/targetGroups match, server-stamp `meta`, push the analysis file
into the package's `outputFiles` (`analyses/grammar-fill-analysis-v1.json`).
**packageBuilder alone does NOT persist** — see Steps 6–7 (MF-2).

### Step 6 — `server/paper-import/validator.mjs` — recognize the new schemaVersion (MF-2, load-bearing)
`validateParsedBundle` (~L449-540) lifts only known `schemaVersion`s into `packageData`; an
unrecognized `grammar-fill-analysis-v1` file is parsed then **silently dropped**. Add a
`grammar-fill-analysis-v1` entry set + paperId-mismatch warning + include it in the returned
`normalized` bundle (mirror L455 / 524-528 / 538).

### Step 7 — `server/paper-import/storage.mjs` — write it to disk (MF-2, load-bearing)
`makeVersionedArtifacts` (~L75-96) must clone + re-stamp `sourceAssetVersion = version` (mirror
L91-94, SW-3); `writePaperImportVersion` (~L99-133) must write
`analyses/grammar-fill-analysis-v1.json` (mirror L131-133). Without Steps 6–7 the published
version dir contains NO grammar-fill analysis file even though the in-memory object validated
(ship-a-hole bug).

### Step 8 — client wiring (MF-1)
- `app/src/services/paperImportAi.ts`: add the `analyze-grammar-fill` client call (mirror L228
  `analyze-cloze`) and a `grammarFillAnalysis` field on the publish payload (mirror L248/264).
- `app/src/features/paper-import-ai/PaperImportAiWorkbench.tsx`: obtain the grammar-fill analysis
  and pass it at publish (mirror L465 `clozeAnalysis: clAnalysisState.result?.analysis`).
  Data-plumbing only — NOT a visual/render change.

### Step 9 — `prompts/grammar-fill-analysis-v1.md`
The generation prompt (built from contract + facet KB): steer the AI to pick `facetKey` from the
**16 leaves** (by hint POS / position), 代入 the framework in `reason`, emit `role`/`path` for
non-finite, highlight syntactic-trigger `evidence` (exact passage substrings), output the produced
`answer`. **Input mapping (SW-1):** the parsed given word is `question.prompt` (`docxSplitter.mjs:740`),
map it to the contract's `hint`; the input assertion (mirror `assertClozeAnalyzeInput`) must NOT
require an `options` object (grammar fill has none) and expects 10 questions, not 15.

### Step 10 — verifiers
- New `scripts/verify-i13-grammar-fill-analysis.mjs` (mirror `verify-i8-cloze-analysis.mjs`),
  registered in `verify-ci.mjs registry.scripts`. Cases: valid fixture passes; each rule
  fails-closed; **C1 (MF-4)** `whether/if`✓, `Whether`/`whether`✓, `were worn` multi-word ✓,
  `worn`-for-`wore`✗, wrong answer ✗ non-retryable; **C2** bad facetKey ✗, parent-as-leaf ✗,
  blank_type mismatch ✗, role/path on non-non-finite ✗, 16-leaf membership; evidence
  non-substring ✗, marker-present ✗ (fixture passage includes both a `  56  ` marker and a
  `(wear)` token — SW-2); **MF-2** post-publish **on-disk** `analyses/grammar-fill-analysis-v1.json`
  present. CR mutation-tests it.
- **Sibling-verifier fixture updates (MF-3 blast radius):** the mandatory guard breaks every
  fixture in `scripts/verify-i1/i2/i3/i5-*.mjs` (and check i4) that publishes a four-family paper
  without supplying `grammarFillAnalysis` — same break I8's cloze-mandatory change caused. Update
  each to supply a minimal valid grammar-fill analysis. All must stay green.

## Verify
- `node scripts/verify-i13-grammar-fill-analysis.mjs` green (all rules + C1/C2 cases +
  **post-publish on-disk** `analyses/grammar-fill-analysis-v1.json` present — MF-2).
- `node scripts/verify-ci.mjs` green: new script registered; **i1/i2/i3/i4/i5 + i8 stay green
  AFTER the mandatory-publish fixture updates** (MF-3 / Step 10).
- **Generation smoke (load-bearing, needs AI quota)**: run `analyzeGrammarFillImportCandidate` on a
  real paper's grammar-fill group via `gpt-5.5`; confirm the output validates, 10 blanks covered,
  answers match the answer key (with C1 normalization), facetKeys are real leaves, evidence
  substrings resolve. **Does NOT substitute for the on-disk persistence assertion.** (Render is a
  later slice — no PaperSurface QA here.)

## Allowed Files (PA-finalized)
- **Generation core**: `prompts/grammar-fill-analysis-v1.md`,
  `server/paper-import-ai/grammar-fill-facets-v1.json`,
  `server/paper-import-ai/analyzeGrammarFill.mjs`, `server/paper-import-ai/routes.mjs`,
  `server/paper-import-ai/packageBuilder.mjs`.
- **Persistence (MF-1/MF-2)**: `server/paper-import/validator.mjs`, `server/paper-import/storage.mjs`.
- **Client data-plumbing (MF-1)**: `app/src/services/paperImportAi.ts`,
  `app/src/features/paper-import-ai/PaperImportAiWorkbench.tsx`.
- **Verifiers**: `scripts/verify-i13-grammar-fill-analysis.mjs`, `scripts/verify-ci.mjs`, and
  fixture edits to `scripts/verify-i1/i2/i3/i4/i5-*.mjs` (MF-3).
- **Docs**: this cut's `*.md` + `grammar-fill-facets-v1.json` registry.

## Forbidden / out-of-scope (this slice)
- The render surface + entry gate (later I9-style slice). No TSX UI/visual change (the two client
  files are data-plumbing only).
- Full framework bodies in the registry JSON or per-blank JSON (only facetKey + minimal registry).
- `schemas/**`, `paper-asset-v1`, the grammar-fill group model (`docxSplitter` q56–q65 shape).
- Touching other families' analysis (cloze/seven-choices/reading) modules.
- Committing `app/public/paper-assets/**` or `.claude/launch.json`.

## Decisions (owner-confirmed 2026-05-31)
- **A** evidence trigger-type closed vocabulary (≈12 types) — approved.
- **B** facet registry: slice 1 ships minimal leaf-key registry (**16 leaves**) for validation;
  full framework bodies deferred to render slice — approved.
- **C** answer-match: FROZEN 4-op normalization + alternative-aware (C1/MF-4) — verified the
  answer-key holds inflected free-text.
- **D** grammar-fill analysis is **MANDATORY at publish** (PO 黄学伟, mirrors cloze/seven-choices)
  — adds `grammar_fill_analysis_required` guard; the 5 sibling-verifier fixtures must be updated.

## PA Follow-Up Decisions (PM compression of `pa.md`, 2026-05-31)

PA verdict: **APPROVE WITH MUST FIX (4 MF, 1 PO decision)**. Architecture/contract sound; blockers
were scope-honesty + one PO call + a frozen normalization boundary. All resolved:

- **MF-1 (under-scoped I8 mirror) → RESOLVED**: Steps 6–10 + Allowed Files now own the full I8
  footprint — `validator.mjs`, `storage.mjs`, `paperImportAi.ts`, `PaperImportAiWorkbench.tsx`,
  and the 5 sibling verifiers. DEV does not "discover" the persistence/client chain.
- **MF-2 (packageBuilder alone doesn't persist) → RESOLVED**: Steps 6–7 add validator pass-through
  + storage write; Verify asserts the file **on disk after publish**, not just in-memory.
- **MF-3 (mandatory vs optional) → RESOLVED = Decision D (MANDATORY)**, PO-confirmed; guard +
  5-verifier fixture updates folded into Steps 5 & 10.
- **MF-4 (answer-match) → RESOLVED**: C1 frozen to exactly {trim, collapse-ws, lowercase, split-`/`};
  stemming/edit-distance/punct-strip FORBIDDEN; verifier cases enumerated (Step 10).
- **Leaf-count fix (11→16) → RESOLVED** in C2 + facet KB + contract; parent nodes are not valid
  facetKeys.
- **SW-1 (`prompt`→`hint` mapping; no `options`; 10 not 15 questions)** → folded into Step 9.
  SW-2 (marker+hint fixture), SW-3 (sourceAssetVersion re-stamp), SW-4 (render-slice registry-version
  check) → noted; SW-2 in Step 10, SW-3 in Step 7, SW-4 is a future-slice concern.

## Process
Flow: PM (facet KB + contract + this plan, committed) → fresh-Opus `pa-reviewer` (`pa.md`) →
PM compression → Sonnet DEV (scope above) → CR-lite (fresh Opus, mutation-test verifier) `cr.md`
→ generation smoke → PO QA → RM. Remote `github`, base `main`. Stage explicitly — never
`git add -A`. WIP branch `i13-grammar-fill-analysis`.
