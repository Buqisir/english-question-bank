# H5-A Cut Note — Export Implementation Extraction

Date: 2026-05-24
Status: Ready for PR review

## Shipped

- Export implementation helpers moved into `server/exports/exportImplementation.mjs`.
- Export route shell remains in `server/exports/exportRoutes.mjs`.
- H5-A run-form verifier added and registered in the stable verify suite.
- Deterministic export baseline fixture added before implementation extraction.

## What Was Not Changed

- No UI, DB, prompt, AI parse, PaperSurface, paper data, router, or print
  renderer changes.
- H5 remains closed after H5-A unless a future product cut names a new trigger.

## What We Learned

- Export implementation is the right pilot slice because its behaviour can be
  verified by function-level output fixtures plus existing export smoke tests.
- Byte-identical real DOCX/PDF files are not stable enough for repo fixtures
  because renderer/package metadata can vary; deterministic render doubles are
  the safer H5-A regression boundary.
- H1-E verify had to evolve from "api owns implementation" to "routes dispatch
  through the export owner module"; old verify claims must be updated when the
  architectural boundary intentionally moves.

## Metrics

- PA rounds: 1
- Big CR rounds: 0
- Must Fix count from PA: 3
- Open PO decisions after `decisions.md`: 0
