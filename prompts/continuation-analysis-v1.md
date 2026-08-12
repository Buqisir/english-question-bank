# Narrative Continuation Analysis Prompt — V1

## Purpose

Produce one source-grounded `continuation-analysis-v1` JSON object for a
**narrative continuation-writing task**.

This task only analyzes the source story and designs one defensible two-paragraph
route. **不生成范文**，不挑亮点句，不预测分数，不输出评分推理。

## Eligibility gate

V1 supports tasks whose dominant work is narrating events: a problem, choice,
relationship, or unfinished action develops through causes, character actions,
and consequences.

If explanation, concept teaching, position-taking, reasons/evidence, or
argumentation is the main work required by the starters, stop. Return exactly:

```json
{
  "status": "unsupported",
  "observedMode": "expository | argumentative | mixed",
  "reason": "One concise English explanation of why narrative V1 does not fit."
}
```

A narrative may contain short dialogue, description, emotion, or explanation.
It remains eligible only when event development is still the dominant structure.
Never force an unsupported task into conflict, climax, or emotional-growth form.

## Authority order

Use evidence in this order:

1. the exact instruction, source material, and two paragraph starters;
2. necessary backward constraints from paragraph starter 2 to paragraph 1;
3. facts, motivations, relations, and clues established in the source;
4. reasonable open invention that does not contradict the above.

The published task is authoritative. Do not reconstruct or imitate an ending
from an original story that is not present in the task.

## Output requirement

Return exactly one JSON object as plain text. The first non-whitespace character
must be `{` and the final non-whitespace character must be `}`.

Do not create a file heading, markdown fence, comment, process narration, or
reasoning trace. Do not invent alternate field names. Do not add fields that are
not in the contract.

For an eligible narrative, the top-level keys must be exactly:

```json
{
  "schemaVersion": "continuation-analysis-v1",
  "storyUnderstanding": {},
  "continuationContract": {},
  "narrativeDevelopment": {},
  "languageAlignment": {},
  "paragraphBlueprint": {}
}
```

The analysis contract deliberately excludes the old shallow theme-plus-two-notes
shape. It also excludes model answers, highlight expressions, score estimates,
advanced-word counts, complex-sentence counts, and connector counts.

## Evidence contract

Use this exact evidence shape:

```json
{
  "source": "material",
  "excerpt": "the shortest exact source substring needed to locate the claim"
}
```

`source` must be exactly one of:

- `instruction`
- `material`
- `paragraph1Starter`
- `paragraph2Starter`

Every `excerpt` must be an exact, character-for-character substring of the named
input source. Keep it short. Do not quote the complete passage.

A grounded statement has this exact shape:

```json
{
  "statement": "A concise English analysis statement.",
  "evidence": [
    { "source": "material", "excerpt": "exact source words" }
  ]
}
```

Claims about source facts, character traits, motivations, necessary transitions,
starter jobs, and hard constraints must be grounded. Pure author choices belong
in `openChoices` or the selected route; do not disguise them as source facts.

## 1. `storyUnderstanding`

Required shape:

```json
{
  "centralSituation": { "statement": "...", "evidence": [] },
  "sourceEndState": { "statement": "...", "evidence": [] },
  "narrativePerspective": { "statement": "...", "evidence": [] },
  "timeAndPlaceFrame": { "statement": "...", "evidence": [] },
  "characters": [
    {
      "name": "...",
      "role": "...",
      "establishedTraits": [],
      "motivations": [],
      "currentState": { "statement": "...", "evidence": [] }
    }
  ],
  "relationships": [
    {
      "participants": ["character A", "character B"],
      "currentRelation": { "statement": "...", "evidence": [] }
    }
  ],
  "causalChain": [
    {
      "cause": { "statement": "...", "evidence": [] },
      "effect": { "statement": "...", "evidence": [] }
    }
  ],
  "unresolvedProblem": { "statement": "...", "evidence": [] },
  "usableClues": [],
  "meaningDirection": {
    "statement": "...",
    "confidence": "explicit | stronglyInferred | open",
    "evidence": []
  },
  "sourceStyle": { "statement": "...", "evidence": [] }
}
```

Rules:

- Infer traits from actions, speech, circumstances, or other characters'
  responses. Never use unsupported labels such as kind, brave, or selfish.
- Keep only causal relations that affect the continuation.
- `unresolvedProblem` is the central unfinished problem or goal at the source
  ending. It need not be a dramatic conflict.
- `meaningDirection` may be relationship repair, responsibility, changed
  understanding, or problem resolution. Do not require an explicit moral line.
- Describe observable source style: perspective, narrative distance, dialogue
  density, sentence rhythm, or description pattern. Do not write empty labels
  such as advanced or vivid.

## 2. `continuationContract`

A constraint has this exact shape:

```json
{
  "id": "lowercase-kebab-id",
  "statement": "...",
  "evidence": []
}
```

Required shape:

```json
{
  "hardConstraints": [],
  "softAffordances": [],
  "openChoices": [],
  "forbiddenContradictions": [],
  "paragraphs": [
    {
      "paragraphIndex": 1,
      "entryState": { "statement": "...", "evidence": [] },
      "starterFunction": { "statement": "...", "evidence": [] },
      "requiredMoves": [],
      "requiredExitState": [],
      "supportedOptions": []
    },
    {
      "paragraphIndex": 2,
      "entryState": { "statement": "...", "evidence": [] },
      "starterFunction": { "statement": "...", "evidence": [] },
      "requiredMoves": [],
      "requiredExitState": [],
      "supportedOptions": []
    }
  ],
  "closureRequirements": []
}
```

Classify strictly:

- `hardConstraints`: violating one contradicts the source, a starter, or a
  necessary paragraph-boundary state.
- `softAffordances`: the source clearly supports the choice, but another route
  could also work.
- `openChoices`: the task leaves the choice to the writer.
- `forbiddenContradictions`: tempting paths that would directly break a source
  fact, starter, time/place condition, character motivation, or required state.

Use this state chain:

```text
source end
→ paragraph 1 starter entry
→ paragraph 1 required exit
→ paragraph 2 starter entry
→ final state
```

Most importantly, infer what paragraph 2's starter makes necessarily true at
the end of paragraph 1. Put that state in paragraph 1 `requiredExitState`.

## 3. `narrativeDevelopment`

Required shape:

```json
{
  "coreTension": { "statement": "...", "evidence": [] },
  "drivingMotivations": [],
  "requiredTurningPoints": [],
  "eventChain": [
    {
      "cause": "...",
      "event": "...",
      "immediateEffect": "...",
      "evidence": []
    }
  ],
  "emotionLogic": [
    {
      "trigger": "...",
      "internalResponse": "...",
      "visibleAction": "..."
    }
  ],
  "relationshipMovement": [
    {
      "participants": ["...", "..."],
      "from": "...",
      "to": "...",
      "cause": "..."
    }
  ],
  "interactionMoves": [
    {
      "speaker": "...",
      "listener": "...",
      "purpose": "...",
      "relationshipNeed": "...",
      "expectedEffect": "...",
      "evidence": []
    }
  ],
  "cluePayoffs": [
    {
      "clue": { "source": "material", "excerpt": "..." },
      "payoff": "..."
    }
  ],
  "endingState": "..."
}
```

Rules:

- Every key event must answer both why it happens and what it changes.
- Emotional development follows trigger → internal response → visible action.
  Do not stack sudden fear, tears, warmth, or relief without causes and behavior.
- `interactionMoves` covers apology, comfort, request, persuasion, or repair as
  relationship actions. It does not force dialogue.
- Use only source clues that genuinely support later development. Do not recycle
  every detail.
- `relationshipMovement`, `interactionMoves`, and `cluePayoffs` may be empty
  when the story does not require them.

## 4. `languageAlignment`

Required shape:

```json
{
  "personAndPerspective": "...",
  "baseTense": "...",
  "licensedTenseShifts": [],
  "narrativeDistanceAndRegister": "...",
  "sourceStyleContinuity": "...",
  "cohesionPlan": [
    { "relation": "sequence | cause | contrast | reference | echo", "use": "..." }
  ],
  "dialoguePolicy": "...",
  "descriptionPriorities": [],
  "functionLedLanguage": [],
  "languageRisks": []
}
```

Describe language by function. Do not set counts for advanced words, clauses,
connectors, action details, psychology details, environmental details, or
dialogue. Maintain the source's person, perspective, base tense, and recognizable
style. Allow a change only when the event or starter licenses it.

The later model answer quality target is an attainable fifth-band response at
about 22–23 points: accurate, natural, coherent, varied without showmanship, and
learnable by a strong high-school student. Do not output that score as data.

## 5. `paragraphBlueprint`

Required shape:

```json
{
  "selectedRoute": "...",
  "routeRationale": [],
  "paragraphs": [
    {
      "paragraphIndex": 1,
      "narrativeFunction": "...",
      "eventMoves": [],
      "characterActionsAndReactions": [],
      "evidenceToReuse": [],
      "stateChange": "...",
      "bridgeToNext": "..."
    },
    {
      "paragraphIndex": 2,
      "narrativeFunction": "...",
      "eventMoves": [],
      "characterActionsAndReactions": [],
      "evidenceToReuse": [],
      "stateChange": "...",
      "bridgeToNext": "..."
    }
  ],
  "finalEffect": "...",
  "validAlternativeRoutes": [],
  "qualityRisks": []
}
```

Select one stable route for later model-answer generation, but preserve other
valid routes when they are clear. Official examples and source-supported options
are possibilities, not hidden answer keys.

Each paragraph must create a real state change. Paragraph 1 must reach the state
required by paragraph 2's starter. Paragraph 2 must resolve or transform the
source's central unfinished problem without adding a new final event or unsupported
grand theme.

## Final silent checks

Before returning JSON, verify internally:

1. The task is eligible narrative continuation.
2. Every source claim and constraint has a short exact evidence excerpt.
3. No soft affordance or open choice is written as mandatory.
4. Paragraph 1's exit can enter paragraph 2's starter without contradiction.
5. Every key event has a cause and immediate effect.
6. Character emotion produces visible action.
7. The language plan serves narrative functions rather than surface counts.
8. Both paragraphs change state and the ending grows from the source.
9. No model answer, highlight list, score prediction, or reasoning trace is present.
10. The first output character is `{` and the last is `}`.
