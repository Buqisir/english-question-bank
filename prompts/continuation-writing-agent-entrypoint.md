# Continuation-writing model-answer agent entrypoint

Use this entrypoint when a workspace agent is asked to generate or review a
Gaokao continuation-writing (读后续写) model answer from a complete,
source-checked task.

## Scope

This route produces or reviews one continuation analysis: the standard and
advanced essays with their Chinese teaching notes. It does not import a paper,
change a schema, publish an asset, create classroom material, or use student
work.

## Required reading

For generation, read only:

1. `prompts/continuation-writing-model-answer-v3.md`

V3 is the production prompt (Owner, 2026-11-24;
`docs/cuts/continuation-writing-v3/spec.md`). It was voted without the shared
teaching doctrine, so do not add the doctrine, the teaching-analysis style or
the V2 prompts to a generation run. The backfill driver writes the exact
prompt for each group as `<key>.analysis-v3.prompt.txt`; use that file as is.

For review mode, also read the source notes in
`docs/sources/continuation-writing/` when a judgment needs them.

## Input boundary

The task input must be a complete, source-checked continuation task: the
instruction, the full source passage and both paragraph starters. If the source
or a starter is missing, follow the V3 prompt: set `blocked` and do not guess.

## Generation mode

Follow the production V3 prompt and return only its JSON object. In the
backfill route, write it to `<key>.analysis-v3.json`. In the staged NCK1 route,
`prompts/continuation-writing-staged-analysis-v3.md` gives the outer shape
instead.

Before persistence the workflow runs the V3 program checks
(`validateContinuationAnalysisV3`: starters, two paragraphs, word ranges,
copying from the source, verbatim quotes, entry counts) and, in the backfill
route, an independent `PASS | MUST_FIX` review. This entrypoint does not bypass
those gates.

## Review mode

Review a candidate that another agent generated, never your own. Read the
complete task and the candidate, then return only:

```json
{
  "verdict": "PASS",
  "findings": []
}
```

or:

```json
{
  "verdict": "MUST_FIX",
  "findings": [
    {
      "code": "short-stable-code",
      "problem": "specific task-grounded problem",
      "requiredChange": "minimal required correction"
    }
  ]
}
```

Write it to `<key>.review.json`. Review both essays and the notes against the
source and the V3 principles. Things the program cannot see are the point of
the review: the essay contradicts a source fact or the second starter; the
ending of paragraph 1 does not lead into starter 2; a new named person or an
object from nowhere drives or solves the plot; the amount of direct speech is
far from the source's; the ending pins on a moral that would fit any story; a
note explains something the quoted words do not do; the advanced essay changes
the plot instead of the English; a grammar, spelling or collocation error.
Do not ask for paper-like rhetoric that makes the standard essay harder for a
middle student to learn from.
