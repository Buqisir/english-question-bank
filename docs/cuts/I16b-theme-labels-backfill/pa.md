# PA Review — I16·B 主题标签批量回填 + 按主题找题

Reviewer: PA (fresh Opus, un-anchored). Branch `I16b-theme-labels-backfill` @ plan `2ec38de`.
Cold-read; every code/data claim below was verified by path against `main`-state source.

## Verdict

**APPROVE WITH MUST FIX**

The direction is right and the premise is true (verified against live DB, not the
plan's word). This is a well-sliced medium cut: a reuse-only backend backfill +
a deliberately throwaway trigger UI, with no new schema and no new retrieval layer.
The reuse claims, the "filled → searchable" chain, the revert-lesson adherence, and
the idempotency/error model all hold up under inspection. Two Must Fix items are
honesty/coverage gaps in the plan text, not design flaws — they must be recorded in
`plan.md` before DEV so the cut ships with truthful coverage claims and a complete
Forbidden fence. Zero of the existing open questions rise to a blocking PO decision.

## Product Principle

The teacher's task: today 主题 search returns nothing because 0/18 groups carry topic
labels. The substance of "按主题找题" is **populating the labels**, not building search —
search already consumes `topicLabels` in both concierge and classic paths. A
teacher-triggered, key-gated, idempotent, AI-direct-persist batch is the minimal slice
that makes 主题 search real. The minimal UI is a disposable trigger; the owner owns the
real UI later via Claude Design. This is correctly scoped: do not let the throwaway UI
or a structured theme-filter creep into this cut.

## Exact UX / Architecture Model

**Backend (the substance):**
- `generateTopicLabelsByQuestionGroup(id, apiKey, model, requestId, thinkingMode)`
  (`server/api.mjs:10488`) — VERIFIED classify-only: builds detail via
  `getQuestionGroupDetail`, calls DeepSeek under `DEEPSEEK_TOPIC_LABEL_PROMPT`
  constrained to `TOPIC_LABEL_TAXONOMY`, **returns** `{ topicLabels, ... }`, does NOT
  persist. Throws if detail missing or DeepSeek returns 0 labels. Key resolves from
  arg, falls back to `DEEPSEEK_API_KEY`.
- `bindTopicLabelsToQuestionGroup(id, input)` (`server/api.mjs:10534`) — VERIFIED
  persist-only: opens its OWN `openDatabase({ readOnly:false })` per call, normalizes,
  calls `replaceQuestionGroupTopicLabels` (`api.mjs:974`) which is wrapped in
  `BEGIN/COMMIT/ROLLBACK` — each bind is atomic, `source` defaults `'ai'`. Throws on 0
  labels or missing group.
- Chain generate→bind per group is safe. **Note for scale (Should Watch, not blocking):**
  `bind` opens + closes a DB connection on every group. Fine at 18; a 200-group future
  batch means 200 open/close cycles. Acceptable now; flag if the batch grows.
- Context already exposes both functions (`api.mjs:71,80`). It does NOT yet expose a
  `listUnlabeledGroupIds`; the plan correctly lists adding it as new work.

**Route seam:** `serverRoutes` (`api.mjs:431-441`) is a literal array of factory
**spreads**; the cut-A precedent already added `...createTeachingFacetRoutes()` here.
The correct move is a new `createTopicLabelBackfillRoutes()` factory spread into this
composition (exactly the cut-A MF-3 lesson). Verified the existing topic-labels routes
live in `createQuestionGroupRoutes()` (`questionGroupRoutes.mjs:117,140`) and use
`parseRequestArgs` (`:11`) to pull `apiKey/model`. The plan's seam is right.

**Filled → searchable (VERIFIED — no new retrieval layer needed):**
- `getTopicLabelsForQuestionGroups` (`api.mjs:845`) is merged into every
  `selectQuestionGroupCards` call (`api.mjs:1368-1380`) → `QuestionGroupCard.topicLabels`.
- Classic filter haystack includes `topicLabels[].label` (`App.tsx:1396`) and the chip
  filter matches it (`App.tsx:1408`).
- Concierge keyword haystack includes `topicLabels[].label`
  (`conciergeSearch.ts:130`).
- Because the haystack uses the full label string (`主题-主题群-子主题`),
  `searchable.includes("环境保护")` hits. So "搜某主题词命中" works once labels land.
  The "no new retrieval layer" claim is **correct**.

**Key + refresh (UI):** `aiApiKey` state and `refreshQuestionGroups()` both already
exist in `App.tsx` (`:1062, :1065`). The minimal UI should reuse `aiApiKey` for the key
and call `refreshQuestionGroups()` after the backfill returns, so new labels become
searchable without a restart. This resolves PA-ask #2 cleanly — no new key plumbing.

## Must Fix Before DEV

### MF-1 — Coverage claim is understated; verified scope is BROADER than "objective types"
The plan (Code Reality, Out-of-Scope framing, PA-ask #3) implies coverage tracks the
four objective group types. I queried the live DB directly:

| group_type | groups | empty material_text |
|---|---|---|
| reading | 12 | 0 |
| seven_choices | 2 | 0 |
| cloze | 1 | 0 |
| grammar_cloze | 1 | 0 |
| **writing** | **2** | **0** |

All 18 are unlabeled; **all have non-empty `material_text`**. `getQuestionGroupDetail`
INNER-JOINs `passages` (`api.mjs:1488`), and `formatQuestionGroupForTopicLabel`
(`api.mjs:9555`) feeds passage text + up to 8 question stems/answers — so the classifier
will produce labels for ALL FIVE types, **including the 2 writing groups**, not just the
four objective ones. The "coverage only reading" risk does NOT materialize here — but the
plan must say the truth: the backfill labels **all 18 unlabeled `question_groups`
regardless of type, including writing**. If the owner expects writing excluded (it is the
A4 paper's subjective section), that's a product decision; if not, label them honestly.
**Risk:** silent over- or under-coverage; a verifier asserting "objective types only"
would be wrong. **Required disposition:** plan states coverage = "all unlabeled
`question_groups` rows (currently 18, all 5 types incl. writing); skip only on
no-material / classify-failure." Confirm with PO whether writing is in or out (see Open
PO Decisions).

### MF-2 — Forbidden fence omits the actual reverted prompt FILE
The revert `94950a1` removed topicLabels from **`prompts/reading-choice-analysis-v1.md`**
(plus `analyzeReading.mjs` and `server/shared/topicTaxonomy.mjs`). The plan's Forbidden
names `analyzeReading.mjs`, `packageBuilder.mjs`, import/publish, and "any 解析 prompt" —
but does NOT name `prompts/reading-choice-analysis-v1.md` or `server/shared/topicTaxonomy.mjs`
by path. "Any 解析 prompt" is close but a DEV could re-add a `topicLabels` field to that
markdown prompt and technically not violate the literal list. **Risk:** re-coupling the
analysis prompt to topic classification — the exact thing `94950a1` reverted.
**Required disposition:** Forbidden explicitly lists `prompts/reading-choice-analysis-v1.md`
and `server/shared/topicTaxonomy.mjs` as do-not-touch (read-only at most), alongside the
existing entries. Add a verifier assertion (Step 4) that these files are unchanged by
the diff.

## Must Fix -> Plan Disposition Checklist

| MF | `plan.md` disposition required |
|---|---|
| MF-1 | Rewrite Code Reality "覆盖" + add a Locked decision stating backfill targets **all 18 unlabeled `question_groups` (5 types incl. writing)**; resolve PO decision on writing inclusion; verifier asserts coverage = unlabeled-count, not type-filtered. |
| MF-2 | Add `prompts/reading-choice-analysis-v1.md` + `server/shared/topicTaxonomy.mjs` to Forbidden by path; add Step 4 verifier assertion that the diff touches neither (and not `analyzeReading.mjs` / `packageBuilder.mjs` / import-publish). |

## Should Watch

- **SW-A — paper-asset-derived cards are not labelable.** `selectQuestionGroupCards`
  with no whereClause pushes `listPaperAssetAnalysisGroupCards` (`api.mjs:1314,1383`),
  whose cards set `topicLabels: []` (`api.mjs:1300`) and are NOT `question_groups` rows.
  The backfill cannot label them, so they stay 主题-unsearchable. This is pre-existing
  behavior (the per-group topic-labels UI has the same limit), not a regression, and the
  18-count already excludes them. Worth a one-line note in the QA matrix; not blocking.
- **SW-B — per-group `bind` opens its own DB connection.** Fine at 18; revisit if a
  future batch is large (see Architecture note). Not blocking.
- **SW-C — synchronous loop, no progress stream.** 18 groups × one DeepSeek call each is
  a multi-second-to-minute blocking request. Acceptable for this slice with a summary
  response (matches plan PA-ask #1). The minimal UI must show a clear loading state and
  not let the teacher fire twice (idempotency covers double-fire, but UX should disable
  the button while in flight). Watch in browser QA; not blocking.
- **SW-D — idempotency is "has any label," not "stale label."** Re-running skips any
  group with ≥1 label, so it will not re-classify drift. Plan already scopes re-labeling
  Out-of-Scope. Correct for this cut; watch only.
- **SW-E — TDD seam ergonomics.** Step 1 signature lists both `{ db }` and an injected
  `listUnlabeledGroupIds`. If IDs come from the injected fn, `db` is redundant in the
  pure orchestrator and muddies the mock. Prefer injecting `listUnlabeledGroupIds` and
  dropping `db` from the orchestrator (production wires the real SQL fn). DEV's call;
  the verify-*.mjs convention (85 scripts, no vitest) makes the inject-mock-no-DeepSeek
  verifier clean and sufficient to prove all-labeled / skip / fault-tolerance / summary.

## Allowed Files

- `server/topic-labels/backfillTopicLabels.mjs` (new — pure injectable orchestrator)
- `server/topic-labels/topicLabelBackfillRoutes.mjs` (new — `createTopicLabelBackfillRoutes()` factory) OR add route to `server/question-bank/questionGroupRoutes.mjs`
- `server/api.mjs` (spread new factory into `serverRoutes`; expose `listUnlabeledGroupIds` on context; NO behavior change to existing generate/bind/prompt/taxonomy)
- `app/src/App.tsx` (minimal trigger button + loading/result; reuse `aiApiKey` + `refreshQuestionGroups()`)
- `app/src/services/questionGroups.ts` (new `backfillTopicLabels` fetch)
- `scripts/verify-i16b-theme-labels-backfill.mjs` (new) + `scripts/verify-ci.mjs` + `scripts/README.md`

## Forbidden Files

- `prompts/reading-choice-analysis-v1.md` (MF-2 — read-only)
- `server/shared/topicTaxonomy.mjs` (MF-2 — read-only)
- `server/paper-import-ai/analyzeReading.mjs`, `server/paper-import-ai/packageBuilder.mjs`, any import/publish path (no topic classification re-coupling — `94950a1`)
- `DEEPSEEK_TOPIC_LABEL_PROMPT` / `TOPIC_LABEL_TAXONOMY` / `question_group_topic_labels` schema / existing `POST|PUT /topic-labels` behavior (read-only reuse)
- Any color token / hex / style token (minimal UI reuses existing classes only)
- No new retrieval layer; no card-contract change
- `app/public/paper-assets/**`, `.claude/launch.json`; no `git add -A`

## Static Verify Requirements

`scripts/verify-i16b-theme-labels-backfill.mjs` must, with injected mocks and NO DeepSeek / NO real DB:
1. 3 unlabeled groups → all classified + bound; summary counts `processed/labeled`.
2. an already-labeled group is skipped (idempotency), counted in `skipped`.
3. group #2's `classify` throws → counted in `failed[]`, batch continues, others labeled.
4. summary shape `{ processed, labeled, skipped, failed[] }` correct.
5. source assertion: backfill route is registered via factory spread in `serverRoutes` (NOT a literal append at the array), route reachable.
6. front-end button calls `/api/topic-labels/backfill`.
7. **MF-2 fence:** diff does not modify `prompts/reading-choice-analysis-v1.md`, `server/shared/topicTaxonomy.mjs`, `analyzeReading.mjs`, `packageBuilder.mjs`, or import/publish.
Then green on `node scripts/verify-ci.mjs` + `npm run build --prefix app`.

## Browser QA Matrix

| Case | Expected |
|---|---|
| Click 打标签 (key filled) | backfill runs; button disabled while in flight; summary shows 已标 N / 跳过 M / 失败 K |
| After backfill, search 主题词 (环境保护/科技…) in AI + classic | hits the just-labeled group(s); no restart needed (refreshQuestionGroups ran) |
| Re-click backfill | labeled groups skipped (idempotent); only new unlabeled processed |
| Inspect a labeled group | `source='ai'`; three-level path inside taxonomy |
| Writing group (MF-1) | labeled iff PO decided writing is in-scope; QA confirms it matches the decision |
| Colors / other searches | unchanged (regression) |

## DEV Readiness

DEV-ready **after** MF-1 + MF-2 are recorded in `plan.md`. The teacher action, before/after,
current vs future boundary, allowed/forbidden files, verify assertions, and browser QA are
all stateable. The premise is verified true (0/18 labeled, all types have material). One
PO decision is open (writing inclusion) — well under the limit of 3.

## Open PO Decisions

1. **Are the 2 `writing` groups in-scope for the backfill?** They are unlabeled and have
   material, so they WILL be labeled unless explicitly excluded. Writing is the A4 paper's
   subjective section; the owner may or may not want 主题 search to surface writing prompts.
   Default = include (simpler, honest "label everything unlabeled"); record whichever the
   owner picks in `plan.md` so the verifier asserts the right coverage count.
