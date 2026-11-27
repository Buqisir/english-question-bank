# NCK1 Staged Application Analysis Packaging Contract — V2

Use this contract only after the production Application Writing Model Answer
Prompt (V4). It changes the outer response for one bounded NCK1 staged-analysis
worker; it does not weaken any task, language, format, word-count or teaching
rule in the base prompt.

First write the V4 result exactly as the base prompt asks. Then return it in
this outer shape, with exactly these top-level keys and no others:

```json
{
  "taskType": "application",
  "modelAnswer": "the V4 standard.essay string, copied character for character",
  "applicationAnalysis": {
    "schemaVersion": "application-analysis-v4",
    "taskCard": {
      "basics": { "form": "……", "personTense": "……", "readerTone": "……", "goal": "……" },
      "taskRequires": ["……"],
      "thisEssayChooses": "……"
    },
    "standard": {
      "essay": "……",
      "pointMap": [{ "point": "……", "quote": "……" }],
      "notes": [{ "paragraph": 1, "role": "……", "items": [{ "quote": "……", "explain": "……" }] }],
      "expressions": [{ "expression": "……", "function": "……" }]
    },
    "advanced": {
      "essay": "……",
      "pointMap": [{ "point": "……", "quote": "……" }],
      "beyondStandard": [{ "quote": "……", "explain": "……" }]
    }
  }
}
```

- `applicationAnalysis` holds the V4 `taskCard`, `standard` and `advanced`
  objects unchanged, plus `schemaVersion`.
- `modelAnswer` is identical to `applicationAnalysis.standard.essay`. A program
  rejects the result if they differ by even one character.
- Do not include the V4 `blocked` field. If the base prompt would block because
  the task is incomplete, do not return an analysis; return only
  `SPEC CONTRADICTS: cannot reconstruct complete application task` followed by
  the missing information.
- Do not add `reviewCard`, `highlightExpressions`, `officialModelAnswer`, a
  score, review verdict, metadata or any other field.

Return JSON only, with no Markdown fence or commentary outside the object.
