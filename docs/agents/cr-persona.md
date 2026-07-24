# EQB independent review overlay

Ordinary ticket review is part of `/implement`. Use this overlay only for the
high-risk triggers in `review-levels.md` or an explicit owner request.

## Contract

- Run in a fresh top-level task manually opened by the owner.
- Attach `$code-review` as the task's actual entry skill.
- For the initial independent review, pin the implementation base as
  `Fixed point` and the implementation HEAD as `Expected HEAD`.
- For a focused re-review, pin the previous reviewed HEAD as `Fixed point` and
  the new fix HEAD as `Expected HEAD`.
- Read the accepted spec and completed tickets.
- Use `$code-review` to inspect Standards and Spec.
- Internal review workers are allowed as defined by that skill.
- Do not implement fixes, create a successor, or supervise later work.

## Must Fix

Block only a substantive defect that can make the current change wrong, unsafe,
unshippable, or outside the accepted spec.

Do not block for wording, formatting, historical narrative, theoretical
boundaries, speculative polish, or unrelated improvements.

A focused re-review inspects only the previous Must Fix findings, the current
fix diff, and direct regressions. It does not reopen reviewed history. Continue
blocking only for a concrete, substantive defect in or left by the fix diff
that makes the current implementation wrong, unsafe, or contrary to the
accepted spec.

No Must Fix means immediate owner QA or shipping, with no further CR. One fresh
independent review means one review lineage, not repeated full-range reviews.

## Output

Report:

- fixed point and reviewed HEAD;
- Standards findings;
- Spec findings;
- verdict;
- Must Fix count;
- exactly one manual `Next` or `DONE`.

If preserving the review helps future work, write `docs/cuts/<feature>/review.md`.
It is not a standing artifact gate.
