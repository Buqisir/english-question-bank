# Matt-native feature artifacts

These conventions apply to new work. Historical cuts keep their original files
and terminology.

## Small work

Do not create a cut directory by default. The diff, commit, and final result are
enough.

## Normal multi-session work

```text
docs/cuts/<feature>/
  spec.md
  tickets/
    01-<title>.md
```

Use `_templates/spec.md` and `_templates/ticket.md` when a starting shape helps.
Do not fill sections merely to satisfy ceremony.

## Huge/foggy work

Add:

```text
docs/cuts/<feature>/wayfinder/
  map.md
  tickets/
```

The map is an index; decision detail lives in its ticket. One top-level task
resolves one decision ticket.

## Optional artifacts

Create only when the work needs them:

```text
decisions.md       # accepted decisions not already clear in spec/ADR
research/          # sprint-bound primary-source research
prototype.html     # owner-accepted visual contract
review.md          # independent high-risk review worth preserving
qa/                # durable browser/owner QA evidence
handoff.md         # exceptional context handoff
cut-note.md        # material release learning
```

`agent-entrypoint.md`, relay ledgers, PA/CR prompts, standing `plan.md`,
RM artifact files, and watch ledgers are retired for new work.

## Ticket state

Ticket status is `ready`, `in-progress`, `done`, or `blocked`. The Result
section records commit and verification evidence. The owner manually opens the
next ready ticket task.

## Commit and handoff

- Commit the spec/tickets before the first implementation task.
- Each implementation task commits one ticket and leaves the worktree clean.
- `Next` repeats the exact worktree, branch, HEAD, model, effort, and
  complete prompt.
- Files and git preserve continuity; no live-state or dispatch file is needed.
