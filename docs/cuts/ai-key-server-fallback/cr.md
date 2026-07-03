# CR (cr-lite) — ai-key-server-fallback

Reviewer: 小川 (CR hat), fresh cold-read. Reviewed `feat/ai-key-server-fallback`
@ `01a2750` vs `main` @ `9326404`, in a detached worktree (no `.env`/DB).

## Recommendation

**APPROVE WITH MUST FIX ×1**

Direction correct, scope clean, production code correct. One Must Fix: the MF-3
key-leak **body**-absence assertion is a vacuous green — proven by mutation to
be unable to fail. Production route does not leak, so this is a test-strength
defect on a security-relevant contract, not a runtime bug. Merge blocked until
the negative test actually exercises the body surface.

## Changed Scope

10 files, +468/−6. All inside pa.md Allowed set except
`scripts/verify-h10b-ai-proxy-routes.mjs` (ruled legitimate, below).
- Runtime: `conciergeSearch.ts` (gate `!apiKey` → `!apiKey && !serverKeyAvailable`,
  timeout 6000→20000 default / 60000 thinking, explicit override preserved),
  `useConciergeDesk.ts` (3 seams), `aiStatus.ts` (new), `routes.mjs` (new GET
  route), `api.mjs` (post-hoc `serverContext.serverKeyAvailable`).
- Tests/registry: new verify script + verify-ci + README + concierge-desk Test 18
  + h10b route-count 3→4.
- Forbidden files (schema/domain/PaperSurface/Adapter/export, App.tsx classic key
  UI, `:93` literal, `semanticSearchService.mjs:410`): **zero touch, confirmed
  from diff.** App.tsx untouched (desk-owned fetch per MF-2 decision).

## Findings

### Must Fix

**MF-A — MF-3 response-body leak assertion is a vacuous green (cannot fail).**

Mutation test result (`verify-ai-server-key-fallback.mjs`):
- LOG leak (`console.log('[status] key=', context.DEEPSEEK_API_KEY)`) → **caught**
  (3c goes red). Good.
- BODY leak (`{ serverKeyAvailable: ..., leaked: context.DEEPSEEK_API_KEY }`) →
  **NOT caught** — all 29 assertions still pass.

Root cause: the two Group-3 sub-cases are misaligned. Case **3a** does the
body-absence assertion but its context is
`makeContext({ serverKeyAvailable: Boolean(SENTINEL_KEY) })` — it passes the
boolean `true`, and never places the sentinel string on the context. So the
handler has no sentinel to leak; the body-absence check cannot fail. Case **3c**
is the only one that puts the sentinel on the context
(`DEEPSEEK_API_KEY: SENTINEL_KEY`), but it only inspects console output, not the
response body. Net: the body-leak surface — the *more likely* leak vector — is
unguarded, contradicting MF-3's explicit disposition ("assert the sentinel
appears nowhere in the serialized response").

Fix required: case 3a (or a new sub-case) must inject the sentinel onto the
context via a field a careless handler could echo (e.g.
`makeContext({ serverKeyAvailable: true, DEEPSEEK_API_KEY: SENTINEL_KEY })`) and
then assert the sentinel is absent from `JSON.stringify(response.body)`. Re-run
the body-leak mutation to confirm it then goes red. Production code is correct;
this only hardens the test so the contract is actually protected. Test-only edit,
no runtime change.

## Should Watch

- **SW-1 (timeout values proven by regex only — DEV Blind Spot #1).** 20000/60000
  and the `thinkingMode ? … : …` branch are pinned by source-regex (2c), not by
  real timing; behavioral test 2b only proves the explicit-override path. Accepted:
  no fake-timer harness in repo, 20s/60s real waits non-viable in CI, and the
  regex is specific enough that mis-wiring fails it. Values are a config choice,
  not a correctness invariant. Watch in browser QA case 2 (60s spinner体感).
- **SW-2 (default DeepSeek spend — plan SW-1).** Product default flips to spending
  owner's balance when server holds a key. Reversible, single-user; closeout
  war-report must state it for owner sign-off (non-blocking, per plan).
- **SW-3 (status race).** Mount-fetch not-yet-returned → false → pre-cut behavior.
  Honest, harmless; no loading gate is correct for a ms-level local endpoint.
- **SW-4 (h10b outside Allowed — DEV Blind Spot #2).** Ruled **legitimate**:
  route-count 3→4 + new `GET /api/ai/status defined` assertion is a test tracking
  a real in-scope surface change; CI goes red without it. It strengthens, not
  weakens, the check. Not scope drift.

## Self-Review Blind Spots

- I did not run the full `pnpm -C app run verify:all` (typecheck/build) — relied on
  RM's green-CI gate before merge. If TS types on `serverKeyAvailable?` or the new
  service module regress, only CI would catch it. Confidence: medium-high (types
  are trivial optional-boolean additions).
- I proved MF-3 log-absence and body-absence mutation behavior, but did not
  enumerate every possible leak channel (e.g. response headers). The handler sets
  no headers, so I judge this closed, but a Big CR could re-examine if the route
  grows.
- MF-2/MF-4 runtime plumbing is confirmed via diff read + verify Test 18 string
  assertions; I did not render the hook in a real React harness. The seams are
  visibly wired in the diff (state → call-site → dep array), so confidence is high,
  but the dep-array/thinkingMode stale-closure fix is regex-proven, not runtime-
  proven.

## Verification Evidence (re-run by CR, not copied)

- `verify-ai-server-key-fallback.mjs`: 29 passed, 0 failed.
- `verify-concierge-desk.mjs`: 238 passed, 0 failed (incl. Test 18).
- `verify-h10b-ai-proxy-routes.mjs`: 34 passed, 0 failed.
- `verify-c6a10-concierge-local-search.mjs`: 59 passed, 0 failed.
- `verify-restart1-local-search-intent.mjs`: 85 passed, 0 failed.
- Registration: script in `verify-ci.mjs` registry (line 75) + README `yes`.

MF verification:
- **MF-1 (TDZ):** assign at `api.mjs:2930` (`serverContext.serverKeyAvailable =
  Boolean(DEEPSEEK_API_KEY)`), after decl `:2833`, after literal `:93` and
  `createAiProxyRoutes()` `:482`. Literal `:93` confirmed free of
  `serverKeyAvailable`. Boot-safe. **Closed.**
- **MF-2 (three seams):** state `:97`, call-site `:218` (`serverKeyAvailable,`),
  dep array includes `serverKeyAvailable`. Desk-owned fetch (App.tsx untouched).
  **Closed.**
- **MF-3 (leak negative test):** log surface **closed** (mutation caught); body
  surface **NOT closed** → MF-A above.
- **MF-4 (stale closure):** dep array now includes `input.thinkingMode`;
  Test 18 asserts it. **Closed.**

## Failure / Attack Angle

The realistic failure this diff hides from: a future agent adds a "debug" field
echoing `context.DEEPSEEK_API_KEY` (or a helper that spreads the whole context)
into the status response body. All verify stays green — the body-absence check
cannot fail because no test ever puts a real key where the body handler would
find it. The result is a plaintext DeepSeek key served on an unauthenticated
`GET /api/ai/status`, exactly the leak MF-3 was written to prevent. Today's code
is clean; the test does not keep it clean. MF-A restores the guard.

## Residual Risk

Low after MF-A. Runtime change is a single gate condition + timeout constants +
a boolean-only read endpoint; no schema/persistence/export/print path touched.
Browser QA (main agent, not delegable) remains the gate for real steward calls,
loading UX, and the honest-degradation matrix.
