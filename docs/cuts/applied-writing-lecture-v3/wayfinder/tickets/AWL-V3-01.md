# AWL-V3-01 · 终版批注原型生产化

Type / role: Wayfinder -> PM contract -> formal PA -> DEV -> verification ->
fresh CR -> QA -> RM
State: active
Blockers: none
Claimed by: fresh formal PA (`AWL-V3-PA-20260722-01`)
Base head: `github/main@1deec0f`
Expected head: `64a6784a71b70edb23da745ca24d945982a8a6bc`
Output path: `docs/cuts/applied-writing-lecture-v3/`

## Question

How do we productionize the owner-approved in-place handwritten annotation
prototype from `f64038f` on current `github/main`, while preserving its visual
content units, the backend-production / website-consumption boundary, and the
existing print/student isolation?

## Acceptance

- A production-shaped traceability table maps every visible unit to a stored
  field or an explicit missing-field decision.
- The plan starts from current `github/main`; the rejected B2 carousel runtime
  is evidence only and is never merged or treated as implementation.
- Schema and publishing gates preserve legacy / continuation data while making
  incomplete application annotations unavailable.
- Allowed / forbidden files, behavioral verification, browser QA, PO QA, and
  stop criteria are concrete enough for fresh PA and DEV.
- One unique next role is durably recorded and Auto-Next either dispatches it
  or stops on a named condition.

## Routing

Current role: fresh formal PA
Next role: pending PA verdict
Configured model: `gpt-5.6-sol`
Selected model: `gpt-5.6-sol`
Thinking: `high`
Availability / substitution: task-creation capability lists Sol/high; no
substitution
Dispatch ID / state: `AWL-V3-PA-20260722-01` / active
Authorization scope: PA may write `pa.md` and routing/result fields only; no
runtime implementation

## Unique Next Action

1. Complete the formal PA cold read and write `pa.md`; then create exactly one
   eligible successor or durably record a named escalation.

## Result

PM contract recorded at `def933be06aa171710bfb6d012a7639e30e245e7`.
Risk upgraded from medium to large after real payload mapping exposed both a
new data contract and a paper-local anchor/geometry protocol. The rejected B2
runtime remains excluded. PA activation re-proved that
`github/codex/applied-writing-lecture-v3-20260722-01` resolved to released head
`64a6784a71b70edb23da745ca24d945982a8a6bc`, that it was an ancestor of
worktree `HEAD`, and that the worktree was clean.
