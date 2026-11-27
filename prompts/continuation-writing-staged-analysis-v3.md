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
  "modelAnswer": "标准版范文全文",
  "continuationAnalysis": {
    "schemaVersion": "continuation-analysis-v3",
    "reading": {
      "questions": [
        { "question": "人物", "answer": "……" },
        { "question": "视角与风格", "answer": "……", "evidence": ["逐字原文"] },
        { "question": "待解决问题", "answer": "……" }
      ],
      "characters": [{ "name": "……", "role": "……", "lines": [{ "label": "想要", "text": "……", "evidence": "逐字原文" }] }],
      "sourceLinks": [
        { "sourceQuote": "第一处逐字引句", "use": "第 1 段怎样用" },
        { "sourceQuote": "第二处逐字引句", "use": "第 2 段怎样用" }
      ]
    },
    "taskCard": {
      "route": "……",
      "paragraphs": [
        { "paragraph": 1, "must": "……", "draft": "……", "bridgeQuote": "段首句中的逐字引句", "bridge": "……？" },
        { "paragraph": 2, "must": "……", "draft": "……" }
      ]
    },
    "standard": {
      "essay": "标准版范文全文",
      "notes": [
        {
          "paragraph": 1, "role": "第 1 段的作用",
          "items": [
            { "quote": "第 1 段第一处逐字引句", "explain": "……" },
            { "quote": "第 1 段第二处逐字引句", "explain": "……" }
          ]
        },
        {
          "paragraph": 2, "role": "第 2 段的作用",
          "items": [
            { "quote": "第 2 段第一处逐字引句", "explain": "……" },
            { "quote": "第 2 段第二处逐字引句", "explain": "……" }
          ]
        }
      ],
      "expressions": [
        { "expression": "第一处表达", "function": "……" },
        { "expression": "第二处表达", "function": "……" }
      ],
      "pitfalls": [
        { "pitfall": "第一处容易写偏的地方", "why": "……" },
        { "pitfall": "第二处容易写偏的地方", "why": "……" }
      ]
    },
    "advanced": {
      "essay": "……",
      "beyondStandard": [
        { "quote": "提高版第一处逐字引句", "explain": "……" },
        { "quote": "提高版第二处逐字引句", "explain": "……" }
      ]
    }
  }
}
```

- `continuationAnalysis` holds the V3 `reading`, `taskCard`, `standard` and
  `advanced` objects unchanged, plus `schemaVersion`.
- When `reading.characters` is present, put character evidence only in
  `characters[].lines[].evidence`. The 人物 entry in `reading.questions`
  keeps its summary, and the renderer uses the character lines for display.
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
