# Application Writing V4 · Production Spec

Revision: `AW4-SPEC-1`

Status: accepted by Owner 2026-11-24 (「规范通过，从 01 开始做」)

Planning baseline: `origin/main@c11b14e3e`

## Authority

- Owner 2026-11-24: V4 won both blind rounds against V3 (5 : 0) and is to be
  connected to production. Evidence: `docs/product/application-writing-rules-ledger.md`
  (Trials).
- Owner 2026-11-24: the V4 task card replaces `application-review-card-v2` for
  groups generated with V4. Groups that are not regenerated keep their current
  card and keep rendering.
- Owner 2026-11-24: no paper is regenerated in this cut. Data reruns are a later,
  separate decision.

This spec supersedes the retained-pilot rule "one model answer plus one review
card" (`docs/cuts/applied-writing-lecture-v3/spec.md`) for V4 groups only.

## Problem

Production application writing runs on the V3 prompt. It produces one essay and a
ten-field review card. The V4 prompt produces a standard essay (100–120 new
words), an advanced essay (130–150), a two-part task card that separates what the
task requires from what this essay chose, paragraph notes, two or three task
expressions, and notes on what the advanced essay adds. Every production gate
(projection key lists, persistence, analyzed-package intake, agent plugin marker,
web lecture, PDF) accepts only the V3 shape, so V4 output would be rejected or
silently dropped.

## User outcome

When an application-writing group is generated after this cut, a student or
parent reading the web page or the PDF can:

1. see what the task requires and, separately, what this essay chose and could
   be swapped;
2. read a standard essay they could write themselves, with notes per paragraph
   that quote the essay and say why each choice works;
3. take away two or three expressions that fit this kind of task;
4. read an advanced essay and see, quoted, what it does beyond the standard one.

Groups generated before this cut look exactly as they do now.

## Accepted decisions

### D1 Data contract

`groups[groupId].writing` for `taskType: "application"` gains one optional key:

```json
"applicationAnalysis": {
  "schemaVersion": "application-analysis-v4",
  "taskCard": { "taskRequires": ["…"], "thisEssayChooses": "…" },
  "standard": {
    "essay": "…",
    "pointMap": [{ "point": "…", "quote": "…" }],
    "notes": [{ "paragraph": 1, "role": "…", "items": [{ "quote": "…", "explain": "…" }] }],
    "expressions": [{ "expression": "…", "function": "…" }]
  },
  "advanced": {
    "essay": "…",
    "pointMap": [{ "point": "…", "quote": "…" }],
    "beyondStandard": [{ "quote": "…", "explain": "…" }]
  }
}
```

- The object is closed: no keys beyond those shown.
- When `applicationAnalysis` is present, `modelAnswer` equals
  `applicationAnalysis.standard.essay` byte for byte, so every existing reader of
  `modelAnswer` (answer box, teacher print, draft-paper text) keeps working.
- A V4 group carries `applicationAnalysis` and no `reviewCard`. A group must carry
  exactly one of `reviewCard` or `applicationAnalysis`.
- `officialModelAnswer` is unchanged.
- The model's `taskType` and `blocked` fields are not stored. A blocked result
  is a failed generation and is not persisted.

### D2 Prompt

- `prompts/application-writing-model-answer-v4.md` becomes the production prompt.
  Its status line changes from TRIAL to PRODUCTION; its body does not change in
  this cut.
- The runtime prompt is V4 plus the task text, exactly as in both blind trials.
  The shared doctrine (`teaching-analysis-style-v1.md`) is not appended for
  application writing, because V4 was voted without it and the doctrine's
  "highlight expressions are retired" rule would contradict V4's task
  expressions. The doctrine still applies to every other task type.
- V3 stays in the repo, marked SUPERSEDED, so old outputs remain traceable.

### D3 Validation

A V4 result is accepted only if all of the following hold. Each failure names the
field and the rule.

1. Shape matches D1; `blocked` is null.
2. Both essays: given lines (title, salutation, first sentence, closing lines,
   signature) appear verbatim and in order, as the current
   `validateApplicationModelAnswer` already checks; no Chinese, Markdown, JSON or
   numbering; the given first sentence opens the first body paragraph.
3. Both essays: body text has 3 or 4 paragraphs separated by one blank line.
4. Word count of new writing, for an 80-word task: standard 100–120, advanced
   130–150. For any other target the result is rejected for manual handling,
   because V4 has not been tried on one.
5. `pointMap` is non-empty in both essays and every `quote` is a verbatim
   substring of its essay.
6. Every `notes[].items[].quote` is a verbatim substring of the standard essay;
   every `notes[].paragraph` names an existing body paragraph; each note has
   1–4 items.
7. `expressions` has 2–3 entries; `beyondStandard` has 2–3 entries, each `quote`
   verbatim in the advanced essay.
8. `taskCard.taskRequires` has 1–4 non-empty lines; `thisEssayChooses` is
   non-empty.

Warnings, not failures: a one-sentence middle paragraph; middle paragraphs whose
word counts differ by more than 2×.

The existing second-agent review (`PASS` / `MUST_FIX`) stays on every route and
reviews both essays and the notes.

### D4 Generation routes

- New papers (`lecture-redo.mjs` staged route): the application output contract
  becomes V4 plus a packaging contract `application-writing-staged-analysis-v2.md`
  that wraps the V4 JSON as `{ taskType, modelAnswer, applicationAnalysis }`.
  The agent plugin marker check moves from the V3 heading to the V4 heading.
- Backfill (`writing-analysis-driver.mjs`): the agent writes
  `<key>.analysis-v4.json` (the V4 JSON) and `<key>.review.json`; `persist`
  derives `modelAnswer` from the standard essay.
- Analyzed-package intake accepts `applicationAnalysis` for `application`.
- The persistence projection keeps `applicationAnalysis`; it is not dropped.

### D5 Web lecture

Position stays as today: the essay sits in the answer box, the teaching sits in
the right rail. V4 groups show:

- answer box: standard essay, with a switch to the advanced essay;
- right rail, in order: task card (必须做到 / 可以换), paragraph notes
  (逐段看), task expressions (本题可用表达), and, when the advanced essay is shown,
  what it adds (提高版多做了什么).

Paragraphs are separated by spacing, not by empty lines. Exact layout is settled
by before/after samples that the Owner approves before anything reaches main.

### D6 PDF (`analysis.pdf`)

V4 groups print, in order: task card, standard essay, paragraph notes, task
expressions, advanced essay, what the advanced essay adds. Groups with
`reviewCard` print as today. Exact layout is settled by before/after samples
that the Owner approves before anything reaches main.

### D7 Legacy

`reviewCard` V2 and the legacy card remain valid in schema, projection, web and
PDF. Nothing that reads them is removed.

## Test seams

- Validator unit tests with fixtures built from the trial outputs in this cut's
  `qa/`: one passing result per trial paper, and one failing fixture per D3 rule.
- Projection, persistence and analyzed-package tests: V4 envelope accepted;
  `modelAnswer` ≠ standard essay rejected; both or neither of `reviewCard` and
  `applicationAnalysis` rejected; legacy envelopes unchanged.
- Prompt verify: runtime application prompt equals V4 plus task text; V3 markers
  no longer required; doctrine checks still pass for every other task type.
- Web and PDF: a V4 fixture renders all six blocks; a V2-card fixture renders
  byte-identical HTML to the baseline.

## Out of scope

- Regenerating any paper's application writing.
- Continuation writing (读后续写).
- Changing the V4 prompt body or the rules ledger.
- Retiring V3 data or the V2 card.

## QA

- `node scripts/verify-ci.mjs` passes locally on every ticket.
- Web and PDF samples (before/after, 1440 and 390 widths, light theme) approved by
  the Owner before the display tickets reach main.
- After each push to main: agent-cloud live check that existing application
  groups still render, recorded on the Linear issue with the live SHA.

## Open questions

None blocking. Non-80-word tasks (D3.4) fail closed until a real paper needs
them.
