# Claude Lite CR Prompt — I0-A

Cut: I0-A 七选五 facet taxonomy foundation
Review type: Claude lite CR
Output: `docs/cuts/I0-facet-taxonomy-foundation/claude-lite-cr.md`

## Assignment

Act as CR only. Do not edit files. Do not propose broad redesign.

Review whether this docs-only cut correctly records the 七选五 facet taxonomy
for future similarity search.

## Target

- Target repo root: `/private/tmp/eqb-h9-merge-124`
- Target report path:
  `/private/tmp/eqb-h9-merge-124/docs/cuts/I0-facet-taxonomy-foundation/claude-lite-cr.md`

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

## Review Focus

- Docs-only scope: no app/server/schema/runtime scope leak.
- Position, role, and cohesion mechanism stay independent.
- `seven-choices.cohesion.*` is mechanism namespace, not a subtype of
  `role.cohesion`.
- Mechanism rules are clear:
  - required for `role=cohesion`
  - optional for `role=bridge`
  - not used for `topic` / `summary` in v1
- Facet keys are lowercase ASCII, dot-separated, max 4 levels.
- Parent keys exist before child keys.
- Final keys use `topic-field-recurrence` and `referential-cohesion`, not old
  draft names `topic-word-echo` or `pronoun-reference`.
- `topicClues` and `optionFit` are future analysis fields, not facet keys.
- Taxonomy reflects PO teaching rule: position first, role second, mechanism as
  evidence dimension.

## Output Format

- Verdict: APPROVE / APPROVE WITH CHANGES / REQUEST CHANGES
- Must Fix count
- Should Watch count
- Must Fix
- Should Watch
- Final recommendation
