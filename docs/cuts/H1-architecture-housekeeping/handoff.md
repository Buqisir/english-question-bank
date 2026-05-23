# H1 Handoff

Status: H1 is closed at H1-G.

## Next Agent Should Know

- Do not create H1-H.
- H1 means "Server Route Ownership" in this repo's history.
- The route owner layer is now good enough for near-term product work.
- `server/api.mjs` is still large, but that alone is not a reason to continue
  H1.
- Future housekeeping must be named as a new cut with a distinct objective.

## If The User Says "Continue Housekeeping"

Route the request to one of these cuts:

1. **H2 Workflow / Verify / CI Discipline**
   - Use when the request is about PR size rules, cut notes, watch ledgers,
     verify scripts, CI, or external-agent process.
   - Goal file:
     `docs/cuts/H2-workflow-verify-ci-discipline/goal-h2-workflow-verify-ci.md`

2. **H3 Frontend Component Slimming**
   - Use when the request is about `PaperSurfaceHarness`,
     `DraftPaperWorkbench`, panels, hooks, scroll sync, or frontend module
     size.

3. **H4 Design Tokens / UI Consistency**
   - Use when the request is about colors, spacing, typography, shared UI
     tokens, or visual consistency.

4. **H5 Server Implementation Extraction**
   - Use only when a product cut needs deeper server implementation locality.
   - Do not start H5 just to reduce line count.

## Existing H1 PR Map

- #100 H1-A: minimal route registry
- #101 H1-B: Draft Paper / My Space server surface
- #102 H1-C: Paper Import routes
- #103 H1-D: PaperSurface analysis availability owner
- #104 H1-E: export routes
- #105 H1-F: legacy import routes
- #106 H1-G: question-group routes

Planning-only:

- #98 H1 planning / PA response
- #99 H1 A+B goal plan

## Guardrail

If a future agent wants to keep extracting from `server/api.mjs`, ask:

> Is this blocking the next product cut, or are we just making the file smaller?

If the answer is only "make it smaller", stop and return to product work.
