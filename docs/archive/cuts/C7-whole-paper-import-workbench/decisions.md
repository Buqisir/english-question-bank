# C7 Whole Paper Import Workbench Decisions

Status: PM locked after grill + external PA correction.

This file is the compact decision ledger for C7. Use
`pm-spec.md` for the full product / engineering brief.

## Workflow Decision

- C7 is a large cut.
- Codex owns PM / DEV / CR-lite / local browser QA / RM.
- External Opus PA is used before DEV for large-cut plan challenge.
- External Opus big CR may be used after Codex DEV.
- The owner is PO and final product QA, not code reviewer.
- PA prompts for this cut live in the repo so external agents read a
  versioned file instead of a long chat paste.

## Product Scope

- Import unit: one complete English paper per upload package.
- First usable loop: import package -> validate -> publish -> Reading
  A-D QA links -> PaperSurface -> search cards.
- Reading A-D get PaperSurface analysis entries.
- Other groups are imported as assets but do not show a fake analysis
  button.
- DOCX is source/archive. Structured JSON is operational truth.
- C7 does not call AI. It displays/copies prompts for external AI.

## Upload Package

- Allowed file types: `.docx` and `.json`.
- Rejected files are shown as rejected files; other uploaded files stay.
- No `.zip`, `.pdf`, image, `.txt`, OCR, or JSON repair.
- JSON must be UTF-8 strict JSON object.
- Code fences, JSON5, comments, trailing commas, top-level arrays, and
  unknown `schemaVersion` are blocking.
- Limits for one-paper import: single file 5MB, total package 20MB, max
  20 files.
- Upload UI supports file picker + drag/drop + delete/replace single
  file.
- File classification is automatic; low-confidence files require user
  confirmation.

## Analysis File Merge Rules

- Upload may include one total `reading-choice-analysis-v1.json`.
- Upload may also include per-group analysis JSON files for Reading A-D.
- Per-group files override the total file for the same group and produce
  a visible warning.
- Same-level duplicate group analysis conflicts are blocking.
- A file with multiple `targetGroups` is allowed and gets a
  `multi-group analysis file` warning.
- Published normalized output is always one
  `analyses/reading-choice-analysis-v1.json`.

## Metadata

- `import-meta.json` carries search/display metadata.
- Paper-level metadata: `year`, `region`, `paperName`, `examCode`,
  `subject`, `sourceType`, `defaultTags`.
- Group-level overrides: `groupId`, `difficulty`, `summary`, `tags`,
  `topicLabels`, optional `displayTitleOverride`.
- Search card summary priority:
  `groupMeta.summary -> analysis.groups[groupId].overview -> paperAsset fallback`.
- Difficulty priority: `groupMeta.difficulty -> "中"`.
- Tags/topic labels priority:
  `groupMeta override -> paperMeta.defaultTags + group type`.

## IDs

- `paperId` is suggested by the system and confirmed by the user on
  first import. It is locked on republish.
- `paperId` regex: `^paper-[a-z0-9]+(?:-[a-z0-9]+)*$`.
- Suggested pattern: `paper-{year}-{examCode}-{subject}`.
- `examCode` is system-suggested and user-confirmed.
- Keep existing group/question/paragraph ID styles for C7:
  - `group-{year}-{examCode}-reading-a`
  - `q-{year}-{examCode}-{questionNo3}`
  - `para-{year}-{examCode}-reading-a-p1`
- Missing IDs may be generated. Provided wrong IDs are blocking.

## Validation

- Validation runs on the server, not as frontend source of truth.
- Use JSON Schema plus business validation.
- Schema files live under repo-root `schemas/`.
- Use `ajv` for JSON Schema validation.
- Business validation must run after schema validation and before file
  or DB writes.
- Validation issue shape:
  - `severity: "blocking" | "warning" | "info"`
  - structured `path`
  - human `displayPath`
  - `message`
  - `suggestedFix`
- UI displays severity as 阻断 / 警告 / 提示.
- Clicking an issue expands the related preview path, scrolls there,
  and highlights it.
- Each issue has a copy-to-AI repair prompt. The prompt asks for a full
  corrected `.json` file, not a patch or explanation.

## Blocking Rules

- Invalid JSON, unknown schema, non-object JSON, and code fences.
- `paperId` mismatch.
- Reading A-D missing group/question/answerKey/analysis.
- Reading A-D answerKey mismatch with analysis `answer` /
  `correctOptionLabel` / correct option status.
- Support evidence or trap evidence quote not resolvable for Reading
  A-D.
- Unknown `paragraphId`.
- Multiple quote matches without valid `occurrenceIndex`.
- Provided ID violates system rule.
- Republish breaks Reading A-D groupId/questionId stability.
- `sourceLexicalTrap` missing required structured fields.

## Warning Rules

- Non Reading A-D group incomplete.
- Non Reading A-D objective answerKey missing or malformed.
- Unknown fields stripped from normalized output.
- Text changes that do not break evidence quote resolution.
- Missing `locationParaphrases`, `teachingNote`, or discourse structure.
- Nonstandard file names when JSON content is identifiable.
- `unsupportedClaim` supplied trap evidence: strip in normalized output
  and warn.

## Publish

- Version number is system-generated by max existing version + 1.
- Publish uses simplified two-phase flow:
  validate -> write version files -> DB transaction -> swap latest.
- Latest is changed last. If DB upsert fails, latest remains old.
- Publish success returns Reading A-D QA links:
  - latest teacher entry
  - version-pinned entry
  - search page link
- Publish report records `publishedScope`, complete groups, incomplete
  groups, file hashes, DB upsert summary, and QA links.
- Soft withdraw/archive is reserved in the model, but C7 does not build
  withdraw UI.

## Search / DB

- Publish all groups as assets.
- Only Reading A-D get `hasPaperSurfaceAnalysis=true` and
  `paperSurfaceHref`.
- Non Reading A-D keep existing actions only.
- Listening imports text/options/answers only; no audio.
- Writing imports prompt/material/continuation starters only; no
  scoring.
- Reading A-D answerKey problems block publish. Other objective
  answerKey problems warn in C7.

## Preview / QA

- Import preview is structure preview, not print preview.
- Structure tree shows group label, paragraph count, question range, and
  first-sentence previews.
- Publish success shows QA links for Reading A-D.
- Browser smoke must use temp public root + temp DB to avoid polluting
  real repo/latest.

## Open PO Decisions

None. The external PA left five decisions; PM/PO resolved them:

- publish atomicity: accepted latest-last flow
- `paper-asset` status: default `published`
- upload transport: `multipart/form-data` with `busboy`
- storage location: keep under `app/public/paper-assets/`
- schema validation dependency: allow `ajv`
