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

1. read the source through its main characters, point of view and style, and
   the problem left open at the end;
2. see 2–3 quoted source details and how each can be reused;
3. see the standard essay's route and how each paragraph meets the task;
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
    "questions": [
      { "question": "人物", "answer": "…" },
      { "question": "视角与风格", "answer": "…", "evidence": ["…"] },
      { "question": "待解决问题", "answer": "…" }
    ],
    "characters": [
      { "name": "…", "role": "…", "lines": [{ "label": "想要", "text": "…", "evidence": "…" }] }
    ],
    "sourceLinks": [{ "sourceQuote": "…", "use": "…" }]
  },
  "taskCard": {
    "route": "…",
    "paragraphs": [
      { "paragraph": 1, "must": "…", "draft": "…", "bridgeQuote": "…", "bridge": "…？" },
      { "paragraph": 2, "must": "…", "draft": "…" }
    ]
  },
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

- V3 stays closed. Existing `taskCard` objects with `taskRequires` and
  `thisEssayChooses` stay valid as an alternative to `route` and `paragraphs`.
- `characters` and `evidence` are optional. When characters are present, they
  supply the 人物 row. Character line labels are 性格、想要、此刻、表现.
  Only include main characters whose actions matter to the continuation.
- `bridgeQuote` and `bridge` are optional as a pair on paragraph 1.
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
  prompt. The writing principles from round 3 still apply. The updated prompt
  asks for the new reading and paragraph guidance fields. It asks for evidence
  of about 15 English words per excerpt and no more than eight in 读原文.
- The runtime prompt is V3 plus the structured task input.
  The shared doctrine (`teaching-analysis-style-v1.md`) is not appended
  for continuation writing, because V3 was voted without it. Two doctrine rules
  would also contradict V3: "highlight expressions are retired" (V3 has task
  expressions), and V2's "never quote generated prose" (V3 notes quote the
  essay). The doctrine still applies to every other task type.
- The V2 pair stays in the repo, marked SUPERSEDED, so old outputs remain
  traceable.

### D3 Validation

A V3 result is accepted only if all of the following hold. Each failure names
the field and the rule.

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
6. `reading.questions` has exactly three entries. On the new route the order is
   人物、视角与风格、待解决问题. Each may have 0–2 verbatim source excerpts,
   and each character line may have one. `reading.sourceLinks` has 2–3 entries
   with verbatim excerpts from the source or a starter. For new entries, `use`
   names the paragraph where the detail is used.
7. `taskCard` uses exactly one structure. The new route includes a one-sentence
   `route` and two `paragraphs` in order. `must` states the task requirement and
   `draft` explains the action actually written in the standard essay. The first
   paragraph may include a verbatim `bridgeQuote` from the source or a starter
   and a Chinese bridge question. The legacy structure has 2–4 non-empty
   `taskRequires` and a non-empty `thisEssayChooses`.
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
For the new route, the rail shows 读原文 → 可用伏笔 → 两段怎么写 → 逐段看 →
本题可用表达 → 容易写偏 → 提高版多做了什么 (shown with the advanced essay).
两段怎么写 shows the route, then 题目要求 and 范文这样写 for each paragraph,
with 两段之间 after the first paragraph when supplied. Legacy V3 retains
原文这里可以借 inside 读原文, followed by 审题卡 (必须做到 / 可以换).

### D6 PDF (`analysis.pdf`)

The new route prints 读原文 → 可用伏笔 → 两段怎么写 → 标准版范文 → 逐段看 →
本题可用表达 → 容易写偏 → 提高版范文 → 提高版多做了什么. The first three blocks
use 12 pt headings, 10 pt body text, and 9 pt muted bold labels. Indented quotes
run on their own line in 9 pt muted ink, with 依据 before reading evidence.
Spacing separates the first block heading from the group title. Legacy V3
retains 审题卡, and V1 and V2 retain their existing layout.

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
