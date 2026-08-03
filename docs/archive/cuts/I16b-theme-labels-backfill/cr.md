# CR — I16·B 主题标签批量回填 + 最小触发 UI

Reviewer: CR (fresh Opus, cold-read). Branch `I16b-theme-labels-backfill` @ impl commit `f4bc127`.
Reviewed `git show f4bc127` (whole cut is in one commit; no uncommitted code — working tree only
has untracked `.claude/launch.json` + `.impeccable/`, neither staged). Every code/data claim below
verified by reading source, not by trusting the green verifier.

## Verdict

**APPROVE WITH MUST FIX**

> **Resolution (2026-06-03):** MF-1 + SF-1 fixed in `b151382`. The out-of-scope eyebrow
> copy reverted to `Local-first English Question Bank`; the backfill summary/error spans
> given inline styling via existing tokens (`var(--muted)` / `var(--coral-text)`) — no
> App.css change, no new colors. verify-i16b 34/34, build green. CR clear; browser QA (Step 5,
> key-gated real backfill) remains the owner's PO QA before merge.

The substance is right and proven. The backend orchestrator is a genuine reuse-only batch
(classify→bind per group, idempotent, per-group fault-tolerant, honest summary), wired through a
factory spread exactly per the cut-A MF-3 lesson. The MF-2 diff-fence is real (the verifier reads
the actual prompt/analyze files, not vacuous greps), and I independently confirmed those files
carry no `topicLabels`. No color / hex / token changed anywhere in the diff — the PM's drift
concern is fully resolved (App.css is not in the diff; App.tsx inline styles add none). All three
gates green on my own run: verify-i16b 34/34, verify-ci, app build.

One Must Fix: an **out-of-scope copy change** to the topbar eyebrow slipped into the diff, unrelated
to the backfill cut. It is low-risk but it is scope drift the plan did not authorize, and this DEV
has already shown a tendency to drift (the reverted color). Revert it or get explicit owner sign-off.

## Verification (run independently, not trusted)

- `node scripts/verify-i16b-theme-labels-backfill.mjs` → 34 passed, 0 failed.
- `node scripts/verify-ci.mjs` → CI verify passed.
- `npm run build --prefix app` → built clean (pre-existing 500kB chunk warning only).
- Diff-fence files confirmed by direct grep: `prompts/reading-choice-analysis-v1.md` has 0
  `topicLabels`; `server/shared/topicTaxonomy.mjs` does not exist; `server/paper-import-ai/analyze*.mjs`
  contain no `topicLabels`.
- Full-diff color scan (`+` lines for hex / rgb / hsl / `--token:` / `color:` / `background:`):
  **NONE**.

## What I checked against the contract — all hold

1. **Orchestration correctness** (`server/topic-labels/backfillTopicLabels.mjs`): classify→bind
   chain is correct. `classify` returns `{ topicLabels }` (`api.mjs:10520-10534`); orchestrator
   passes `result.topicLabels` (the array) into `bind(id, array)`. `bindTopicLabelsToQuestionGroup`
   calls `normalizeTopicLabelPayload(input)`, which accepts a bare array
   (`api.mjs:954-955: Array.isArray(payload) ? payload : ...`). So the array-vs-`{topicLabels}` shape
   genuinely works — no silent zero-label bind. Per-group `try/catch` records `{id,error}` in
   `failed` and continues (verifier Req3 proves g2's throw does not abort and g2 is never bound).
   Summary counts are honest: `processed = ids.length`, `labeled` increments only on bind success,
   `skipped` is passed through from `listUnlabeledGroupIds`.
2. **Idempotency / `listUnlabeledGroupIds` SQL** (`api.mjs:10558-10571`): selects all
   `question_groups.id`, subtracts the DISTINCT `question_group_id` set from
   `question_group_topic_labels`, returns `{ unlabeled, skipped }` where `skipped` = already-labeled
   count. Correctly returns only groups with no label row; safe to re-run. `skipped` flows straight
   to the UI summary → "跳过 M" honestly means already-labeled.
3. **Wiring** (`api.mjs:36/92/443`, `topicLabelBackfillRoutes.mjs`): registered via
   `...createTopicLabelBackfillRoutes()` spread into the `serverRoutes` array (NOT a literal push at
   `:436`), matching the cut-A MF-3 lesson. `context.listUnlabeledGroupIds` exposed. Route reads
   `apiKey`/`model` from the JSON body via `parseRequestArgs` and uses `context.readJsonBody` /
   `context.sendJson` — identical seam to the existing topic-labels routes.
4. **Reuse, not reimplementation**: route injects `context.generateTopicLabelsByQuestionGroup`
   (classify) and `context.bindTopicLabelsToQuestionGroup` (persist). No classification logic,
   prompt, or taxonomy reimplemented. `topicTaxonomy.mjs` not recreated.
5. **MF-2 fence is real**: verifier Req7 reads the actual file contents (`readFileSync` +
   `!includes('topicLabels')`), and the `else` branches assert `false` if a file is missing — so it
   cannot pass vacuously. Independently confirmed all four targets clean.
6. **Minimal UI** (`App.tsx`): reuses `aiApiKey` (no new key plumbing), `ghost-button` class (exists
   in App.css), disables the button while `backfillStatus === 'loading'`, and calls
   `refreshQuestionGroups()` after success so new labels reach cards/search without restart. Service
   `backfillTopicLabels` POSTs `/api/topic-labels/backfill` with proper error handling. No color added.

## Must Fix (blocks merge)

### MF-1 — Out-of-scope topbar eyebrow copy change
`app/src/App.tsx:3576` changes the eyebrow from `Local-first English Question Bank` to
`按你怎么教，找你要的题`. This is unrelated to the theme-label backfill cut — it is not in plan.md
Must Do (Steps 1–5 are orchestrator / route / trigger-button / verifier / QA only), and it touches
the app's top-level branding line. Low functional risk, but it is unauthorized scope drift, and the
same DEV already drifted once (the reverted placeholder color the PM caught). Either revert it to
keep this cut clean, or get an explicit one-line owner sign-off recorded in plan.md before merge.
Do not let copy/brand edits ride in on a backend-backfill commit by default.

## Should Fix

### SF-1 — Result/error spans reference undefined CSS classes
`App.tsx:3658` and `:3665` render `<span className="backfill-summary">` and
`className="backfill-error">`, but neither class exists in any CSS file (App.css is not in the diff).
They render as unstyled inline spans inside the flex `.topbar-actions` row, so the summary text
("已标 N / 跳过 M / 失败 K") and the "打标失败" indicator inherit default text color and may flow
awkwardly next to the buttons. The plan explicitly allows a throwaway "做个先" UI, so this is not
blocking — but the spans are functionally placeholders with no styling at all. Acceptable to ship as
long as browser QA confirms the summary is legible; otherwise reuse an existing muted-text class.
(No color/token would be added by reusing an existing class — keep it that way.)

## Should Watch (non-blocking, already anticipated in plan/pa)

- **SW-A — synchronous 18× DeepSeek loop, no progress stream.** The button disables during flight
  (good) and idempotency covers a double-fire, but the request is a multi-second-to-minute blocking
  call. Plan/PA accept this for the slice (PA-ask #1). Correctness risk only if a proxy/server
  request timeout aborts mid-batch — already-bound groups persist (each bind is its own atomic txn),
  and a re-run resumes the rest via idempotency, so even a timeout is recoverable. Confirm in QA the
  server does not hard-timeout the request before 18 calls complete.
- **SW-B — per-group `bind` opens/closes its own DB connection** (`api.mjs:10538`). Fine at 18;
  revisit only if a future batch is large. Inherited from existing bind behavior, not new.
- **SW-C — idempotency is "has any label," not "stale label."** Re-run skips any group with ≥1 label;
  re-labeling drift is explicitly Out-of-Scope. Correct for this cut.
- **SW-D — paper-asset-derived cards (`topicLabels: []`, not `question_groups` rows) are not
  labelable** and stay 主题-unsearchable. Pre-existing limit (same as the per-group topic-labels UI);
  the 18-count already excludes them. Note in QA, not a regression.

## Self-Review Blind Spots (for any later Big CR)

- I did NOT exercise the live route end-to-end against a running server or real DB — the orchestrator
  is proven by injected mocks and the route is proven by static source assertions only. Browser QA
  (plan Step 5) remains load-bearing: it is the only place that proves the real
  `generateTopicLabelsByQuestionGroup`/`bind` chain runs over the 18 live groups, that labels become
  searchable ("环境保护"/"科技" hits), and that `source='ai'` with a valid 3-level taxonomy path lands.
- The MF-2 fence checks current file *contents*, not the literal diff. It is strictly stronger here
  (catches a bad state regardless of how it got there) and not vacuous, but it would false-fail if
  any of those files ever legitimately needed the substring `topicLabels` for an unrelated reason.
  Not a concern today.
