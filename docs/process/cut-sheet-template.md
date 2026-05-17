# Cut Sheet Template

Use this before a big cut goes to Plan Reviewer. Keep it concrete. If a section does not matter, write "not relevant" instead of inventing ceremony.

## Title

`<short cut name>`

## Status

Draft / Plan-reviewed / Accepted / Superseded

## Trigger

What user pain, product gap, bug, or architectural drift triggered this cut?

## Product Goal

What should the teacher or internal worker be able to do after this cut?

## Primary User Path

Describe the happy path in plain language.

Example:

1. Search a source paper.
2. Open the paper preview.
3. Click a passage.
4. Add that passage to the Assembly Basket.

## Domain Terms

List the project terms that matter. Prefer terms from `CONTEXT.md` and ADRs.

- Source Paper:
- Passage:
- Question Group:
- Assembly Basket:
- Paper Set:

## Current State

What exists today? Name the important files/modules if known.

## Proposed Direction

What should change at a high level?

## Explicit Non-Goals

Write what this cut must not do. This section is mandatory.

- Do not:
- Do not:
- Do not:

Coder must report out-of-scope discoveries as follow-ups, not implement them in the same PR.

## Cut Plan

Break the work into small cuts. Each cut should be independently reviewable.

### Cut 1

- Goal:
- Files likely touched:
- Verification:
- Stop condition:

### Cut 2

- Goal:
- Files likely touched:
- Verification:
- Stop condition:

## Data And State Ownership

Who owns the important state?

- UI state:
- Domain state:
- Persistence:
- Derived view model:

If state crosses module boundaries, name the interface.

## Persistence Rules

What persists across refresh? What is only in-memory? What writes to SQLite/backend? What must not write?

## Interface / Module Boundaries

What new module or interface is expected? What UI file should become thinner?

## Visual / Interaction Rules

For UI cuts, write the exact interaction rules.

- Default state:
- Click behavior:
- Empty state:
- Disabled state:
- Mobile/small-screen behavior:
- Reduced-motion behavior:

## Verification Plan

List the minimum checks.

- Build:
- Static verify:
- Smoke:
- Manual path:
- Diff hygiene:

## Failure Modes

What could go wrong, and how should the UI/system fail?

## Plan Reviewer Questions

Ask the Plan Reviewer to challenge specific points.

1. Is this the right user path?
2. Is state owned by the right module?
3. Are the non-goals strict enough?
4. Is this split into the right small cuts?

## Decision Log

Record final decisions after Plan Reviewer review.

- Decision:
- Reason:
- Follow-up:

## Ready For Coder Prompt?

Only mark ready when:

- The primary user path is clear.
- Non-goals are explicit.
- State ownership is clear.
- Verification is concrete.
- Plan Reviewer `Must fix` items are resolved or explicitly accepted by the User.
