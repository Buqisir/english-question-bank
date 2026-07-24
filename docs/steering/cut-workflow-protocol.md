# Product and engineering workflow

The workflow is Matt's idea-to-ship path adapted to EQB's product risks.

## 1. Classify two independent things

### Context shape

- **Small**: clear and implementable in the current healthy context.
- **Normal**: plan fits one context but implementation needs multiple tickets.
- **Huge/foggy**: the path to a spec is not visible; use Wayfinder.

### Product risk

- **Normal**: local and reversible.
- **High risk**: schema/data contracts, migrations, auth/permissions,
  persistence, PaperSurface anchors, print/export, production configuration,
  cross-cut architecture, or an irreversible decision.

Context shape decides how many fresh tasks are useful. Product risk decides
whether an independent top-level review is required. Do not inflate one axis
because the other is large.

## 2. Small

Use the current task:

```text
understand → implement → narrow verify → review → commit → DONE
```

No cut directory, spec, ticket, review artifact, QA file, or Next task unless
the work genuinely needs one.

Upgrade from Small when:

- behavior is still undecided;
- more than one independently useful slice appears;
- the change crosses a high-risk boundary;
- the agent cannot explain the verification seam;
- the context begins to degrade.

## 3. Normal

The planning task runs:

```text
grill-with-docs → to-spec → to-tickets
```

Keep those steps in one context while it remains sharp. Store the durable
result under:

```text
docs/cuts/<feature>/
  spec.md
  tickets/
```

Tickets are tracer bullets: each one delivers a complete behavior through the
necessary layers and can be verified on its own. Horizontal schema/API/UI
phase tickets are not the default.

The owner then opens one fresh top-level `/implement` task per ready ticket,
blockers-first. Every ticket task commits its result and returns the exact
worktree, branch, HEAD, and next prompt.

## 4. Huge and foggy

Wayfinder charts only decisions that can be stated precisely now. Unclear
future areas remain Fog.

```text
docs/cuts/<feature>/wayfinder/
  map.md
  tickets/
```

Charting is one task. Resolving one decision ticket is one fresh top-level
task. When the map is clear, synthesize every closed decision into `spec.md`
and continue through normal ticketed implementation.

Wayfinder never implements production code.

## 5. Research and prototype detours

Use `/research` when a planning decision needs primary-source facts. Its
background worker is internal to the current task.

Use `/handoff` → `/prototype` when conversation cannot settle a UI, interaction,
or state-model question. Keep the answer, not the prototype code. Snapshot an
owner-approved visual prototype when implementation must preserve it.

## 6. Implementation contract

Each ticket prompt names:

- exact worktree, branch, and expected HEAD;
- exact spec and ticket;
- allowed behavior and explicit out-of-scope;
- accepted test seam;
- required narrow checks;
- whether owner browser QA is required.

The task uses `/implement`, which drives vertical-slice TDD, relevant checks,
Standards + Spec review, fixes, and commit. It does not create the next task.

Stop rather than guess when:

- `SPEC CONTRADICTS` — accepted artifacts disagree;
- `SCOPE UNCLEAR` — the ticket cannot be implemented without a new decision;
- `BRANCH CONFLICT` — worktree/branch/HEAD is not the handoff;
- `CONTEXT INSUFFICIENT` — required source material is absent.

## 7. Independent review

High-risk work gets one fresh top-level `$code-review` lineage after the
relevant tickets are complete. The initial independent review uses the
implementation base as `Fixed point` and the implementation HEAD as
`Expected HEAD`. Normal work relies on `$implement`'s review unless the owner
requests another.

After a Must Fix repair, the focused re-review uses the previously reviewed
HEAD as `Fixed point` and the new fix HEAD as `Expected HEAD`. It checks only
the previous Must Fix, the fix diff, and direct regressions; it does not reopen
reviewed history. Continue blocking only for a concrete, substantive defect in
or left by the fix diff that makes the implementation wrong, unsafe, or
contrary to the accepted spec.

Review ends as soon as there are no substantive Must Fix findings, then moves
to owner QA or shipping with no further CR. Wording, formatting, historical
narrative, theoretical boundaries, and unrelated improvements do not block.
One fresh independent review means one review lineage, not a new full review
after every fix.

## 8. QA

User-visible changes require:

- real browser interaction;
- comparison against the accepted spec/prototype;
- an owner checklist of at most five actions.

The QA task stays open for the owner's response. `QA 完成` advances to shipping;
a failure produces one copyable fix prompt.

## 9. Ship

The owner manually opens one ship task after tickets, required independent
review, and QA are complete.

The ship task:

1. verifies the exact branch and clean worktree;
2. checks the required evidence;
3. runs the missing release checks or consumes current CI evidence;
4. pushes/merges;
5. confirms `main` CI;
6. updates `docs/STATUS.md` in at most five lines;
7. returns `DONE`.

Shipping is an action, not a standing RM persona.

## 10. Context and handoff

At a phase boundary, continue while the context remains sharp or the remainder
is simple. If it cannot continue: clear disposable context; use `/handoff` only
to cross to another agent, directory, or colleague; use a bounded internal
worker only for AFK work that reports back; otherwise compact valuable context
and continue the same ticket. Repeated settled questions, forgotten scope,
mixed tickets, or stalled rereading are behavioral stop signals.

The next top-level task is always opened manually by the owner. Historical
`agent-entrypoint.md`, relay ledgers, and Auto-Next lifecycle records never
route new work.
