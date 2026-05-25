# External AI Input — Seven Choices Analysis V1

Paste this entire document into the external AI.

The model must create a downloadable JSON file named:

```text
seven-choices-analysis-v1.json
```

It must not paste JSON in chat. It must not provide markdown. If it cannot
create a downloadable file, it must reply exactly:

```text
UNABLE_TO_CREATE_FILE
```

---

# Assignment

Use the contract below to create exactly one downloadable JSON file:

```text
seven-choices-analysis-v1.json
```

Do not output JSON in chat. Do not explain. Do not wrap output in markdown.

## Contract Summary

Top-level:

```json
{
  "schemaVersion": "seven-choices-analysis-v1",
  "paperId": "paper-2024-jslk-english",
  "sourceAssetVersion": 1,
  "targetGroups": ["group-2024-jslk-seven-choices"],
  "meta": {
    "generatedBy": "external-ai",
    "model": "your model name",
    "promptVersion": "seven-choices-analysis-v1",
    "reviewStatus": "reviewed",
    "reviewedBy": "external-ai",
    "reviewedAt": "2026-05-24"
  },
  "groups": {
    "group-2024-jslk-seven-choices": {
      "overview": "Chinese overview of the passage topic and 七选五 structure",
      "discourseStructure": {
        "summary": "Chinese summary of the discourse flow",
        "units": [
          {
            "unitId": "unit-...",
            "heading": "Optional heading text",
            "paragraphIds": ["para-..."],
            "summary": "Chinese summary of this unit"
          }
        ]
      }
    }
  },
  "questions": {
    "q-2024-jslk-036": {},
    "q-2024-jslk-037": {},
    "q-2024-jslk-038": {},
    "q-2024-jslk-039": {},
    "q-2024-jslk-040": {}
  }
}
```

For `groups["group-2024-jslk-seven-choices"]`, include analysis fields only:
`overview` and `discourseStructure`. Do not copy source fields such as
`groupId`, `groupType`, `questionIds`, `blankIds`, `optionBank`, or
`passageTitle` into the analysis group object.

For every blank/question, include:

- `blankId`
- `positionFacet`
- `roleFacet`
- `primaryMechanismFacet` when required
- `supportingMechanismFacets` when useful, max 2
- `topicClues`
- `contextEvidence`
- `mechanismSignals` when the blank uses logical connector or referential
  cohesion
- `optionFit`
- optional `keyDistractors`, max 2
- `teachingNote`

`contextEvidence` must be one object, not an array. Quote fields must use exact
passage text, but exclude the blank marker number itself, such as `36`, `37`,
`38`, `39`, or `40`.

Use only these facet values:

```text
seven-choices.position.paragraph-start
seven-choices.position.paragraph-middle
seven-choices.position.paragraph-end
seven-choices.role.topic
seven-choices.role.summary
seven-choices.role.bridge
seven-choices.role.cohesion
seven-choices.cohesion.grammatical.referential-cohesion
seven-choices.cohesion.grammatical.logical-connector
seven-choices.cohesion.lexical.topic-field-alignment
```

Mechanism rules:

- `roleFacet = seven-choices.role.cohesion` requires `primaryMechanismFacet`.
- `roleFacet = seven-choices.role.bridge` may include `primaryMechanismFacet`.
- `roleFacet = seven-choices.role.topic` or
  `seven-choices.role.summary` must not include `primaryMechanismFacet`.
- `supportingMechanismFacets` may contain at most 2 items.
- `mechanismSignals` is required when a blank uses
  `seven-choices.cohesion.grammatical.logical-connector` or
  `seven-choices.cohesion.grammatical.referential-cohesion`, whether the
  mechanism is primary or supporting.

`mechanismSignals` rules:

- Use it for the exact logical connector, pronoun, demonstrative, or other
  concrete cohesion signal that should be highlightable.
- Each item includes `mechanismFacet`, `signalText`, `signalSide`,
  `targetText`, and `relation`.
- `signalSide` must be `context` or `option`.
- Do not put broad topic-field words here; use `topicClues` for that.

`topicClues` rules:

- Required for every blank.
- Include only context-side word chunks from nearby passage text or heading.
- Do not include words that appear only in the correct option.

`optionFit` rules:

- `correctOptionLabel` must match the supplied answer label.
- `matchedClues` must compare option-side language with context-side clues.
- `fitSummary` must explain the main solving move in Chinese.

Do not invent IDs. Use only the source data below.

## Source Data

```json
{
  "paper": {
    "paperId": "paper-2024-jslk-english",
    "title": "2024年高考综合改革适应性测试英语试题",
    "subject": "English",
    "source": "2024 九省联考 / 高考综合改革适应性测试",
    "assetVersion": 1,
    "status": "draft"
  },
  "group": {
    "groupId": "group-2024-jslk-seven-choices",
    "groupType": "sevenChoices",
    "title": "七选五 Common Mistakes New Runners Make",
    "questionIds": [
      "q-2024-jslk-036",
      "q-2024-jslk-037",
      "q-2024-jslk-038",
      "q-2024-jslk-039",
      "q-2024-jslk-040"
    ],
    "blankIds": [
      "blank-2024-jslk-036",
      "blank-2024-jslk-037",
      "blank-2024-jslk-038",
      "blank-2024-jslk-039",
      "blank-2024-jslk-040"
    ],
    "optionBank": [
      {
        "label": "A",
        "text": "Not taking rest days"
      },
      {
        "label": "B",
        "text": "If you’re just starting out"
      },
      {
        "label": "C",
        "text": "Comparing yourself to others"
      },
      {
        "label": "D",
        "text": "Running can be uncomfortable at times"
      },
      {
        "label": "E",
        "text": "It’s important not to use the same muscles"
      },
      {
        "label": "F",
        "text": "While it may be true that you don’t need expensive equipment to take up running"
      },
      {
        "label": "G",
        "text": "Experts suggest increasing your running distance by no more than 10%each week"
      }
    ],
    "passage": {
      "paragraphs": [
        {
          "paragraphId": "para-2024-jslk-seven-title",
          "text": "Common Mistakes New Runners Make"
        },
        {
          "paragraphId": "para-2024-jslk-seven-intro",
          "text": "Running is a great way to get in shape and just about everyone can do it.However,many make a number of common mistakes,which can interfere(妨碍)with training or lead to injury. 36 ,keep these things in mind to help you increase your chances of running success."
        },
        {
          "paragraphId": "para-2024-jslk-seven-h1",
          "text": "•Doing too much too soon"
        },
        {
          "paragraphId": "para-2024-jslk-seven-p1",
          "text": "One of the biggest mistakes new runners make is doing too much too soon.Slowly easing into a training program will help reduce the risk of injury,so you can continue on with your new running routine. 37 ."
        },
        {
          "paragraphId": "para-2024-jslk-seven-h2",
          "text": "•38 "
        },
        {
          "paragraphId": "para-2024-jslk-seven-p2",
          "text": "Beginners might think they need to run every day(or nearly every day)to meet their fitness or weight-loss goals,but this couldn’t be further from the truth.Running is a high-impact activity which can be really hard on your body.So it’s important to give your body a rest between workouts."
        },
        {
          "paragraphId": "para-2024-jslk-seven-h3",
          "text": "•Not wearing the right equipment"
        },
        {
          "paragraphId": "para-2024-jslk-seven-p3",
          "text": "39 ,it’s important that you wear properly for your workouts.The most important piece of equipment for running is a good pair of running shoes,so be sure to do some research before you purchase a pair.Visit a running specialty store and ask an employee to fit you for a shoe."
        },
        {
          "paragraphId": "para-2024-jslk-seven-h4",
          "text": "•Running through pain"
        },
        {
          "paragraphId": "para-2024-jslk-seven-p4",
          "text": "40 .If something hurts when you run,you need to stop and treat the pain. Remember:It doesn’t make you less of a runner if you listen to your body to keep it healthy."
        }
      ]
    }
  },
  "questions": {
    "q-2024-jslk-036": {
      "questionId": "q-2024-jslk-036",
      "questionNo": 36,
      "groupId": "group-2024-jslk-seven-choices",
      "stem": "36",
      "blankId": "blank-2024-jslk-036"
    },
    "q-2024-jslk-037": {
      "questionId": "q-2024-jslk-037",
      "questionNo": 37,
      "groupId": "group-2024-jslk-seven-choices",
      "stem": "37",
      "blankId": "blank-2024-jslk-037"
    },
    "q-2024-jslk-038": {
      "questionId": "q-2024-jslk-038",
      "questionNo": 38,
      "groupId": "group-2024-jslk-seven-choices",
      "stem": "38",
      "blankId": "blank-2024-jslk-038"
    },
    "q-2024-jslk-039": {
      "questionId": "q-2024-jslk-039",
      "questionNo": 39,
      "groupId": "group-2024-jslk-seven-choices",
      "stem": "39",
      "blankId": "blank-2024-jslk-039"
    },
    "q-2024-jslk-040": {
      "questionId": "q-2024-jslk-040",
      "questionNo": 40,
      "groupId": "group-2024-jslk-seven-choices",
      "stem": "40",
      "blankId": "blank-2024-jslk-040"
    }
  },
  "fixtureAnswerLabels": {
    "q-2024-jslk-036": "B",
    "q-2024-jslk-037": "G",
    "q-2024-jslk-038": "A",
    "q-2024-jslk-039": "F",
    "q-2024-jslk-040": "D"
  }
}
```
