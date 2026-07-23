# AWL-V3-01 · 终版批注原型生产化

Type / role: Wayfinder -> PM contract -> formal PA -> DEV -> verification ->
fresh CR -> QA -> RM
State: ready-for-dev
Blockers: none
Claimed by: fresh PM plan-revision (releasing one fresh DEV)
Base head: `github/main@1deec0f`
Owner-approved DEV plan head:
`9f87000cc51f59b985d420471d095230fa35f02a`
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

Current role: fresh PM plan-revision releasing the approved contract
Next role: exactly one fresh DEV
Configured model: `gpt-5.6-sol`
Selected model: `gpt-5.6-sol`
Thinking: `high`
Availability / substitution: task-creation capability lists Sol/high; no
substitution
Dispatch ID / state: `AWL-V3-PM-REV-20260722-01` / ready-for-dev
Authorization scope: PM plan-revision may edit cut docs except canonical
`pa.md`; no runtime implementation
Successor dispatch: `AWL-V3-DEV-20260723-01`; `gpt-5.6-terra` / `high`,
explicitly available in the current task-creation capability. High is selected
over the DEV default medium because the exact 16-file route spans schema,
persistence, paper-host geometry, browser behavior, and subset fonts.

## Unique Next Action

1. PM commits and pushes the owner verdict, 5/5 closed Must Fix dispositions,
   zero blocking PO decisions, and the exact counted implementation route.
2. PM creates exactly one fresh DEV from that released head, confirms
   activation, and immediately exits without awaiting implementation.

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
PM revision `8081cabc9dbf63d182fdab5a3172eb0394a8d08c` adds both
production-shaped pilot packets, closes MF-2 through MF-5, narrows the review
contract to the prototype's exact two-point class, locks literal availability,
active-group teardown, 794 × 472 / 612 × 458 host geometry, Times New Roman
essay font, and the exact 16-file route. Live-site recheck corrected the
responsive contract: lecture rail and paper are side-by-side, and v3 keys off
the real paper canvas reaching its 794 px cap instead of a guessed viewport.
A runtime-only browser harness now injects the selected Variant A stage and
locked review card into the actual 2022 / 2024 local paper pages; both
full-canvas states pass `5/5 + 4/4`, while the 628 px narrow host refuses
injection. The exact injected owner-review artifact head is
`6ba221a267b6b4d2e5235e2d742cf607811b78aa`; owner review rejected the
half-page lower-left leader, restored `要点②` near its source, and made every
review micro leader visibly enter its underline with an arrowhead toward the
note.
The owner personally passed the final real-site prototype on 2026-07-23 at
exact head `4208c672373433b1b357228c55af1645f5ccbb7e`. MF-1 is closed; the formal
PA disposition count is 5/5 and blocking PO decisions are zero. Exactly one
fresh DEV is now authorized. After `git fetch github`, the owner-approved plan
release recheck proved remote source ref, local `HEAD`, and released head all
equal `9f87000cc51f59b985d420471d095230fa35f02a`; the worktree was clean.
