# Review levels

Review strength follows real risk. Review is a feedback loop, not a sequence of
personas.

## Level 0 — direct

Use for a small, clear, local, reversible change.

- implement in the current task;
- run the narrow relevant check;
- perform the `/implement` closeout review;
- commit;
- `DONE`.

No spec, ticket directory, independent review, or cut ceremony is required.

## Level 1 — ticketed

Use for a normal feature that needs more than one implementation context.

- `/grill-with-docs` when behavior is still fuzzy;
- `/to-spec` and `/to-tickets`;
- one fresh `/implement` task per ticket;
- owner QA if user-visible;
- ship after every ticket is done.

`/implement` includes its own Standards + Spec review. Do not add a separate
verification, CR, or RM task by habit.

## Level 2 — independent review

Add one fresh top-level `/code-review` before shipping when the change touches:

- schema or data-contract semantics;
- migrations, permissions, authentication, persistence;
- PaperSurface anchors;
- print, PDF, DOCX, or export;
- production configuration;
- cross-cut architecture or an irreversible decision;
- repeated implementation failure;
- an explicit owner request.

The review pins a fixed point, reads the accepted spec/tickets, and checks both
Standards and Spec. The skill may use its internal independent reviewers. It
does not implement fixes or create the fix task.

Only a substantive defect that can make the current change wrong, unsafe,
unshippable, or outside the accepted spec is `Must Fix`. Wording, formatting,
historical prose, speculative polish, and theoretical consistency are not
blocking.

If review finds a Must Fix, its `Next` asks the owner to open one fresh fix
implementation task. After the fix, rerun only the review/evidence invalidated
by the change.

## QA

User-visible behavior requires real browser QA and owner acceptance.

QA stops when:

- the main path works;
- the accepted prototype/spec is preserved;
- no blocking user-visible issue remains;
- polish ideas are recorded instead of absorbed.

Static verification never substitutes for browser QA.

## Stop rules

Review stops when:

- there are no Must Fix findings;
- the implementation matches the accepted spec;
- evidence is strong enough for the changed surface;
- remaining observations are non-blocking.

Do not open review-after-review loops for wording or artifact neatness.

## High-risk design

There is no standing PA role. When a design is unresolved:

- continue `/grill-with-docs`;
- use `/domain-modeling` for language;
- use `/prototype` for runnable/UI uncertainty;
- record an ADR for a truly irreversible decision;
- do not start implementation until the decision is clear.

An explicit fresh design review may be requested for an exceptional
architecture or contract change, but it returns advice to the owner; it does
not start a relay.
