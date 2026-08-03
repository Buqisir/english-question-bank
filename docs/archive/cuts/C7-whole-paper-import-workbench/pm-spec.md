# C7 Whole Paper Import Workbench PM Spec

Status: ready for PA / implementation planning. C7 is a large cut.

## Summary

C7 builds a real local import workbench for one complete English paper.
The user imports a structured package, validates it, publishes it into
repo static assets and the local DB/search index, then verifies that
Reading A-D cards open the PaperSurface analysis experience.

C7 is not an AI generation cut. The product manages contracts, prompts,
validation, publishing, and QA links for externally generated and
reviewed JSON.

## Teacher / Owner Task

The owner has a reviewed paper package and wants to turn it into a
stable, searchable teaching asset. After publish, teachers should search
Reading A-D, click `阅读解析`, and see the existing PaperSurface analysis
with option evidence/trap lines.

## First Success Path

```text
Open ?view=paper-import
-> upload one paper package
-> validate
-> review blocking/warning report
-> confirm publish vN
-> write version/latest files and DB rows
-> show Reading A-D QA links
-> click Reading D latest
-> PaperSurface opens with right analysis panel
-> search cards show 阅读解析 for Reading A-D only
```

## Out Of Scope

- AI calls inside the product
- OCR, PDF, image, txt, or zip import
- writing scoring / writing analysis
- listening audio upload or playback
- draft paper / print preview
- body, question, option, or analysis fact editor
- PaperSurface renderer rewrite
- all-question-type analysis pages
- cloud auth / multi-user permissions

## Product Model

### Files

Input package may include:

- source `.docx`
- `paper-asset.json`
- `answer-key.json`
- `import-meta.json`
- one total `reading-choice-analysis-v1.json`
- per-group analysis JSON files for Reading A-D

Published normalized files:

```text
app/public/paper-assets/<paperId>/versions/vN/
  raw/
  paper-asset.json
  answer-key.json
  import-meta.json
  analyses/reading-choice-analysis-v1.json
  validation-report.json
  publish-report.json

app/public/paper-assets/<paperId>/latest/
  paper-asset.json
  answer-key.json
  import-meta.json
  analyses/reading-choice-analysis-v1.json
```

### Import Meta

`import-meta.json` stores search and display metadata that does not
belong in `paper-asset.json`.

Paper-level fields:

- `year`
- `region`
- `paperName`
- `examCode`
- `subject`
- `sourceType`
- `defaultTags`

Group-level overrides:

- `groupId`
- `difficulty`
- `summary`
- `tags`
- `topicLabels`
- optional `displayTitleOverride`

### ID Rules

- `paperId` is suggested and confirmed on first import.
- Republish locks `paperId`.
- `paperId` regex: `^paper-[a-z0-9]+(?:-[a-z0-9]+)*$`.
- C7 keeps current ID styles:
  - `group-{year}-{examCode}-reading-a`
  - `q-{year}-{examCode}-{questionNo3}`
  - `para-{year}-{examCode}-reading-a-p1`
- Missing IDs may be generated.
- Provided wrong IDs are blocking.

## Import Workbench UX

Route: `?view=paper-import`.

Layout: one page with top status steps and two columns.

Left column:

- upload zone with click and drag/drop
- file classification list
- delete/replace single file
- rejected file list
- metadata editor for paper/group meta only
- prompt cards with copy buttons

Right column tabs:

- validation report
- structure preview
- analysis entry preview
- publish result

Surface states:

- empty
- ready to validate
- validated
- published

Internal task states:

- parsing
- validating
- writingVersionFiles
- upsertingDb
- swappingLatest
- published
- failed

When an uploaded package exists and is not published, leaving or
refreshing the page should warn the user.

## Prompt Support

The workbench shows read-only prompt templates and copy buttons.
It also generates Reading A-D specific prompts from the current package.

Generated prompts must require:

- output a `.json` file
- if information is sufficient, output immediately
- no meaningless thinking outside question analysis
- self-check schema and required fields before output

Prompt history is not saved in C7.

## Validation

Validation source of truth is server-side.

Use JSON Schema plus business rules:

- JSON Schema proves structure, types, required fields, enums.
- Business validation proves cross-file consistency and PaperSurface
  usability.

Schema files live under repo-root `schemas/`:

```text
schemas/paper-asset-v1.schema.json
schemas/reading-choice-analysis-v1.schema.json
schemas/import-meta-v1.schema.json
schemas/answer-key-v1.schema.json
```

Use `ajv`.

Validation issue shape:

```ts
type PaperImportIssue = {
  severity: 'blocking' | 'warning' | 'info'
  path: readonly (string | number)[]
  displayPath: string
  message: string
  suggestedFix: string
}
```

Validation must run before file or DB writes.

### Required Business Checks

- `paperId` matches across files.
- answer key question IDs exist in `paper-asset`.
- Reading A-D group IDs exist.
- Reading A-D group question IDs exist.
- Reading A-D every question has analysis.
- analysis answer / `correctOptionLabel` / correct status matches
  answer key.
- option labels match paper-asset question options.
- evidence/trap `paragraphId` exists in the referenced group.
- support/trap quote resolves to the paragraph text.
- multiple quote matches require valid `occurrenceIndex`.
- `sourceLexicalTrap` has source/option text, match type, relation
  note.
- `unsupportedClaim` has explanation and no evidence in normalized
  output.

### Blocking / Warning Policy

Reading A-D correctness and evidence usability are blocking.
Other groups may be incomplete in C7 and produce warnings.

`unsupportedClaim` supplied with trap evidence is normalized by stripping
that evidence and warning.

## Publish

Publish is server-side.

Algorithm:

1. classify package files
2. validate schema and business rules
3. stop if any blocking issue exists
4. compute next version by max existing version + 1
5. write version files
6. start DB transaction and upsert latest rows
7. commit DB transaction
8. swap `latest/` atomically
9. write publish report / import run
10. return QA links

If DB upsert fails, rollback DB transaction and keep latest unchanged.

Success returns:

- Reading A-D latest teacher links
- Reading A-D version-pinned links
- search page link

## API

Use separate endpoints:

```text
POST /api/paper-import/validate
POST /api/paper-import/publish
POST /api/paper-import/revalidate-latest
```

Transport: `multipart/form-data`.

Use `busboy` for multipart parsing.

Limits:

- single file: 5MB
- whole package: 20MB
- max files: 20

Accepted file extensions:

- `.docx`
- `.json`

No auth in C7 local version. Future cloud version requires admin auth.

## DB / Search

Publish upserts local DB/search rows.

All groups become assets. Only Reading A-D get:

- `hasPaperSurfaceAnalysis: true`
- `paperSurfaceHref`

Non Reading A-D do not show disabled fake analysis buttons.

Reading group card summary priority:

```text
groupMeta.summary
-> analysis.groups[groupId].overview
-> paperAsset fallback
```

Difficulty:

```text
groupMeta.difficulty -> "中"
```

Tags:

```text
groupMeta override -> paperMeta.defaultTags + group type
```

## Preview

Preview is an import preview, not print preview and not embedded
PaperSurface.

Structure preview shows:

```text
A · 3段 · 21-23 · 3题
B · 5段 · 24-27 · 4题
C · 4段 · 28-31 · 4题
D · 5段 · 32-35 · 4题
```

Each group can expand to paragraph first-sentence previews.

Clicking a validation issue expands the path, scrolls to the related
node, and highlights it.

Default display is human path. Technical JSON path is shown in details.

## Browser QA

Golden path:

```text
open ?view=paper-import
upload fixture package
validate
publish
click Reading D latest link
assert PaperSurface route and right analysis panel
click wrong option with trap evidence
assert evidence/trap line
return to search page
assert Reading A-D cards show 阅读解析
assert 七选五/完形 do not show 阅读解析
```

Browser smoke must use a temporary public root and temporary DB.

## Test Fixtures

Use:

```text
test-fixtures/paper-import/paper-2024-jslk-english/
  source.docx
  paper-asset.json
  answer-key.json
  import-meta.json
  reading-a-analysis.json
  reading-b-analysis.json
  reading-c-analysis.json
  reading-d-analysis.json
```

## Future Cloud Notes

C7 local files simulate object storage. C7 SQLite/API simulate cloud
DB/API.

Cloud migration should replace:

- local file root -> object storage bucket
- local SQLite -> cloud DB
- no auth -> admin-only validate/publish
- local import runs -> audit records

Files should be tracked by version, path, and hash.
