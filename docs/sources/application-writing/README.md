# Application-writing research sources

This directory is the source-grounded research base for Gaokao application-
writing model answers. It is deliberately narrower than the source project it
came from.

## Included

- Two named research papers, each preserved as the original PDF plus a
  searchable Markdown transcription.
- One application-writing-specific curriculum-standard crosswalk.
- A manifest with the exact source names and SHA-256 digests.

## Excluded

- Courses, lesson plans, handouts, workbooks, answer sheets, and classroom
  production files.
- Student writing, student profiles, feedback, scores, images, or any other
  student-related material.
- Question banks, model-answer collections, topic corpora, and unrelated
  teaching manuals.
- Generic teaching-persona skills.

Nothing in this directory is served from `app/public/`. These files are
internal research inputs for an agent or prompt-authoring task.

## Reading order

For ordinary model-answer generation, read:

1. [`../../product/application-writing-doctrine-v1.md`](../../product/application-writing-doctrine-v1.md)
2. [`curriculum/application-writing-crosswalk.md`](curriculum/application-writing-crosswalk.md)
3. [`../../../prompts/application-writing-model-answer-v3.md`](../../../prompts/application-writing-model-answer-v3.md)

Read the two full papers when reviewing or revising the doctrine, resolving an
ambiguous task, or checking whether a compressed rule still reflects its
source:

- [`papers/zhu-jingli-task-analysis.md`](papers/zhu-jingli-task-analysis.md)
- [`papers/tang-bangshun-critical-turn.md`](papers/tang-bangshun-critical-turn.md)

The PDFs are provenance copies. Agents should normally use the Markdown
transcriptions because they are searchable and cheaper to load.

## Authority order

When sources appear to pull in different directions, use this order:

1. The complete writing task and its source-provided format.
2. Official answer/rubric evidence, when present, and the curriculum standard.
3. The two papers as expert interpretations.
4. The repository doctrine and prompt as operational syntheses.

The papers are valuable but not official scoring rules. Their examples must not
be generalized beyond what the task itself supports.
