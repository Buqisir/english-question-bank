# applied-writing-lecture-v3 · Current Decisions

Last synced: 2026-07-22 after Wayfinder / PM compression.
Open review items: 0 before formal PA.

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
- Chinese uses self-hosted Xiaolai SC; English essay/English note fragments use
  self-hosted Shantell Sans. Runtime CDN dependencies are forbidden.
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
  points: string[] // 1..5
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

An application lecture publishes only with exactly five renderable review
marks. `text` must be a literal single-line substring of one model-answer line;
the validator must not accept a normalized-only anchor that the renderer cannot
find. Labels derive without text heuristics:

- `type` -> `判型「${reviewCard.type}」`
- `tense` -> `主时态 · ${reviewCard.tense}`
- `cares` -> `读者 · ${reviewCard.readerCares}`
- `wants` -> `读者 · ${reviewCard.readerWants}`
- repeated `points` marks -> `要点①/②… · ${reviewCard.points[index]}` in
  occurrence order; cardinality mismatch fails publishing.

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
- HTML, Markdown, newlines, leading/trailing whitespace, partial objects, and
  over-limit values fail the production gate. The website renders stored text
  nodes only; it never summarizes, splits, truncates, or invents copy.
- The backend application enrichment/backfill owns authoring. The website only
  consumes. Continuation neither produces nor persists `lectureAnnotation`.

## D5 — Availability and isolation

- Missing/invalid review contract or not-exactly-four valid highlight
  annotations makes the entire application lecture `unavailable`; no partial
  annotation page mounts.
- Right lecture rail keeps the filled four-section review card and one quiet
  pointer to the paper annotations. It does not duplicate the full essay or
  long highlight analyses.
- Annotation DOM exists only under `lectureOpen && application`.
- PaperSurface protocol, print/PDF/DOCX/export renderers, student mode, and all
  continuation payloads are forbidden scope.

## D6 — Historical boundary

The rejected B2 runtime on local/archive history is not implementation input.
Only the approved prototype/specs and the two pilot payload shapes are evidence.
No commit after `f64038f` on removed worktrees is live authorization.
