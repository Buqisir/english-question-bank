# H3-C CR Lite — PaperSurface Analysis Panel Locality

Date: 2026-05-24
Verdict: APPROVE

## Findings

No must-fix findings.

## Review Notes

- The extraction creates real locality: paper-asset analysis rendering and
  legacy analysis rendering now live in feature-local panel files.
- The harness interface stays appropriately host-owned. It passes analysis
  data, active option/evidence state, and selection callbacks; it does not move
  reducer state, fetch behavior, PaperSurface props, or line geometry into the
  panels.
- Existing `data-pi-evidence-id`, `data-pi-evidence-kind`, and CSS class names
  were preserved, so the cross-column evidence line and styling contract remain
  intact.
- No PaperSurface renderer, `shared/papersurface/**`, server, data schema,
  product behavior, or visual design files changed.

## Attack Angle

If this went wrong, likely failures would be:

- right-panel extraction breaks support / trap evidence selection while static
  typecheck still passes;
- legacy text-only distractor rows become clickable and try to draw a line to
  a missing left-side anchor;
- paper-asset wrong-option accordion loses the default support/trap evidence
  target;
- the harness becomes smaller only by pushing host focus state into shallow
  children.

The updated verify script covers the structural seam and the text-only
distractor invariant. Browser QA covered paper-asset option / evidence
interaction and the legacy support / distractor panel path.

## Residual Risk

Low. This is a behavior-preserving extraction with narrow verify, stable verify,
build, and browser QA. The remaining PaperSurface harness size is now
orchestration-heavy rather than right-panel rendering-heavy.

## Follow-Up

Do not automatically extract H3-D hooks. Proceed only if a future pass finds a
deep data/focus seam with a smaller interface than the code it moves.
