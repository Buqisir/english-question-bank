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

### C1 — answer-match is NORMALIZED + alternative-aware, NOT strict `===`. (high; flag to PA)

Unlike cloze (answer = single letter A–D, trivially exact), grammar-fill `answerKey` is the
**inflected free-text answer word** parsed from the answer docx
(`docxSplitter.mjs:124-142 parseGrammarFillAnswers` → e.g. `wore` / `the` / `to rent`). It can
carry: ① **alternatives** (`whether/if`, `because/as`); ② **sentence-initial capitalization**
(`Whether` vs `whether`); ③ residual parse noise. So the validator's "answer equals answer key"
rule (contract §Answer Authority) MUST compare **normalized** (trim, collapse spaces,
case-insensitive) and **accept any `/`-separated alternative**. A strict `===` would
false-block legitimate answers. **The answer key stays authoritative; on genuine mismatch the
analysis blocks (non-retryable), never overwrites.** PA must scrutinize this normalization
boundary (it is the analogue of cloze's optionLabel check but harder).

### C2 — `facetKey` validated by membership against a registry, framework NOT embedded. (high)

Per PO decision B: slice 1 ships a **minimal machine-readable registry**
`server/paper-import-ai/grammar-fill-facets-v1.json` = the list of valid leaf `facet_key`s
(+ each leaf's `blank_type`), generated/transcribed from the facet KB. The validator checks:
`facetKey` ∈ registry, and the leaf's `blank_type` matches the blank's `blankType`. The full
framework bodies stay in the KB / are a **render-slice** concern (NOT embedded per-blank →
anti-hallucination, DRY). `role`/`path` required iff `facetKey ===
grammar-fill.given.verb.non-finite`.

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

### Step 5 — `packageBuilder.mjs` — wire `grammarFillAnalysis`
Add a `grammarFillAnalysis` param to `buildPaperImportAiPackageFiles` and a storage block
mirroring the cloze block (~L397-478): validate paperId/targetGroups match, server-stamp, write
the analysis file into the package (`analyses/grammar-fill-analysis-v1.json`). **Decision needed
in PA: is grammar-fill analysis MANDATORY at publish (like cloze) or optional?** Default: mandatory
for consistency, but PA confirms this doesn't break existing publish flows / fixtures.

### Step 6 — `scripts/verify-i13-grammar-fill-analysis.mjs`, registered in `verify-ci.mjs`
Table-driven validator tests mirroring `verify-i8-cloze-analysis.mjs`: a valid fixture passes;
each validation rule, when violated, is caught (esp. **C1**: alternative answer `whether/if`
accepted, case-insensitive accepted, genuine wrong answer blocked; **C2**: bad facetKey blocked,
blank_type mismatch blocked, role/path on non-non-finite blocked; evidence non-substring blocked).
CR mutation-tests it. Register in `verify-ci.mjs registry.scripts`.

## Verify
- `node scripts/verify-i13-grammar-fill-analysis.mjs` green (all rules + C1/C2 cases).
- `node scripts/verify-ci.mjs` green (new script registered; existing suites incl. i8 stay green).
- **Generation smoke (load-bearing, needs AI quota)**: run `analyzeGrammarFillImportCandidate` on a
  real paper's grammar-fill group via `gpt-5.5`; confirm the output validates, 10 blanks covered,
  answers match the answer key (with C1 normalization), facetKeys are real leaves, evidence
  substrings resolve. (Render is a later slice — no PaperSurface QA here.)

## Forbidden / out-of-scope (this slice)
- The render surface + entry gate (later I9-style slice).
- Full framework bodies in the registry JSON or per-blank JSON (only facetKey + minimal registry).
- `schemas/**`, `paper-asset-v1`, the grammar-fill group model (`docxSplitter` q56–q65 shape).
- Touching other families' analysis (cloze/seven-choices/reading) modules.
- Committing `app/public/paper-assets/**` or `.claude/launch.json`.

## Decisions (owner-confirmed 2026-05-31)
- **A** evidence trigger-type closed vocabulary (≈12 types) — approved.
- **B** facet registry: slice 1 ships minimal leaf-key registry for validation; full framework
  bodies deferred to render slice — approved.
- **C** answer-match feasible but must be normalized + alternative-aware (not strict `===`) —
  PM verified the answer-key holds inflected free-text; carried as C1.

## Process
Flow: PM (facet KB + contract + this plan, committed) → fresh-Opus `pa-reviewer` (`pa.md`) →
PM compression → Sonnet DEV (scope above) → CR-lite (fresh Opus, mutation-test verifier) `cr.md`
→ generation smoke → PO QA → RM. Remote `github`, base `main`. Stage explicitly — never
`git add -A`. WIP branch `i13-grammar-fill-analysis`.
