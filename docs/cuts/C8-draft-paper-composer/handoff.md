# C8 Handoff

Cut: C8 Draft Paper Composer / 草稿卷组卷与个人空间 V1
Last updated: 2026-05-23
Branch truth: GitHub `main` after planning PR #92

## Current Truth

- PM grill is complete.
- Opus PA review is recorded at
  `docs/cuts/C8-draft-paper-composer/pa-review-opus.md`.
- PO accepted the PA direction and planning decisions.
- C8 remains a large user-visible cut and should use staged
  implementation, Codex CR, browser QA, PO QA, and a final Cut Note.

## Completed

- PM spec and decision ledger exist.
- External PA report exists in-repo, not only in chat.
- Draft Paper was accepted as a distinct domain entity.
- C8 V1 scope is student-paper composition and export only.

## Still Open

- Implementation checkpoints still need to be cut into reviewable PRs.
- Before RM, C8 needs a `cut-note.md` using
  `docs/cuts/_templates/cut-note.md`.
- Should Watch items from PA / CR must be copied into the Cut Note or a
  relevant ledger before merge.

## Must Not Forget

- Do not turn C8 into a mini Word processor.
- Do not allow single-question composition.
- Do not print source metadata in C8 V1.
- Do not add answer sheets or teacher analysis output in C8 V1.
- Do not implement a parallel React print template if the print
  renderer can be reused.

## Verify / QA State

- Planning docs were reviewed by Opus PA.
- Runtime DEV has not started from this handoff state.
- Browser QA is required for any visible draft-paper / My Space UI.

## Next Action

Compress C8 into staged DEV prompts or a PRA artifact, keeping each PR
within the size gate in `.kiro/steering/cut-workflow-protocol.md`.
