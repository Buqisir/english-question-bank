# NCK1 Staged Narrative Continuation Packaging Contract — V1

Use this contract only after the Narrative Continuation Analysis Prompt. It
changes the outer response for one bounded NCK1 staged-analysis worker; the
nested `continuationAnalysis` must still obey the complete source-grounded
contract in the base prompt.

For this one pass, produce the source-grounded analysis and one model answer
that realizes its selected route. The base prompt's instruction not to generate
a model answer applies to the nested analysis, not to this outer staged package.

Return exactly one JSON object with exactly these top-level keys and no others:

```json
{
  "taskType": "continuation",
  "modelAnswer": "Two complete English continuation paragraphs.",
  "continuationAnalysis": {
    "schemaVersion": "continuation-analysis-v1",
    "storyUnderstanding": {},
    "continuationContract": {},
    "narrativeDevelopment": {},
    "languageAlignment": {},
    "paragraphBlueprint": {}
  }
}
```

The abbreviated nested object above names required sections only. Supply every
field and correctly shaped array item required by the complete base contract.

The `modelAnswer` must:

- begin paragraph 1 with the exact first starter and paragraph 2 with the exact
  second starter;
- preserve the source's person, perspective, base tense, facts, relationships,
  and established character motivations;
- realize the same `selectedRoute` and paragraph state changes recorded in
  `continuationAnalysis`;
- develop cause → character action → immediate result, with emotion shown
  through action;
- resolve or transform the source's central unfinished problem without
  unsupported characters, facts, a forced grand theme, or a new final event;
- stay near the supplied `wordCountTarget` and include the two starters in the
  response exactly as the task requires;
- use accurate, natural, learnable high-school English rather than showy
  vocabulary;
- contain no title, Markdown, Chinese explanation, score, highlight list, or
  commentary.

Do not add `continuationDesign`, `highlightExpressions`, `reviewCard`, metadata,
`officialModelAnswer`, or any other field. The route and model answer are one
defensible completion, not the unique required ending. Return JSON only, with
no Markdown fence or commentary outside the object.
