# Model and effort guidance

These routes are optional workload guidance. They do not authorize broader
scope or weaken the proportionate test, review, QA, or production rules in
`AGENTS.md`.

## Default routes

| Work | Model | Effort |
| --- | --- | --- |
| Coordinator, Wayfinder, product investigation including grilling, domain modeling, to-spec, to-tickets, and measured replanning | `gpt-5.6-sol` | `medium` |
| Deterministic, repetitive, mechanically checkable work after its seam and expected result are already proven | `gpt-5.6-luna` | `max` |
| Normal implementation and semantic fixes | `gpt-5.6-terra` | `high` |
| First-of-kind source adapters; cross-cut persistence, migration, or rollback; full-corpus semantic closure; full Screen/Print/PDF closure | `gpt-5.6-terra` | `max` |
| Independent Standards/Spec review and focused re-review | `gpt-5.6-sol` | `medium` |
| High-risk aggregate review: full-corpus source closure, full Screen/Print/PDF closure, or final legacy-retirement closure | `gpt-5.6-sol` | `high` |

Classify by the work that can make the result wrong, not by the artifact's file
type. In particular:

- a mechanical documentation or metadata fix uses Luna Max only when the seam,
  desired bytes, and direct check are already proven;
- a semantic or evidence fix uses Terra High;
- a cross-cut closure fix uses Terra Max;
- a focused re-review retains the Sol effort of its review gate: Medium by
  default, or High for a high-risk aggregate lineage.

Classify the concrete work by its highest-risk part. A separately required
independent reviewer uses the Sol review row. Model choice never lowers the
proof required by the changed behavior.

## Escalation and availability

`gpt-5.6-sol` / `xhigh` requires fresh explicit owner direction and is limited
to unresolved contradictory evidence, deeper arbitration after a failed
high-level review, or a one-shot governance or design task. It is not a
default. The standing owner cap is Sol xHigh; do not use Sol Max or Ultra
unless fresh explicit owner direction changes that cap.

If the selected route is unavailable, report the unavailable model and effort
plus the nearest sensible option to the owner. That option is a proposal and
requires fresh owner direction before substitution. Do not silently substitute
it, inherit a historical route, or treat model availability as authority to
skip work.

These are workload policies, not claims about model intelligence or provider
cost. Runtime billing, token cost, and quota were not measured. The
initiative-specific timing trial that informed this revision is evidence, not
general authority; it is recorded in
`docs/cuts/paper-canonical-unification/migration/testing-and-model-routing-measurements-2026-08-01.md`.
