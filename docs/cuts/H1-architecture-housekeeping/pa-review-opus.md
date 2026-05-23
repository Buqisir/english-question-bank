# H1 Small PA Review — Opus

Reviewer: external Opus PA, acting under `docs/agents/pa-persona.md`.
Cut: H1 Architecture Housekeeping / server surface extraction.
Branch: `codex/h1-architecture-housekeeping-planning`, head `415714d`.
Mode: small PA; no implementation, no Big CR.

Required reading completed:

- `docs/cuts/H1-architecture-housekeeping/{agent-entrypoint,pm-spec,decisions}.md`
- `docs/agents/{pa-persona,review-levels}.md`
- `.kiro/steering/{cut-workflow-protocol,product-scope-discipline}.md`
- `docs/code-style.md`
- `scripts/README.md`
- `server/api.mjs` (12,428 lines, 71 route handlers, 389 functions,
  1 export) on the H1 branch head.
- `server/paper-import/{multipart,publisher,storage,validator}.mjs`
  and `server/my-space/mySpace.mjs` — already-extracted modules that
  set the pattern H1 extends.

---

## 1. Verdict

**READY FOR DEV.**

H1 is coherent, correctly scoped, and honestly boring — which is
exactly what architecture housekeeping should be. The spec answers
the six PA questions directly and I have no blocking concerns. The
four-PR split is ordered correctly. The A+ registry is the right
level of abstraction. The forbidden scope is tight enough.

Must Fix count: **2** (both small; neither blocks the goal, but each
should be addressed before the specific PR they apply to).

Open PO Decisions: **0**.

---

## 2. Must Fix Before DEV

### MF-1 — H1-B must define the shared-helper extraction boundary, not just route dispatch.

The PM spec says H1-B extracts "Draft Paper route dispatch and
related server helpers." The spec names candidate files
(`draftPaperRoutes.mjs`, `draftPaperStore.mjs`,
`mySpaceRoutes.mjs`). But it does not state which of the 389
functions in `server/api.mjs` move into these modules.

Draft Paper alone depends on at least these `api.mjs`-internal
functions:

- `isGroupPrintReady` (the only current export; also used by search)
- `selectQuestionGroupCards` (used by Draft Paper item enrichment)
- `getQuestionGroupDetail` (used by `buildDraftPrintHtml`)
- `getDraftSearchContext` (used by search)
- `buildPrintHtml` (imported from `print-renderer.mjs`, called via
  `buildDraftPrintHtml`)
- `openDatabase`, `readJsonBody`, `sendJson`, `sendPdf` (generic
  plumbing)

If `draftPaperStore.mjs` absorbs the Draft Paper CRUD functions but
those functions call `selectQuestionGroupCards` (which is defined in
the 12k-line file and used by 10+ other surfaces), the module
boundary leaks.

**Fix:** before H1-B DEV, list — in `pm-spec.md` or a small
appendix — every function that will move vs. every function that
stays in `api.mjs` and is accessed through the context object. The
critical decision: **`selectQuestionGroupCards` and
`getQuestionGroupDetail` stay in `api.mjs` for now and are passed
to extracted modules via context.** This is the minimal-seam answer.
Any attempt to move them into a `question-bank/` module belongs in a
future H2, not H1.

Without this list, DEV will discover mid-PR that pulling
`draftPaperStore.mjs` out of `api.mjs` drags 15 helpers with it,
the diff explodes past 3500 lines, and the PR must be re-split.

### MF-2 — H1-D must define which search-availability fields are context-provided vs. module-owned.

The PM spec says H1-D extracts "PaperSurface analysis availability
derivation used by search cards" and "search-card enrichment fields."
But today these fields are computed inside
`selectQuestionGroupCards`:

```
const printReady = isGroupPrintReady(db, row.id)
const draftContext = getDraftSearchContext(db)
const paperSurfaceAnalysis = paperSurfaceAnalysisAvailabilityByGroupIdCache.get(row.id)
```

H1-D needs to decide: does `paperSurfaceAvailability.mjs` **own**
the cache + computation, or just **derive** it from a context-passed
value? If the module owns the cache, it also owns the cache
invalidation — which today is done inside the `POST
/api/paper-import/publish` route handler and the `POST
/api/paper-import/revalidate-latest` handler. That means H1-D must
coordinate with H1-C's already-extracted Paper Import routes.

**Fix:** in `decisions.md`, add a one-paragraph rule:

> The `paperSurfaceAnalysisAvailabilityByGroupIdCache` and its
> invalidation remain in `server/api.mjs` (or move to a tiny
> `server/search/paperSurfaceAvailability.mjs` that exports
> `getCache`, `invalidateCache`, and is called from both the Paper
> Import route module and the search enrichment path). The cache must
> not be duplicated across modules.

This prevents the standard "extract-then-discover-shared-state-is-
split-across-two-modules" rework.

---

## 3. Should Watch

### SW-1 — `readJsonBody` is used by 30+ routes. Its extraction into `server/router/` is correct, but the signature should not change.

Today: `readJsonBody(request, { maxBytes })` returns a `Promise<object>`.
If H1-A wraps it as `readJsonRouteBody(request, options)`, the
internal callers must not receive a different default `maxBytes`. The
PM spec says this is forbidden (no API behavior change), but a
"convenience default change" is the most common accidental behavior
drift in extract-and-rename refactors.

Verify: assert `readJsonRouteBody` default `maxBytes === 1_000_000`
in `verify-h1-router-skeleton.mjs`.

### SW-2 — `openDatabase` returns a `DatabaseSync` that callers must close. Context passing doesn't change this, but extraction makes "who closes the db" harder to trace.

Today every route handler does:

```
const db = openDatabase({ readOnly: ... })
try { ... } finally { db.close() }
```

If route handlers move into separate files, the `try/finally` pattern
must move with them. If `openDatabase` is passed through context,
a module might call `context.openDatabase()` and forget to close it.

Recommendation: verify script should assert every route handler file
contains `finally.*db\.close\(\)` if it contains `openDatabase`.

### SW-3 — `buildPrintHtml` is imported from `server/print-renderer.mjs` into `api.mjs`. H1 extraction should not change the import target.

Draft Paper's `buildDraftPrintHtml` calls `buildPrintHtml`.
`print-renderer.mjs` is forbidden from body changes. When
`draftPaperStore.mjs` is extracted, it will `import { buildPrintHtml }
from '../print-renderer.mjs'` — that's fine. But the path changes.
Verify: `print-renderer.mjs` is never `import`-ed from more than one
first-party file (i.e. only from the extracted module, not also from
`api.mjs`). Dual-import of the same module is not a bug but it makes
it ambiguous which caller is the "owner."

### SW-4 — H1-A "tiny low-risk sample routes" should be the health check only.

PM spec says H1-A may "move zero or only tiny low-risk sample routes."
The safest sample is `GET /api/health`. It has no DB access, no body
parsing, no response shape complexity. Moving anything else in H1-A
(e.g. `GET /api/question-groups`) would pull in `openDatabase`,
`selectQuestionGroupCards`, and half the file. Keep H1-A to health
and nothing else.

### SW-5 — Diff size risk is highest in H1-B and H1-D, not H1-C.

H1-C extracts 3 routes from 3 already-extracted modules. Small diff.

H1-B extracts ~16 Draft Paper + My Space routes, each with their
own `try/catch`, `db.close()`, and 5-15 line handler bodies, plus
the `buildDraftPaperBlocks`, `buildPageBreakSuggestions`,
`buildDraftPrintHtml`, `estimateEnglishWords`, and other helpers
that only Draft Paper uses. That's easily 800+ lines moving. With
the 3500-line hard limit, the PM's "if any H1 PR approaches 3500
diff lines, split it" rule should be tightened for H1-B:

**If H1-B diff exceeds 2000 lines, split Draft Paper and My Space
into H1-B1 and H1-B2.** They are already separated by module
(`draftPaperRoutes` vs `mySpaceRoutes`). The split is clean.

H1-D is similar: exports (4 routes) + search availability (scattered
through `selectQuestionGroupCards` + the cache). If both move in one
PR, the diff will be large. Consider splitting export routes
(mechanical) from search-availability seam (architectural).

---

## 4. PR Split Assessment

The four-PR plan is **correctly ordered**:

1. H1-A (skeleton) must land first because all subsequent PRs depend
   on `defineRoute` / `runRoutes` / context.
2. H1-B (C8 surface) should go second because Draft Paper + My Space
   are the freshest and best-tested surfaces — they have both verify
   and smoke coverage, so extraction regressions are caught early.
3. H1-C (C7 import) is naturally third; it depends only on the route
   registry and the already-extracted `server/paper-import/` modules.
4. H1-D (exports / search) is last because search-availability
   touches the most shared state (the cache, `isGroupPrintReady`,
   `getDraftSearchContext`) and is the riskiest extraction.

No reordering needed.

One adjustment: consider making H1-A + H1-C one PR if H1-A is truly
just a health-check route + registry. The skeleton alone doesn't
prove anything; H1-C is small enough to fold in without exceeding
the diff limit. This would give a 3-PR plan: A+C → B → D. But this
is a taste call, not a Must Fix.

---

## 5. Router Registry Assessment

The A+ minimal registry (`defineRoute`, `runRoutes`,
`readJsonRouteBody`) is **the right level of abstraction** for this
project. Rationale:

- It eliminates the if/else cascade in `server/api.mjs` (which is
  the #1 source of "where does this route live?" friction) without
  introducing middleware, nested groups, or framework concepts.
- `runRoutes` returning `boolean` is honest: the caller still owns
  the fallback / 404 / CORS handling. No hidden catch-all.
- `readJsonRouteBody` is a renamed `readJsonBody` with the same
  signature. It signals "this is route infrastructure, not app logic"
  without changing behavior.

One constraint to add to decisions.md (captured in SW-1):
`readJsonRouteBody` must preserve the default `maxBytes` from the
current `readJsonBody`. No silent default change.

---

## 6. Allowed / Forbidden Scope Corrections

### Allowed — correct, with one addition

Add `server/draft-paper/draftPaperStore.mjs` explicitly. The PM spec
mentions it as a "candidate module" but the agent-entrypoint's
allowed-files list only has `server/draft-paper/*.mjs` as a wildcard.
Since `api.mjs` currently has no `server/draft-paper/` directory
(Draft Paper logic is inline), the wildcard is harmless — but the
explicit name in the allowed list prevents DEV from naming the file
something unexpected (`draftPaper.mjs`, `store.mjs`, `db.mjs`...).

### Forbidden — correct, with one clarification

`server/print-renderer.mjs body changes` is forbidden. Clarify that
**import path changes are allowed**: when `draftPaperStore.mjs` is
extracted, it will `import { buildPrintHtml } from '../print-renderer.mjs'`
instead of the current inline call. The import path change is not a
body change. Without this clarification, a literal-minded DEV or CR
agent will flag the new import as a forbidden change.

---

## 7. Verify / Smoke Gate Assessment

Gates are **sufficient** for a behavior-preserving refactor. The key
gates:

- `verify:all` + `npm run build` on every PR — catches type errors
  and broken imports.
- C8 draft + My Space verify + smoke on H1-B — catches Draft Paper
  and My Space regression.
- C7 contracts + publish verify on H1-C — catches Paper Import
  regression.
- Export + search-availability verify on H1-D — catches export and
  search-card regression.

One addition I recommend (not a Must Fix):

- **H1-A verify** should assert: `server/router/` exists, exports
  exactly `defineRoute`, `runRoutes`, `readJsonRouteBody`, and
  nothing else. No `use`, no `group`, no `middleware`, no
  `errorHandler`. This is the "registry abstraction creep" early
  warning from the PM spec's watch items, encoded as a gate.

---

## Summary

| Question | Answer |
|---|---|
| Is H1 scope coherent? | Yes. Four surfaces, four PRs, one goal. |
| Is the four-PR split safe? | Yes. Order is correct. H1-B may need a B1/B2 split if diff exceeds 2000 lines. |
| Is A+ minimal registry appropriate? | Yes. Exactly the right level. |
| Are allowed/forbidden scopes tight enough? | Yes, with two minor clarifications above. |
| Are verify/smoke gates sufficient? | Yes, with one recommended H1-A verify addition. |
| Hidden behavior-drift risks? | Two: (1) shared-helper boundary for `selectQuestionGroupCards` / `getQuestionGroupDetail` (MF-1), (2) search-availability cache ownership split (MF-2). |

---

Open PO Decisions: **0**.

End of report.
