# Claude Lite CR Prompt — I0-C

Cut: I0-C 七选五 prompt + external input + reviewed fixture + verify
Review type: Claude lite CR
Output: `docs/cuts/I0-seven-choices-analysis-prompt/claude-lite-cr.md`

## Assignment

Act as CR only. Do not edit files. Do not propose broad redesign.
Use `docs/cuts/_templates/cr-lite.md` as the report structure.

Review whether I0-C is ready to commit after the external AI output was
cleaned into the repo fixture.

## Target

- Target repo root: `/private/tmp/eqb-h9-merge-124`
- Target report path:
  `/private/tmp/eqb-h9-merge-124/docs/cuts/I0-seven-choices-analysis-prompt/claude-lite-cr.md`

Before writing, confirm:

- `pwd`
- `git rev-parse --show-toplevel`
- target report absolute path

If repo root is not `/private/tmp/eqb-h9-merge-124`, stop with:

```text
ESCALATION: BRANCH CONFLICT
```

## Must Read

- `prompts/seven-choices-analysis-v1.md`
- `docs/cuts/I0-seven-choices-analysis-contract/seven-choices-analysis-v1.contract.md`
- `docs/cuts/I0-seven-choices-analysis-prompt/decisions.md`
- `docs/cuts/I0-seven-choices-analysis-prompt/external-ai-input-seven-choices.md`
- `app/public/paper-assets/paper-2024-jslk-english/analyses/seven-choices-analysis-v1.json`
- `scripts/verify-i0c-seven-choices-analysis-v1.mjs`

## Review Focus

- Prompt requires a downloadable JSON file and gives no JSON-in-chat fallback.
- Prompt uses I0-A facet keys and I0-B contract fields without renaming them.
- External input contains enough source data for q36-q40.
- Fixture answer labels are explicit because the current paper-asset has no
  answerKey entries for q36-q40.
- Verify script can self-check without the external JSON file.
- Verify script hard-checks the cleaned reviewed fixture now stored in repo.
- Reviewed fixture follows the I0-B contract shape after cleaning:
  - `topicClues` is an array of strings.
  - `contextEvidence` is one object, not an array.
  - `keyDistractors[].reason` exists, with no facet fields inside distractors.
- The fixture's teaching judgments are plausible enough for a first reviewed
  sample: answer labels, position facets, role facets, mechanism facets,
  topic clues, option fit, and teaching notes.
- No app/server/runtime UI/database changes are included.

## Suggested Local Checks

Run:

```text
node scripts/verify-i0c-seven-choices-analysis-v1.mjs --self-check
node scripts/verify-i0c-seven-choices-analysis-v1.mjs
git diff --check
```

## Output Format

Fill `docs/cuts/_templates/cr-lite.md`.

Recommendation must be one of:

- READY TO COMMIT
- APPROVE WITH CHANGES
- REQUEST CHANGES
