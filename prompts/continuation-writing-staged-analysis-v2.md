# NCK1 Staged Narrative Continuation Packaging Contract — V2

Use this after the V2 continuation-analysis prompt. Return exactly:

```json
{
  "taskType": "continuation",
  "modelAnswer": "Two complete English continuation paragraphs.",
  "continuationAnalysis": {
    "schemaVersion": "continuation-analysis-v2",
    "storyUnderstanding": {},
    "continuationContract": {},
    "developmentPlan": {}
  }
}
```

Supply every nested field required by the schema. Add no other top-level field.
In particular, never return `continuationDesign`, `highlightExpressions`,
`reviewCard`, `officialModelAnswer`, metadata or a separate language checklist.

The generated `modelAnswer` is clearly generated, never official. It must begin
paragraph 1 with starter 1 and paragraph 2 with starter 2 exactly, realize the
selected route and both cause/action/result plans, preserve all source facts and
constraints, and stay near the supplied `wordCountTarget`. Preserve person,
perspective, base tense, style and causal cohesion as substantive generation
constraints. Use natural, learnable high-school English; no title, Markdown,
Chinese commentary, scores or expression list. The route is one defensible
completion, not the only permitted ending. Return JSON only.
