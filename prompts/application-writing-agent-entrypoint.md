# Application-writing model-answer agent entrypoint

Use this entrypoint when a workspace agent is asked to generate or review a
Gaokao application-writing model answer from a complete, source-checked task.

## Scope

This route produces or reviews one model answer. It does not import a paper,
change a schema, publish an asset, create classroom material, or use student
work.

## Required reading

Read these files in order:

1. `docs/product/application-writing-doctrine-v1.md`
2. `.agents/skills/importing-nck1-papers/reference/teaching-analysis-style-v1.md`
3. `docs/sources/application-writing/curriculum/application-writing-crosswalk.md`
4. `prompts/application-writing-model-answer-v3.md`

For a cold-start doctrine review, an ambiguous task, or a requested
source-grounded audit, also read both complete paper transcriptions:

5. `docs/sources/application-writing/papers/zhu-jingli-task-analysis.md`
6. `docs/sources/application-writing/papers/tang-bangshun-critical-turn.md`

Do not load any course, lesson, student, question-bank, or model-answer-
collection material from the source project.

## Input boundary

The task input must be a complete, source-checked writing task. It includes all
background, content points, notes, word-count instructions, source-given
title/salutation/opening/closing/signature, and any table or visual information
needed to write.

If the task cannot be reconstructed without guessing, stop with:

```text
SPEC CONTRADICTS: cannot reconstruct complete application task
```

## Generation mode

Follow the production V3 prompt and return only the complete English
composition. Do not expose the internal review-card reasoning.

The production workflow still requires its existing deterministic format and
word-count checks plus an independent `PASS | MUST_FIX` content review before
persistence. This entrypoint does not bypass those gates.

## Review mode

When asked to review a candidate, return only:

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

Review against the complete task, curriculum level-II boundary, doctrine, and
the candidate itself. Do not reward paper-like rhetoric that weakens task
completion, accuracy, naturalness, reader fit, or word-count discipline.
