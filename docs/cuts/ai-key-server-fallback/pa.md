# PA Review — ai-key-server-fallback

Reviewer: 小川 (PA hat), fresh cold-read. Repo main @ 74fc8a7.
Cut tier: medium (server API surface +1 read-only endpoint; user-visible
behavior change; no schema/DB). L3 by review-levels (user-visible flow).

## Verdict

**APPROVE WITH MUST FIX**

The切线 is correct and the direction is right. The plan's core factual claims
were verified against live code: server-side `apiKey || DEEPSEEK_API_KEY`
fallback exists (`questionBankStewardService.mjs:357,406`;
`semanticSearchService.mjs:403`), the frontend break is real
(`conciergeSearch.ts:1054` `!apiKey` short-circuits before any steward call),
`runConciergeSearch` has exactly one production caller (via
`useConciergeDesk` default), and the stale-closure dependency bug is real
(`useConciergeDesk.ts:224` omits `input.thinkingMode`). The boundary (Key UI
stays in classic, no multi-user/quota) is the right slice and does not deepen
local-only assumptions — `/api/ai/status` via `apiPath()` resolves same-origin
off-localhost, so it is launch-track-safe.

Four Must Fix items must land in `plan.md` before DEV, all specification /
verification holes rather than direction errors.

## Product Principle

The teacher opens AI 取题 (thinking mode) to find questions in natural
language. Today they silently fall through to weak keyword search because they
never pasted a DeepSeek key into the classic-mode top bar — a config affordance
they have no reason to visit from AI mode. The fix: when the server holds a key,
the AI path is the default and the teacher gets the real steward search without
touching key config. Honest degradation (刀⑤) is preserved: local fallback only
when *both* sides lack a key or the call genuinely fails.

## Exact UX / Architecture Model

Before → After (behavior matrix, verified against `conciergeSearch.ts:1029-1109`):

| user key | server key | steward call | current | after |
| --- | --- | --- | --- | --- |
| filled | any | yes | steward (or api-error fallback) | unchanged |
| empty | absent | no | `missing-api-key` local | unchanged |
| empty | present | — | `missing-api-key` local (BUG) | steward, apiKey='' → server `||` catches |
| empty | present | fails | n/a (never reached) | `api-error` local fallback |

Data contract: `GET /api/ai/status → { serverKeyAvailable: boolean }`, value =
`Boolean(DEEPSEEK_API_KEY)`, never the key or any fragment.
`ConciergeSearchInput.serverKeyAvailable?: boolean` (default `false` = current
behavior). Local-fallback gate `!apiKey` → `!apiKey && !serverKeyAvailable`.

## Must Fix Before DEV

### MF-1 — Pin the exact injection site for `serverKeyAvailable` (TDZ risk)

The plan says "serverContext 注入 `Boolean(DEEPSEEK_API_KEY)`（api.mjs 顶层常量已
有）" but does not name where. This matters: `DEEPSEEK_API_KEY` is declared
`const` at `api.mjs:2833`, but `serverContext` is an object literal at
`api.mjs:93` and `createAiProxyRoutes()` is invoked at `api.mjs:482` — both
*before* 2833. Putting `serverKeyAvailable` in the `:93` literal is a
temporal-dead-zone crash on module load. The plan's own precedent already
solves this: `serverContext.semanticSearchQuestionGroups`/`...StewardSearch`
are assigned post-hoc at `api.mjs:2922-2925`, after 2833.

Risk: DEV places it in the literal, server fails to boot, or DEV invents a
second env read. Concrete disposition: `plan.md` Must Do must state
"assign `serverContext.serverKeyAvailable = Boolean(DEEPSEEK_API_KEY)` in the
post-hoc block near `api.mjs:2925`, alongside the existing serverContext
post-assignments — NOT in the `:93` literal." Route handler reads
`context.serverKeyAvailable` at request time (safe).

### MF-2 — Plumb `serverKeyAvailable` end-to-end through the desk, not just runConciergeSearch

The闸门 change lives in `runConciergeSearch`, but its only production caller is
`useConciergeDesk.runSearch` (`useConciergeDesk.ts:192-199`), which builds the
`ConciergeSearchInput` and today passes only `intent/pendingQuery/
questionGroups/apiKey/thinkingMode`. The plan describes mount-fetch + "传入
runConciergeSearch" but does not name every seam. Missing any one leaves the new
input permanently `false` (silent no-op — the worst kind, because verify on
`runConciergeSearch` alone still passes).

Concrete disposition: `plan.md` Must Do must enumerate all three seams:
(a) new state in `useConciergeDesk` from the mount fetch;
(b) pass it into the `runConciergeSearch` call at `useConciergeDesk.ts:193-199`;
(c) add it to the `runSearch` `useCallback` dependency array at
`useConciergeDesk.ts:224` (same array MF-4 fixes) so a status arriving after
mount is not stale-closured out. Optionally note whether it enters
`UseConciergeDeskInput` (App-owned fetch) or stays desk-internal — DEV picks,
but plan must lock that the fetch lives in the desk per §3, App only sees
retrieval/actions (`useConciergeDesk.ts:19-21` opacity contract).

### MF-3 — Make the "no key leak" assertion a real negative test, both body AND logs

Plan §「验证」asserts `/api/ai/status` response body does not contain the key
string. Good, but incomplete. The key-leak surface is two-sided: response body
*and* server logs. The verify-question-group route already logs request detail
(`routes.mjs:32-34`); a careless status handler could log the resolved key or
its presence with the value. Also "does not contain the key string" is only
meaningful if the fake context injects a *non-empty, distinctive* key so the
absence assertion can fail loudly.

Concrete disposition: `plan.md` verification entry must state (a) fake context
uses a distinctive sentinel key value; (b) assert the sentinel appears nowhere
in the serialized response; (c) assert the status route emits no log line
containing the sentinel (or emits no key-bearing log at all). Add a Forbidden
rule: the status route must not `console.log` the key or any substring of it.

### MF-4 — Lock the stale-closure fix scope + its own regression assertion

The plan folds the `input.thinkingMode` dependency fix into "顺手修." It is a
real bug (`useConciergeDesk.ts:224` deps omit `input.thinkingMode`; the desk
would search with a stale thinking flag after the toggle changes). But "顺手修"
with no verification lets it regress. The neighboring `verify-concierge-desk.mjs`
is the natural home.

Concrete disposition: `plan.md` must (a) name `useConciergeDesk.ts:224` as the
exact edit; (b) add a verify assertion (in the new script or
`verify-concierge-desk.mjs`) that a `thinkingMode` change between renders is
reflected in the next `runSearch` call's input — otherwise the fix is
unprovable and this stays a latent bug.

## Must Fix -> Plan Disposition Checklist

- MF-1 → `plan.md` Must Do step: `serverContext.serverKeyAvailable` assigned
  post-hoc near `api.mjs:2925`, explicitly NOT in the `:93` literal (TDZ).
- MF-2 → `plan.md` Must Do step enumerating the 3 desk seams (state, call-site,
  dependency array) + locked decision that the status fetch lives in the desk.
- MF-3 → `plan.md` Verification entry (sentinel key, body-absence, log-absence)
  + Forbidden rule (no key logging in status route).
- MF-4 → `plan.md` Must Do step naming `useConciergeDesk.ts:224` + a verify
  assertion that thinkingMode changes reach the next search.

## Should Watch

- **SW-1 (default DeepSeek spend — borderline PO).** After this cut, every AI
  search on a server-with-key spends owner's balance by default (2 v4-flash
  calls/search). The plan flags it as a risk with owner veto but does not lock
  it. For today's single-user local runtime this is fine and cost is trivial;
  it does not block DEV. But it is a *product default flip*, so the closeout
  war-report must state it explicitly for owner sign-off (plan §「风险」already
  commits to this — keep it). It becomes a real design question at the
  multi-user launch L-cut, not here. Not a Must Fix because it is reversible
  and single-user.
- **SW-2 (timeout vs honest degradation).** 6s→20s default / 60s thinking does
  not conflict with 刀⑤: loading text is visible throughout
  (`useConciergeDesk` sets `kind:'loading'`), and timeout still yields the
  honest `api-error` fallback line. 60s is long to stare at a spinner; the plan
  correctly leaves down-tuning to QA/CR. Watch during browser QA case 2.
- **SW-3 (status race).** Mount-fetch not-yet-returned → `serverKeyAvailable`
  false → current behavior (`missing-api-key` local). Harmless and honest. The
  plan's "no loading gate" is the right call for a ms-level local endpoint.
  Watch only: if launch moves the API off-localhost, the race window widens —
  record, do not fix now.
- **SW-4 (fake-key priority).** With a hand-typed key, server uses the user key
  first (`String(apiKey || DEEPSEEK_API_KEY)`), so a bad user key → api-error
  fallback, not silent server rescue. Plan QA case 4 covers this; confirm the
  fallback line reads honestly (it does: `api-error` → 「管家暂时没连上…」).
- **SW-5 (pre-existing CI gap, not this cut's job).** `verify-c6a10-concierge-
  local-search.mjs` is listed as a regression script but is NOT in
  `scripts/verify-ci.mjs` and carries no `yes` marker in `scripts/README.md`
  (line 114). The plan's *new* script is correctly slated for verify-ci + README
  per the 2026-07-03 hard rule. Do not expand this cut to backfill c6a10;
  just note it.

## Allowed Files

- `server/ai-proxy/routes.mjs` (add `GET /api/ai/status` via `defineRoute`).
- `server/api.mjs` (post-hoc `serverContext.serverKeyAvailable` assignment near
  :2925 only).
- `app/src/concierge/conciergeSearch.ts` (`serverKeyAvailable?` input + gate).
- `app/src/concierge/useConciergeDesk.ts` (mount fetch, plumb, dep-array fix).
- `app/src/services/aiStatus.ts` (new; uses `apiPath()` from `httpClient.ts`).
- `app/src/App.tsx` (only if the status fetch is App-owned; plan §3 prefers
  desk-owned — if so, App is untouched).
- `scripts/verify-ai-server-key-fallback.mjs` (new), `scripts/verify-ci.mjs`,
  `scripts/README.md`, `scripts/verify-concierge-desk.mjs` (MF-4 assertion).

## Forbidden Files

- Any schema / migration / `domain/` / `PaperSurface` / Adapter / export file.
- `App.tsx:3322-3352` classic-mode key-config UI (out of scope — do not move).
- `semanticSearchService.mjs:410` thinking=off log drift (out of scope).
- The `serverContext` literal at `api.mjs:93` (TDZ — see MF-1).
- Classic-mode per-button key gates (打标/校验/解析).

## Static Verify Requirements

New `scripts/verify-ai-server-key-fallback.mjs` (hermetic; no `git show main:`):
1. Gate matrix on `runConciergeSearch`: (no key, no server → `missing-api-key`
   local), (no key, server → `doStewardCall` with `apiKey===''`),
   (key present → `doStewardCall`, no regression), (steward throws →
   `api-error` fallback, no regression).
2. Timeout selection: default 20000 / thinking 60000 / explicit
   `stewardTimeoutMs` wins.
3. `/api/ai/status`: fake context with distinctive sentinel key → asserts shape
   `{ serverKeyAvailable: boolean }`, value tracks `Boolean(context key)`,
   sentinel absent from response body AND from any emitted log (MF-3).
4. thinkingMode-change reaches next search (MF-4; may live in
   `verify-concierge-desk.mjs`).
Mount into `verify-ci.mjs` + register in `README.md` with `yes` (same cut).
Regression: `verify-c6a10-concierge-local-search.mjs`,
`verify-restart1-local-search-intent.mjs`, `verify-concierge-desk.mjs`.
Full `pnpm -C app run verify:all` or green PR CI before merge (RM gate).

## Browser QA Matrix (main agent, not delegable)

Plan's 4 cases are sound. Keep verbatim; add one:
1. Clear `localStorage['ai-api-key']`, AI mode, thinking off, natural-language
   search → steward runs (server fallback), no 「没填 AI 密钥」; server log shows
   steward call.
2. thinking on → loading visible, not killed at 6s, steward result returns.
3. Kill API process, retry → 「管家暂时没连上…」honest fallback.
4. Classic top bar, type a fake key → no regression: fake key used first →
   api-error fallback, honest text.
5. (ADD) With server key present and NO user key, toggle thinking on→off→on
   between searches → each search uses the current flag (proves MF-4 in the
   browser, not just verify).

## DEV Readiness

Ready after the 4 Must Fix dispositions land in `plan.md`. All state:
- Teacher action improved: AI 取题 natural-language search without pasting a key.
- Before/after: locked (matrix above).
- Current-cut boundary: server fallback接线 + timeout + dep fix only.
- Future-cut boundary: key UI relocation, multi-user/quota, AI-import key
  unification, log drift — all deferred.
- Allowed / Forbidden files: above.
- Verify + QA: above.
- Open PO decisions: 0 blocking (SW-1 is a closeout sign-off, not a gate).

## Open PO Decisions

None blocking. SW-1 (default spend of owner's DeepSeek balance) is a war-report
sign-off item at closeout, not a DEV gate — the behavior is reversible and the
runtime is single-user. Under 3, DEV may start once MF-1..4 are compressed in.
