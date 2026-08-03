# H8 Decisions — PaperSurface Host Interaction Run-Form

Status: accepted for this verify-hardening cut.
Last synced: 2026-05-24 after Codex cut selection.
Open items from external review: 0

## Locked Decisions

- H8 converts one high-value grep-style verify into run-form behavior
  coverage instead of trying to clean up every historical verify script.
- The selected seam is `paperSurfaceHostInteractionReducer`, because it
  is pure, small, and owns teacher-focus / insight / structure / rail
  reset behavior.
- The verify script should import and execute the reducer directly.
- Static checks remain only where they prove architecture shape:
  reducer purity, harness using `useReducer`, harness retaining DOM
  adapter responsibility, and forbidden-scope guardrails.
- `verify-paper-surface-host-interaction.mjs` remains cut-specific and
  outside stable CI for now.

## Open Decisions

- None.

## Moved / Cut

- No PaperSurface visual behavior changes.
- No reducer implementation changes unless the new run-form checks
  expose a real bug.
- No migration to a general test runner in H8.
- No broad conversion of older verify scripts.
