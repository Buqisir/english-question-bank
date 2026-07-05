# Verify Script Index

This directory contains many cut-specific verify scripts. Prefer the
smallest script that proves the current risk. Do not run every script
just to create confidence theater.

Stable local/CI entrypoint: `npm run verify:all` from `app/`, which delegates
to `scripts/verify-ci.mjs`. It runs `git diff --check`, app
build/typecheck, then stable contract scripts. Install app dependencies with
`pnpm install --frozen-lockfile` from `app/` and server dependencies with
`npm ci` from `server/` before running it in a clean worktree. The GitHub
Actions template lives at `docs/ci/verify-workflow-template.yml`; installing it under
`.github/workflows/verify.yml` requires a token with workflow scope.
To inspect the stable verify registry without running it, use
`node scripts/verify-ci.mjs --list-json`.

Current install state: the workflow is not installed under `.github/workflows/`
because the available GitHub token has `repo` scope but not `workflow` scope.
See `docs/ci/verify-workflow-install.md`.

## Stable CI entrypoint

| Script | Scope | Runs in CI? |
| --- | --- | --- |
| `verify-ci.mjs` | Stable app build/typecheck plus core contracts used by GitHub Actions | yes |
| `verify-architecture-housekeeping.mjs` | Housekeeping guardrails: CI, code style, tokens, verify index | yes |
| `verify-h1-router-skeleton.mjs` | H1-A minimal route registry contract | yes |
| `verify-h1c-paper-import-routes.mjs` | H1-C Paper Import route extraction contract | yes |
| `verify-h1d-analysis-availability.mjs` | H1-D PaperSurface analysis availability owner contract | yes |
| `verify-i0e-seven-choices-entry.mjs` | I0-E 七选五 PaperSurface entry availability and label gate | yes |
| `verify-h1e-export-routes.mjs` | H1-E export route dispatch contract | yes |
| `verify-h5a-export-implementation.mjs` | H5-A export implementation extraction contract | yes |
| `verify-h5c-json-extraction.mjs` | H5-C AI-completion JSON / verify-verdict extraction leaf contract | yes |
| `verify-h5d-completion-runner.mjs` | H5-D AI-completion transport: provider routing + retry + thinking-mode fallback + flash-default + re-import guard (stub fetch) | yes |
| `verify-h5b-import-listing.mjs` | H5-B import file/bundle/batch listing + dir-scan extraction contract | yes |
| `verify-h5e-verify-question-group.mjs` | H5-E verify-question-group service: invocation smoke + audit-JSONL shape + re-import guard | yes |
| `verify-h5j-reading-difficulty.mjs` | H5-J reading-difficulty normalizer: golden T-card override matrix + six-dimension scoring/floor + surfaceQuestion correction + invocation smoke + file-private/seam guard (no provider) | yes |
| `verify-h5h-semantic-search.mjs` | H5-H semantic-search recall + rerank service: invocation smoke (prefilter→score→rerank→matches envelope byte-identical for fixed inputs, stub DeepSeek + fixture DB) + reading-signals SQL fold + empty-DB short-circuit + rerank-prompt-not-over-indented + extraction seam + used-but-undefined/file-private guards | yes |
| `verify-h5i-steward-service.mjs` | H5-I question-bank steward service: invocation smoke (stub semanticSearchQuestionGroups + callDeepSeekWithFallback) asserting plan/filter/message envelope byte-identical for fixed NL inputs (clarification + skill-inference filter matrix + plan-only) + steward-prompt-not-over-indented + extraction seam (semanticSearch injected, no cycle) + used-but-undefined/file-private guards | yes |
| `verify-h5k-synonym-difficulty.mjs` | H5-K synonym-difficulty local-Qwen classifier: invocation smoke (stub callLocalQwenCompletion + fixed fake reading question-group) asserting per-group envelope + cardId white-list enforcement (invalid-card-replaced + retry-once) + deepseek/review trigger composition + knowledgeVersion/latency keys; gate-OFF exact-throw path; REAL knowledge file -> formatSynonymDifficultyKnowledgeForReadingPrompt stable (always-on reading path) + per-question-prompt-at-indent-0 (byte-sensitive Chinese template) + factory/6-named-export surface + used-but-undefined/file-private/no-cycle guards | yes |
| `verify-h5l-question-group-parse.mjs` | H5-L question-group parse owners (4 DeepSeek per-type owners: reading/cloze/grammar-fill/seven-choices): invocation smoke (stub callDeepSeekWithFallback + fixed fake per-type question-group detail) driving all 4 parse*ByQuestionGroup owners and asserting each envelope (persisted payload_json shape: questionGroupId/title/questionCount/parsedCount/matchedCount/unmatchedQuestionNos/keySource/keyMask/requestId/model/thinkingMode/provider/totalLatencyMs/questions) byte-stable; wrong-group-type + missing-key exact-throw paths; same-name 4-prompt inject + byte-sensitive inline Chinese template at column 0 (no factory re-indent); factory/4-owner return surface + 8 file-private helpers; used-but-undefined/no-cycle guards; api.mjs import+inject integration | yes |
| `verify-h5f-legacy-import-impl.mjs` | H5-F legacy DOCX import-draft / answer-alignment implementation (deterministic, zero AI): move-equivalence over fixed extracted_text fixtures — stub openDatabase returns canned rows, drives generateImportBundleDraft (healthy reading split: groupCount=1/2 questions/A-D options/answers, byte-identical to frozen draft golden minus generatedAt; warningBundles=0 + noOptGroups=0 per import-splitter.md; null-on-no-files) + generateAnswerAlignmentDraft (byte-identical alignment golden, answerDiffers flagged); applyAnswerAlignment asserts shouldUpdateExplanation=false (updatedExplanationCount stays 0 under overwrite=false AND true; UPDATE writes currentExplanation never proposed) + the parseCompactAnswerEntries questionNo===57 hack (语法填空@57 back-fills q56); factory returns exactly the 8 seam fns + ~70 file-private helpers; no-cycle (no api.mjs import) + used-but-undefined guards (drop openDatabase/normalizeDraftText/cleanDraftText -> throw); contract-literal + api.mjs import/inject/wrapper-async integration guards | yes |
| `verify-h5g-docx-renderer.mjs` | H5-G DOCX OOXML renderer (escapeXml … convertDocxToPdf + readingDistractorTypeLabel) — USER-VISIBLE byte contract: drives the REAL renderer (NOT the H5-A export-impl stub) via createDocxRenderer over a representative question-group detail fixture (reading/grammar/cloze/seven-choices with saved parse+verify data); buildDocumentXml byte-stable across calls for handout+exam printStyle and student+teacher versionType (student hides the answer area); asserts WordprocessingML envelope (XML decl / w:document ns / sectPr page-size literal) + groupTypeLabels + readingDistractorTypeLabel + docxVerifyVerdictLabels + escapeXml outputs verbatim; exam path routes through file-private buildExamDocumentXml; writeDocxPackage writes a non-empty PK zip to a temp path; factory returns exactly the 3 entry fns (buildDocumentXml/writeDocxPackage/convertDocxToPdf) with the 23 helpers + readingDistractorTypeLabel file-private; no-cycle (no api.mjs import) + used-but-undefined (drop groupTypeLabels/optionalString -> factory throws); timestampPrefix NOT in the docx module; V1 footer TODO comment verbatim; api.mjs import/inject + 3 forwarding-wrapper signature integration guards | yes |
| `verify-h1f-legacy-import-routes.mjs` | H1-F legacy import route dispatch contract | yes |
| `verify-h1g-question-group-routes.mjs` | H1-G question-group route dispatch contract | yes |
| `verify-h10a-paper-set-routes.mjs` | H10-A paper-set CRUD + paper-workflow route dispatch contract (status codes, create-vs-merge, no-shadow) | yes |
| `verify-h10b-ai-proxy-routes.mjs` | H10-B PR2 AI-proxy route owners (semantic-search/steward/verify-question-group): defineRoute surface + exact context.fn call args + 200 envelope pass-through + verify-question-group x-verify-request-id contract (result.requestId on success / minted id on 500) + {error,requestId} + serverContext-exposure/no-cycle guards | yes |
| `verify-h11b-paper-import-ai-view.mjs` | H11-B PaperImportAi untyped-analysis view helpers extraction contract (source-level) | yes |
| `verify-h11a-http-client.mjs` | H11-A PR1 shared frontend httpClient dedup: each caller's host form preserved verbatim (apiPath ::1-inclusive vs apiPathNoIpv6 no-::1) + runtime invocation smoke of the moved helpers | yes |
| `verify-h12a-entry-modal.mjs` | H12-A App.tsx Manual Entry form modal extraction into workbench/EntryModal.tsx; 5-prop seam + savedCard writeback contract (source-level) | yes |
| `verify-restart1-local-search-intent.mjs` | Restart cut ① local search: tokenize() CJK bigram production, parseLocalIntent() year/section/groupType/region extraction, weighted ranking (topic label > section/place > generic fields, year DESC tiebreak), hard-filter dimensions, non-regression on plain-English/empty queries | yes |
| `verify-restart3-teacher-analysis.mjs` | Restart cut ③ teacher-version real analysis (paper-assets join): print-renderer isMetaStub() hides the publisher.mjs metadata stub note (source + behavioral); analysisText.mjs four-family degrader (reading/cloze/grammar-fill/seven-choices) against real tracked paper-zj-2026-jan fixtures, writing excluded; graceful no-throw on missing-analysis paper (paper-2024-jia) and unmatched groupId; findPaperAssetGroup additive paperId field + existing call-site regression; draftPaperStore teacher-only wiring + never-overwrite-existing-explanation + no-DB-write guard | yes |
| `verify-home-default-feed.mjs` | Cut ⑥ home-default-feed: buildDefaultFeed (year DESC + paperName tiebreak sort, reuses aggregatePaperResults bucketing, empty-corpus no-throw, real_exam + mock_exam both included); ConciergeDesk feed render gate (empty + true-vacuum only, not loading/results/clarification/error), 8-paper cap + "显示全部 N 套卷" expander, empty-corpus import-guidance copy, feed rows reuse ConciergePaperRow wiring unchanged; STARTER_CHIPS retired for the structured filter row (cut ai-mode-filter-chips C7) with submit(intentOverride) path preserved + submit/triggerSimilar keep query after firing (P1 same-face fixes); `.eyebrow` re-scoped off slate inside `.home-mode-ai` only, `:root` untouched | yes |
| `verify-concierge-filters.mjs` | Cut ai-mode-filter-chips: `filters.ts` pure functions — buildFilterOptions (four dimensions/fixed business order for groupType+sourceType/year DESC/region by count DESC, correct counts), applyConciergeFilters (single-dimension, multi-dimension AND, empty filters = full corpus unchanged, impossible AND = `[]` with no throw/no fallback), composition with buildDefaultFeed (filtered feed only matching papers, sort order preserved) | yes |

## Core data and import

| Script | Scope | Runs in CI? |
| --- | --- | --- |
| `verify-paper-asset-v1.mjs` | `paper-asset-v1` fixture and source-faithfulness contract | yes |
| `verify-c7-paper-import-contracts.mjs` | C7 schema / offline validator contracts | yes |
| `verify-c7-paper-import-publish.mjs` | C7 publish atomicity and storage protocol | yes |
| `verify-i1-paper-import-splitter.mjs` | I1 DOCX reading splitter endpoint and parser contract | no |
| `verify-i1-paper-import-route.mjs` | I1 owner-only `?view=paper-import-ai` parse / publish route | yes |
| `verify-i1-paper-import-analysis.mjs` | I1 owner-only analysis / publish endpoints, provider seam, JSON preview, and C7 package bridge contract | yes |
| `verify-i2-seven-choices-ai-import.mjs` | I2 七选五 AI 导题接入：splitter / analysis / package / route contracts | yes |
| `verify-i3-cloze-ai-import.mjs` | I3 完形填空 AI 导题接入：splitter / package / route contracts | yes |
| `verify-i4-grammar-fill-ai-import.mjs` | I4 语法填空 AI 导题接入：splitter / package / route contracts | yes |
| `verify-i5-writing-ai-import.mjs` | I5 应用文写作 + 读后续写 AI 导题接入：splitter / package / publish path contracts | yes |
| `verify-i6-writing-render.mjs` | I6 写作卷面版面还原：从 content.blocks 派生写作页模型（题面外壳归属 / 续写开头句折叠进答题框 / 应用文空框 / 不串味） | yes |
| `verify-i7-application-given.mjs` | I7 应用文给定上下格式解析：末尾纯英文 + 正向信号守卫切给定骨架（信件/标题/无给定/负向守卫/称呼型），情境剔除、夹注不误判 | yes |
| `verify-i8-cloze-analysis.mjs` | I8 完形填空 AI 解析生成：prompt 合约、validate 校验器成功与阻断用例（stub provider）、路由 + 包构建 + 存储接线、磁盘 latest/analyses/cloze-analysis-v1.json 断言 | yes |
| `verify-i9-cloze-analysis-surface.mjs` | I9 完形填空解析 render 面：adapter 映射 + 多次出现证据 + 空白标记排除 + option-side 标记；panel 必要结构；harness fetch→fallback dispatch；availability 完整性 vs 不完整（blanks 键） | yes |
| `verify-i10-blank-rendering.mjs` | I10 空格渲染：paperBlankPattern 提取 + 行为测试（完形 `__41__` / 七选五 `_____36_____` / 语法填空 2空格变体）；重命名符号存在 + 旧名称不存在；MF-3 已接受误匹配记录 | yes |
| `verify-relay-json-format.mjs` | Chat-completions request body sends response_format json_object on every provider (incl. openai-compatible gpt relay); `thinking` stays native-only | yes |
| `verify-i11-symbol-normalization.mjs` | I11 符号归一 2a：normalizePassageText 纯函数表驱动用例（规则 1 半角化 / 规则 2 标点后空格 / 规则 3 生词括号空格）；mixed seam 边界；C2 空格标记字节完整哨兵；语法填空两阶段 compose 顺序；完整幂等性 | yes |
| `verify-i13-grammar-fill-analysis.mjs` | I13 语法填空 AI 解析生成（第一刀）：prompt + 16 叶 facet 注册表合约；validateGrammarFillShape 成功与所有阻断用例（stub provider）；C1 冻结 4-op 归一化（whether/if✓、worn-for-wore✗、were worn 多词✓）；C2 16 叶成员、父节点拒绝、blank_type 不匹配、role/path 条件约束；C3 evidence 精确子串 + SW-2 空格标记排除（  56   + (wear)）；MF-2 发布后磁盘 analyses/grammar-fill-analysis-v1.json 存在；MF-3 强制发布 guard | yes |
| `verify-i14-grammar-fill-analysis-surface.mjs` | I14 语法填空解析 render 面 + 入口（第二刀）：Step 0 facet 框架注册表漂移守卫（16 key == 服务端 JSON）+ non-finite 形变表；Step 1 GATE-1 空白容差匹配（plain indexOf 失败但容差命中、偏移映射回存储字节、3+空格折叠）+ MF-1 每个 range.sentenceId 存在于 textMap + 多次出现 + 空白标记排除 + 10 空映射 + framework/labelZh 解析 + role/path 仅 non-finite + unknown facetKey/schemaVersion 抛错；Step 2 panel 必要结构；Step 3 harness fetch→fallback dispatch + 各 cloze 触点镜像；Step 4 availability 完整 vs 不完整（blanks 键，语法解析） | yes |
| `verify-i15-grammar-fill-blank-focus.mjs` | I15 语法填空点正文空格聚焦 + 退数字排（第三刀）：blankFocusMode 在 types.d.ts 声明（默认 rail）；rail 两处渲染点被 !blankFocus 门控；grammarFillBlankPattern 必需点号区分（匹配 56._____ / 57._____(absorb)，排除 cloze __41__ / 七选五 _____36_____ / 数字噪声 2026·800g·3-5g·25-30g；64._____ 3-5g→["64"] 不取 3）；paperBlankPattern 字面量零改动守卫；空格渲染为带 aria-label/aria-pressed 的 <button>、未匹配→非交互 span（SW-2）；harness 仅 grammarFillAnalysisModel 时传 in-passage | yes |
| `verify-i16a-teaching-dimension-search.mjs` | I16·A 教学维度检索层：extractor 四类（语法/七选五/完形/阅读）真实 960d0f8d 样本断言；MF-1 完形 signatureFacet 稀疏（13/15 缺失不崩）；reading 多组 join 3+4+4+4 无孤儿；MF-2 未解析题组（jslk grammar-fill/cloze）缺席索引；查询行为（bridge/noun/skill/多维 AND）；MF-3 路由注册 + invalidate 清缓存 | yes |
| `verify-i16b-theme-labels-backfill.mjs` | I16·B 主题标签批量回填：注入 mock 编排（全标/跳过/容错/摘要计数）；MF-2 diff 围栏（reading-choice-analysis-v1.md/topicTaxonomy.mjs/analyzeReading/packageBuilder 未耦合）；路由经工厂注册；前端 service 调 /api/topic-labels/backfill | yes |
| `verify-i16c-grammar-verb-axes.mjs` | I16·C 语法填空动词维度（时态/语态/主谓一致）：确定性分类器各形态 + AI 兜底；MF-1 sidecar 落在 resolved baseDir（versions/v1，不造 latest/）；MF-2 索引合并保留现有 grammarFill facet+groupType+跨类阅读、新增三轴；MF-4 主谓一致从主语上下文判（have-led→AI，prompt 携带 subjectSignals）；编排幂等/容错；endpoint filter；frozen 契约围栏（facets 注册表/validator/schema/deepseek.mjs 未动）| yes |
| `verify-search-thinking-toggle.mjs` | AI 搜索 thinking 开关：askQuestionBankSteward 第三参 thinkingMode 进请求体；questionBankStewardSearch 形参含 thinkingMode 且传给 plan + semantic；steward 路由 forwards input.thinkingMode；ConciergeDesk 渲染 thinking toggle | yes |

## PaperSurface and Paper Intelligence

| Script | Scope | Runs in CI? |
| --- | --- | --- |
| `verify-paper-surface-module-v1.mjs` | Shared PaperSurface module contract; includes historical forbidden-scope checks | no |
| `verify-paper-surface-host-interaction.mjs` | Host interaction reducer run-form behavior and seam rules; includes cut-specific forbidden-scope checks | no |
| `verify-paper-surface-mjs-declaration-parity.mjs` | `.mjs` declaration parity | yes |
| `verify-paper-intelligence-paper-surface-harness.mjs` | Paper Intelligence harness contract | no |
| `verify-paper-intelligence-paper-surface-evidence.mjs` | Evidence-line behavior | no |
| `verify-paper-intelligence-paper-surface-insight.mjs` | Insight panel behavior | no |
| `verify-paper-intelligence-route-integration.mjs` | Paper Intelligence route integration | no |
| `verify-i0e-seven-choices-entry.mjs` | I0-E 七选五 PaperSurface entry availability and label gate | yes |

## C5 / C6 reading-analysis cuts

| Script | Scope |
| --- | --- |
| `verify-c5a-paragraph-structure-anchors.mjs` | Confirmed paragraph structure anchors |
| `verify-c5b-structure-brace.mjs` | Structure brace geometry and controls |
| `verify-c5b-po-qa-contract.mjs` | C5b PO QA contract |
| `verify-c6a-2-reading-a-analysis.mjs` | Reading A reviewed analysis |
| `verify-c6a3-reading-analysis-bridge.mjs` | Search card to PaperSurface route bridge |
| `verify-c6a4-paper-asset-analysis-loader.mjs` | Paper asset analysis loader |
| `verify-c6a5-search-entry-e2e.mjs` | Search entry end-to-end path |
| `verify-c6a6a-reading-b-analysis.mjs` | Reading B analysis data |
| `verify-c6a6b-open-reading-b-analysis-entry.mjs` | Reading B entry gate |
| `verify-c6a7-reading-c-analysis.mjs` | Reading C analysis data |
| `verify-c6a8-reading-d-analysis.mjs` | Reading D analysis data |
| `verify-c6a9-open-reading-cd-analysis-entry.mjs` | Reading C/D entry gate |
| `verify-c6a10-concierge-local-search.mjs` | Concierge local search |
| `verify-c6b1-option-anchored-analysis.mjs` | Option-anchored analysis panel |
| `verify-c6b2-analysis-entry-gate.mjs` | Data-driven analysis availability gate |

## Draft paper / export

| Script | Scope | Runs in CI? |
| --- | --- | --- |
| `verify-basket-persistence.mjs` | Basket persistence | yes |
| `verify-paper-draft.mjs` | Draft paper model / behavior | yes |
| `verify-concierge-desk.mjs` | Concierge desk behavior used by draft entry points | yes |
| `verify-c8-draft-paper-contracts.mjs` | C8 draft-paper API/search/workbench contract | yes |
| `verify-c8-my-space-contracts.mjs` | C8 PR B My Space storage/API/UI contract; cut-specific | no |
| `verify-c8-draft-paper-render-model.mjs` | C8 draft paper render model | yes |
| `verify-c8-print-ready-gate.mjs` | C8 print-ready gate | yes |
| `verify-error-copy-mainline.mjs` | Cut ⑧ error-copy-mainline: `describeError` human-copy helper contract, MySpacePage + DraftPaperWorkbench zero raw `error.message`/`String(error)` residue, my-space failure-state retry button + single-render de-dup, draft-paper workbench errors don't clear in-progress work | yes |
| `verify-ai-server-key-fallback.mjs` | Cut ai-key-server-fallback: `runConciergeSearch` gate matrix (no key+no server→local `missing-api-key`; no key+server available→steward call with `apiKey===''`; key present→steward, no regression; steward throws→`api-error` fallback), timeout selection (default 20000ms / thinking 60000ms / explicit `stewardTimeoutMs` wins), `GET /api/ai/status` route shape + MF-3 key-leak negative test (sentinel absent from response body AND all console output), `api.mjs` MF-1 TDZ guard (`serverContext.serverKeyAvailable` assigned post-hoc, not in the `:93` literal) | yes |
| `verify-auth-gate.mjs` | M0-2 invite-login: spawns the real server against a temp DB — bootstrap-open mode (empty users table, zero-change for existing smoke/verify), real `create-user.mjs` CLI invocation, forced-mode 401s (no cookie / wrong password / no-enumeration on nonexistent username), `GET /api/health` and `/paper-assets/*` gate coverage (PA MF-2), successful login unlocking a previously-401 API, logout invalidating the cookie, and `--disable` taking effect immediately | yes |
| `verify-owner-gate.mjs` | M0-3 owner/member role gate: spawns the real server against temp DBs — owner + member accounts (real `create-user.mjs` CLI) each hit all 41 `ownerOnly` routes (legacy-import/paper-import/paper-import-ai/topic-label-backfill/verb-profile-backfill whole modules + question-group and paper-set per-route gates); member gets 403 `{ error: 'forbidden' }` on every one (never a different body shape), owner never sees 401/403 on any of them; member allowed-surface sample (question-groups/paper-sets/my-space/draft-paper-items/auth-me) never 403; bootstrap-open mode (empty users table) leaves a gated-route sample un-403'd (ADR-0013 decision 2, positive-authMode-check regression guard per PA MF-3) | yes |
| `verify-user-scope.mjs` | M0-4 user data isolation: hermetic (all 4 path envs + port -> temp dirs, no vivliostyle — artifact rows are inserted directly via `saveMySpaceArtifact` against the running server's temp user-data DB file). Three fixtures: (1) open-mode regression — empty users table, full draft/my-space CRUD + `in_current_draft` button state, then a direct DB check that every touched row is `user_id='local'`; (2) two-user isolation — CLI-created owner A + member B, each add-to-draft without a composite-index collision, cross-user 404 on draft GET/PATCH/items PATCH+DELETE/print-html, owner has no private-data privilege (A 404s on B's draftId too), same folder name succeeds for both users but collides within one user, cross-user artifact download/delete 404s, PA MF-3's "B borrows A's draftId via `POST /api/my-space/artifacts`" 404s before vivliostyle is ever invoked, and B filing into A's folderId is rejected by `saveMySpaceArtifact`'s ownership check; (3) migration — hand-built v2-shape DB -> `ensureUserDatabaseShape` -> column/backfill/composite-index/`user_version=3`/`foreign_key_check` assertions + idempotent re-run, plus a hand-built half-migrated DB (PA MF-2 crash-reentry: `draft_papers`/`my_space_artifacts` already have `user_id`, `my_space_folders` does not, `user_version` still 2) converging to v3 with folder data intact | yes |
| `verify-ai-daily-limit.mjs` | M0-5 AI global daily request-count limit: spawns the real server against a temp DB + a temp AI-usage snapshot path + a local mock DeepSeek HTTP server (`DEEPSEEK_API_URL` env override, additive to `server/api.mjs`). Five assertions: (1) `AI_DAILY_REQUEST_LIMIT` set to 2 -> 2 server-key `POST /api/ai/semantic-search` calls succeed, 3rd 429s with `{ code: 'ai-daily-limit-exceeded' }`, mock DeepSeek reached exactly twice; (2) a call with a client-supplied `apiKey` still succeeds (200, mock reached a 3rd time) after the limit is exceeded; (3) `GET /api/ai/status` returns `dailyLimit: {limit, used, exceeded}` alongside `serverKeyAvailable`, `used` counts only server-key calls, `exceeded` flips true; (4) kill + respawn the server process against the same snapshot path -> `used` reads back unchanged (fail-soft write-through persistence, not reset to 0); (5) a hand-written snapshot with a stale (year-2000) Beijing `dayKey` and `count:100` rolls over to `count:1`/today's `dayKey` on the first request of the day, not `count:101` | yes |
| `verify-classic-retire-2.mjs` | detail-consume-only (ADR-0015, formerly classic-retire-2-detail-view): source assertions (no duplicate API behavior checks; verify-owner-gate.mjs already covers the questionGroupRoutes 403/200 gate). Asserts `QuestionGroupDetailView.tsx` is props-driven (zero internal `useState`), keeps 编辑/删除 owner-gated, and no longer contains any retired 现场生产 control (verify/AI-parse/topic-label generate-bind/difficulty rating) or AI ops-trace field, while member-visible surfaces (加入草稿卷, passage text, 已绑定话题标签, 答案对比统计, AI 答案验证 verify-list) stay unconditional; App.tsx no longer defines the retired WRITE handlers but still defines the READ-only parse/verify state, `runAiEnhancementAnswerParse`, and `handleBackfillTopicLabels`; `onOpenDetail` is threaded through all three ConciergeDesk render points (2x `ConciergePaperRow` + `ConciergeGroupCard`) and wired in App.tsx; `ConciergeGroupCard` no longer shows a difficulty dot | yes |
| `verify-classic-retire-3.mjs` | classic-retire-3-cleanup: source assertions deleting the last classic-mode dead code from App.tsx/App.css — homeMode state machine, classic list view, filter bar, classic sidebar (basket-panel incl. steward-chat-panel), and the print-preview viewMode branch. Asserts App.tsx has zero `homeMode`, no `className="basket-panel"`, no `steward-chat-panel`, `viewMode` no longer has a `'preview'` value, no `openPreview`; ConciergeDesk renders unconditionally under the `viewMode === 'list'` branch only; the app-shell className is the fixed literal `"app-shell home-mode-ai"`; App.css still carries `.version-toggle`/`.paper-page`/`.paper-meta`/`.basket-item`/base `.eyebrow`/`.app-shell.home-mode-ai` as negative-deletion sentinels (these have live users outside the deleted classic UI); `handleBuildObjectivePaperSet` no longer jumps to print preview | yes |
| `verify-launch-deploy.mjs` | launch-deploy Slice 1+2+3+4: Slice 1 asserts `httpClient.ts` ships no absolute `http://127.0.0.1:8787` API origin (comment-stripped code check) — `apiPath` returns the relative path, `API_ORIGIN` const gone, `apiPath`/`apiPathNoIpv6` exports preserved, no `app/src/services/*.ts` reintroduces the origin, and (if `app/dist` built) the bundle is 8787-free. Slice 2 asserts `deploy/Caddyfile` has 3 `reverse_proxy → 127.0.0.1:8787` handle blocks for `/api /paper-assets /user-space` ordered before the SPA `try_files {path} /index.html` + `file_server` fallback (SW-3) targeting eqbank.cc; `deploy/eqb.service` runs `User=eqb` with `Restart=`, `--env-file`, ExecStart→`server/api.mjs`, WorkingDirectory pinned; `.nvmrc` pins Node 24; `scripts/deploy.sh` builds + restarts eqb + smokes `/api/health` and passes `bash -n`. Slice 3 (VA6) asserts `scripts/backup-to-r2.sh` passes `bash -n`, uses `rclone copy` and never `rclone sync` in code (SW-1, comment-stripped), and behaviorally: spawns the script with `--dry-run` against a temp fixture (seeded sqlite db + temp dirs via the same env vars `server/api.mjs` reads, `EQB_SNAPSHOT_DIR` pointed at a temp out dir) with no rclone installed, asserts exit 0, and asserts the snapshot the script wrote passes `sqlite3 <snap> "PRAGMA integrity_check"` == `ok`. Slice 4 (VA5) asserts `scripts/pull-run-push.mjs` passes `node --check`; `check-manifest` exits non-zero when fed a `user-data`-shaped basename (MF-2 abort真触发) and exits 0 for a clean path list; and a full fake-remote `push` round-trip (`EQB_REMOTE=local:<tmp>` + `EQB_LOCAL_REPO=<tmp>`, seeded fake-remote db/user-data + distinct fake-local db, injected `EQB_SERVICE_STOP`/`EQB_SERVICE_START` shell commands that log to a file) proves: fake-remote `user-data.sqlite` size+mtime+sha256 unchanged, fake-remote `question-bank.sqlite` now matches the local content (swap landed), its inode changed (atomic rename, not in-place write), no leftover `*.incoming.*` temp file remains, and the STOP marker recorded the OLD content's sha (stop ran before the swap) with a START marker following. A symmetric fake-remote `pull` round-trip (Big CR MF-A) proves: remote `user-data.sqlite` unchanged, the remote content lands locally (logical `SELECT` compare — `.backup` is data- not byte-identical), the old local db is backed up before the swap, the local swap is a same-dir atomic rename (inode changed, no leftover `*.incoming.*`), and the remote `.backup` snapshot temp is cleaned up. Behavioral browser QA (LAN-host Caddy topology, relative addressing, deep-link fallback) run manually at Slice 1/2 acceptance | yes |
| `verify-paper-blocks-numbering.mjs` | Paper block numbering | no |
| `verify-paper-layout-roundtrip.mjs` | Layout model roundtrip | no |
| `verify-paper-export-flow.mjs` | Export flow | no |
| `verify-paper-export-payload.mjs` | Export payload | no |
| `verify-exam-export.mjs` | Exam export | no |
| `verify-print-renderer.mjs` | Print renderer | no |
| `verify-print-pdf-export-flow.mjs` | Print PDF export flow | no |

## Concierge and reading-analysis legacy

| Script | Scope |
| --- | --- |
| `verify-reading-analysis-route.mjs` | Legacy reading-analysis route |
| `verify-reading-analysis-selector.mjs` | Reading-analysis selector |
| `verify-reading-analysis-view-state.mjs` | Reading-analysis view state |
| `verify-reading-analysis-linking.mjs` | Reading-analysis linking |
| `verify-reading-analysis-annotation.mjs` | Reading-analysis annotation behavior |

## Miscellaneous / older Paper Intelligence cuts

| Script | Scope |
| --- | --- |
| `verify-dev-completion-report-contract.mjs` | DEV completion report contract (steering ↔ template consistency) |
| `verify-paper-intelligence-cut-d1.mjs` | Older Paper Intelligence D1 contract |
| `verify-paper-intelligence-preview.mjs` | Paper Intelligence preview |
| `verify-paper-intelligence-interactive-preview.mjs` | Interactive preview |
| `verify-paper-intelligence-evidence-audit.mjs` | Evidence audit |
| `verify-paper-surface-interaction-model-doc.mjs` | PaperSurface interaction model doc |
| `verify-paper-surface-prototype.mjs` | PaperSurface prototype |
| `verify-paper-surface-textmap-adapter-plan.mjs` | Text-map adapter plan |
| `verify-paper-surface-tokens.mjs` | Token contract |
