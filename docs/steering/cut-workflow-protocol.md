# Product and engineering workflow

Choose the smallest path that can produce and verify the requested result.

## Clear work

Understand the affected seam, implement in the current task, run focused
checks, review the diff, and commit when requested. Do not create a spec,
ticket set, review task, QA artifact, or release task by habit.

An explicit Owner Goal covers the complete stated transaction under
`AGENTS.md`'s Goal authorization: diagnose, reconcile the same operation,
implement, review, verify and deliver without mechanical reapproval between
steps. Included entry maintenance, deployment, health and agreed recovery share
that authorization; a code/merge-only Goal does not include deployment. Ask
only at the documented privilege, Secrets, target, uncovered destructive-data
or new irreversible-risk boundaries. UNKNOWN requires reconciliation, not replay.

## Multi-session work

Use one tracked spec and small vertical tickets under `docs/cuts/<feature>/`
when the work genuinely will not fit one context. Tickets should deliver
independently useful behavior. The owner chooses when to start another
top-level task; there is no required phase chain or repeated handoff.

## Genuinely foggy work

Use Wayfinder only until the decisions needed for a spec are clear. Its map is
an index of decisions and remaining fog, not implementation authority or a
phase receipt. Do not create governance-only tickets to publish, approve,
recover, or synchronize the map.

## Risk and acceptance

- Local reversible work gets affected checks.
- A known-shape data addition and a UI micro-change use their light lanes in
  `AGENTS.md` and `docs/agents/testing-cadence.md`.
- Actual high-risk shared behavior gets affected public-seam tests, one final
  full suite, and independent Standards/Spec review.
- Visible behavior gets exact-page real-click verification and Owner QA.
- Production actions must be within the explicit Goal; neither a green gate nor
  an implementation approval expands it.

Record durable product decisions in the spec, ticket, or ADR that needs them.
Use an optional cut note only for a material reusable lesson.
