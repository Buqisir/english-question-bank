# H5-A CR-Lite — Export Implementation Extraction

Cut: H5-A Export Implementation Extraction
PR: TBD
Reviewer: Codex
Date: 2026-05-24

## Changed Scope

- Export implementation helpers moved from `server/api.mjs` into
  `server/exports/exportImplementation.mjs`.
- Export routes now consume injected implementation helpers instead of
  `context.export*`.
- Added run-form H5-A verifier plus CI / script index registration.
- Added deterministic baseline fixture for export helper output.

## Findings

- Must Fix: none.
- Should Watch:
  - The new implementation factory still depends on DOCX renderer helpers that
    remain in `server/api.mjs`; this is intentional for H5-A to keep the slice
    small. Future extraction should name a product trigger before moving more.
  - The deterministic byte fixture does not replace real renderer smoke; keep
    `verify-print-pdf-export-flow.mjs` in the required suite for export work.

## Verification Evidence

- Static verify:
  - `node scripts/verify-h5a-export-implementation.mjs`
  - `node scripts/verify-h1e-export-routes.mjs`
  - `node scripts/verify-architecture-housekeeping.mjs`
  - `git diff --check`
- Export verify:
  - `node scripts/verify-exam-export.mjs`
  - `node scripts/verify-paper-export-flow.mjs`
  - `node scripts/verify-paper-export-payload.mjs`
  - `node scripts/verify-print-pdf-export-flow.mjs`
  - `node scripts/verify-print-renderer.mjs`
- Build:
  - `npm run verify:all --prefix app`
- Browser QA:
  - Not required; no visible UI or endpoint contract change.

## Failure / Attack Angle

This change could fail if a future agent treats H5-A success as permission to
continue broad `server/api.mjs` extraction without a product trigger. The
strongest technical risk is a misleading green check that only proves route
dispatch, not output semantics; the new run-form verifier reduces that risk by
calling the extracted implementation directly against captured baseline
fixtures. Real PDF renderer coverage remains separate because renderer metadata
is not byte-stable.

## Residual Risk

- Low. The public export endpoints and response headers are unchanged, and the
  extracted implementation is still wired through the same server route list.
- `server/api.mjs` still owns nearby DOCX renderer helper functions; this is a
  deliberate boundary to preserve H5-A as one reversible slice.

## Recommendation

- APPROVE.
