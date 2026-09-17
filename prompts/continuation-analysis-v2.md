# Narrative Continuation Analysis Prompt — V2

Analyze one complete NCK1 narrative-continuation task. Return one JSON object
that conforms exactly to `continuation-analysis-v2.schema.json`. Return JSON
only. Do not generate the model composition in this nested analysis.

If the task is not narrative continuation, return only:

```json
{"status":"unsupported","observedMode":"...","reason":"..."}
```

Narrative eligibility means events develop through causes, character choices,
actions and consequences. If the starters mainly require explanation, concept
teaching, position-taking or argumentation, stop rather than force a conflict,
climax or emotional-growth story. Short dialogue or explanation within a story
does not by itself make it ineligible.

## Authority and evidence

- Treat the instruction, source material and two paragraph starters as the
  complete authority. Never invent source facts or quote generated prose.
- Every evidence `excerpt` must be an exact, non-empty substring of its named
  source: `instruction`, `material`, `paragraph1Starter`, or
  `paragraph2Starter`.
- Keep fact, inference and creative choice distinct. Every grounded statement
  and constraint carries evidence. `openChoices` are creative freedoms and
  must never be copied into hard constraints.
- Constraint IDs are globally unique. Paragraphs are ordered 1 then 2. At least
  one paragraph-1 `requiredExitState` must cite `paragraph2Starter`, because
  the second starter constrains what paragraph 1 has already achieved.
- The published task, not an original story or remembered answer outside it, is
  authoritative. Use necessary backward starter constraints first, then source
  facts/motivations/relations/clues, and only then compatible open invention.

## Explain the same reasoning, not a new narrative formula

Start with what the characters have actually done, what remains unresolved, and
what each starter makes true. Explain the backward step: “because starter 2 says
..., paragraph 1 must already have ...”. Show cause → character action → immediate
result. Names such as emotional arc, clue payoff or causal closure cannot replace
the actual event or its reason. A selected route is one teachable route, never
the hidden answer. Prefer one decisive source chain and a necessary starter check
over repeating the same claim across sections. Keep the analysis concise, natural
and source-grounded; do not replace teaching with terminology.

## The three nested analysis sections

The outer staged writing package adds the fourth section, the model answer.

### `storyUnderstanding`

Explain the central situation, source end state,
perspective, time/place, characters and their evidenced traits/motivations/current
states, relationships, causal chain, unresolved problem, usable clues, meaning
direction with calibrated confidence, and source style. Do not force a closed
theme where the source leaves meaning open.

`sourceEndState` stops at the end of `material`: an action introduced by a
paragraph starter belongs to that paragraph's entry state, not the source's past.
State the obstacles actually shown. Several failed attempts do not prove that
all possible methods have failed; retain the source's scope and uncertainty.

Infer traits from actions, speech, circumstances or others' responses, not labels
such as kind, brave or selfish without evidence. Keep causal links that actually
affect continuation. The unfinished problem may be an ordinary goal rather than
a dramatic conflict. Meaning may be problem resolution or changed understanding;
no moral slogan is required. Describe observable style—perspective, distance,
dialogue density, rhythm, description—not empty praise such as advanced or vivid.

### `continuationContract`

Separate grounded hard constraints, soft affordances,
open choices, forbidden contradictions, two ordered paragraph contracts and
closure requirements. `supportedOptions` are possibilities, not obligations.
Do not promote the selected route into the contract.

Read each starter as an actual entry state and narrative action, not a generic
paragraph label. Check what must already have happened when paragraph 2 starts;
the first paragraph must reach that state without prematurely narrating the
second paragraph's main work. State only necessary exit/closure constraints,
not the chosen route's optional props, dialogue or method of seeking help.

Write the contract before choosing the route. In each required statement,
retain only the event or state entailed by its cited source; leave unspecified
people, methods and timing unspecified. A later event's date does not establish
that an earlier promise specified that date. Use the shortest sufficient set of
requirements, not a detailed plot outline. Keep every schema-required field;
leave optional arrays empty or omitted where the schema allows.

Test necessity against a compatible alternative. If another route can satisfy
the same source and starters without this detail, move the detail to
`developmentPlan`, not another required statement. Do not expand a contract
after choosing a route merely to make that route look compulsory.

### `developmentPlan`

Choose one defensible route while preserving other legitimate possibilities.
Teach that route directly as “本范文选择……”, not “续写必须……”. Explain only
the cause, action and result needed to connect the starters and close the source
problem. Do not enumerate alternative plots merely to demonstrate breadth.
Return:

- `selectedRoute` and one or more grounded `routeRationale` items;
- exactly two ordered paragraphs;
- for each paragraph: one explicit `cause`, `action`, and `result`, one or more
  nonduplicative `sourceEvidence` refs, and zero or more `cluePayoffs`;
- paragraph 1 has `bridge` and no `ending`; paragraph 2 has `ending` and no
  `bridge`;
- `emotionChanges` and `relationshipChanges` only when the story genuinely has
  them. A credible no-emotion-change story must use empty arrays or omit those
  optional arrays, never fabricate an arc;
- optional `languageReminder` only for a task-specific language risk. General
  language alignment remains an internal generation discipline: preserve person,
  perspective, base tense, narrative distance/register, source style, causal
  cohesion and restrained dialogue without emitting a separate checklist;
- `alternatives` and `qualityRisks` only when useful. Alternatives remain
  possibilities and cannot become hard constraints.

Let actions arise from established motivations and circumstances. A turn needs
an event or information change that causes it; emotion alone is not an event.
Show necessary emotion through its trigger and visible action. Use dialogue only
when it changes understanding, decision or relationship; no decorative exchanges.
Return to a source clue because it resolves or reframes the unfinished problem,
not to repeat a symbol mechanically. The ending follows the selected events and
resolves the source problem, without an unearned moral or outside rescue.

Do not duplicate event/state/ending content across parallel development objects.
Do not output `narrativeDevelopment`, `paragraphBlueprint`, `languageAlignment`,
`continuationDesign`, `highlightExpressions`, scores, metadata or a model answer.
