# Model and effort guidance

These routes are optional workload guidance. They do not authorize broader
scope or weaken the proportionate test, review, QA, or production rules in
`AGENTS.md`.

## Default routes

| Work | Model | Effort |
| --- | --- | --- |
| Planning, decomposition, and coordination | `gpt-5.6-sol` | `medium` |
| Semantic, shared, or uncertain execution | `gpt-5.6-terra` | `xhigh` |
| Clear, local, mechanical, or repetitive execution | `gpt-5.6-luna` | `xhigh` |
| Independent Standards/Spec review and focused re-review | `gpt-5.6-sol` | `medium` |

Classify by the work that can make the result wrong, not by the artifact's file
type. In particular:

- planning uses Sol Medium; use Sol High only when the planning itself is
  genuinely complex;
- use Terra xHigh for the ordinary execution pool when semantics, shared
  behavior, or uncertainty can make the result wrong;
- use Luna xHigh for the ordinary execution pool when the seam is clear and
  the work is local, mechanical, or repetitive;
- Terra Max and Luna Max are exceptional, not defaults: a fresh concrete
  reason must establish that xHigh is insufficient;
- one independent review lineage uses Sol Medium, including a focused
  re-review.

Classify the concrete work by its highest-risk part. A separately required
independent reviewer uses the Sol review row. Model choice never lowers the
proof required by the changed behavior.

## Escalation and availability

Sol High requires a fresh concrete reason that the planning is genuinely
complex. Sol xHigh requires fresh explicit owner direction and is limited to
unresolved contradictory evidence, deeper arbitration after a failed
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
