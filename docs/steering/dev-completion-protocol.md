# Ticket completion protocol

An implementation task finishes one ticket. It does not create, open, run, or
supervise the next top-level task, but a passed non-terminal ticket must return
the complete handoff declared by `Next on PASS`.

## Before finishing

- acceptance criteria are met;
- `$implement` has completed TDD, focused checks, and ordinary Standards +
  Spec review;
- findings were fixed or recorded as a real blocker;
- the ticket result is updated;
- changes are committed;
- the worktree is in the allowed state;
- exact branch and HEAD are known.

## Final response

Use the short result fields in
`../agents/dev-completion-report-template.md`. Do not paste raw command logs or
an implementation diary.

Then read `Terminal` and `Next on PASS` and choose exactly one exit under
`../agents/dispatch-protocols.md`. That file is the sole detailed owner of:

- dispatch versus handoff;
- deterministic completion exits;
- skill attachment and path verification;
- the complete new top-level task template;
- blocker and unclear-state routing.

The task never dispatches a successor. A completed non-terminal task must
still hand off its declared successor; “do not start the next ticket” does not
permit omitting its handoff.

For visible work, provision and open the page, then use
`../agents/owner-qa-handoff-template.md`. Owner QA remains in the current task
and is not a successor dispatch.

After `QA 完成`, perform closeout and choose the next deterministic exit. Use
`DONE` only after every required ticket, review, owner QA, and release closeout
is complete.
