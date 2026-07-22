# Codex × Matt two-axis workflow

Risk and context topology are independent. Risk selects Small / Medium / Large
/ irreversible gates. Context selects one bounded slice, a serial ticket graph,
or a Wayfinder map; it never waives a risk gate.

Wayfinder is a role and tracked map, not a required skill name. For foggy,
large features it owns the durable frontier through decisions, tickets, spec,
review, QA, and closeout; it is not a surviving coordinator conversation.

## Auto-Next relay

Each task owns one role, writes its durable result, and creates at most one
independently addressable fresh direct successor. A parent-owned subagent may
assist a role only; it never satisfies a PA, DEV, verification, formal CR,
QA, or RM boundary. Initial CR/re-review has no DEV history.

For a shared worktree: record `dispatch-pending`; create the write-held child;
record `provisioning` then `ready-held`; make the predecessor's final commit
with `release-authorized`; release its exact hash; the child re-proves that
hash and clean state, makes its first permitted `active` record, acknowledges,
and becomes sole writer. The predecessor then exits without a further write or
waiting for the result. States are `blocked -> ready -> claimed ->
result-recorded -> dispatch-pending -> provisioning -> ready-held ->
release-authorized -> active -> closed`; failures are durable.

Dispatchers read [model routing](../agents/model-routing.md), record explicit
model/thinking and availability evidence, and do not create a task when no
eligible candidate exists. Human QA pauses the relay; `QA 完成，继续` resumes
with RM, while failed QA dispatches fresh fix DEV -> verification -> re-review.

Tracked multi-task truth lives under `docs/cuts/<CUT>/`; `.scratch/` is never
shared state. The first three qualifying Medium/Large cuts use serial tracked
topology as an evaluation gate.
