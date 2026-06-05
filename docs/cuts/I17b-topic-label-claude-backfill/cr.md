# CR-lite Review — I17b-topic-label-claude-backfill

**Reviewer:** CR-lite (fresh cold-read, independent, pre-merge)
**Branch:** `i17b/topic-label-claude-backfill`
**Base:** `github/main` @ `6af4213`
**Code under review:** `e394aa3` `feat(I17b)` — `server/api.mjs` only (+27 / −21).
(The two `docs(I17b)` commits — plan.md, pa.md — are context, not under review.)

## Verdict: APPROVE

The diff is exactly the 6 locked changes, nothing more. Byte-identical extraction
verified character-for-character. Main-guard predicate proven TRUE for the real
launch and proven import-safe while the API holds 8787 (no EADDRINUSE, no hang).
Both verify gates green (verify-i16b 34/0, verify-ci 39/0, exit 0). No scope creep,
no forbidden file touched, no over-export, no data/prompt/schema change. PA's MF-1
(import-safety) is genuinely closed.

## Must Fix (blocks merge)

None.

## Should Watch (non-blocking)

- **SW-1 — Driver-side double-normalize (gitignored, not in this diff).** The plan's
  driver does `normalizeTopicLabelPayload(...)` then `bindTopicLabelsToQuestionGroup`,
  and `bind` itself normalizes (and `replaceQuestionGroupTopicLabels` normalizes a
  third time). This is **pre-existing** behavior on `main` — the diff did not touch
  `bind`'s body, only added `export`. Normalize is deterministic and stable, so
  re-applying is harmless/idempotent. Note only; nothing to change here. Verified by
  PO QA (labels land + search hits), not by CR.

- **SW-2 — `persist` must stop the API before direct SQLite writes (driver concern,
  gitignored).** Same release discipline as the import pipeline precedent (plan Step 2:
  停 API → persist → 重启刷缓存). Not in this cut's reviewable surface; PO QA owns it.

- **SW-3 — Symlink edge of the main-guard.** `fileURLToPath(import.meta.url) ===
  path.resolve(process.argv[1])` does no realpath on either side, so a launch via a
  symlinked path would compare consistently (both un-realpathed) — fine for the actual
  launch (`scripts/dev.sh:19` passes the literal absolute path). No action; flagged only
  so a future "run via symlink" wrapper is aware the guard is path-literal, not inode.

## Per-item verification log

| # | Item | Evidence (file:line) | Result |
|---|------|----------------------|--------|
| 1 | **Byte-identical extraction** — `buildTopicLabelMessages(detail)` == original inline messages array | `git show 6af4213:server/api.mjs` 10469-10491 vs `e394aa3` 10469-10500 | **VERIFIED** — system text (`${DEEPSEEK_TOPIC_LABEL_PROMPT}\n\n可选标签清单：\n${allowedLabels}`) and user text (`请为以下…\n\n${formatQuestionGroupForTopicLabel(detail)}`) are character-identical; `allowedLabels` builder moved verbatim into the fn; only `context.detail`→`detail` param rename; siblings (`temperature/maxTokens/thinkingMode/apiKey/model/provider`) stay in `callDeepSeekTopicLabels`. `可选标签清单` occurs exactly once → single source of truth. |
| 2a | **Main-guard TRUE for real launch** | `scripts/dev.sh:19` `node "$ROOT_DIR/server/api.mjs"`; guard @ api.mjs:11087 | **VERIFIED** — argv[1] is the absolute api.mjs path; `path.resolve(abs)`=itself; `fileURLToPath(import.meta.url)`=same path → predicate TRUE; bootstrap + listen run as before. |
| 2b | **Wrapped block = exactly the 4 bootstrap lines** | api.mjs:11087-11096 | **VERIFIED** — guard wraps `ensureDatabaseShape()` / `cleanupPaperImportTempArtifacts(paperAssetsDir)` / `ensureMySpaceFilesRoot(userSpaceFilesDir)` / `server.listen(...)`; nothing else. |
| 2c | **`createServer(...)` stays top-level, no side effect** | `const server = createServer(...)` @10921; `.listen` only inside guard | **VERIFIED** — server object created at import time but never binds until `.listen()`, which is now guarded; the guard block is the last code in the file (EOF 11096). |
| 2d | **Nothing else moved in/out of guard** | tail 11097+ empty; diff hunk @11084 | **VERIFIED** — no other boot-relied statement displaced; `port`/`paperAssetsDir`/`dbPath` etc. remain module-scoped, defined regardless of guard. |
| 3 | **Import-safe live proof (API up, 8787 held)** | started `node server/api.mjs` (listening on 8787), then `import('./server/api.mjs')` with 10s watchdog | **VERIFIED** — import settled and exited clean (rc 0), no EADDRINUSE, no hang. Cold (API down) import also OK. MF-1 closed. |
| 4 | **No over-export / scope creep** | `git diff` exports: `normalizeTopicLabelPayload`, `getQuestionGroupDetail`, `buildTopicLabelMessages`, `bindTopicLabelsToQuestionGroup` | **VERIFIED** — exactly the 4 intended; taxonomy NOT moved; `generateTopicLabelsByQuestionGroup` / `callDeepSeekWithFallback` bodies unchanged; no schema/payload/prompt-text change. |
| 5 | **Forbidden fences (verify-i16b MF-2 four files) intact** | `git diff --name-only` | **VERIFIED** — diff touches only `server/api.mjs` (+ docs); `reading-choice-analysis-v1.md` / `analyzeReading.mjs` / `packageBuilder.mjs` / `topicTaxonomy.mjs` untouched. |
| 6 | **verify-i16b-theme-labels-backfill.mjs green** | ran | **VERIFIED** — 34 passed / 0 failed, exit 0 (incl. Req7 MF-2 fence + DeepSeek-path Req). |
| 7 | **verify-ci.mjs green** | ran | **VERIFIED** — 39 PASS / 0 SKIP / 0 FAIL, exit 0. |

## Self-Review Blind Spots (for a later Big CR / B)

- Driver correctness (`.scratch/import-pilot/topic-driver.mjs`) is gitignored and out of
  CR scope; only PO QA (labels land in DB + 主题词搜命中 108 组) proves it. CR did not
  exercise the Claude/Sonnet classify path or the scoped SQL.
- `npm run build --prefix app` was not run here (api.mjs change does not touch the
  frontend bundle); verify-ci passing is the relevant gate. If a belt-and-suspenders
  build is wanted, run it before RM.
- The 4 new exports widen api.mjs's public surface; B is expected to fold these into a
  `server/topic-labels/` module. Until then they are an intentional, minimal seam.
