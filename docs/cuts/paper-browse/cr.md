# CR — paper-browse (刀B 整卷预览页 v1)

- Reviewer: fresh Opus CR (reviewer ≠ implementer), cold-read.
- Baseline: `main` … tip `3623abc` (`github/claude/paper-browse`).
- Level: L3 (user-visible route). PA-lite downgrade adjudicated below.
- **Recommendation: APPROVE** (no Must Fix). Three Should-Watch items recorded.

## Changed Scope (verified from diff, not report)

8 files, +1150 / -0:

- `app/src/App.tsx` (+90): `paperBrowseRoute` state, `openPaperBrowse`,
  `openPaperBrowseFromDetail`, `paperBrowseOnBackToWorkbench`, early-return
  branch, mutual-exclusion clears, detail prop wiring.
- `app/src/features/paper-browse/PaperBrowsePage.tsx` (+446, new).
- `app/src/features/paper-browse/paperBrowsePage.css` (+154, new).
- `app/src/features/question-detail/QuestionGroupDetailView.tsx` (+16):
  `Eye` import, one prop, one 看整卷 button.
- `scripts/verify-paper-browse.mjs` (+364, new) + `verify-ci.mjs` (+1) +
  `README.md` (+1) registration.
- `docs/cuts/paper-browse/plan.md` (+78).

Forbidden scope confirmed clean **from the diff**: `git diff main...HEAD --
app/src/shared-ui/papersurface/**` is **empty** (PaperSurface zero-modified).
No `server/`, schema, export, or draft-API file touched.

## PA-lite Downgrade Adjudication

Upheld. The diff crosses **no** contract boundary:

- **Server / schema**: zero server files in the diff. `paperId` + focus
  `groupId` are parsed client-side out of the existing `paperSurfaceHref`
  query string — no new server field. Href format confirmed at
  `server/search/paperSurfaceAvailability.mjs:43` (`buildPaperSurfaceHref`):
  `?view=paper-intelligence&source=paper-asset&paperId=<id>&surface=paper&groupId=<gid>&questionId=<qid>`.
  `paperId` and `groupId` are always present, values are ids without `?`;
  `split('?')` + `URLSearchParams` parse is not fragile, and malformed hrefs
  fall through the `try/catch` to a no-op (button does nothing) — safe.
- **PaperSurface**: empty diff; `verify-paper-surface-tokens` green (150/0).
  Mounted read-only (`lectureFocus={null}`, `onFocusIntent={() => {}}`,
  `annotations={[]}`). No AI-dashboard drift, no `questionId=null`-style
  placeholder leaked into a contract.
- **Draft-paper API semantics**: reuses `addGroupsToBasket` and the existing
  `draftPaperButtonState` union verbatim; no new persistence path.
- **Reversible**: whole route is additive; deleting the branch + page removes
  it entirely.

Additive, reversible, no data-contract touch → PA-lite is the correct gate.

## Findings

### Must Fix
None.

### Should Watch

1. **`verify-paper-surface-module-v1.mjs` FAILS on this branch — plan's
   "module-v1 护栏必须原样绿" claim is factually wrong, but it is not a CI
   gate.** `scripts/verify-paper-surface-module-v1.mjs:208` lists
   `/^app\/src\/App\.tsx$/` in `FORBIDDEN_PATHS`; it diffs the whole branch
   against `merge-base(HEAD, main)` (`:165`) and flags this cut's App.tsx edit
   (`✗ No edits to ^app\/src\/App\.tsx$: offenders: app/src/App.tsx`, exit 1).
   This guard only passes on a branch that touches none of its forbidden
   paths, so it produces a false failure on *any* App.tsx-touching branch.
   **It is NOT in `verify-ci.mjs` and is marked `no` in `scripts/README.md`**,
   so it does not gate merge. The substantive contract it was meant to protect
   (PaperSurface zero-modification) is proven independently by the empty
   papersurface diff + `verify-paper-surface-tokens` green. Non-blocking, but
   the plan's Forbidden wording overclaimed; do not let a future reader treat
   this stale guard as a real gate. Follow-up: either narrow the module-v1
   App.tsx freeze to its own cut or retire the script.

2. **No `popstate` listener — browser Back after entering paper-browse does
   not re-render.** `openPaperBrowse` uses `history.pushState`; there is no
   `popstate` handler in App.tsx (route state is boot-read-once via the
   `useState` initializer). Browser Back reverts the URL without flipping
   `paperBrowseRoute`, so the page stays put. This is a **pre-existing,
   shared** limitation of `draftPaperRoute` and `mySpaceRouteActive` (same
   pushState-without-popstate pattern), not a regression this cut introduces —
   the 看整卷 → 返回 (`onBack` → `replaceState`) flow is the intended path.
   Not this cut's to fix.

3. **`verify-paper-intelligence-route-integration.mjs` has 16 failures — but
   they are pre-existing and not in CI.** Confirmed 16 failures / exit 1 on
   **both** `main` and the branch (identical), and the script is **not** in
   `verify-ci.mjs`. Neither this cut nor the parallel 刀A introduced them.
   DEV's flag is accurate. Follow-up (stale assertions), not a blocker.

## Self-Review Blind Spots

- **Runtime rendering not exercised.** `verify-paper-browse.mjs`'s 56 asserts
  are overwhelmingly regex-on-source (route wiring, prop names, button gating,
  block-switch cases, no-`移出`, single `onAddGroupsToBasket([card])`) plus a
  real-fixture *structural* check (paper-2026-i has all 5 group types + an
  `answerBox` block that must fall to the placeholder). It does **not** mount
  the component or prove blocks actually render in order at runtime, that the
  adapters produce a valid `surfaceData` for the real fixture, or that scroll
  anchoring works. Per plan, runtime correctness is delegated to browser QA
  (member/owner, both views). tsc passing (exit 0) confirms the
  `entry.model.surfaceData.{textMap,evidence,questions}` and writing
  `pageModel` field access is type-sound across all five adapter return types,
  which reduces (not eliminates) the risk. **Big CR / QA should confirm the
  live paper-2026-i render + 加入草稿卷 round-trip before this is called done.**
- **groupId ↔ card id match** looks correct by construction — a DB group only
  gets a `paperSurfaceHref` when `server/api.mjs:1357` finds availability keyed
  by `row.id`, and availability is keyed by the asset `groupId`
  (`paperSurfaceAvailability.mjs:80`), so `row.id === asset groupId`; the page
  looks up `questionGroupById.get(block.groupId)` on that same id. Groups not
  in the retrieval index correctly render no button (plan-accepted). I did not
  run the live app to confirm every paper-2026-i group actually resolves a
  card — QA territory.

## Verification Evidence (re-run by CR on the branch, not copied)

| Script | Result |
| --- | --- |
| `verify-paper-browse` | **56 passed, 0 failed** (exit 0) |
| `verify-h1-router-skeleton` | 28 passed, 0 failed |
| `verify-paper-surface-tokens` | 150 passed, 0 failed |
| `verify-paper-surface-module-v1` | **FAIL** — App.tsx freeze guard, not in CI (see SW-1) |
| `verify-paper-draft` | 146 passed, 0 failed |
| `tsc --noEmit` (app) | **exit 0**, clean |
| `verify-paper-intelligence-route-integration` | 16 fail on branch AND main; not in CI (see SW-3) |

Assertion strength spot-check: the fixture assert
`answerBox present && no case 'answerBox'` genuinely exercises the default
placeholder path (would fail if someone special-cased answerBox or the fixture
changed). The `content.blocks.map` + negative `.sort/.reverse` assert would
fail if blocks were reordered. The `(match /看整卷/g).length === 1` +
`selectedDetail.paperSurfaceHref &&` gate would fail if the button were
duplicated or ungated. These protect the stated risks.

## Failure / Attack Angle

- **Adapter throw blanking the page** — the real risk for reading/sevenChoices
  groups, whose adapters throw without reviewed analysis JSON. Verified robust:
  analysis fetch is `if (res.ok)`-guarded inside its own `try/catch`; the
  per-group build is wrapped in a **per-group** `try/catch` that writes an
  `{ kind: 'error' }` model → placeholder row (NOT `Promise.all`, so one bad
  group cannot reject the batch). Only a failed **asset** fetch trips the
  whole-page error state, which is the correct behavior. All `await`s sit
  inside the single `load()` try — no unhandled-rejection path.
- **Fake-green via unregistered script** — checked: the new verify IS in
  `verify-ci.mjs` and README (`yes`), so it runs in the real gate, not just by
  hand. The two failing scripts (module-v1, route-integration) are both absent
  from `verify-ci` and marked `no`, so their red does not block merge and does
  not silently mask this cut.
- **Merge conflict with 刀A** — the entry button lives in the detail action bar
  (`QuestionGroupDetailView.tsx:207` neighborhood, +16 lines: import + prop +
  destructure + button); 刀A touches per-question analysis blocks. Textually
  disjoint regions in the same file — a trivial rebase, not a semantic clash.
  The merger owns the rebase per plan.

## Residual Risk

Low. Additive read-only route, PaperSurface provably untouched, no
server/schema/export/persistence surface. The only unproven-by-verify claim is
live rendering fidelity, which the plan correctly routes to browser QA. Ship
after QA screenshots (member/owner) land.

## Recommendation

**APPROVE.** No Must Fix. Merge is gated only on the plan's own browser-QA step
(member/owner, paper-2026-i full scroll + 目录跳转 + 加入草稿卷 + chip count),
not on any code change. Record SW-1 (stale module-v1 App.tsx-freeze guard) and
SW-3 (stale route-integration script) as housekeeping follow-ups.
