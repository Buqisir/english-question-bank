# Applied Writing Lecture · Retained Pilot Spec

Revision: `AWL-RETAINED-SPEC-1`

Status: accepted for implementation ticketing

Planning baseline: `github/main@773c3b77e5fca12b9407a25d63448f237ce692f7`

## Authority and supersession

The owner closed the in-paper annotation initiative at
`708a5ae18a781679d4ebfe8228a84738252f2c24`:
`docs/cuts/applied-writing-lecture-v3/closure.md`.

This spec is the only production contract for the retained pilot. It
supersedes every annotation, geometry, leader, two-tab, handwritten-note, and
R4 implementation requirement in the historical v3 documents. Historical
prototype and v3 branches are evidence only. Implementation starts from the
planning baseline above and must not merge or cherry-pick the old v3
implementation branch.

## Teacher task

While explaining an application-writing task, the teacher needs to:

1. read one complete model answer in the original answer-box position; and
2. use one compact right-rail card to establish audience, purpose, content
   points, language constraints, and communicative value.

The retained pilot does not teach highlight expressions. Existing highlight
data is not a reason to show it.

## Pilot boundary

Only these two application-writing groups may publish the retained experience:

| Paper | Group |
| --- | --- |
| `paper-2022-i` | `group-2022-i-writing-application` |
| `paper-2024-i` | `group-2024-i-writing-application` |

All other application groups retain their ordinary answer box. Because they do
not have a valid `reviewCard`, their right rail shows `解析未发布`.

Continuation writing is not part of this pilot.

## Before and after

### Current `main`

- The application answer box is inert.
- Opening lecture mode loads `writing-analysis-v1.json`.
- Application writing currently uses `WritingAnalysisPanel` in the right rail,
  which shows the model answer and highlight expressions.

### Retained pilot

When lecture mode is open, the current panel group is one of the two pilot
application groups, and its complete retained payload is valid:

- the existing application answer box shows the complete plain
  `modelAnswer`;
- the right rail shows only the filled `reviewCard`;
- the model answer is not duplicated in the rail;
- no highlight expression is rendered anywhere in the retained experience.

Closing lecture mode or moving panel ownership to another group immediately
restores the ordinary answer box.

## Publication contract

A retained application lecture is available only when all of these are true:

1. the source writing task is `taskType: "application"`;
2. the group is one of the two pilot group IDs;
3. `modelAnswer` is a non-empty string;
4. `reviewCard` is present and complete;
5. each `reviewCard` scalar is trim-clean, non-empty, plain single-line text
   within 80 Unicode code points; and
6. `reviewCard.points` contains exactly two values satisfying the same text
   rule.

The required `reviewCard` shape is:

```ts
type ReviewCard = {
  form: string
  topic: string
  reader: string
  person: string
  tense: string
  type: string
  points: [string, string]
  readerWho: string
  readerCares: string
  readerWants: string
  value: string
}
```

Malformed-present data fails closed. A missing field, `null`, wrong type,
wrong point count, surrounding whitespace, newline, Markdown, or markup makes
the retained lecture unavailable:

- the ordinary answer box remains;
- the right rail shows exactly `解析未发布`;
- no partial card or plain model-answer replacement mounts.

Loading keeps the ordinary answer box and may show `解析加载中…`.

## Visible-unit mapping

### Left: plain model answer

- Source: the persisted outer `modelAnswer`.
- Preserve exact text, logical-line order, paragraph order, salutation, and
  closing/signature.
- Split only on stored newlines for rendering.
- Do not rewrite, summarize, truncate, annotate, underline, or inject markup.
- Use the existing paper face and answer-box width/padding.
- The box may grow vertically when the complete answer requires it; it must not
  scale, clip, or overflow horizontally.
- The replacement is browser lecture-mode DOM only.

### Right: review card

The rail heading remains the application group title. Beneath it, render these
four sections in this order:

1. `基础判断`
   - `体裁` ← `form`
   - `主题` ← `topic`
   - `读者` ← `reader`
   - `人称` ← `person`
   - `时态` ← `tense`
   - `类型` ← `type`
2. `内容要点`
   - ordered item 1 ← `points[0]`
   - ordered item 2 ← `points[1]`
3. `读者三问`
   - `是谁` ← `readerWho`
   - `关心` ← `readerCares`
   - `期待` ← `readerWants`
4. `价值落点`
   - body ← `value`

No model answer, highlight list, annotation pointer, status banner, or
additional AI analysis appears below the card.

## State and responsive behavior

The mount predicate is:

```text
lectureOpen
&& panelGroupId === groupId
&& pilot application group
&& complete retained payload
```

No separate answer-box trigger, active-writing ID, tab state, seed, canvas
measurement, or reseed state is introduced.

The existing lecture shell owns responsive behavior:

- wide screens keep the paper and sticky 380 px rail;
- narrow screens keep the existing lecture drawer;
- the plain answer and card remain readable without a fixed 794 × 472 stage;
- existing `Esc`, lecture-toggle, rail, and scroll ownership behavior remains
  unchanged.

## Payload and persistence boundary

- Add only optional `reviewCard` semantics to application writing analysis.
- Copy only the approved `reviewCard` values into the two current-main pilot
  assets. The exact source is
  `708a5ae18a781679d4ebfe8228a84738252f2c24` at the matching
  `app/public/paper-assets/<paper>/latest/analyses/writing-analysis-v1.json`
  paths; do not copy any sibling v3 field.
- Do not add, consume, or persist `reviewMarks`.
- Do not add or consume `lectureAnnotation`.
- Do not delete, migrate, regenerate, reinterpret, or reorder existing
  `highlightExpressions`.
- Existing application persistence must preserve every outer
  `highlightExpressions` item exactly while round-tripping `reviewCard`.
- Continuation validation, projection, payloads, and rendering remain
  byte-for-byte and behaviorally unchanged.

`highlightExpressions` remains part of the existing writing-analysis data
contract, but it is outside this feature's visible and behavioral scope.

## Explicit exclusions

The retained pilot must not contain or revive:

- highlight-expression display;
- review marks or literal-anchor mapping;
- lecture annotations;
- underlines, arrows, leaders, handwritten notes, or note cards on paper;
- automatic whitespace placement or collision solving;
- drag, line-between-text, inline annotation, or alternative annotation modes;
- tabs, `重新寻位`, random seeds, or geometry diagnostics;
- custom application-writing fonts;
- `WritingReviewAnnotationStage`, `writingReviewRouteGeometry`, R4-04, or any
  later R4 ticket;
- changes to PaperSurface, student mode, print, PDF, DOCX, export, routes, or
  production configuration;
- regeneration of the other application-writing analyses.

## Verification and release gates

Implementation must prove:

1. both pilots render the complete plain answer plus complete card;
2. missing and malformed cards fail closed without partial DOM;
3. no highlight-expression or annotation UI appears;
4. closing/switching restores ordinary writing content and continuation remains
   unchanged; and
5. student and print/PDF/DOCX/export paths remain baseline-exact and receive no
   retained-lecture DOM or review-card behavior.

This work changes schema/data-contract semantics and guards export isolation.
After the implementation ticket passes its own TDD, relevant checks, ordinary
Standards + Spec review, and commit, run one fresh top-level `/code-review`
against the implementation task's fixed point before owner QA or merge.
