# EQB independent review overlay

Ordinary ticket review is part of `/implement`. Use this overlay only for the
high-risk triggers in `review-levels.md` or an explicit owner request.

## Contract

- Run in a fresh top-level task manually opened by the owner.
- Pin a fixed point and verify it resolves.
- Read the accepted spec and completed tickets.
- Use `/code-review` to inspect Standards and Spec.
- Internal review workers are allowed as defined by that skill.
- Do not implement fixes, create a successor, or supervise later work.

## Must Fix

Block only a substantive defect that can make the current change wrong, unsafe,
unshippable, or outside the accepted spec.

Do not block for wording, formatting, historical prose, speculative polish, or
theoretical consistency.

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
