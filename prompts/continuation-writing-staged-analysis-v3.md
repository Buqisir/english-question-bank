# NCK1 Staged Narrative Continuation Packaging Contract — V3

Use this contract only after the production Continuation Writing Model Answer
Prompt (V3). It changes the outer response for one bounded NCK1 staged-analysis
worker; it does not weaken any reading, task, language, format, word-count or
teaching rule in the base prompt.

First write the V3 result exactly as the base prompt asks. Then return it in
this outer shape, with exactly these top-level keys and no others:

```json
{
  "taskType": "continuation",
  "modelAnswer": "the V3 standard.essay string, copied character for character",
  "continuationAnalysis": {
    "schemaVersion": "continuation-analysis-v3",
    "reading": {
      "questions": [{ "question": "……", "answer": "……" }],
      "sourceLinks": [{ "sourceQuote": "……", "use": "……" }]
    },
    "taskCard": { "taskRequires": ["……"], "thisEssayChooses": "……" },
    "standard": {
      "essay": "……",
      "notes": [{ "paragraph": 1, "role": "……", "items": [{ "quote": "……", "explain": "……" }] }],
      "expressions": [{ "expression": "……", "function": "……" }],
      "pitfalls": [{ "pitfall": "……", "why": "……" }]
    },
    "advanced": {
      "essay": "……",
      "beyondStandard": [{ "quote": "……", "explain": "……" }]
    }
  }
}
```

- `continuationAnalysis` holds the V3 `reading`, `taskCard`, `standard` and
  `advanced` objects unchanged, plus `schemaVersion`.
- `modelAnswer` is identical to `continuationAnalysis.standard.essay`. A program
  rejects the result if they differ by even one character.
- Do not include the V3 `taskType` or `blocked` fields inside
  `continuationAnalysis`. If the base prompt would block because the task is
  incomplete, do not return an analysis; return only
  `SPEC CONTRADICTS: cannot reconstruct complete continuation task` followed by
  the missing information.
- Do not add `continuationDesign`, `highlightExpressions`, `reviewCard`,
  `officialModelAnswer`, a score, review verdict, metadata or any other field.

Return JSON only, with no Markdown fence or commentary outside the object.
