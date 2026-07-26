# EQB × Matt development workflow

This is the practical entry guide for developing EQB with Matt Pocock's
current skills. It replaces the retired Auto-Next relay.

## The one picture

```text
small and clear
  └─ implement now → verify → review → commit

normal feature
  └─ grill-with-docs → to-spec → to-tickets
                         └─ fresh implement task per ticket
                         └─ owner QA when visible
                         └─ ship

huge and foggy
  └─ Wayfinder map
       └─ one fresh task per decision ticket
       └─ to-spec → to-tickets → implement
```

Manual owner dispatch is the default. The sole agent-side exception is an
owner-explicit `$coordinate-eqb-wayfinder` for an already-charted map under
`../agents/dispatch-protocols.md`; ordinary task agents never create the next
task.

## What manual means

- no Auto-Next;
- no `create_thread`, fork, or subagent successor;
- no implicit, permanent, or self-replacing coordinator;
- one writer task at a time in a feature worktree;
- every passed non-terminal task returns the handoff declared by its ticket.

This does not disable a Matt skill's bounded internal workers. `/research` may
use a background researcher. `/code-review` may use internal Standards and Spec reviewers.
They report to the current task and never become the next ticket or phase.

## Pick the entry point

| Situation | Entry |
| --- | --- |
| Small, clear, reversible | `/implement` now |
| Feature fits one planning context | `/grill-with-docs` |
| UI or state question needs something runnable | `/handoff` → `/prototype` → `/handoff` back |
| Multi-session build | `/to-spec` → `/to-tickets` |
| Huge and foggy | `/wayfinder` |
| Difficult bug | `/diagnosing-bugs` |
| Raw incoming issues | `/triage` |
| Architecture health | `/improve-codebase-architecture` |

Wayfinder is exceptional. Use it only when one planning context cannot hold the
map.

## Plan and ticket

For a normal feature:

1. `/grill-with-docs` resolves product decisions.
2. `/to-spec` records accepted behavior and boundaries.
3. `/to-tickets` creates bounded, independently completable tickets.
4. Each new ticket declares `Next on PASS` and `Terminal`.
5. The owner opens one fresh `/implement` task per ticket.

The ticket is the durable source of scope, acceptance, verification, and exit
routing. Do not copy the ticket body into the next prompt.

## Implement one ticket

`$implement` owns one ticket's TDD and code-review loop:

- verify worktree, branch, HEAD, spec, and ticket;
- implement only that ticket;
- run focused checks and the full suite required by risk;
- perform ordinary Standards + Spec review and fix findings;
- commit the bounded result;
- choose the exit declared by `Next on PASS`.

The implementation task does not dispatch or supervise the successor. It must
still generate the declared handoff when the initiative remains open; an
already-authorized coordinator may consume that handoff without changing it.

## Review and QA

High-risk changes receive one fresh independent review lineage:

- Initial independent review compares the implementation base through the
  completed implementation HEAD.
- Focused re-review compares the previously reviewed HEAD through the fix HEAD
  and checks prior Must Fixes, the fix diff, and direct regressions.
- A green lineage proceeds to owner QA or release; it does not restart a full
  review.

User-visible work requires browser provisioning and owner acceptance under
`../agents/owner-qa-handoff-template.md`.

## Completion and new tasks

Detailed exit selection, dispatch versus handoff, skill resolution, blockers,
and the only complete attachment-first template live in
`../agents/dispatch-protocols.md`.

New top-level task: use that canonical template and fill its exact `Worktree:`,
branch, `Expected HEAD:`, spec, ticket, fixed point, model, effort, and short
prompt. Implementation/fix successors attach `$implement`; independent review
and focused re-review successors attach `$code-review`.

The prompt links the ticket and says to implement only it, treating its
`Next on PASS` as the exit route. It does not recursively restate the ticket.

Invocation availability and handoff referenceability are separate. Current
invocation requires an active or owner-attached skill; a future attachment may
use one uniquely verified explicit-only skill. The full resolution and
`SKILL UNAVAILABLE` rules are owned by `dispatch-protocols.md`.

## Context and worktrees

- One top-level task writes a feature worktree at a time.
- Specs, tickets, review anchors, and QA evidence are durable; chat is not.
- Reuse one sequential feature worktree for a multi-ticket initiative.
- Before every handoff, report the exact worktree, branch, and HEAD.
- Ordinary tasks do not create lifecycle state, a dispatch ledger, or a
  coordinator. The global coordinator skill keeps only an in-conversation
  ledger.

Use `/handoff` only when crossing to another agent, directory, or colleague.
Otherwise compact valuable context and continue the current ticket while it
remains sharp.

## Ship

Before merging:

- implementation checks are green;
- required independent review has no Must Fix;
- user-visible work has browser and owner QA;
- `pnpm -C app run verify:all` or PR CI is green.

The owner manually opens one ship task when shipping is a required successor,
unless an already-authorized coordinator follows that exact durable route.
After merge, confirm `main` CI and update `docs/STATUS.md` briefly for material
releases.

## Non-Codex fallback

Matt skills are not vendored here. A non-Codex harness must explicitly declare
`NATURAL-LANGUAGE FALLBACK` before following the equivalent workflow. Never
install infrastructure automatically.
