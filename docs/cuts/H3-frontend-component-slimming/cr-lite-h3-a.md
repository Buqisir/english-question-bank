# H3-A CR Lite — Draft Paper Preview Locality

Date: 2026-05-23
Verdict: APPROVE

## Findings

No must-fix findings.

## Review Notes

- The extraction creates a real locality improvement: the workbench no longer
  owns the long inline preview CSS and pagination script.
- The interface is intentionally small: `buildA4PreviewHtml(printHtml)`.
- No caller behavior changed. `DraftPaperWorkbench` still computes
  `previewHtml` with `useMemo` and passes it to the iframe `srcDoc`.
- The verify script now guards the new seam instead of only checking inline text
  inside the workbench.

## Attack Angle

If this went wrong, the likely failure would be silent preview drift: the helper
moves out, but the verify script keeps searching only the old workbench file.
That is covered by the new assertion that the preview generator lives outside
the workbench and that the A4 dimensions / pagination script live in the new
module.

## Residual Risk

Low. This is a pure extraction with build and render-model verification. No
server, data, CSS, or product behavior changed.
