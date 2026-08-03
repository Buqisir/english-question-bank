# PA Review — I17b-topic-label-claude-backfill

**Reviewer:** PA (fresh cold-read, pre-DEV)
**Branch:** `i17b/topic-label-claude-backfill` (plan @ `7345b57`)
**Plan:** `docs/cuts/I17b-topic-label-claude-backfill/plan.md`

## Verdict: APPROVE WITH MUST FIX

The Z-lite seam is sound, behavior-preserving, and correctly minimal for "先 A 小步". The
scope SQL, 108/12/9 facts, and overwrite-all rationale all verify exactly against the live
DB and ADR-0009. **One load-bearing reality the plan's prose hides blocks DEV as-written:**
`server/api.mjs` has unguarded top-level side effects — it calls `server.listen(8787)` +
`ensureDatabaseShape()` at import time, and **nothing in the repo imports api.mjs's exports
today**. The driver (Step 2) and the optional ESM-import assertion (Step 3) both assume a
clean `import` of api.mjs, which does not exist. This must be dispositioned before DEV.

---

## Must Fix (blocks DEV)

### MF-1 — api.mjs is not import-safe; the export seam alone is insufficient
**Risk (verified).** `server/api.mjs` @11087 runs `server.listen(port, '127.0.0.1', …)` and
@11083-11085 runs `ensureDatabaseShape()` / `cleanupPaperImportTempArtifacts()` /
`ensureMySpaceFilesRoot()` at **top level, with no `import.meta`-main guard**. Confirmed no
existing script anywhere imports from `server/api.mjs` (`grep` of `scripts/` + `.scratch/`
returns nothing) — `isGroupPrintReady` is the lone export and has zero ESM consumers. This cut
makes the **first** ESM consumer.

Consequence:
- The `.scratch` driver doing `import { getQuestionGroupDetail, buildTopicLabelMessages,
  normalizeTopicLabelPayload, bindTopicLabelsToQuestionGroup } from '…/server/api.mjs'` will
  **boot a second HTTP listener on 8787** and run `ensureDatabaseShape()` as a side effect of
  the import, and the process **will not exit on its own** (listen keeps the event loop alive).
  This collides with the plan's own release discipline ("先停 API … 跑 persist … 重启 API"):
  after killing the API, the driver's import re-binds 8787; if the API is *not* killed, the
  import **throws `EADDRINUSE`** and the driver dies before doing any work.
- The Step 3 "optional" assertion `import { buildTopicLabelMessages } from '../server/api.mjs'`
  would **hang `verify-ci.mjs`** (listener never closes) and/or fail on `EADDRINUSE` in CI.

**Required disposition (plan.md must record one of):**
- (a) **Preferred, still Z-lite:** guard the three side-effect lines + `server.listen` behind
  `if (import.meta.url === pathToFileURL(process.argv[1]).href)` (run-as-main check), so
  `import`-ing api.mjs is pure. This is a 1-block additive change, fully behavior-preserving for
  `node server/api.mjs`, and is the real "make the seam usable" step. Add it to Locked #1 as a
  6th change and to Step 1's diff budget (the "仅 5 处" claim must become 6, or explicitly
  scope the guard as a separate hunk). **OR**
- (b) Keep api.mjs untouched at top level and have the driver **not import api.mjs** — instead
  spawn `node server/api.mjs` and drive it over HTTP (existing `/api/topic-labels` + a scoped
  list). This contradicts the plan's stated export-seam design, so if chosen, Locked #1's 4
  exports become unnecessary and the cut shrinks to "extract `buildTopicLabelMessages` + rewire
  DeepSeek path only". **OR**
- (c) Explicitly accept the EADDRINUSE-or-second-listener behavior, document in Step 2 that the
  driver runs **with the API stopped and tolerates the extra listener** (process must be
  `kill`ed after persist), AND **drop the Step 3 ESM-import assertion entirely** (replace with a
  source-text characterization check that does not import). This is the weakest option.

Whichever is chosen, **Step 3's optional assertion must not naively `import` api.mjs** unless
(a) is taken. Note this is *the* reason verb-profile (#189) was a clean drop-in and topic-label
is not — the plan names that asymmetry but stops one step short of its real cause (import-time
side effects, not just "few exports").

---

## Should Watch (non-blocking)

- **SW-1 — `buildTopicLabelMessages` must absorb `allowedLabels`.** The extracted function must
  move the `allowedLabels` const (api.mjs @10470) inside itself, since the system string at
  @10478 interpolates it. The 2-element array @10475-10484 depends only on module-scoped
  `DEEPSEEK_TOPIC_LABEL_PROMPT` (@6585), `TOPIC_LABEL_TAXONOMY` (@148), and
  `formatQuestionGroupForTopicLabel(detail)` (@9560) — all reachable from a function kept in
  api.mjs. Extraction can be byte-identical; the `temperature/maxTokens/thinkingMode/apiKey/
  model/provider` fields stay in `callDeepSeekTopicLabels` (they are siblings of `messages`,
  not inside it). No drift risk if the boundary is drawn exactly at the array.

- **SW-2 — over-export check.** All 4 proposed exports are used by the driver path
  (getDetail → buildMessages → normalize → bind). None is gratuitous. `getQuestionGroupDetail`
  and `bindTopicLabelsToQuestionGroup` are already serverContext shorthands (@83, @73) — adding
  `export` to their `function` declarations is purely additive and does not disturb the
  shorthand references (hoisted binding). Confirmed no name collisions.

- **SW-3 — Sonnet quality gate is owner-vetoable and sound.** Constrained pick-from-~100-taxonomy
  classification; same model as #189 verb-profile. Step 4's "抽查 2-3 组 → 不达标升 Opus" is an
  adequate gate. Suggest the driver's failed[] also flag *out-of-taxonomy* picks (normalize
  already drops them, so they'd silently become empty) so a Sonnet that hallucinates labels
  surfaces as `failed`, not as a silently-empty group.

- **SW-4 — overwrite-all is sound and route-independent.** Verified all 27 labeled groups in DB
  are `source='ai'` (no human labels to clobber); `replaceQuestionGroupTopicLabels` (@979) is
  DELETE-then-INSERT scoped per `question_group_id`, so overwriting the 9 is naturally
  idempotent and group-local. The driver bypassing `listUnlabeledGroupIds` (@10560, whole-DB,
  unscoped) does **not** touch the I16b `/backfill` route — independent paths. Consistent with
  ADR-0009 ("derived → re-backfillable"). No risk.

- **SW-5 — diff-budget honesty.** Plan repeatedly asserts "仅 5 处 diff / `git diff --stat`
  确认仅 5 处". If MF-1(a) is taken, that becomes 6 hunks; update the Verification section so CR
  doesn't flag a budget breach.

---

## Per-claim verification log

| # | Claim | Checked | Result |
|---|-------|---------|--------|
| 1 | Behavior-preserving extract of @10475-10484 | api.mjs @10469-10491, @6585, @148, @9560 | **VERIFIED** — array depends only on `detail` + module consts; byte-identical extraction possible (see SW-1). |
| 2 | Change cannot trip verify-i16b Req7 MF-2 (4 forbidden files) | ran verify-i16b on current tree (34/0 green); read script @343-391 | **VERIFIED** — MF-2 only checks absence of `topicLabels` in 3 files + non-existence of `topicTaxonomy.mjs`; Z-lite touches none. Req5 checks string presence (`createTopicLabelBackfillRoutes`, route spread) — unaffected. Script is fully mocked/injected; it does **not** import api.mjs at runtime, only reads it as text. |
| 3 | Export seam sufficient for driver (list→detail→build→normalize→bind); nothing missing/over | api.mjs @1467, @955, @10539, proposed `buildTopicLabelMessages` | **VERIFIED for function reachability; BLOCKED by MF-1** — the 4 functions are reachable and exactly what the driver needs, BUT importing them is not side-effect-free (MF-1). No over-export. |
| 4 | api.mjs grain: 4 ESM exports vs module/serverContext | api.mjs @48-87, @374, @418-431 | **VERIFIED** — adding `export` to 4 hoisted `function` decls is the correct minimal seam *given* MF-1 is fixed; full module extraction is correctly deferred to B (ADR-0009). Recommend MF-1(a) guard so the seam is actually usable now; do **not** pull B's module move into A. |
| 5 | Scoped SQL frames exactly 108 groups / 12 papers, no over-capture | live read-only queries on `data/question-bank.sqlite` | **VERIFIED EXACTLY** — `source_type='real_exam' AND year BETWEEN 2020 AND 2025` → 12 sources sets (2020-2025 × Ⅰ/Ⅱ), regions only 全国新课标Ⅰ/Ⅱ, 108 question_groups, **0** real_exam rows outside that range → region filter is redundant but harmless; no over-capture possible. |
| 6 | Overwrite-all sound; doesn't break I16b idempotency | DB `source` distinct = `ai`(57 rows / 27 groups); api.mjs @979 | **VERIFIED** — all labels `source='ai'`; replace is per-group DELETE+INSERT; driver path independent of `/backfill` route. |
| 7 | Sonnet + overwrite-all rationale (owner-vetoable) | plan Why; #189 precedent | **VERIFIED as reasonable** — not blockers; see SW-3. |

Bonus fact-check: plan's "live DB: 108 组,仅 9 有 topic-label" → DB confirms exactly 9 of the
108 labeled. Plan's "api.mjs 顶层只 `isGroupPrintReady` export @374" → confirmed (@374).

---

## Must-Fix → plan.md disposition checklist

- [ ] **MF-1** — Record in `Locked Decisions` and `Must Do Step 1`/`Step 2`/`Step 3` how
  api.mjs's import-time side effects (`server.listen` @11087 + `ensureDatabaseShape` etc.) are
  handled. Pick (a) add an `import.meta`-main guard (preferred; bump diff budget 5→6 and update
  every "仅 5 处" claim incl. Verification), or (b) drive via spawned HTTP (then drop the 4
  exports), or (c) accept-and-document + drop the ESM-import assertion. Step 3's optional
  assertion **must not naively `import` api.mjs** unless (a) is chosen.

DEV may start once MF-1 has a recorded disposition. Unresolved PO decisions: 0 (model/overwrite
are owner-vetoable recommendations already locked, not open questions).
