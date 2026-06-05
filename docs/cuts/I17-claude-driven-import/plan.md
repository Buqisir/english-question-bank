# I17 Plan — Claude-driven whole-paper import (pilot: 2024 新课标I)

## Cut Size

medium。

Touches schema, data contract, product boundary, or teaching interpretation: yes (teaching interpretation).
- No schema / DB-contract change. Reuses the existing publish contract, per-type
  analysis schemas, validators, and `/publish` path unchanged.
- It DOES change *who* produces the analysis (DeepSeek → Claude subagents) and
  feeds the official answer into reading analysis. The analysis is a teaching
  artifact → teaching-interpretation touch. Mitigated: analysis is derived &
  backfillable (ADR-0008), so model/quality is not locked and can be re-run with
  zero re-import.

## Objective

Import the whole 2024 新课标I 真题 (答案版 DOCX) into the bank using Claude instead
of DeepSeek for both splitting and analysis, because (a) owner wants to spend
Claude quota instead of DeepSeek money, and (b) these 答案版 files use
non-standard numbering that the rule-based `docxSplitter` cannot parse (proven:
0 reading groups, cloze/grammar skipped). Establish a repeatable Claude-driven
path; this cut lands ONE complete paper as the proof + first content.

Source: `~/Desktop/教学资料库/05_真题模拟与试卷库/高考真题/阅读解析与答案版/真题答案版/2024年新课标Ⅰ卷-答案版.docx`
Target paperId: `paper-2024-i`.

## Locked Product Decisions

- **Split model = Sonnet** (mechanical), **Analyze model = Opus** (teaching
  quality). Proven by spike: both get answers right + pass validators; Opus is
  meaningfully better on higher-order questions (skill tagging + trap-type
  differentiation). See `.scratch/import-pilot/` bake-off.
- **Answer-guided analysis (owner point 1).** The official answer from the 答案版
  is fed INTO analysis (model explains why the official answer is correct, not
  blind-derives). cloze/grammar/seven already pass real answerKey; READING is the
  only one the shipped code blanks — the Claude driver un-blanks it (driver-level,
  no shipped-code change). Existing validators still enforce model-choice ==
  official answer.
- **Standard exam renumbering (owner point 2).** Stored question numbers must be
  standard 新课标 numbers, not the 答案版's custom numbering:
  reading 21–35, seven-choices 36–40, cloze 41–55, grammar-fill 56–65,
  listening 1–20 (skipped). Mechanism: seven/cloze/grammar set `stem` = the
  number; reading sets question `id` ending in 21..35 (packageBuilder's
  `questionNoFromId` reads trailing digits).
- **Whole paper only.** `packageBuilder` blocks publish unless all six families
  are present (reading + seven-choices + cloze + grammar-fill + application +
  continuation). Do NOT weaken this gate (ADR-0007 quality policy). First landable
  unit = the full paper.
- **No DeepSeek call.** The driver never hits `/analyze*`; it bypasses to
  Claude subagents and assembles the publish payload directly.
- Driver + split/analyze prompts live in `.scratch/import-pilot/` (gitignored,
  throwaway pilot). Only the published paper-assets are committed. If the path
  proves out, promoting the driver/prompts to `scripts/` + `prompts/` is a
  SEPARATE follow-up cut.

## Must Do

### Step 1 — Split the whole paper (Sonnet → exact group shapes)

- Extract section texts from the DOCX (textutil/mammoth) for: reading (passages
  11–14), seven-choices (passage 15), cloze (大题16), grammar-fill (大题17),
  application (五、书信写作), continuation (六、书面表达 续写).
- For each section, a Sonnet subagent emits the group JSON in the EXACT shape the
  matching `build*AnalysisMessages` / publish payload expects (see Contracts
  below), carrying the official answerKey and STANDARD numbering.
- Validate each group's shape mechanically before analysis (a script that calls
  the matching `build*AnalysisMessages({paper, group})` — it throws on malformed
  shape; passing = shape OK).

### Step 2 — Analyze (Opus → existing prompts, answer-guided)

- For reading (4 groups), seven-choices, cloze, grammar-fill: build messages from
  the existing prompt via `build*AnalysisMessages`, with READING answerKey
  UN-blanked, hand to an Opus subagent, capture JSON.
- Validate each through the existing `analyze*ImportCandidate` with an injected
  provider returning the subagent text (runs schema + answer-match + exact-quote
  checks). Re-spawn with the validator error on failure.
- Application + continuation need NO analysis (publish takes the group only).

### Step 3 — Assemble payload + dry-run package

- Assemble the `paper-import-ai-publish.json` payload (parseResult.readingGroups +
  analysesByGroupId + seven/cloze/grammar groups+analyses + application +
  continuation).
- Dry-run `buildPaperImportAiPackageFiles` (packageBuilder) to catch
  completeness/shape errors BEFORE writing anything.

### Step 4 — Backup + publish + verify

- Run `./scripts/backup-assets.sh` before publishing (hard constraint).
- Start the API server (`./scripts/dev.sh`), POST `/publish` (or call publisher
  directly), confirm `status: 'published'`.
- Verify in DB / via API: paper-2024-i present, 6 groups, standard question
  numbers (21–35/36–40/41–55/56–65), answers match official.

### Step 5 — Light up derived dimensions

- `POST /api/grammar-fill/verb-profiles/backfill`
- `POST /api/topic-labels/backfill`

### Step 6 — Stage + CR-lite + QA + RM

- Explicitly stage ONLY the tracked paper-assets (`latest/` + flat `analyses/`).
  Never `git add -A`; never commit `versions/`, `.env`, `.claude/launch.json`,
  raw DOCX.
- CR-lite cold-read of any committed artifacts + the import result.
- Owner PO QA in the app (the paper renders, answers/analysis correct).
- RM: artifact gate, PR, CI green, merge, fetch tip.

## Forbidden

- Do NOT edit any contract file: `server/**` (analyzers, docxSplitter,
  packageBuilder, publisher, validator, routes), domain/schema, `*Adapter.ts`,
  PaperSurface, verify scripts, print/export styling. The driver only READS
  exported functions and calls existing endpoints.
- Do NOT weaken the six-family completeness gate in packageBuilder.
- Do NOT call DeepSeek / the `/analyze*` endpoints.
- Do NOT `git add -A`. Do NOT commit `.scratch/`, `versions/`, `.env`, raw DOCX.

## Suggested Files

- `.scratch/import-pilot/` — driver scripts, split/analyze prompts, intermediate
  JSON (all gitignored).
- Committed output: `app/public/paper-assets/paper-2024-i/latest/**` + flat
  `analyses/**` (whatever publish tracks).

## Contracts (per-type group shapes — from server read, see I17 investigation)

- **reading** group: `{groupId,title,order,paragraphs:[{id,text}],questions:[{id (ends in 21..35),stem,options:{A,B,C,D},answerKey}]}`. analysis schema `reading-choice-analysis-v1`. Reading is the only type whose shipped code blanks answerKey → un-blank in driver.
- **seven-choices** group: `{groupId,title,order,paragraphs:[{id,text}],optionBank:[{label A..G,text}]×7,blankIds,questions:[{id,questionNo 36..40,blankId}]×5}` (no stem/options/answerKey-in-input on question; answerKey compared in validator). analysis schema `seven-choices-analysis-v1`.
- **cloze** group: `{...,questions:[{id,blankId,stem "41".."55",answerKey A-D,options:{A,B,C,D}}]×15}`. schema `cloze-analysis-v1` (analysis keyed under `blanks`).
- **grammar-fill** group: `{...,questions:[{id,blankId,stem "56".."65",answerKey word(s),prompt?:hint}]×10}` (no options). schema `grammar-fill-analysis-v1` (`blanks`).
- **application** group: `{groupId,title,paragraphs:[{id,text}],applicationGiven?}` — no analysis.
- **continuation** group: `{groupId,title,paragraphs:[{id,text}],continuationStarters:[≥2]}` — no analysis.
- publish increments assetVersion on re-run (safe retry / rollback by version).

## Verification

- Step 1: `node` shape-check per group (build*Messages throws on malformed) → all pass.
- Step 2: `node` validate per analysis via injected provider → all PASS, AI answer == official.
- Step 3: packageBuilder dry-run → no blocking issues.
- Step 4: backup ran; publish `status: published`; DB query shows 6 groups + standard numbers + correct answers.
- Step 5: backfill responses ok; verb/topic dimensions populated for paper-2024-i.
- Step 6: artifact gate `node scripts/verify-cut-artifacts.mjs docs/cuts/I17-claude-driven-import medium`; CI green.

## DEV Readiness

- Step 1 can start now. Each step gates the next via its verifier.
- Step 4 publish requires Steps 1–3 all green + backup.

## Self-Review Blind Spots (for CR)

- Exact-quote validation: split paragraph text must be the SAME text the analyze
  step quotes from; full-width-space / symbol normalization mismatches could fail
  evidence checks. Watch passages with tables (the HABITAT poster) and special
  punctuation.
- Reading numbering via trailing digits of `id` — verify 21..35 actually land
  (not 1..15) post-publish.
- Cloze/grammar/seven group shapes are inferred from analyzer inputs; the publish
  packageBuilder may require extra fields (blankIds, optionBank count==7,
  continuationStarters≥2). Dry-run packageBuilder before publish.
- Listening is skipped — confirm publish does not require listening questions.

## PA Follow-Up Decisions

N/A (no separate PA session; reuses existing contracts, inline PA-lite in this plan).
