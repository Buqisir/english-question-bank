# Continuation Writing V3 · Production Spec

Revision: `CW3-SPEC-1`

Status: accepted by Owner 2026-11-24 (「规范通过，从 01 开始做」)

Planning baseline: branch `claude/dreamy-thompson-296ayb@fda2e071b`; production
code as on `origin/main`.

## Authority

- Owner 2026-11-24: 「采用新版，先修 2020 卷对话问题，结尾不加空泛的升华」.
- Evidence: `trial/README.md`, rounds 2 and 3. Matched-length standard essays
  came out V3 3, V2 3, tie 2 over eight papers. The advanced essay was judged
  worth its extra words on 9 of 9 papers. The decision rests on parity for the
  standard essay plus what V3 adds that V2 has none of: reading questions, a
  task card, an advanced essay, and the rules on direct speech and new people.
- Owner 2026-11-24: word ranges 170–210 (standard) and 240–280 (advanced).
- No paper is regenerated in this cut. Data reruns are a later, separate
  decision. `paper-zj-2026-jan` stays held out of every trial and fixture.

## Problem

Production continuation writing runs on `continuation-analysis-v2.md`, wrapped
by `continuation-writing-staged-analysis-v2.md` and followed by the shared
teaching doctrine. It produces one essay and a three-zone English analysis.
The analysis never quotes the essay and has no Chinese. The essay itself gets
no program check: starters, paragraph count, word count and Chinese text all go
unchecked (`docs/cuts/continuation-writing-prep/inventory.md`, G1–G14).

V3 produces two essays and Chinese teaching that quotes them. Every production
gate (schema, projection, persistence, analyzed-package intake, agent plugin
marker, web panel, PDF) accepts only the V1 or V2 shape, so V3 output would be
rejected.

## User outcome

When a continuation group is generated after this cut, a student or parent
reading the web page or the PDF can:

1. answer three questions about the source before writing: where it stops,
   what the character wants and is like, and how it is written;
2. see 2–3 quoted source details and how each can be reused;
3. see what the starters and source require and, separately, what this essay
   chose and could swap;
4. read a standard essay they could write themselves, with notes per paragraph
   that quote it and say why each choice works;
5. take away two or three expressions that fit this story, and two or three
   ways students usually go wrong on it;
6. read an advanced essay and see, quoted, what it does beyond the standard one.

Groups generated before this cut look exactly as they do now.

## Accepted decisions

### D1 Data contract

`groups[groupId].writing` for `taskType: "continuation"` accepts a third
`continuationAnalysis` version:

```json
"continuationAnalysis": {
  "schemaVersion": "continuation-analysis-v3",
  "reading": {
    "questions": [{ "question": "…", "answer": "…" }],
    "sourceLinks": [{ "sourceQuote": "…", "use": "…" }]
  },
  "taskCard": { "taskRequires": ["…"], "thisEssayChooses": "…" },
  "standard": {
    "essay": "…",
    "notes": [{ "paragraph": 1, "role": "…", "items": [{ "quote": "…", "explain": "…" }] }],
    "expressions": [{ "expression": "…", "function": "…" }],
    "pitfalls": [{ "pitfall": "…", "why": "…" }]
  },
  "advanced": {
    "essay": "…",
    "beyondStandard": [{ "quote": "…", "explain": "…" }]
  }
}
```

- The V3 object is closed: no keys beyond those shown.
- The schema's shared `required` list (`storyUnderstanding`,
  `continuationContract`) moves into the V1 and V2 branches, because V3 has
  neither key.
- When V3 is present, `modelAnswer` equals `standard.essay` byte for byte, so
  every existing reader of `modelAnswer` keeps working.
- The model's `taskType` and `blocked` are not stored. A non-null `blocked` is
  a failed generation and is not persisted.
- `officialModelAnswer` is unchanged.

### D2 Prompt

- `prompts/continuation-writing-model-answer-v3.md` becomes the production
  prompt. Its status line changes from CANDIDATE to PRODUCTION. Its body is the
  one fixed after round 3 (direct speech decided from the source first).
- The runtime prompt is V3 plus the structured task input, exactly as in the
  trials. The shared doctrine (`teaching-analysis-style-v1.md`) is not appended
  for continuation writing, because V3 was voted without it. Two doctrine rules
  would also contradict V3: "highlight expressions are retired" (V3 has task
  expressions), and V2's "never quote generated prose" (V3 notes quote the
  essay). The doctrine still applies to every other task type.
- The V2 pair stays in the repo, marked SUPERSEDED, so old outputs remain
  traceable.

### D3 Validation

A V3 result is accepted only if all of the following hold. Each failure names
the field and the rule. These are the checks `trial/check.mjs` already runs.

1. Shape matches D1; `blocked` is null.
2. Both essays: exactly two paragraphs separated by one blank line; paragraph 1
   starts with starter 1 verbatim, paragraph 2 with starter 2 verbatim.
3. Both essays: no Chinese, Markdown, title or numbering.
4. New words (essay minus the two starters, counted with
   `/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g`): standard 170–210, advanced
   240–280. These ranges hold for a task whose target is about 150 words; any
   other target is rejected for manual handling, because V3 has not been tried
   on one.
5. Neither essay repeats 8 or more consecutive words of the source, starters
   excepted.
6. `reading.questions` has exactly 3 entries; `reading.sourceLinks` has 2–3,
   each `sourceQuote` verbatim in the source or a starter.
7. `taskCard.taskRequires` has 2–4 non-empty lines; `thisEssayChooses` is
   non-empty.
8. `standard.notes` covers paragraphs 1 and 2, each with 2–4 items; every
   `quote` is verbatim in the standard essay.
9. `expressions`, `pitfalls` and `beyondStandard` have 2–3 entries each; every
   `beyondStandard.quote` is verbatim in the advanced essay.

Warnings, not failures:
- an essay's share of words in direct speech is above twice the source's share
  plus 10 points;
- a capitalised word mid-sentence that the source never uses (a possible new
  named character), after the exclusions in `check.mjs`.

The existing second-agent review (`PASS` / `MUST_FIX`) stays on every route and
reviews both essays and the notes.

### D4 Generation routes

- New papers (`lecture-redo.mjs` staged route): the continuation output
  contract becomes V3 plus a packaging contract
  `continuation-writing-staged-analysis-v3.md` that wraps the V3 JSON as
  `{ taskType, modelAnswer, continuationAnalysis }` with `schemaVersion` set.
  The agent plugin marker check moves from the V2 heading to the V3 heading.
- Backfill (`writing-analysis-driver.mjs`): the agent writes
  `<key>.analysis-v3.json` and `<key>.review.json`; `persist` derives
  `modelAnswer` from the standard essay.
- Analyzed-package intake and the persistence projection accept and keep V3.
  `nck1AnalysisProjection.mjs` stops requiring V2 for new papers and requires
  V3.

### D5 Web lecture

Continuation follows application writing V4: the essay sits in the answer box,
with a switch to the advanced essay, and the teaching sits in the right rail.
Today the continuation essay is at the bottom of the right rail, under three
analysis zones. Right rail, in order:

1. 读原文: the three questions with answers, then the source details (原文这里可以借);
2. 审题卡: 必须做到 / 可以换;
3. 逐段看;
4. 本题可用表达;
5. 容易写偏;
6. 提高版多做了什么 (shown with the advanced essay).

Blocks shared with application V4 (task card, paragraph notes, expressions,
essay switch) reuse the same components; continuation adds only 读原文 and
容易写偏. Paragraphs are separated by spacing, not by empty lines. Exact layout
is settled by before/after samples that the Owner approves before anything
reaches main.

### D6 PDF (`analysis.pdf`)

V3 groups print, in order: reading questions and source details, task card,
standard essay, paragraph notes, expressions, pitfalls, advanced essay, what
the advanced essay adds. V1 and V2 groups print as today. Exact layout is
settled by before/after samples that the Owner approves before anything
reaches main.

### D7 Legacy

V1, V2 and the I19 `continuationDesign` format remain valid in schema,
projection, web and PDF. Nothing that reads them is removed.

## Test seams

- Validator unit tests with fixtures built from the trial outputs in
  `trial/round2/` and `trial/round3/` (V3 side only): one passing result per
  paper, and one failing fixture per D3 rule. The round 2 2025-ii output (named
  "Emma") is the fixture for the new-name warning.
- Projection, persistence and analyzed-package tests: V3 envelope accepted;
  `modelAnswer` ≠ standard essay rejected; V1 and V2 envelopes unchanged.
- Prompt verify: the runtime continuation prompt equals V3 plus the task input;
  V2 markers no longer required for new papers; doctrine checks still pass for
  every other task type.
- Web and PDF: a V3 fixture renders all blocks; a V2 fixture renders
  byte-identical HTML to the baseline.

## Ordering

Tickets 03 and 04 reuse the application V4 display blocks, so they start after
application V4 tickets 03 and 04 land. Tickets 01 and 02 do not wait.

## Out of scope

- Regenerating any paper's continuation writing.
- Changing the V3 prompt body beyond its status line.
- Retiring V1, V2 or I19 data.
- `paper-zj-2026-jan`.

## QA

- `node scripts/verify-ci.mjs` passes locally on every ticket; failures that
  also fail on the pre-change commit are listed, not hidden.
- Web and PDF samples (before/after, 1440 and 390 widths, light theme) approved
  by the Owner before the display tickets reach main.
- After each push to main: agent-cloud live check that existing continuation
  groups still render, recorded on the Linear issue with the live SHA.

## Open questions

None blocking. Non-150-word tasks (D3.4) fail closed until a real paper needs
them.
