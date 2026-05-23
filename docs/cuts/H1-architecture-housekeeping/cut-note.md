# H1 Cut Note — Architecture Housekeeping Closeout

Date: 2026-05-23
Status: Closed at H1-G. Do not add H1-H.

## What H1 Was For

H1 was a server route ownership cut. Its purpose was to reduce the review cost
of `server/api.mjs` by moving route dispatch into owned modules while preserving
behavior exactly.

H1 was not meant to solve every housekeeping issue in the repo. The motivating
problems discussed during the cut were broader:

- `server/api.mjs` was too large and hard to review.
- External PA / CR had trouble finding route owners.
- verify scripts, rules, CI, and tokens were scattered.
- Future C8 / C9 product work should not be slowed by old structure.

Those are four different kinds of work. H1 intentionally closed only the first
two at the server-route layer.

## What Shipped

Planning / protocol:

- PR #98: H1 planning docs and external PA review response
- PR #99: H1 A+B goal plan

Implementation PRs:

- PR #100: H1-A minimal server route registry
- PR #101: H1-B Draft Paper / My Space server surface routes
- PR #102: H1-C Paper Import route dispatch
- PR #103: H1-D PaperSurface analysis availability owner
- PR #104: H1-E export routes
- PR #105: H1-F legacy import routes
- PR #106: H1-G question-group routes

New or clarified owner modules:

- `server/router/index.mjs`
- `server/draft-paper/draftPaperRoutes.mjs`
- `server/draft-paper/draftPaperStore.mjs`
- `server/my-space/mySpaceRoutes.mjs`
- `server/paper-import/paperImportRoutes.mjs`
- `server/search/paperSurfaceAvailability.mjs`
- `server/exports/exportRoutes.mjs`
- `server/imports/legacyImportRoutes.mjs`
- `server/question-bank/questionGroupRoutes.mjs`

`server/api.mjs` line count after H1-G: 11,099 lines. Line count was treated as
a health signal, not the success gate.

## What H1 Did Not Do

H1 did not:

- rewrite `server/api.mjs` into a small file;
- extract all DB/query implementation functions;
- extract AI proxy routes;
- extract paper-set / paper-workflow routes;
- change API behavior, response JSON, status codes, DB schema, UI, PaperSurface,
  print rendering, or reading-analysis behavior;
- solve frontend component size;
- finish CI / verify workflow discipline;
- finish design-token adoption.

These were intentionally left out so H1 would remain a route ownership cut, not
a permanent housekeeping umbrella.

## Key Lesson

The original H1 PM spec described four implementation PRs. During execution,
the work split into seven behavior-preserving implementation PRs because the
safe engineering unit was a route owner, not a broad problem statement.

That was safe for review and rollback, but it made H1 feel open-ended. The
closing rule is now:

> H1 ends at H1-G. New housekeeping work must start a new H-numbered cut with a
> narrower objective.

## Follow-Up Cuts

Use these names instead of extending H1:

- **H2 — Workflow / Verify / CI Discipline**
  - PR diff/file-count guardrails
  - cut-note enforcement
  - watch-ledger flow
  - CI workflow installation
  - verify script index maintenance

- **H3 — Frontend Component Slimming**
  - `PaperIntelligencePaperSurfaceHarness.tsx`
  - `DraftPaperWorkbench.tsx`
  - analysis panels / hooks / scroll-sync extraction

- **H4 — Design Tokens / UI Consistency**
  - shared UI tokens
  - CSS color and spacing consolidation
  - component-level visual consistency

- **H5 — Server Implementation Extraction**
  - only if needed by a product cut
  - move DB/query implementation functions out of `server/api.mjs`
  - do not start just to chase line count

## Closeout Verification

H1-G, the final implementation PR, passed:

- focused H1-G verify
- stable `scripts/verify-ci.mjs`
- `app` `npm run verify:all`
- `app` production build
- API smoke for question-group routes

The closeout itself is docs-only and should pass `git diff --check`.
