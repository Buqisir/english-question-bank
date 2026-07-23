# AWL-V3-01 · 终版批注原型生产化

Type / role: Wayfinder -> PM contract -> formal PA -> DEV -> verification ->
fresh CR -> QA -> RM
State: active
Blockers: formal PA 5 Must Fix + 3 blocking PO decisions
Claimed by: fresh PM plan-revision
Base head: `github/main@1deec0f`
Expected head: `eefa1305f326c0d25c4fcb6b5122ea8e75323051`
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

Current role: fresh PM plan-revision
Next role: unresolved until the PA disposition and PO-decision gates close
Configured model: `gpt-5.6-sol`
Selected model: `gpt-5.6-sol`
Thinking: `high`
Availability / substitution: task-creation capability lists Sol/high; no
substitution
Dispatch ID / state: `AWL-V3-PM-REV-20260722-01` / active
Authorization scope: PM plan-revision may edit cut docs except canonical
`pa.md`; no runtime implementation

## Unique Next Action

1. PM plan-revision closes the five PA dispositions and three blocking PO
   decisions or durably records a human-decision pause; DEV remains forbidden
   meanwhile.

## Result

PM contract recorded at `def933be06aa171710bfb6d012a7639e30e245e7`.
Risk upgraded from medium to large after real payload mapping exposed both a
new data contract and a paper-local anchor/geometry protocol. The rejected B2
runtime remains excluded. PA activation re-proved that
`github/codex/applied-writing-lecture-v3-20260722-01` resolved to released head
`64a6784a71b70edb23da745ca24d945982a8a6bc`, that it was an ancestor of
worktree `HEAD`, and that the worktree was clean. Formal PA result
`e5d8dec9c76b35d581bc61e96b41681e3c7c7529` is
`APPROVE WITH MUST FIX`: 5 unresolved Must Fix and 3 blocking PO decisions;
the only legal successor was fresh PM plan-revision. Activation at released
head `eefa1305f326c0d25c4fcb6b5122ea8e75323051` re-proved after
`git fetch github` that the remote source ref resolves exactly to that commit,
that it is an ancestor of the current `HEAD` (which also equals it), and that
the worktree was clean. Dispatch `AWL-V3-PM-REV-20260722-01` is active.
