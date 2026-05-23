# H1 Architecture Housekeeping PM Spec

Status: ready for small external PA.

## Problem

`server/api.mjs` has grown into the central server surface for nearly every
backend concern:

- HTTP route dispatch
- SQLite schema bootstrapping and queries
- Draft Paper state and print export
- My Space artifact storage
- C7 Paper Import validate / publish
- search-card availability derivation
- DOCX / PDF export routes
- legacy import and AI proxy routes

After C8, the file is roughly 12.4k lines. C7 and C8 already proved that new
modules (`server/paper-import/**`, `server/my-space/mySpace.mjs`) are easier to
review than adding more logic directly to `server/api.mjs`. H1 makes that
pattern explicit.

## Goal

Extract major server surfaces from `server/api.mjs` into owned modules while
preserving behavior exactly.

H1 is successful when a reviewer can open the relevant module for a feature area
instead of scanning the whole server file. The goal is not an ideal framework;
the goal is smaller, behavior-preserving review units.

## Non-Goals

- No product behavior change.
- No UI change.
- No DB schema change.
- No new import, export, AI, or PaperSurface feature.
- No new backend framework.
- No rewrite of `server/print-renderer.mjs`.
- No cleanup of every legacy route in one pass.
- No attempt to make `server/api.mjs` tiny in one PR.

## Locked Decisions

See `decisions.md`. The short version:

- Scope: Draft Paper, My Space, C7 Paper Import, exports / search availability.
- PR split: H1-A skeleton, H1-B C8 surface, H1-C C7 import, H1-D exports/search.
- Router shape: A+ minimal registry (`defineRoute`, `runRoutes`,
  `readJsonRouteBody`), not a framework.
- Behavior changes: forbidden except mechanical refactor plumbing.
- QA: no full PO QA, but relevant verify/build plus minimal browser smoke.
- External review: small PA before DEV; Big CR only if risk escalates.

## Architecture Shape

### Server Context

H1 should introduce a small explicit server context object passed into route
handlers. It may include only existing dependencies such as:

```js
{
  rootDir,
  dbPath,
  exportDir,
  importDir,
  paperAssetsDir,
  userSpaceFilesDir,
  openDatabase,
  readJsonBody,
  sendJson,
}
```

Do not hide global behavior in the context. Prefer passing explicit paths and
helpers over importing hidden mutable globals in each module.

### Minimal Route Registry

H1-A introduces a tiny registry helper under `server/router/`:

```js
defineRoute(method, pattern, handle)
runRoutes(routes, { request, response, url, context })
readJsonRouteBody(request, options)
```

Expected semantics:

- `method` is an exact HTTP method string.
- `pattern` is a RegExp matched against `url.pathname`.
- `handle` receives `{ request, response, url, match, context }`.
- `runRoutes` returns `true` if a route handled the request and `false`
  otherwise.
- Each handler is responsible for preserving its current response shape and
  status codes.

Not in H1:

- middleware chains;
- route group nesting;
- automatic body parsing;
- automatic error mapping;
- auth;
- a dependency on Express / Fastify / Hono.

## PR Plan

### H1-A Router Skeleton

Purpose: prove the route registry is thin.

Allowed files:

- `server/router/*.mjs`
- `server/api.mjs`
- `scripts/verify-h1-router-skeleton.mjs`
- `docs/cuts/H1-architecture-housekeeping/*`

Requirements:

- Add minimal route registry helpers.
- Build a server context object in `server/api.mjs`.
- Move zero or only tiny low-risk sample routes through the registry.
- Do not migrate Draft Paper / My Space / Paper Import yet.
- Verify that helper code does not introduce middleware/framework behavior.

### H1-B C8 Surface

Purpose: extract the freshest stable teacher-facing server surface.

Candidate modules:

- `server/draft-paper/draftPaperRoutes.mjs`
- `server/draft-paper/draftPaperStore.mjs`
- `server/my-space/mySpaceRoutes.mjs`

Scope:

- `/api/draft-papers`
- `/api/draft-papers/current`
- `/api/draft-papers/current/items`
- `/api/draft-papers/migrate-assembly-basket`
- `/api/draft-papers/:id`
- `/api/draft-papers/:id/items`
- `/api/draft-papers/:id/items/:itemId`
- `/api/draft-papers/:id/items/restore`
- `/api/draft-papers/:id/print-html`
- `/api/draft-papers/:id/print-pdf`
- `/api/my-space`
- `/api/my-space/folders`
- `/api/my-space/folders/:id`
- `/api/my-space/artifacts`
- `/api/my-space/artifacts/:id`
- `/user-space/files/:artifactId.pdf`

Requirements:

- Preserve all current response JSON and status codes.
- Preserve `GET /api/draft-papers/:id` read-only behavior from PR #97.
- Preserve My Space path traversal guards.
- Preserve Save-to-My-Space staging-PDF cleanup.
- Preserve C8 preview / PDF behavior.

### H1-C C7 Paper Import

Purpose: extract the C7 import route dispatch while preserving atomic publish
proofs.

Candidate module:

- `server/paper-import/paperImportRoutes.mjs`

Scope:

- `/api/paper-import/validate`
- `/api/paper-import/publish`
- `/api/paper-import/revalidate-latest`

Requirements:

- Preserve C7 validate dry-run behavior.
- Preserve publish atomicity behavior.
- Preserve temp-root / temp-DB verify compatibility.
- Preserve invalidation of PaperSurface analysis availability cache.

### H1-D Exports / Search Availability

Purpose: extract remaining high-churn server seams needed by the teacher loop.

Candidate modules:

- `server/exports/exportRoutes.mjs`
- `server/search/paperSurfaceAvailability.mjs`

Scope:

- `/api/exports/docx`
- `/api/exports/pdf`
- `/api/exports/print-html`
- `/api/exports/print-pdf`
- PaperSurface analysis availability derivation used by search cards
- search-card enrichment fields that expose `hasPaperSurfaceAnalysis`,
  `paperSurfaceHref`, `canAddToDraftPaper`, and draft state

Requirements:

- Preserve existing export behavior.
- Preserve existing search-card response fields.
- Preserve cache behavior unless a verify-covered mechanical context move is
  required.

## Verification Gates

Every H1 PR:

- `git diff --check`
- `npm run verify:all` from `app/`
- `npm run build` from `app/`
- focused H1 verify for that PR

H1-B additionally:

- C8 draft paper verify
- C8 My Space verify
- C8 My Space smoke or equivalent browser smoke

H1-C additionally:

- C7 paper import contracts verify
- C7 publish verify
- publish failure / latest-not-moved proof remains green

H1-D additionally:

- export-route focused verify
- search-card availability verify
- minimal browser smoke that proves search -> add draft -> PDF/static still
  works

## Forbidden Behavior Changes

The following changes must not happen in H1:

- changing URL paths or methods;
- changing response JSON keys;
- changing status codes;
- changing error copy;
- changing DB schema;
- changing generated PDF / print HTML content;
- changing frontend component behavior;
- changing PaperSurface / reading-analysis behavior;
- adding new feature flags or user settings.

If an implementation appears to require one of these changes, stop and update
the PM spec / PA before coding further.

## Watch Items

- Registry abstraction creep. If `server/router` starts looking like a
  framework, stop.
- Context creep. If the context object becomes a hidden service locator, stop.
- Diff size. If any H1 PR approaches 3500 diff lines, split it.
- Route behavior drift. If a route needs a new error handler to pass tests, it
  may be changing behavior.
- `server/api.mjs` line count. Record before/after, but do not chase a number
  at the expense of safe boundaries.

## External PA Questions

The small PA should answer:

- Is the H1 scope coherent?
- Is the four-PR split safe?
- Is A+ minimal registry enough, or too much?
- Are allowed / forbidden scopes tight enough?
- Are verify and smoke gates sufficient?
- Is any behavior-changing risk hidden in the proposed extraction order?

Open PO decisions: 0.
