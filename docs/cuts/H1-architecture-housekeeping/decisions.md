# H1 Architecture Housekeeping Decisions

Status: small external PA complete. Ready for DEV after planning PR merge.

## Cut Identity

- Cut name: H1 Architecture Housekeeping / server surface extraction.
- H1 is an architecture goal, not a product feature.
- The motivating debt is `server/api.mjs`, currently about 12.4k lines after C8.
- H1 exists to make future PA / CR work cheaper and safer by creating smaller
  reviewable server modules.

## Scope Decision

- H1 covers server surface extraction for:
  - Draft Paper
  - My Space
  - C7 Paper Import
  - exports / search availability seams
- H1 does not touch PaperSurface rendering, reading-analysis legacy UI, or
  question-parser data contracts.

## Success Standard

H1 succeeds when:

- behavior is unchanged;
- `server/api.mjs` becomes a thin boot / top-level route orchestration file;
- each extracted surface has a clear owner module;
- future reviews can inspect Draft Paper, My Space, Paper Import, exports, and
  search availability without scrolling the full `server/api.mjs`;
- verify and smoke coverage prove the moved surfaces still behave as before.

Line-count reduction is a health signal only. It is not the merge gate.

## Behavior Boundary

- H1 only allows mechanical refactors.
- Do not change product behavior, API paths, methods, response JSON, status
  codes, error messages, DB schema, UI, or file formats.
- If a bug is discovered during extraction, record it as a follow-up unless the
  extraction cannot proceed without the fix.
- The C8 current-draft GET behavior was already handled in PR #97 and must not
  be mixed into H1.

## Router Decision

H1 uses an A+ minimal route registry:

```js
defineRoute(method, pattern, handle)
runRoutes(routes, { request, response, url, context })
```

Allowed helper:

```js
readJsonRouteBody(request, options)
```

Not allowed in H1:

- middleware stacks;
- nested route groups;
- auth abstraction;
- automatic response-shape normalization;
- global error-code rewrites;
- replacing the server with Express / Fastify / another framework.

`readJsonRouteBody` is a route-infrastructure wrapper around the existing
`readJsonBody` behavior. It must preserve the current default `maxBytes` value
and may not silently change body-size limits.

H1-A may move at most the health-check route through the registry. Larger
routes wait for the surface-specific PRs.

## PR Split

H1 must be split into four implementation PRs:

1. **H1-A Router Skeleton**
   - Introduce the minimal route registry and context object.
   - Move only tiny low-risk sample routes if needed to prove the pattern.
   - No large surface extraction yet.

2. **H1-B C8 Surface**
   - Extract Draft Paper route dispatch and related server helpers.
   - Keep / reuse `server/my-space/mySpace.mjs`, and move My Space route
     dispatch / static file route out of `server/api.mjs`.
   - Cover C8 draft + My Space smoke.
   - Keep `selectQuestionGroupCards`, `getQuestionGroupDetail`,
     `getDraftSearchContext`, and `isGroupPrintReady` in `server/api.mjs` for
     this PR; pass them by context if extracted Draft Paper modules need them.
   - Move only Draft Paper-owned helpers such as `markCurrentDraftPaper`,
     `buildDraftPaperBlocks`, `buildDraftPaperExportInput`,
     `buildDraftPrintHtml`, and `estimateEnglishWords`.
   - If the diff exceeds 2000 lines, split into H1-B1 Draft Paper and H1-B2
     My Space.

3. **H1-C C7 Paper Import**
   - Extract validate / publish / revalidate-latest route dispatch.
   - Preserve C7 publish atomicity and temp-root behavior.
   - Cover C7 verify and publish failure proofs.

4. **H1-D Exports / Search Availability**
   - Extract export route dispatch.
   - Extract PaperSurface analysis availability / search availability seams.
   - Preserve current search card fields and PDF/DOCX behavior.
   - Keep a single owner for `paperSurfaceAnalysisAvailabilityByGroupIdCache`.
     The cache and invalidation can remain in `server/api.mjs` until H1-D, or
     H1-D can move them together into
     `server/search/paperSurfaceAvailability.mjs`. They must not be duplicated.
   - Paper Import publish / revalidate invalidation and search-card enrichment
     must call the same cache owner.

Do not merge these in parallel. Each PR starts from latest `main` after the
previous PR is merged.

## QA / Verify Decision

- H1 does not require full PO browser QA because it does not change UI.
- Each implementation PR must run relevant static verify scripts.
- At least H1-B and H1-D must run minimal browser smoke for the teacher path:
  search loads, add to draft works, draft workbench opens, PDF/static route still
  works, and My Space still saves/downloads artifacts.
- `npm run verify:all` from `app/` must pass before every H1 PR is merged.
- `npm run build` from `app/` must pass before every H1 PR is merged.

## External Review Decision

- H1 gets a small external PA before DEV.
- External PA should review scope, PR split, router boundary, allowed /
  forbidden files, and smoke/verify gates.
- H1 does not automatically require Opus Big CR for every PR.
- Upgrade to Big CR only if:
  - one PR exceeds 3500 diff lines;
  - DB schema changes become necessary;
  - API response shape changes become necessary;
  - verify / smoke failure is non-obvious;
  - Codex CR finds boundary drift.

## Open PO Decisions

0. H1 is ready for DEV after planning PR merge.
