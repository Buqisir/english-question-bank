# NCK1 Staged Application Analysis Packaging Contract — V1

Use this contract only after the production Application Writing Model Answer
Prompt. It changes the outer response for one bounded NCK1 staged-analysis
worker; it does not weaken any task, language, format, or word-count rule in the
base prompt.

The base prompt's requirement to output only the complete English composition
applies to the `modelAnswer` string. Return exactly one JSON object with exactly
these top-level keys and no others:

```json
{
  "taskType": "application",
  "modelAnswer": "The complete English composition, including every required given line in its original order.",
  "reviewCard": {
    "schemaVersion": "application-review-card-v2",
    "form": "简洁中文，说明交际形式",
    "topic": "简洁中文，概括本题主题",
    "purpose": "简洁中文，说明本次写作要达成的交际目的",
    "person": "简洁中文，说明主要人称及其作用",
    "tense": "简洁中文，说明主要时态及其作用",
    "points": ["按原题实际要求列出要点一如何落地"],
    "reader": "简洁中文，说明实际读者",
    "relationship": "简洁中文，说明作者与读者的关系",
    "readerNeeds": "简洁中文，说明读者需要理解、回应或采取什么行动",
    "value": "简洁中文，说明这篇文字对读者的实际价值"
  }
}
```

ReviewCard is both student-visible teaching guidance and structured matching
support. Every ReviewCard string must be specific to this task, no longer than
80 characters, contain no Markdown or line breaks, and avoid internal AI
labels. `points` must contain one non-empty item for each explicit task content
requirement: preserve the task's actual count (including one or three), cover
every requirement once, and do not invent or merge requirements to force a
fixed count. Keep `topic` distinct from `purpose`, `reader` distinct from
`relationship`, and `purpose` distinct from `value` in the JSON even though the
teaching card displays the first two pairs together.

Do not add `highlightExpressions`, `type`, `readerWho`, `readerCares`,
`readerWants`, a score, review verdict, metadata,
`officialModelAnswer`, or any other field. The model answer is one defensible
route, not the unique required wording. Return JSON only, with no Markdown fence
or commentary outside the object.
