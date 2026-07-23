# AWL-V3-01 · 终版批注原型生产化

Type / role: Wayfinder -> PM contract -> formal PA -> DEV -> verification ->
fresh CR -> QA -> RM
State: dispatch-pending
Blockers: none
Claimed by: current Wayfinder / PM task
Base head: `github/main@1deec0f`
Expected head: predecessor-final PA release commit on
`codex/applied-writing-lecture-v3-20260722-01`
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

Current role: none; Wayfinder / PM result committed
Next role: fresh formal PA
Configured model: `gpt-5.6-sol`
Selected model: `gpt-5.6-sol`
Thinking: `high`
Availability / substitution: task-creation capability lists Sol/high; no
substitution
Dispatch ID / state: `AWL-V3-PA-20260722-01` / dispatch-pending
Authorization scope: PA may write `pa.md` and routing/result fields only; no
runtime implementation

## Unique Next Action

1. Create one fresh formal PA at the predecessor-final exact HEAD; PA cold-reads
   the contract and writes `pa.md` or a named escalation.

## Result

PM contract recorded at `def933be06aa171710bfb6d012a7639e30e245e7`.
Risk upgraded from medium to large after real payload mapping exposed both a
new data contract and a paper-local anchor/geometry protocol. The rejected B2
runtime remains excluded.
