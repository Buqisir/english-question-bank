# applied-writing-lecture-v3 · Current Decisions

Last synced: 2026-07-22 after formal-PA plan revision.
Open blocking PO decisions: 1 (owner visual “过关” on the real-packet
prototype).

## D1 — Teacher task

讲评时，老师需要让学生在**原范文阅读流里**看见“审题判断如何落到具体
句子”和“哪些句式可以迁移”，而不是把作文拆进新的 AI 卡片或仪表盘。

## D2 — Frozen visual contract

- Owner-approved source is `f64038f` on remote branch
  `codex/applied-writing-lecture-prototype-archive-20260722`.
- Selected: Variant A `全局空白求交`; rejected: B `页边车道优先`, C
  `锚句近邻优先`.
- Original essay remains primary. There are exactly two annotation views:
  `审题要点` and `亮点句式`. Notes are always visible; there is no card,
  drawer, click-to-expand, runtime truncation, or taller paper fallback.
- The model-answer essay keeps the paper's existing Times New Roman face and
  reading flow. Chinese annotations use self-hosted Xiaolai; only English
  fragments inside annotations and transfer examples use self-hosted Shantell
  Sans. This owner decision on 2026-07-22 supersedes the prototype's use of
  Shantell Sans for the whole essay. Runtime CDN dependencies are forbidden.
- Every annotation uses the same deterministic placement and mixed
  leader/arrow rule. No label-specific exception or hard-coded coordinate is
  allowed. Arrow direction is English source -> Chinese annotation.

## D3 — Application review contract

`writing-analysis-v1` stays v1. Application groups gain additive optional
`reviewCard` and `reviewMarks`; the production validator and frontend
availability predicate make them required for publishing the v3 lecture view.
Continuation remains readable and unchanged.

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

type ReviewMark = {
  grid: 'type' | 'tense' | 'points' | 'cares' | 'wants'
  text: string
  note: string
}
```

This cut supports only two-point application prompts. An application lecture
publishes only with exactly two non-empty `points` and exactly five renderable
review marks in this fixed grid order:

`type -> cares -> points[0] -> tense -> points[1]`

The exact order is the selected prototype's two-point mark set. Non-point grids
cannot repeat; `wants` is forbidden in this class; the two `points` occurrences
map by occurrence order to indices 0 and 1, so every review-card point appears
exactly once. `points.length !== 2`, any other grid order/multiset, any repeated
non-point grid, or a point-mark/index/cardinality mismatch rejects the whole
lecture payload. Support for one, three, four, or five points requires a later
contract revision; schema breadth must not pretend those classes publish now.

Every review `text` must be a non-empty literal substring wholly contained in
one logical `modelAnswer` line. The validator must not accept a normalized-only
anchor that the renderer cannot find. Labels derive without text heuristics:

- `type` -> `判型「${reviewCard.type}」`
- `tense` -> `主时态 · ${reviewCard.tense}`
- `cares` -> `读者 · ${reviewCard.readerCares}`
- `wants` -> `读者 · ${reviewCard.readerWants}`
- the first/second `points` mark -> `要点①/② ·
  ${reviewCard.points[index]}` in occurrence order.

## D4 — Short highlight annotation contract

The existing outer `highlightExpressions[].text` and long `.note` keep their
meaning, value, and order. Application expressions may add:

```ts
lectureAnnotation?: {
  label: string
  note: string
  transferExample?: string
}
```

- A published application v3 lecture has 3–5 expressions and exactly four
  complete, valid `lectureAnnotation` objects. Five expressions may leave one
  unannotated; three expressions cannot publish until a fourth is authored.
- Values are trim-clean, single-line plain text measured in Unicode code
  points: `label <= 24`, `note <= 28`, optional `transferExample <= 52`.
- Each of the exactly four annotated expression `text` values must also be a
  non-empty literal substring wholly contained in one logical `modelAnswer`
  line. Normalization-only matches are forbidden for both publishing and
  frontend availability.
- HTML, Markdown, newlines, leading/trailing whitespace, partial objects, and
  over-limit values fail the production gate. The website renders stored text
  nodes only; it never summarizes, splits, truncates, or invents copy.
- The backend application enrichment/backfill owns authoring. The website only
  consumes. Continuation neither produces nor persists `lectureAnnotation`.

## D5 — Availability and isolation

- Backend validation, persistence projection, frontend availability, the
  payload-parity harness, and browser behavior use the same whole-object rule.
  Missing/invalid review contract, a malformed-present nested value, a
  non-literal anchor, or not-exactly-four valid highlight annotations makes the
  entire application lecture `unavailable`; no partial annotation page mounts.
- Right lecture rail keeps the filled four-section review card and one quiet
  pointer to the paper annotations. It does not duplicate the full essay or
  long highlight analyses.
- `activeWritingLectureGroupId` is the explicit owner of the paper-local stage.
  Clicking an application answer box sets that group active and opens lecture
  mode. Annotation DOM exists only under
  `lectureOpen && activeWritingLectureGroupId === groupId && application &&
  available && panelGroupId === groupId`.
- While payload fetch/validation is loading, the original 246 px answer box
  remains and the rail may say `解析加载中…`; invalid/unavailable data leaves the
  answer box intact and shows `解析未发布`. Neither state mounts partial stage
  DOM.
- Esc/lecture-close clears `activeWritingLectureGroupId`, stage view, and seed.
  Selecting or scrolling the active panel to continuation/another group clears
  the writing owner and removes the stage before the other group's rail mounts.
- PaperSurface protocol, print/PDF/DOCX/export renderers, student mode, and all
  continuation payloads are forbidden scope.

## D6 — Historical boundary

The rejected B2 runtime on local/archive history is not implementation input.
Only the approved prototype/specs and the two pilot payload shapes are evidence.
No commit after `f64038f` on removed worktrees is live authorization.

## D7 — Lecture-only host and narrow boundary

- The selected prototype already fixes the host: while the active application
  lecture is available, replace the ordinary on-screen 246 px application
  answer-box region with one fixed 794 × 472 px stage; its answer frame is
  612 × 458 px and reaches into the paper's 91 px side gutters exactly as the
  prototype does. It is neither an overlay squeezed into 246 px nor an
  additional host below the answer box.
- `卷面不增高` means the lecture stage never grows beyond 472 px to rescue a
  failed layout. Entering lecture does replace 246 px with 472 px on screen;
  closing/teardown restores the original 246 px exam answer box.
- This replacement is lecture-only DOM. Student mode and every print, PDF,
  DOCX, export, non-lecture, unavailable, and loading path retain the current
  exam-format answer box and never receive annotation fonts/content.
- The host is the website's existing `.paper-browse-content` paper canvas.
  Opening lecture reflows that canvas and the 380 px rail side-by-side; the rail
  does not cover the paper. Real-page measurement at 1470 × 719 is
  `canvas 794 / nested writing 612 / answer 612 × 246 / rail 380`, exactly
  matching the prototype's outer/inner widths.
- V3 availability follows the measured canvas, not a fixed viewport guess:
  mount only when the reflowed paper canvas is its full 794 CSS px. Below that
  canvas width, preserve the existing responsive 246 px answer box and current
  lecture rail behavior. Local 1200 × 719 evidence was
  `canvas 628 / answer 446 / rail 380`, side-by-side without overlap.
  No horizontal-scroll canvas, scaled stage, overflow, or mobile variant may be
  invented in this cut.
- Owner visual adjustment (2026-07-23): on review view, the fixed fifth mark
  (`points[1]`, rendered as `要点②`) prefers valid lower-left whitespace inside
  the answer frame. The 2024 pilot has that pocket and uses it; a packet without
  a collision-free pocket stays with the global solver. The English source
  always stays in the original essay flow and its leader still points from that
  literal anchor to the note. This is one semantic placement preference in the
  locked five-mark class, not a hard-coded coordinate or permission to move
  source text.

## D8 — Locked pilot teaching content

The exact pre-DEV candidates are:

- `pilot-content/paper-2022-i.application.json`
- `pilot-content/paper-2024-i.application.json`

Their current model answers and outer long-highlight fields are byte-for-byte
bound to `github/main@1deec0fce29852556bb60e0b2fd8a1fb6075f2d4`.
The new review/lecture teaching copy passed PM checks for prompt fit, grammar,
register, reader relationship, purpose, literal anchors, length, and Gaokao
vocabulary. The runtime-only owner-review harness injects
`prototype-pilot-review.html?embedded=1` into each packet's real local
`PaperBrowsePage`: both use the actual 794 px canvas and 91 px answer offset,
the actual 380 px lecture rail remains side-by-side, and the 628 px narrow host
is rejected before injection. Machine precheck reports `5/5 + 4/4` for each.
The owner's personal visual “过关” remains the hard DEV precondition; DEV may
transport approved content but may not invent or rewrite it.
