# Claude Lite PA Prompt — I0-B

Cut: I0-B 七选五 reviewed-analysis contract
Review type: Claude lite PA
Output: `docs/cuts/I0-seven-choices-analysis-contract/claude-lite-pa.md`

## Assignment

Act as PA only. Do not edit files. Do not propose runtime implementation.

Review whether this docs-only contract is ready for the next cut
(prompt + sample JSON + verify).

## Target

- Target repo root: `/private/tmp/eqb-h9-merge-124`
- Target report path:
  `/private/tmp/eqb-h9-merge-124/docs/cuts/I0-seven-choices-analysis-contract/claude-lite-pa.md`

Before writing, confirm:

- `pwd`
- `git rev-parse --show-toplevel`
- target report absolute path

If repo root is not `/private/tmp/eqb-h9-merge-124`, stop with:

```text
ESCALATION: BRANCH CONFLICT
```

## Must Read

- `docs/cuts/I0-facet-taxonomy-foundation/decisions.md`
- `docs/cuts/I0-facet-taxonomy-foundation/facet-taxonomy-draft.md`
- `docs/cuts/I0-seven-choices-analysis-contract/decisions.md`
- `docs/cuts/I0-seven-choices-analysis-contract/seven-choices-analysis-v1.contract.md`

## Review Focus

- Docs-only scope: no app/server/schema/runtime work is implied.
- Contract faithfully consumes I0-A facet keys without renaming them.
- Field ownership is clear:
  - facets classify the blank/question
  - `topicClues` are context-side clues
  - `optionFit` explains correct option fit
  - distractors do not get facet keys
- Mechanism rules are clear:
  - required for `role=cohesion`
  - optional for `role=bridge`
  - absent for `topic` / `summary`
- The contract is sufficient for a future prompt + sample JSON + verify cut.
- The contract does not over-specify PaperSurface, import validation, or DB.

## Output Format

- Verdict: READY FOR NEXT CUT / APPROVE WITH CHANGES / REQUEST CHANGES
- Must Fix count
- Should Watch count
- Must Fix
- Should Watch
- Final recommendation
