# PA Assignment — applied-writing-lecture-v3

Cut: `applied-writing-lecture-v3`
Review type: fresh formal PA
Output: `docs/cuts/applied-writing-lecture-v3/pa.md`

## Assignment

Act as PA only. Do not implement or patch runtime files. Cold-read whether the
owner-approved annotation prototype has been faithfully compressed into a
stable production/data contract on current main.

## Must Read

1. `docs/cuts/applied-writing-lecture-v3/agent-entrypoint.md`
2. `docs/cuts/applied-writing-lecture-v3/plan.md`
3. `docs/cuts/applied-writing-lecture-v3/decisions.md`
4. `docs/cuts/applied-writing-lecture-v3/spec.md`
5. `docs/cuts/applied-writing-lecture-v3/wayfinder/map.md`

Then inspect the three immutable sources at archive commit `f64038f` named in
`spec.md`, plus the two current pilot payloads. Do not inspect or inherit any
DEV/fix history.

## Review focus

- Does each approved visible unit have a stable, authorable production field
  with no hidden summarization/truncation or review-mark cardinality ambiguity?
- Can one PR stay under the runtime size gate while preserving PaperSurface,
  continuation, export, student, and backend-production boundaries?
- Do payload parity, behavioral verification, browser geometry, and owner QA
  actually prove the key risks across two materially different letters?
- Is `large` the correct tier, are allowed/forbidden files complete, and are
  there zero unresolved decisions being delegated to DEV?

## Output contract

Use `docs/agents/pa-persona.md` sections exactly. If Must Fix exists, include a
Must Fix -> Plan Disposition Checklist. Do not write a partial report after
`CONTEXT INSUFFICIENT`, `BRANCH CONFLICT`, `SPEC CONTRADICTS`, or
`SCOPE UNCLEAR`.

After durable `pa.md` writeback, follow the one-way Auto-Next relay in the live
entrypoint: one successor maximum, explicit route, exact-head release, then
exit after activation acknowledgement. DEV is forbidden unless the canonical
PA verdict is `APPROVE FOR DEV` with zero unresolved Must Fix.
