# Paper Asset Extraction Prompt — V1

## Purpose

Extract a clean `paper-asset-v1` JSON from DOCX-extracted text.

## Input

Extracted plain text from a whole English exam paper DOCX.

## Output

A single JSON object conforming to `paper-asset-v1` schema:

```json
{
  "schemaVersion": "paper-asset-v1",
  "paper": { ... },
  "sources": { ... },
  "layoutTree": { ... },
  "content": { ... },
  "answerKey": {},
  "analysis": {}
}
```

## Rules

### MUST produce:

1. `paper` — stable `paperId`, `title`, `subject`, `source`, `assetVersion: 1`, `status: "draft"`
2. `sources` — record the DOCX source with `fileName`, `sha256`, `sourcePath`
3. `layoutTree` — model the real exam hierarchy: `parts → sections → groups`
4. `content.blocks` — all blocks in paper order using semantic block types:
   - `notice`, `partHeading`, `sectionHeading`, `instruction`, `exampleQuestion`
   - `questionRange`, `group`, `answerBox`, `pageBreakHint`
5. `content.groups` — every group with `groupType`, `questionIds`, passage data, optionBank, etc.
6. `content.questions` — every question with `questionId`, `questionNo`, `groupId`, `stem`, `options`
7. `content.blanks` — all blanks for 七选五, 完形, 语法填空 linked to `questionId`
8. `content.writingTasks` — writing tasks with instructions, starters
9. `answerKey` — empty object `{}` (or separately supplied; extraction does NOT guess answers)
10. `analysis` — empty object `{}`

### ID conventions:

- Use stable, readable IDs: `paper-{year}-{code}-english`, `q-{year}-{code}-{nnn}`
- IDs must be unique across the asset
- Group/question/blank IDs must be cross-referenced consistently

### STRICTLY FORBIDDEN:

- **DO NOT** generate analysis content
- **DO NOT** guess or invent answers
- **DO NOT** invent IDs that don't correspond to real paper content
- **DO NOT** include dirty placeholders (`unknown`, `TODO`, `TBD`)
- **DO NOT** include `reviewFlags` or `unknown` fields
- **DO NOT** include markdown explanations outside the JSON
- **DO NOT** output anything except valid JSON
- **DO NOT** add `correctAnswer` anywhere

### Quality requirements:

- All text must be faithfully extracted from the source
- Question stems must be complete
- Options must preserve original text exactly
- Passage paragraphs must preserve paragraph boundaries from source
- No truncation of content
- All question numbers must be sequential and match the source

## Validation

Output must:
- Parse as valid JSON
- Have no `unknown` or `reviewFlags` fields at any depth
- Have no `correctAnswer` field at any depth
- Have `schemaVersion` equal to `"paper-asset-v1"`
- Have `analysis` as empty `{}`
