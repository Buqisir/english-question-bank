# EQB steering index

Read this index before product, UI, planning, implementation, review, QA, or
shipping work. Load only the note relevant to the task.

## Collaboration

### Matt development workflow

File: `codex-matt-workflow.md`

Use it to choose `grill-with-docs`, Wayfinder, spec/tickets, implementation,
review, handoff, QA, and shipping. The owner manually creates every top-level
task. Historical Auto-Next documents do not route current work.

### Product and engineering workflow

File: `cut-workflow-protocol.md`

Use it to classify Small / Normal / Huge context shape and normal / high product
risk, then choose the smallest sufficient path.

### DEV completion

File: `dev-completion-protocol.md`

Use it for the short ticket result and the single copyable `Next`.

### Owner QA handoff

File: `../agents/owner-qa-handoff-template.md`

Use it for the single canonical QA provisioning contract and handoff format
across prototypes, implementation, re-QA, responsive checks, real-data
acceptance, and post-review owner QA.

### Issue tracker

File: `../agents/issue-tracker.md`

Multi-session truth lives in tracked `spec.md`, tickets, and optional Wayfinder
files under `docs/cuts/<feature>/`.

### Review depth

File: `../agents/review-levels.md`

Ordinary `/implement` owns its review. High-risk work adds one independent
top-level `/code-review`.

## Product direction

### Product scope discipline

File: `product-scope-discipline.md`

Every visible field must serve a concrete teacher task. Do not turn the focused
workbench into an AI dashboard just because data exists.

### UI mockup before implementation

File: `ui-mockup-before-dev-protocol.md`

Use for structural visual work. Settle the visual contract before production
implementation; stop after two non-converging rounds and return to the problem.

### Cut notes

File: `cut-note-protocol.md`

Use only when a material release creates knowledge worth preserving. Cut notes
are optional memory, not a merge gate.

## Non-negotiable product posture

- Teacher task before feature excitement.
- Passage-first, not isolated-question-first.
- AI output requires human confirmation.
- Student versions hide answers/explanations.
- Teacher versions include them for review and teaching.
- PaperSurface insight defaults to a short passage map.
- Dense diagnostic dashboards require a separate product justification.
- User-visible work requires real browser QA and owner acceptance.

## Reading discipline

Start with the accepted spec/ticket and the smallest relevant code surface.
Do not load every steering note, historical cut, or case-law entry. Files are
context pointers, not a reading quota.
