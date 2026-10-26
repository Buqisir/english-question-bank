# Verify Script Index

听核包只读命令：`node scripts/import-pipeline/listening-owner-review-pack.mjs --help`。
标准操作见 `docs/import/listening-review.md`「出听核包」。

| Focused check | Distinct failure caught | CI |
| --- | --- | --- |
| `node --test scripts/import-pipeline/listening-cut-padding.test.mjs scripts/import-pipeline/listening-segment-pipeline.test.mjs scripts/import-pipeline/listening-owner-edge-rule.test.mjs scripts/import-pipeline/listening-boundary-safety.test.mjs` | 捕获默认剪到长静音中点而非词边 ±0.8 秒、短于 1.6 秒停顿吞入邻语音、录音首尾越界、跨引擎静音并集扩大缓冲、历史 attempt 被改写，以及装入 Owner 最终切点时二次加缓冲；合成数据只证明导航切点规则，不证明真实词级定位准确。 | focused/manual; existing listening rule/pipeline checks remain in daily packs |
| `node --test scripts/import-pipeline/listening-owner-review-pack.test.mjs` | 合成音频证明逐遍精切不会重复整段，0.8 秒缓冲不跨相邻停顿中点，上下文从精切扩 3 秒且受整录音端点约束；捕获缺首尾/停顿、音频 SHA 改变、错误段/遍选择、经符号链接写回卷目录、输入被改写、中文页面首末句/绝对时钟遗漏，以及 manifest 缺规则/SHA 或误称 Owner 已审。需本机 ffmpeg/ffprobe；此检查不证明真实录音内容与原文一致。 | manual; not in daily packs |

`listening-source.mjs plan/apply` 是显式、有界的听力来源作者入口。只选择
答案 PDF 中的完整标题/起点/排他终点，以及 example / cue / speech 原件角色；
混合 item 允许 UTF-16 slice，所有受影响 item 必须逐字完整覆盖。
`--request` 提供 `documentId`、`headingItemId`（可 null）、`startItemId`、
`endItemId`（null 表示文档末尾）、`reason`、`roles`。每个 role 提供
`role`、`nextTextNumber`、`questionNumbers`、`fragments`；fragment 提供
`itemId` 和可选 `start/end`（省略表示完整 item）。
两步均强制新的 `--output`，禁止写入源卷目录或其 OCR work 目录；
apply 另需 `--plan`、`--agent-confirmed`。输出只是隔离作者产物，`publicReplay`
如实记录 admission/compile 的独立阻塞，绝不是发布通过凭证。
原写者安装前必须通过既有 redo 从 spelling 起失效下游，保留封存 OCR、
原 producer receipt 与 materialization-edits；再重新执行完整公共流程。
新决策仅在 Materialization v9 / authority v75 生效，旧 schema/authority 不接收新字段，
无决策 producer 的输出保持原路径。已存在的段落合并应先于本入口完成。

| New verifier | Distinct failure caught | CI |
| --- | --- | --- |
| `materialization-listening-source.test.mjs` | Catches examples or scoring appendices leaking into transcript, whole-heading rewriting, overlapping/gapped/skipped source slices, surrogate splits, stale PDF/evidence/confirmation/materialization/receipt plans, dropping real M/W speech as cue, wrong next Text/question/section order, forged transcript/admission and older-authority acceptance; requires public OCR import/compile and atomic no-clobber outputs outside immutable input directories. | yes, via `verify-nck1-ocr-source-evidence.mjs` |

`source-references-v4` 的评分图只进入显式 `includeScoring` 的答案册；范文仍用
v3 的 `figures` / `afterParagraphId`。既有 publication/receipt 继续绑定原 sidecar
bytes，不重写旧版，不提升未变的 OCR confirmation/Materialization producer。

| New verifier | Distinct failure caught | CI |
| --- | --- | --- |
| `source-reference-exclusion.test.mjs` | Catches undeclared explanation-image omission, stale PDF/crop/anchor/OCR bindings, duplicate/forged confirmations, essay or scoring images (including labels consumed inside the image) laundered as explanation, multi-image first-declaration deadlock or cross-bound figure options, missing admission closure, and stale reference drafts/requests/products surviving redo; Candidate/UNKNOWN must reject without writes and unmodified source evidence/essay/scoring content must survive. | yes, via `verify-nck1-answer-source-shapes.mjs` |
| `verify-source-reference-scoring-v4.mjs` | p03 标题/段落及 p04 续段的评分图在 compile → capture → admission → answerOnly 分页/PDF 丢失或乱序；伪造区域、重复 ID、越界归属、图片预算漏算，以及旧 v3 bytes/SHA 漂移。表→图的 v4 序列可表达和渲染，但现有 confirmation v3 的 consumed-anchor 拒绝必须保留（方案 A 不在本次范围）。 | yes |

既有 `verify-review-publication-content.mjs` 增加 `--v4-scoring-figures`
子场景：独立捕获“已审评分 PNG/crop/order 被替换或删除”、冻结 sidecar 承诺失效，
并验证所有学生产品不含答案图；发布读取只消费冻结 PNG，不重新裁源 PDF。

讲解图声明可在 `ocr-proofread.mjs exclude-explanation-figure <paperId>` 后重复
`--figure <id> --figure-sha256 <digest> --anchor <itemId> --reason <原页理由>`，
每组绑定各自的图，共用一次 `--agent-confirmed`。完整集合通过 producer/admission
后才原子安装 draft；单图声明仍须满足整卷图像闭合，不能依靠未验证的中间 draft 累积。

This directory contains many cut-specific verify scripts. Prefer the
smallest script that proves the current risk. Do not run every script
just to create confidence theater.

Three local entrypoints share `scripts/verify-ci.mjs`:

- `pnpm -C app verify:changed` selects the smallest pack from the diff;
- `pnpm -C app verify:import-paper` exercises one paper's import/admission/surface/recovery seams;
- `pnpm -C app verify:paper` exercises shared Canonical Paper/Print seams;
- `pnpm -C app verify:all` is the release/fallback suite used by CI.

Owner decision (2026-09-17): the personal “过生词” feature is frozen. Its 13
dedicated vocabulary verifiers are manual-only, excluded from Full and all
daily packs. Their files and functionality remain; run a specific check with
`node scripts/verify-vocabulary-rendered-behavior.mjs` (or another vocabulary
script below) when needed. Shared build/typecheck, auth/user isolation and the
six independent Actions E2Es remain required. This trades automatic detection
of vocabulary-only regressions for lower daily CI cost.

Two corpus-dependent audits are also manual-only, outside Full and every daily
pack. Their former exit-2 SKIPs supplied no coverage on clean CI checkouts:

- `verify-i16a-teaching-dimension-search.mjs` requires the original local
  `app/public/paper-assets/paper-960d0f8d/versions/v1/` paper asset and analysis
  sidecars. The entire `versions/` directory is gitignored; CI does not restore
  it. With those original files present, run
  `node scripts/verify-i16a-teaching-dimension-search.mjs`. This retains the
  independent four-type extractor/index/query/cache audit against that real
  paper; no replacement CI coverage is claimed.
- `verify-list-groups-perf.mjs` requires a populated real question-bank database
  and its matching local served paper assets. Run
  `QUESTION_BANK_DB=/absolute/path/to/question-bank.sqlite node scripts/verify-list-groups-perf.mjs`
  from the checkout containing those assets. It opens the DB read-only and
  retains whole-corpus batch/single judgment parity, list-card N+1 source
  guards, and the 1500ms batch ceiling. `init-db.sh` only creates the
  nine-passage V0 development seed; it cannot substitute for this corpus-scale
  audit. Existing daily print-ready and draft batching checks remain, but do
  not prove the real corpus's parity or timing.

Missing inputs still return exit code 2 (`SKIP`), never `PASS`. Restore the
original inputs before relying on either manual audit's result.

Verifier scripts use bounded parallel execution. The default is half the
available CPU count, capped at 8 jobs (8 jobs on the 16-core Orb). Browser,
Chromium, Vivliostyle, and LibreOffice checks share one render lane; each fixed
port has its own collision lock; official-evidence checks run exclusively.
Each job spools output privately and the runner prints those logs in registry
order, while still collecting all PASS/SKIP/FAIL results. Use `--jobs 1` or
`VERIFY_CONCURRENCY=1` for exact serial fallback; use `--jobs N` to override
the bounded default.

Actions partitions the selected pack across its two existing, independent
runner workspaces with `--lane verify` and `--lane e2e`. The latter owns six
whole render-heavy scripts (NCK1 publish, image-source bundle, legacy opaque
writing, seven-choices and application-writing surfaces, and figure rendering)
in addition to its six
unchanged E2E steps. The lanes are disjoint and together execute exactly the
selected pack. Both use the same immutable-event, trusted-base selection;
both must succeed. A failed E2E does not suppress the transferred pack lane.
Each nonempty lane retains build/typecheck and its own resource locks. For a
reduced pack with no transferred scripts, `e2e` runs only its original six
seams: it skips the extra system packages and empty-lane build. The actual
lane plan supplies this decision, not a duplicate pack-to-resource map.
No local command uses a lane by default: `verify:all` still runs the entire registry.
Inspect either partition with `--plan-json --pack all --lane verify` (or `e2e`).

This reuses existing runners rather than raising same-workspace browser
concurrency. The initial four-script split's natural PR #472 run
[35241038654](https://github.com/Buqisir/english-question-bank/actions/runs/35241038654)
measured 21m08s for `verify` and 15m40s for `e2e`. Moving the whole seven-choices
(87.688s) and figure-render (78.816s) checks balances that observed gap. Fixed
duration arithmetic projects roughly 18m22s/18m27s, not a measured speedup;
subsequent natural runs must include installation, builds and all six E2Es.
Full still covers 170 scripts, partitioned 164/6 without omissions or duplicates.
OCR fixture generation alone measured 16.6s locally, so removing that setup
would not eliminate the full OCR verifier's cost. No OCR validation or real
surface assertions are removed in this change. Historical checks and weak
assertions remain separate work; cheap checks are not deleted for their use
of regex.

Every registered row below is its one-line named failure: the distinct fault
the verifier catches or the independent layer it supplies. A verifier without
such a row is not registrable. `--list-json` shows the registry and packs;
`--plan-json --changed-file <path>` explains routing without running tests.
Install app dependencies with `pnpm install --frozen-lockfile` from `app/` and
server dependencies with `npm ci` from `server/` before a clean release run.

### SQLite verification authority

`init-db.sh` creates the nine-passage V0 development seed, not a mirror of the
tracked served corpus. Daily `verify-similar-v2`, `verify-paper-assets-consistency`
and `verify-genre-truth` therefore use isolated SQLite regressions built with
`data/sql/schema.sql`; the latter two also check the real tracked assets/artifact.
They neither replace nor migrate an existing database. A daily PASS is not a
deployment inventory audit or proof that reviewed genres were applied to a DB.

Explicit corpus audits are read-only and fail closed on missing inputs:

```bash
node scripts/verify-similar-v2.mjs --db /path/to/question-bank.sqlite
node scripts/verify-paper-assets-consistency.mjs --db /path/to/question-bank.sqlite --paper-assets /path/to/paper-assets
node scripts/verify-genre-truth.mjs --db /path/to/question-bank.sqlite
```

Assets retains strict bidirectional DB/disk checks without an allowlist. Genre
requires every historical decision row and its applied value, permits newer
passages outside the reviewed batch, and rejects old question-type genre values
across the entire DB. Similar uses the actual schema CHECK (including self-made
and other sources), with behavioral tests that only `real_exam` earns the boost.
The historical two-value source sample and 273-row whole-DB equality are not
current domain contracts. The V0 seed still fails a complete-corpus assets/genre
audit; do not remove or populate it merely to manufacture a green audit.

The one-time Tencent maintenance-controller cutover uses the exact merged
`deploy/inspect-eqb-maintenance-host.sh` as a standalone root/TAT, read-only
pre-install probe. It emits one strict target/payload-bound marker and is rerun
by `deploy/install-eqb-maintenance-controller.sh` on the installer's inherited
production lock after six-file commit verification, immediately before lock
normalization, backup, or installed-controller mutation. The repository-owned
`scripts/lib/tencentTat.mjs` adapter signs one direct Tencent API request,
polls its exact invocation/task, and requires complete output plus the remote
exit code; an ambiguous `RunCommand` is never retried automatically. This
deliberately avoids requiring the old static
forced controller to expose a command that does not exist until after
installation; operational steps and authorization boundaries remain in the
launch/deploy runbook.

## Vocabulary audio Owner QA

Run `node scripts/vocabulary/serve-audio-owner-qa.mjs --port 5417` to open the
local 1600-word listening pass against the frozen formal audio assets. The tool
binds only to `127.0.0.1`, stores progress in
`.scratch/vocabulary-audio-owner-qa-state.json`, and exports the full decision
ledger plus the problem-word list. It never overwrites formal MP3 assets or the
audio manifest.

Displayed IPA is supplied by the versioned General American overlay at
`data/vocabulary/wanwei-american-phonetics-v1.json`; the source-book British
IPA remains unchanged in the shared database and source ledger. Rebuild the
overlay from the pinned official CMUdict and `ipa-dict` alignment file with
`node scripts/vocabulary/build-wanwei-american-phonetics.mjs --dictionary /absolute/path/to/ipa-dict-en_US.txt --cmudict /absolute/path/to/cmudict.dict`.

After a completed first pass, build the frozen repair batch with
`node scripts/vocabulary/build-audio-repair-batch.mjs`. Generate the four
non-formal candidates per failed word with `generate-qwen-audio-repair.py`
from an `mlx-audio==0.4.7` environment, using the pinned Base model cache and
the approved voice profile. Then run
`node scripts/vocabulary/serve-audio-repair-qa.mjs --port 5418` for the
original/A-D comparison pass. Its batch, candidates, and state all live under
`.scratch/vocabulary-audio-repair-v1/`; neither pass changes formal MP3 assets
until the owner has selected the replacements.

High-risk PRs retain their required review, Full verification, and E2E. The sole
target CI authority is the native GitHub Actions `verify` and `e2e` pair from
`.github/workflows/verify.yml`, bound to the current natural PR/main run and its
latest successful attempt. Base-classified PR packs (Full for shared/high/unknown)
and six browser E2E seams run on separate hosted runners; main always runs Full.
Normal Ship registers a read-only native Actions notification to its own thread,
then rechecks GitHub directly, without a CI-host handoff or private receipt lookup.
Deployment validates the exact-main natural
workflow and both jobs, failing closed for missing, pending, failed, wrong-SHA,
wrong-workflow or ambiguous evidence. See ADR-0026 and
`docs/agents/github-actions-cutover.md`; this README does not claim the live
branch-protection cutover is complete. Current deployment follows
[AGENTS.md — Owner Mac deployment](../AGENTS.md#owner-mac-deployment) and
[ADR-0027](../docs/adr/0027-owner-local-website-deployment.md). Retained Amp-specific
verifiers test historical libraries and do not require a live Orb controller.

## Stable CI entrypoint

| Script | Scope | Runs in CI? |
| --- | --- | --- |
| `verify-ci.mjs` | Selects changed/Paper/all packs, runs bounded resource-aware parallel jobs with registry-ordered logs, and reports PASS/SKIP/FAIL without hiding later failures | yes |
| `verify-ci-pr-plan.mjs` | Rejects unsafe PR reduction for protected/shared/persistence paths, malformed identities, candidate-controlled policy, renamed/deleted files, and classifier failure; proves exact test-merge and existing-pack selection | yes |
| `verify-ship-check-watcher.mjs` | Rejects duplicate or false-positive registration, stale-head or wrong-target notification, missing failure summaries, duplicate claims, and cancelled-startup overwrites without calling GitHub or messaging a real thread | yes |
| `verify-amp-orb-ci.mjs` | Rejects non-natural or HMAC-invalid deliveries, delivery/merge drift, candidate-secret exposure, duplicate execution, receipt/Check create-PATCH ambiguity, failed lane aggregation, or diagnostic authority without registering a webhook or calling GitHub | yes |
| `verify-amp-orb-ci-coordination.mjs` | Retired control plane, manual only: serialized eligibility/wake compatibility against fake private state; run `node scripts/verify-amp-orb-ci-coordination.mjs` when changing those historical contracts. Current Actions coverage lives in ci-pr-plan, verification-scheduler and ship-check-watcher | no (manual) |
| `verify-amp-orb-deploy.mjs` | Proves the deployment CLI/controller contract without production access: clean exact-main resolution, native Actions evidence and fail-closed revalidation, code-only versus reviewed-persistence classification, atomic release switch, shared-data isolation, and healthy rollback; retained App Check/bootstrap cases cover historical contracts | yes |
| `verify-verification-command-runner.mjs` | Prevents completed or concurrently interrupted verifiers from leaving their own Vite/Chromium/test descendants alive, and bounds oversized single-line diagnostics while retaining their head, tail, and digest | yes |
| `verify-verification-scheduler.mjs` | Proves exact disjoint lane coverage for every pack, invalid-lane rejection, bounded concurrency, render/port resource locks, exclusive barriers, ordered result flushing, collect-all statuses, abort stop-dispatch, and jobs=1 serial fallback | yes |
| `verify-vocabulary-closed-loop.mjs` | Validates the 1600-entry Wanwei source/content/unique Koboyo visual, formal American and Owner-approved Cori British audio contracts, plus isolated progress, frozen-set, share/revoke, and temporary-scope persistence | no (manual) |
| `verify-vocabulary-dictation-review.mjs` | Verifies frozen multi-set dictation tasks, global share isolation, teacher-confirmed result editing/voiding, pending/stubborn/improved derivation, manual flags, suggestions, library search/statistics, and user/student isolation | no (manual) |
| `verify-vocabulary-meaning-recall.mjs` | Verifies frozen multi-set meaning-recall records, same-day evidence collapse, cross-day repeated/recovered derivation, dictation-correct contribution without fabricated meaning errors, task linkage, suggestions, and user/student isolation | no (manual) |
| `verify-gaokao-vocabulary-source.mjs` | Rejects any 高考课标 3000 source ledger whose exact entry count, frequency order, stage/day/week/group partition, or source receipt contract has drifted | no (manual) |
| `verify-gaokao-vocabulary-golden-content.mjs` | Rejects an incomplete or unreviewed 90-entry golden content slice, duplicate examples, or learning content that leaves its independently reviewed source contract | no (manual) |
| `verify-gaokao-vocabulary-golden-visuals.mjs` | Rejects missing, reused, hash-drifted, or inaccessible Koboyo SVGs and visuals without Chinese alternative text in the 90-entry golden slice | no (manual) |
| `verify-gaokao-vocabulary-golden-audio.mjs` | Rejects missing, hash-drifted, wrong-codec, or incomplete American/British MP3 pairs for any entry in the 90-entry golden slice | no (manual) |
| `verify-gaokao-vocabulary-full-audio.mjs` | Rejects any full-course Google Neural2 audio set whose 3000 American C or 3000 British D entries drift from source order, approved spoken text, selected voice, hashes, MP3 format, duration, level, or silence bounds | no (manual) |
| `verify-gaokao-vocabulary-full-audio-qa.mjs` | Rejects a full 3000-word Owner QA page with missing dual-audio assets, duplicate entries, broken per-accent verdicts, or missing resume/search/export and keyboard contracts | no (manual) |
| `verify-gaokao-vocabulary-golden-import.mjs` | Rejects a golden import that weakens the 3000-entry authority gate, accepts source-meaning drift, publishes by default, or damages coexistence with an existing vocabulary course | no (manual) |
| `vocabulary/build-wanwei-american-phonetics.mjs` | Rebuilds the pinned 1600-entry learner-facing General American IPA overlay without rewriting source-book evidence | no |
| `vocabulary/build-wanwei-audio-golden-set.mjs` | Builds the fixed 56-word isolated-pronunciation gate from reviewed Wanwei content | no |
| `vocabulary/generate-qwen-audio.py` | Generates resumable local Qwen3-TTS Base MP3 assets from the approved synthetic British teacher reference, with model/reference hash checks and a manifest receipt | no |
| `vocabulary/build-audio-repair-batch.mjs` | Freezes the 70 first-pass Owner-QA failures into an ordered repair batch without changing formal MP3 assets | no |
| `vocabulary/generate-qwen-audio-repair.py` | Generates four cue-protected Qwen repair candidates per failed word under `.scratch/`; formal MP3 assets remain unchanged | no |
| `vocabulary/serve-audio-repair-qa.mjs` | Serves the isolated 70-word original/A-D comparison QA and saves second-pass progress separately from first-pass QA | no |
| `verify-vocabulary-migration.mjs` | Replays the legacy vocabulary-entry constraint migration and proves successful row/index/FK preservation plus full rollback and FK restoration on a rejected legacy row | no (manual) |
| `verify-vocabulary-match-game.mjs` | Verifies the pure 10-word round builder and flip/mismatch/confirmation/match state machine for the frozen-set matching game | no (manual) |
| `verify-vocabulary-rendered-behavior.mjs` | Uses real Chromium to verify one-audio playback timing/cancellation/retry/end behavior, matching-game interaction, vocabulary cards, dictation/answer/handwriting PDFs, download filenames, and the hidden-answer auto-dictation flow | no (manual) |
| `verify-ops-mcp.mjs` | EQB read-only Ops MCP: Cloudflare Access JWT fail-closed auth, four read-only tools, runningCommit proof vs checkout HEAD, health field filtering, log redaction/omission, recent_errors 500/timeout, query limits, loopback bind, install destinations not Caddy/eqb.service, cloudflared version/token permissions, Access extra-policy fail-closed, missing ChatGPT callback zero Cloudflare writes | yes |
| `verify-architecture-housekeeping.mjs` | Prevents missing CI entrypoints, undocumented verifier registration, Chromium dependency drift, and changed-risk routing regressions | yes |
| `verify-motion-tokens.mjs` | motion-pass gate: `app/src/**/*.css` (excluding PaperSurface.css contract file) has no `ease-in`, no `transition: all`, and no bare hand-written transition/animation durations outside `token-exempt`-tagged loading or signature moments | yes |
| `verify-lecture-panel-css.mjs` | lecture-css-restore gate: 讲评五解析面板 (pi-ps-analysis/cloze/gf/seven/writing) 活 TSX 用到的每个类必须有 CSS 定义或在 hook-only 白名单（含白名单防陈旧 + paperBrowsePage.css @import 加载链断言）——retire 刀样式陪葬事故的可执行形态 | yes |
| `verify-radius-family.mjs` | design-canon-v2 gate: every `border-radius` in `app/src/**/*.css` is in the DESIGN.md radius ladder {0, 4, 6, 8, 999px, 50%}; 32 historical off-family literals grandfathered per file×value as a shrink-only ratchet | yes |
| `verify-no-ui-emoji.mjs` | design-canon UI icon gate: `app/src` interface source contains no hard-coded Emoji/Dingbat pictographs used as icons, and DESIGN.md retains The No-Emoji-Icon Rule; imported paper/user content remains outside this source-level gate | yes |
| `verify-h1-router-skeleton.mjs` | H1-A minimal route registry contract | yes |
| `verify-h1d-analysis-availability.mjs` | H1-D PaperSurface analysis availability owner contract | yes |
| `verify-i0e-seven-choices-entry.mjs` | I0-E 七选五 PaperSurface entry availability and label gate | yes |
| `verify-h1e-export-routes.mjs` | H1-E export route dispatch contract | yes |
| `verify-h5a-export-implementation.mjs` | H5-A export implementation extraction contract | yes |
| `verify-h5c-json-extraction.mjs` | H5-C AI-completion JSON / verify-verdict extraction leaf contract | yes |
| `verify-h5d-completion-runner.mjs` | H5-D AI-completion transport: provider routing + retry + thinking-mode fallback + flash-default + re-import guard (stub fetch) | yes |
| `verify-h5e-verify-question-group.mjs` | H5-E verify-question-group service: invocation smoke + audit-JSONL shape + re-import guard | yes |
| `verify-h5j-reading-difficulty.mjs` | H5-J reading-difficulty normalizer: golden T-card override matrix + six-dimension scoring/floor + surfaceQuestion correction + invocation smoke + file-private/seam guard (no provider) | yes |
| `verify-h5h-semantic-search.mjs` | H5-H semantic-search recall + rerank service: invocation smoke (prefilter→score→rerank→matches envelope byte-identical for fixed inputs, stub DeepSeek + fixture DB) + reading-signals SQL fold + empty-DB short-circuit + rerank-prompt-not-over-indented + extraction seam + used-but-undefined/file-private guards | yes |
| `verify-h5i-steward-service.mjs` | H5-I question-bank steward service: invocation smoke (stub semanticSearchQuestionGroups + callDeepSeekWithFallback) asserting plan/filter/message envelope byte-identical for fixed NL inputs (clarification + skill-inference filter matrix + plan-only) + steward-prompt-not-over-indented + extraction seam (semanticSearch injected, no cycle) + used-but-undefined/file-private guards | yes |
| `verify-h5k-synonym-difficulty.mjs` | H5-K synonym-difficulty local-Qwen classifier: invocation smoke (stub callLocalQwenCompletion + fixed fake reading question-group) asserting per-group envelope + cardId white-list enforcement (invalid-card-replaced + retry-once) + deepseek/review trigger composition + knowledgeVersion/latency keys; gate-OFF exact-throw path; REAL knowledge file -> formatSynonymDifficultyKnowledgeForReadingPrompt stable (always-on reading path) + per-question-prompt-at-indent-0 (byte-sensitive Chinese template) + factory/6-named-export surface + used-but-undefined/file-private/no-cycle guards | yes |
| `verify-h5l-question-group-parse.mjs` | H5-L question-group parse owners (4 DeepSeek per-type owners: reading/cloze/grammar-fill/seven-choices): invocation smoke (stub callDeepSeekWithFallback + fixed fake per-type question-group detail) driving all 4 parse*ByQuestionGroup owners and asserting each envelope (persisted payload_json shape: questionGroupId/title/questionCount/parsedCount/matchedCount/unmatchedQuestionNos/keySource/keyMask/requestId/model/thinkingMode/provider/totalLatencyMs/questions) byte-stable; wrong-group-type + missing-key exact-throw paths; same-name 4-prompt inject + byte-sensitive inline Chinese template at column 0 (no factory re-indent); factory/4-owner return surface + 8 file-private helpers; used-but-undefined/no-cycle guards; api.mjs import+inject integration | yes |
| `verify-h1g-question-group-routes.mjs` | H1-G question-group route dispatch contract | yes |
| `verify-h10a-paper-set-routes.mjs` | H10-A paper-set CRUD + paper-workflow route dispatch contract (status codes, create-vs-merge, no-shadow) | yes |
| `verify-h10b-ai-proxy-routes.mjs` | H10-B PR2 AI-proxy route owners (semantic-search/steward/verify-question-group): defineRoute surface + exact context.fn call args + 200 envelope pass-through + verify-question-group x-verify-request-id contract (result.requestId on success / minted id on 500) + {error,requestId} + serverContext-exposure/no-cycle guards | yes |
| `verify-h11a-http-client.mjs` | Runtime same-origin addressing across loopback/remote/SSR, header decoding and server-error/fallback behavior; no source-shape or historical alias constraints | yes |
| `verify-h12a-entry-modal.mjs` | H12-A EntryModal `addEntryQuestion` duplicate-`questionNo` guard: source — `EntryModal.tsx` imports + calls the extracted pure `nextQuestionNumber(form.questions)` helper (no `form.questions.length + 1` residue in code anywhere under app/src; `removeEntryQuestion` still does not renumber so `max+1` is load-bearing); behavioral — the exact repro `["1","2","3"]` → delete middle → `["1","3"]` → next number is `"4"` not the colliding `"3"` (the bug), exhaustive non-collision sweep over every non-last deletion from sequential 2..8 groups, boundary/gap/multi-digit/large/empty/non-integer/whitespace/decimal/already-corrupted cases, structural-type acceptance of the broader `EntryQuestionForm` shape through the public seam, `handleEntrySubmit` `stem`-filter persistence gate pinned | yes |
| `verify-restart1-local-search-intent.mjs` | Restart cut ① local search: tokenize() CJK bigram production, parseLocalIntent() year/section/groupType/region extraction, weighted ranking (topic label > section/place > generic fields, year DESC tiebreak), hard-filter dimensions, non-regression on plain-English/empty queries | yes |
| `verify-restart3-teacher-analysis.mjs` | Restart cut ③ teacher-version real analysis (paper-assets join): print-renderer isMetaStub() hides the publisher.mjs metadata stub note (source + behavioral); analysisText.mjs four-family degrader (reading/cloze/grammar-fill/seven-choices) against real tracked paper-zj-2026-jan fixtures, writing excluded; graceful no-throw on missing-analysis paper (paper-2024-jia) and unmatched groupId; findPaperAssetGroup additive paperId field + existing call-site regression; draftPaperStore teacher-only wiring + never-overwrite-existing-explanation + no-DB-write guard | yes |
| `verify-home-default-feed.mjs` | Cut ⑥ home-default-feed: buildDefaultFeed (year DESC + paperName tiebreak sort, reuses aggregatePaperResults bucketing, empty-corpus no-throw, real_exam + mock_exam both included); ConciergeDesk feed render gate (empty + true-vacuum only, not loading/results/clarification/error), 8-paper cap + "显示全部 N 套卷" expander, empty-corpus import-guidance copy, feed rows reuse ConciergePaperRow wiring unchanged; STARTER_CHIPS retired for the structured filter row (cut ai-mode-filter-chips C7) with submit(intentOverride) path preserved + submit keeps query after firing (P1 same-face fix; triggerSimilar retired by similar-entrypoints E3 — 配相似 is now a plain deep-link, not a hook action); `.eyebrow` re-scoped off slate inside `.home-mode-ai` only, `:root` untouched | yes |
| `verify-concierge-filters.mjs` | Cut ai-mode-filter-chips: `filters.ts` pure functions — buildFilterOptions (four dimensions/fixed business order for groupType+sourceType/year DESC/region by count DESC, correct counts), applyConciergeFilters (single-dimension, multi-dimension AND, empty filters = full corpus unchanged, impossible AND = `[]` with no throw/no fallback), composition with buildDefaultFeed (filtered feed only matching papers, sort order preserved) | yes |
| `verify-genre-truth.mjs` | Historical 273-decision artifact: uniqueness, controlled genre/confidence/rationale and tracked-passage coverage; publisher no-overwrite/NULL-insert guards; real-schema SQLite positive/negative coverage, applied-value and all-row stale-genre regressions. Explicit `--db` requires the reviewed batch as a subset and checks applied values plus all-row residue, without treating newer passages as reviewed. See SQLite verification authority above. | yes |
| `verify-generated-docx-disconnected.mjs` | Ticket 16：公共 UI/客户端/路由无生成 DOCX 与旧 DOCX 转 PDF；真实 API 断言三条退休路由 404，并验证学生/教师 `/print-pdf` 直接返回 Chromium PDF 且不写输出文件 | yes |
| `verify-generated-docx-output-deleted.mjs` | Ticket 17：生成 DOCX renderer、OOXML 打包、输出侧 LibreOffice、DOCX Consumer Contracts 与 compatibility exports 已删除；live canonical consumers/authority schema 只保留 Screen 和 Print/PDF | yes |
| `verify-file-save-as.mjs` | 所有本地下载入口共享“下载 / 另存为…”协议；浏览器实测文件选择器写入、批量文件夹写入、取消不下载、不支持时回退普通下载，并钉住草稿卷/个人空间/生词/听写/卷面导出的另存为入口 | yes |
| `verify-detail-redesign.mjs` | detail-page-redesign (2026-07-15 owner approved spec, 原型 `?detailVariant=paper-peek` 实点通过): source assertions — `QuestionGroupDetailView.tsx` 零 `AnalysisDisclosure` 挂载（负空间①结构性保证）；唯一 `PaperSurface` 挂载钉死只读形态（`lectureFocus={null}` + no-op `onFocusIntent` + `mode="lecture"`）；原型三件（`DetailPaperPeekPrototype.tsx`/`detailPaperPeek.css`/`?detailVariant=` 接线）app/src 下代码零残留（历史说明性注释豁免）；语法填空 facetKey→registry 全命中（对真实 paper-960d0f8d 的 `grammar-fill-analysis-v1.json`，schemaVersion `grammar-fill-analysis-v2`，复用 D1 registry 完备性）；阅读 chips 走 questionType 真值计数 + 缺失「未标注」分支（无 parse 结果时 0 chips，不造假占位）；完形/七选五 chips 一期只显示题数 | yes |
| `verify-reading-analysis-retire.mjs` | Also rejects any `groupChrome` reference in the live PaperSurface (merged solo-surface guard); reading-analysis-retire (2026-07-16): 孤儿支退役证——`features/reading-analysis/` 整目录 + `paper-intelligence/` 内 14 个孤儿文件 + `adapter/`/`evidence/` 目录 + 两个 route 文件 + `app/public/reports/paper-intelligence/` 静态镜像全部不存在；`App.tsx`/`main.tsx` 源码零 `paper-intelligence` 路由挂载分支；存活面（`PaperBrowsePage.tsx` 仍 import `paperIntelligence.css` + evidence 动线两文件、7 个活 `*Adapter.ts` 的 `PaperSurfaceData` import 指向新落点 `paperIntelligenceTypes.ts`，tsc 全量证实际可解析）；`main.tsx` 静态自愈改写断言（行为证据见同刀 DP-2） | yes |
| `verify-r2-trap-audit.mjs` | r2-trap-audit (2026-07-16): 干扰项机审+摘牌——`trap-audit-lib.mjs`（scan/apply 共用判据）对全库 33 卷 `latest/analyses/reading-choice-analysis-v1.json` 的 1395 条 trap 实时重扫，逐条与已提交 `docs/cuts/r2-trap-audit/scan-findings.json` 比对（复算一致）+ 报告总数比对；自动摘牌批（rogueType/labelExplanationContradiction/structuralIncompleteness）在真实语料上逐条核 suspension.level/reason 合法且与 finding 一致，evidenceFieldLeak 桶确未被摘牌；零 rogueType 漏摘（`primaryType` 本身从不改写）；`versions/` 零触碰；`buildPaperAssetSurfaceModel`（真模块，自建 fixture）badge/row/控制组三态行为断言 + 对真实语料里唯一 rogueType/badge 记录（`paper-2023-i` q-2023-i-025/B）二次实证；`loadGroupAnalysisTexts`（真模块，临时磁盘 fixture）row 摘项排除、badge/未摘项照留 | yes |

## Core data and import

| Script | Scope | Runs in CI? |
| --- | --- | --- |
| `import-pipeline/analyzed-package.mjs` | Offline producer/worker entrypoint: `validate` runs strict archive/content/Canonical/analysis replay; `export` requires one exact sealed Review revision and emits/rechecks normalized directory or ZIP; `kit` snapshots the real prompt/schema/style/taxonomy/type contracts. No OCR/AI fallback | no |
| `verify-paper-asset-v1.mjs` | `paper-asset-v1` fixture and source-faithfulness contract | yes |
| `verify-paper-canonical-foundation.mjs` | Canonical Foundation A: digest-closed authority, immutable Source Capture and exact ledger, complete-only compiler/Plan/Group envelope, rich-content, projection, and all four blocked dispositions | yes |
| `verify-paper-canonical-publication.mjs` | Canonical Foundation A: immutable Publication seal/load, byte-pinned historical v13 reload through the real filesystem store and Consumption loader, whole-family Consumer Contract selection, corruption closure, retry identity, and pre/post-commit recovery | yes |
| `verify-paper-canonical-import-admission.mjs` | Ticket 18 public new-import latch: compile-first canonical-only admission, four blocked dispositions with byte-identical store state, in-memory/staged/committed Consumer Contract validation, and exact reload | yes |
| `verify-paper-canonical-registered-confirmation-admission.mjs` | Rejects unregistered or proof-mutated historical confirmation authorities before publication and proves v41/v42/v37 recovery remains atomic | yes |
| `verify-paper-canonical-import-recovery.mjs` | Ticket 19 public canonical import recovery: byte-exact pre-commit restoration, committed-target restart recovery, idempotent retry, digest-identity conflict rejection, strict stale/corrupt load failure, and validated whole-Publication rollback without legacy or generated-DOCX fallback | yes |
| `verify-universal-nck1-publish.mjs` | Universal NCK1 analysis and Seven Choices role closure: nine staged analysis bytes bind immutable Review and five authenticated sidecars; incomplete/question/blank/answer/role joins fail closed; source-bound title/body roles remain identical across Review, publication, Screen, Student/Teacher Print HTML, and Chromium PDF; shared DB/version/latest/Canonical commit rolls back and recovers without mixed assets | yes |
| `verify-promotion-worker.mjs` | Independent bounded promotion supervisor/executor: durable receipts, cache invalidation, exact replay, host-slot exclusion, same-lease retained native-group admission, and named independent exit/forged/truncated/out-of-order/native deadline/RSS/OOM failures with exact durable reasons and process-group death before cleanup | yes |
| `verify-paper-header-title.mjs` | Subject-free first-page title: suffix/bracket/adjacent-grade rules and lexical counterexamples; opt-in only via import config; Publication `paperHeader` binding rejects invalid, digest-recomputed or compatibility-asset injected titles; historical papers keep their title | yes |
| `verify-nck1-analyzed-package-candidate.mjs` | Trusted NCK1 analyzed-package import: candidate keeps its historical authority distinct from the current raw-materialization authority; analysis-member changes invalidate confirmation; unrelated JSON pointers and fake MP3 bytes are rejected | yes |
| `verify-scoped-publication.mjs` | Rejects missing Owner grants, cross-paper capabilities, expired/revoked or replaced approvals, concurrent revoke/redeem overwrites, lost-response renewal and implicit publication retries; preserves exact v2/v3 public identity and reloadable two-step confirmation | yes |
| `verify-listening-audio-intake.mjs` | Rejects undecodable MP3, reversed-conversation false matches (including digest-valid old receipts), missing ASR, unsafe review, and changed audio bytes; synthetic fixtures do not measure real ASR accuracy | yes |
| `verify-listening-signal.mjs` | Exercises real signal-only encode/decode and segmentation CLI; catches missed short repeats, substituted audio false matches, nondeterministic warning bindings, invalid segment bounds, changed playback bytes, and stale or wrongly retired staging blockers; preserves raw diagnostics and unverified candidate status without ASR or semantic approval | yes |
| `verify-listening-audio-serving.mjs` | Exercises real HTTP 200/206/416 and HEAD, byte bounds, private-artifact denial, traversal/symlink containment, and historical JSON fallback; API authentication is independently covered by `verify-auth-gate.mjs` | yes |
| `verify-published-products-storage.mjs` | Rejects unbound or missing four-product storage/source references, invalid actual PDF pages, corruption and ambiguous CAS writes; proves disposable Review/publication, exact SHA/length readback, and export GET/HEAD parity without remote R2 | yes |
| `verify-companion-analysis-export.mjs` | Rejects companion-analysis export drift in authoritative answer joins, two-column A4 publisher layout, complete Reading distractor explanations, source translations, selected long-sentence analysis, sparse exact-source underlines, and student-facing omission of internal metadata or workflow prose | yes |
| `verify-nck1-docx-materialization-producer.mjs` | Rejects NCK1 DOCX parsing drift across nine groups, 45 source-backed answers including glued labels, one-to-one paragraph locators, semantic tables, fail-closed exceptions, and digest-bound non-overwriting resume | yes |
| `verify-nck1-pdf-materialization-producer.mjs` | Runs a synthetic text-layer question/answer PDF pair through the public Universal CLI; proves nine groups, 45 source-backed answers, replayable page regions, one border-confirmed semantic table, answer-explanation exclusion, and fail-closed image-only, incomplete, embedded-raster, multi-column, overlap, unbordered side-by-side, and ambiguous source shapes | yes |
| `verify-nck1-answer-source-shapes.mjs` | Proves DOCX/PDF detailed answers, key-only answers, and one-file question-plus-answer sources converge on the same 45 authoritative values; excludes source explanations/model essays and rejects missing, duplicate, or ambiguous answer boundaries through Candidate preview and the Universal CLI | yes |
| `materialization-paragraph-joins.test.mjs` | Catches cross-page paragraph joins accepting stale or forged digest-bound plans, nonadjacent or wrongly owned fragments, altered OCR text/observations or visuals; preserves sealed inputs, legacy closed schemas and v8 writing/presentation support | yes, via `verify-nck1-answer-source-shapes.mjs` |
| `materialization-paragraph-joins-redo.test.mjs` | Catches paragraph-join redo losing sealed OCR/producer receipts or archives, stale/Candidate guards writing before rejection, and old authored summary parts or metadata surviving unchanged IDs and being rebound to new digests; real request/split/finish must stop for fresh summaries while ordinary redo retains reuse | yes, via `verify-nck1-answer-source-shapes.mjs` |
| `materialization-paragraph-joins-public.test.mjs` | Catches public scanned-PDF import/compile/live admission losing original inline IDs/emphasis or either source fragment, accepting tampered joins, or admitting the relation through an older authority | yes, via `verify-nck1-ocr-source-evidence.mjs` |
| `verify-nck1-reading-figure-options.mjs` | Rejects missing, duplicate, mixed-mode and altered Reading A–D images through Canonical/Review, Screen, mobile scrolling and Student/Teacher Print/PDF; optional `EQB_SHENZHEN_QUESTION_PDF` replays original Q33 images and rejects wrong source/crop/order and fabricated label measurements, without claiming full-paper import | yes |
| `verify-nck1-ocr-source-evidence.mjs` | Runs a synthetic scanned-PDF question/answer pair through immutable page-raster evidence, fixed OCR observations, explicit confirmation, the shared ordered-item parser, and the public stage/confirm/materialize CLI; rejects low confidence, ambiguous order, missing pages, unclassified visuals, raster drift, and stale confirmation | yes |
| `nck1ListeningBroadcast.test.mjs` | Catches wrapped listening section broadcasts being misread as dialogue, standalone 英语试卷 analysis titles leaking into Text 10, and unproven independent tail paragraphs being published as speech; requires exact ordered markers and whole-paragraph titles, preserves answer sources, and keeps ambiguous tails for author review | yes |
| `nck1FigureOptions.test.mjs` | Catches labelled A–D figure options failing to bind, and stem/option boundary errors that drop stem continuation lines or merge unspaced option labels into the stem; incomplete structures keep their ambiguity | yes |
| `derive-option-figures.test.mjs` | Catches derived option crops staying on unsupported v2, overlapping or missing crops, and crop derivation clearing unresolved stem/option ambiguity | yes |
| `ocr-semantic-tables.test.mjs` | Catches semantic table regions failing containment by a few pixels, while rejecting fits beyond 5px or fits that use words bound to other tables | yes |
| `verify-universal-nck1-image-source-bundle.mjs` | Runs an anonymous ordered PNG/JPEG/WebP question-and-answer bundle through exact page replay, OCR confirmation, nine-group/45-answer Materialization, Canonical build, real Screen, Student/Teacher Print and PDF; rejects page gaps, duplicates, unsupported media and digest drift | yes |
| `verify-universal-nck1-source-only-intake.mjs` | Captures synthetic question-only DOCX, PDF and ordered image pages into digest-closed gitignored records; proves original bytes, page order and source metadata replay without answer or Canonical fields | yes |
| `verify-universal-nck1-source-only-boundaries.mjs` | Proves awaiting-answer records cannot materialize, build, upload to Review or publish; rejects question drift, mismatched binding and duplicate attachment, then creates a new complete PDF/image source set without rewriting the old capture | yes |
| `verify-paragraph-summaries-v1.mjs` | Rejects stale bindings, foreign/misassociated/duplicate/missing paragraph summaries, ambiguous continuation material, blank summary text, and listening-supplement reuse while preserving the public-paper intake profile | yes |
| `verify-public-search-metadata-v1.mjs` | Exercises complete-source request and CLI preparation, strict authored-field rejection, deterministic finalization, taxonomy/facet/identity coverage and source bindings without teaching analyses; rejects forged derived fields and dropped blank/option context | yes |
| `verify-public-paper-review-consumer.mjs` | Rejects public-paper Owner Review drift that loses source/summary pairing, Screen paragraph location, or narrowed approval scope, while preserving the existing analyzed-paper review UI | yes |
| `verify-import-review-ocr-confirmation.mjs` | Uses authenticated `/ops/` browser actions to edit OCR text/order/classification and submit exact source/evidence-bound confirmation; rejects stale confirmation, unsupported content and every Candidate/approval/shipping seam on a pre-Canonical OCR revision | yes |
| `ocr-generation.test.mjs` | Catches explicit OCR generation accepting a stale base at registration or finalize, source/evidence/plan drift or any Candidate; preserves legacy digest bytes, old receipts and downstream archives, and blocks upload replay after UNKNOWN | yes |
| `sealed-ocr-resume.test.mjs` | Catches ordinary fast resume uploading over an existing or ambiguous remote OCR when local receipts are missing; requires exact approved remote and installed digests for reuse, and explicit remote absence for initial upload | yes |
| `verify-import-review-ocr-worker.mjs` | Compares synchronous and worker OCR proofreading receipts through the authenticated POST with a cold projection cache; concurrently probes HTTP health and event-loop delay below 1s. `--sync-baseline` must fail the responsiveness assertion. Registered in Full only, outside the bounded import-paper pack | yes |
| `verify-import-review-media-derivation.mjs` | Rejects source/candidate digest, dimension, deterministic-recipe or prior-Owner-receipt drift; proves latent AI stays out of publication and one selected rendition plus layout intent reaches real Screen, Student/Teacher Print, Chromium PDF and authenticated media Review endpoints | yes |
| `verify-import-environment-preflight.mjs` | Fails before import work when magick, ffmpeg, soffice, PDF raster/text/image-inventory tools, unzip, or macOS magick/ffmpeg dynamic-link health is unavailable | yes |
| `verify-import-review-target.mjs` | Executes the Review CLI with fake fetch; missing import-origin binding or a login-environment host/port mismatch must send zero requests, while exact binding succeeds with redirects forbidden | yes |
| `verify-nck1-source-materialization.mjs` | Rejects incomplete nine-slot/45-answer Source Materialization, invalid source coverage/listening/writing boundaries, misplaced blanks, unresolved media, or digest instability | yes |
| `verify-nck1-writing-notice-numbering.mjs` | Proves the full producer→validator→adapter pipeline accepts all four NCK1 writing-notice numbering styles (ASCII digits, Chinese numerals, full-width digits, circled digits) and that `wordCountRuling.target` is 80; includes a regression guard confirming raw-text detection yields `blockCount: 1` (the bug) while NFKC-normalized detection yields `blockCount: 3` (the fix) | yes |
| `verify-nck1-pdf-crop-recipe-replay.mjs` | Rejects PNG tIME/date:* metadata drift across delayed pdf_crop replays, preserves original pixels/color/density, and rejects changed page/region/density recipes; runs in Paper and import-paper packs | yes |
| `verify-paper-canonical-nck1-materialization-candidate.mjs` | Proves Source Materialization derives one digest-bound Candidate with strict DOCX paragraph fidelity, source locators, media extraction, source-bound Reading/Seven Choices title roles, Teacher Confirmation, immutable prior authority resolution, and fail-closed admission | yes |
| `verify-import-paper-routing.mjs` | Keeps one-paper materialization changes on the narrow import-paper pack while mixed, shared producer, and unknown changes fail closed to all | yes |
| `verify-production-canonical-publication-backfill.mjs` | Reproduces an empty production publication index, then proves the accepted 4+29 store merge restores 33/33 Screen and Print/PDF consumption, is idempotent, preserves bank row counts, and leaves existing latest paper assets byte-identical | yes |
| `verify-paper-canonical-import-pilot-fixes.mjs` | Ticket 20 focused review closure: no synthetic ready semantics or default answers at the public compiler seam; complete source-bound inactive Listening; structured Reading table lineage; exact Profile/Plan order; and strict PaperBrowse rejection of Plan-external active groups | yes |
| `verify-paper-canonical-import-pilot.mjs` | Historical Ticket 20 macOS visual pilot; retained for explicit reproduction, not a default gate. Current family-specific rendered-behavior and publication/recovery verifiers remain in Full | explicit only |
| `verify-paper-canonical-docx-source-adapter.mjs` | Ticket 25 trusted DOCX seam: versioned v37 candidate authority, immutable-byte Import Candidate derivation, deterministic diagnostics/source spans, exact candidate/source-bound Teacher Confirmation, no caller-authored groups/questions/answers/profile semantics, inactive non-rendered `not_supplied` Listening with zero Groups, and non-DOCX `paper-2026-i` fail-closed proof without publication | yes |
| `verify-paper-canonical-trusted-docx-request.mjs` | Format ① trusted-DOCX producer: NCK1 identity (national 一卷 / 浙江 1 月), byte-reproducible `canonical-import-request.json` that `loadCanonicalImportRequest` can load, and Teacher-Confirmed publication into `latest/` without a missing-request publish | yes |
| `verify-paper-canonical-docx-pair-request.mjs` | Format ③ DOCX-pair producer: owner-asserted paperId wins, mock titles never become `paper-YYYY-i` / `paper-zj-YYYY-jan`, reserved exam ids are rejected, and Teacher-Confirmed pair admission writes isolated `latest/` | yes |
| `verify-nck1-new-paper-locks.mjs` | NCK1 new-paper locks: Format ③ rejects glued word-count or incomplete Application Writing chrome/ReviewCard publication, while Format ② keeps Shenzhen Reading A as `framed_columns` and keeps Reading D/Application out of that block kind | yes |
| `verify-paper-canonical-legacy-source-capture-adapter.mjs` | Prevents the frozen legacy corpus from bypassing immutable source capture, exact group accounting, or deterministic candidate identity | yes |
| `verify-paper-canonical-legacy-opaque-application.mjs` | Prevents opaque legacy Application Writing evidence from inventing structured semantics while preserving its source-bound public payload | yes |
| `verify-paper-canonical-legacy-opaque-continuation.mjs` | Prevents opaque legacy Continuation Writing evidence from inventing starter/material structure while preserving its source-bound public payload | yes |
| `verify-paper-canonical-legacy-opaque-writing-rendered-behavior.mjs` | Proves both legacy opaque writing families render through shared Screen/Print consumers without semantic reconstruction or teacher leakage | yes |
| `verify-paper-canonical-import-pilot-qa-server.mjs` | Historical Ticket 20 HEAD-scoped artifact-server/seal reproduction, including macOS-only pilot cleanup. Default plans and results no longer depend on old scratch, HEAD, seals or ledgers | explicit only |
| `verify-paper-canonical-cloze-grammar-publication.mjs` | Hash-bound real Cloze/Grammar Fill reference evidence through compile, atomic Publication, reopen, whole-family loader, projection, and family-specific fail-closed cases | yes |
| `verify-paper-canonical-cloze-grammar-consumption.mjs` | Ticket 05 whole-paper Cloze/Grammar consumption across actual Screen payload and Print HTML/PDF source; shared semantic/A–D placement signatures, student/teacher isolation, alignment regression, and hard failure for partial or unavailable canonical selections | yes |
| `verify-paper-canonical-seven-choices-publication.mjs` | Ticket 06 hash-bound real Seven Choices evidence through compile, atomic Publication, reopen, whole-family loader, projection, and malformed bank or pair fail-closed cases | yes |
| `verify-paper-canonical-seven-choices-rendered-behavior.mjs` | Ticket 07 one shared A–G bank across actual PaperSurface and Print/PDF artifacts; five pair anchors, seven option anchors, cross-mode signatures, and retained repeated-bank regressions | yes |
| `verify-paper-canonical-reading-publication.mjs` | Ticket 08 canonical-only and hash-bound real Reading evidence through compile, atomic Publication, reopen, whole-family loader, shared projection, native tables, PDF page-region transcription lineage, and exact fail-closed dispositions | yes |
| `verify-paper-canonical-reading-rendered-behavior.mjs` | Ticket 09 canonical Reading semantics across actual PaperSurface and Print/PDF artifacts; ordered prose/title/table/Figure identities, answers, and shared A–D placement signatures | yes |
| `verify-paper-canonical-framed-columns.mjs` | Reading `framed_columns` contract: exactly two columns, paragraph/table-only children, valid per-column heading identity, shared projection parity, and fail-closed figure/nesting/question/shape cases, including the Shenzhen Reading A typed-block producer | yes |
| `verify-paper-canonical-framed-columns-rendered.mjs` | Shared `framed_columns` Screen/Print/PDF rendering: two hairline columns, true paragraph/table content, explicit heading styling, atomic print placement, and cross-surface semantic parity without raw figure-marker fallback | yes |
| `verify-paper-canonical-application-writing-publication.mjs` | Ticket 10 canonical-only and hash-bound real Application Writing evidence through compile, Publication, reopen, whole-family loader, projection, closed prompt/word-ruling/Given Skeleton/response semantics, and exact fail-closed dispositions | yes |
| `verify-paper-canonical-continuation-writing-publication.mjs` | Ticket 12 hash-bound real Continuation Writing evidence through compile, Publication, reopen, whole-family loader, projection, exact two-starter and Profile-compatible plot-led zero-starter contracts, fail-closed pollution/profile/boundary/ruling cases, and supplement independence | yes |
| `verify-paper-canonical-listening-inactive-closure.mjs` | Ticket 14 hash-bound real `paper-2026-i` listening questions/answers/transcript/source inventory through compile, Publication, reopen, and all three shared loaders; exact 5+15 A–C/answer/ten-segment/timing/no-audio closure, zero listening Groups, and fail-closed missing/unsupported/conflict/ambiguous/reference cases | yes |
| `verify-paper-canonical-listening-zero-occurrence.mjs` | Ticket 15 complete inactive listening Plan closure with zero current-surface occurrence across whole-paper PaperSurface plain/lecture and student/teacher Print HTML plus actual PDF | yes |
| `verify-paper-canonical-listening-first-section-playback-slot-gating.mjs` | Gates the materialization-level `section1_playback` ("仅读一遍") timing marker to the `listening.short-dialogue` occurrence only; the `listening.long-form` occurrence and its `projectedOccurrenceDigests` entry must not carry the section-1-only `firstSectionPlayback` field, and the short-dialogue occurrence/digest must still reflect the marker | yes |
| `verify-paper-canonical-continuation-writing-rendered-behavior.mjs` | Ticket 13 canonical Continuation Writing across authenticated Screen and Print/PDF artifacts; exact NCK1 one-part/two-section 40/15/25-point Profile chrome with source-digest-bound instruction admission and Transformation Record replay, exact NCK1/Zhejiang instruction placement/ref closure, schema descriptor/`$id` parity, complete Zhejiang v4 source-backed Application + Continuation hierarchy/material, identical two/zero-starter semantic and occurrence signatures, unique response regions, poisoned legacy/Analysis/supplement rejection, invalid order/declaration rejection, and three-entry fail-closed proof | yes |
| `verify-paper-canonical-application-writing-rendered-behavior.mjs` | Ticket 11 canonical Application Writing across actual PaperBrowse/PaperSurface and Print/PDF artifacts; present/absent/full fixed-part variants, one response identity, student/teacher supplement isolation, and poisoned-legacy rejection | yes |
| `verify-paper-canonical-abcd-layout.mjs` | Shared renderer-only A–D whole-set selector: digest-closed primary/fallback fonts and shaping metrics, integer-twip 4/2/1 fallback, hard-break and overflow closure, hash-bound accepted-reference 4/1/2 measurements, the exact 33-paper/1035-set 641/330/64 corpus census, 15-row hash-bound Cloze proof, cross-renderer placement signatures, and canonical-semantic immutability. The stable suite runs the deterministic seam; `--actual-artifacts` additionally verifies full option content in browser and real PDF within the 1pt/0.5pt gates and fails when the host lacks the pinned font closure. | yes |
| `verify-paper-normalization-cloze.mjs` | Ticket 01 pure `normalizePaperGroup` cloze compiler: real `paper-2026-i` identity/prose/options/source-map/fingerprint facts, numeric-only stem conditions, immutability/determinism, optional blank records, and structured fail-closed malformed-marker matrix | yes |
| `verify-paper-normalization-grammar-fill.mjs` | Ticket 04 pure `normalizePaperGroup` grammarFill compiler: real `paper-2026-i` embedded-marker and `paper-960d0f8d` label-marker dialects, canonical hint merge, identity/source-map/fingerprint/digest stability, protected prose numbers, input immutability, and structured fail-closed malformed/ambiguous marker matrix | yes |
| `verify-paper-normalization-cloze-surface.mjs` | Ticket 02 public canonical cloze adapter + SSR PaperSurface: real `paper-2026-i` TextMap/semantic-node identity, no raw marker or duplicate slot number, compatibility fail-closed fallback diagnostics, and shared blank ruling | yes |
| `verify-paper-normalization-cloze-analysis.mjs` | Ticket 03 public cloze analysis model + SSR PaperSurface: real `paper-2026-i` canonical plain/analysis digest parity, all 15 blank-to-question anchors, fail-loud analysis/evidence anchors, TextMap range validity, active evidence paint, and lecture focus lifecycle stability | yes |
| `verify-paper-normalization-grammar-fill-surface.mjs` | Ticket 05 public canonical grammarFill adapter + plain/analysis PaperSurface: both real proof dialects, semantic DOM/hint/null-hint behavior, digest parity, blank focus/evidence ranges, protected prose, and explicit compatibility fallback diagnostics | yes |
| `import-pipeline/verify-source-doc-types.mjs` | DOCX/PDF source-input admission and magic-byte validation through the public paper-import validator | yes |
| `verify-import-ops.mjs` | 导题 Agent 八态 preflight（本地 Source/Materialization/收据 + Review 当前 revision）、自动触发 skill、不可变 revision / 陈旧认可恢复、ready_to_ship / shipped / ship_failed、只读无生产按钮，以及无当前上线授权时拒绝 push | yes |
| `verify-source-intake.mjs` | Rejects source-ledger auth, upload-integrity, immutable-revision, claim-lease, initialization-receipt, or handoff regressions through the real Owner and Agent HTTP seams plus the official source-intake CLI | yes |
| `verify-source-intake-frontend.mjs` | Renders synthetic queued, Orb-created, claimed, failed, Owner-needed, and handed-off rows; proves Amp thread links, Paper ID/command copy controls, non-flashing background refresh, and active-only polling | yes |
| `verify-source-intake-webhook.mjs` | Rejects wakeup-plugin payload, HMAC, feature-gate, runner-routing, or fixed-prompt drift without activating the plugin or creating an Amp thread | yes |
| `verify-nck1-analysis-agent-plugin.mjs` | Pins the one-group analysis worker to GPT-5.6 Sol medium with no tools, proves one-shot child isolation and provenance envelopes, and rejects whole-paper, mismatched-group, oversized, or non-JSON boundaries without calling a real model | yes |
| `verify-import-review-source-pairing.mjs` | 匿名 PDF 原卷局部与真实 Screen 的精确配对：revision-bound source crop、digest/locator fail-closed、表格/媒体定位、Print 切换保留以及 source issue 刷新回放 | yes |
| `verify-import-pagination-qa.mjs` | Rejects stale pagination identity, invalid edition/slots/geometry, non-exact explicit targets, and missing/tampered version-bound plans; checks single-render replay and legacy automatic fallback | yes |
| `verify-student-product-pdf.mjs` | Rejects premature small-font fallback, lost valid fits after overflow, unrestored writing boxes, ceiling violations and replay diagnostic drift; measures caption/table typography and option reflow in Chromium | yes |
| `verify-import-pagination-ui.mjs` | Real browser checks exact student PDF8/10 URLs, source-specific edition availability, revision/edition/page feedback, natural compatibility, metadata failure and narrow toolbar layout | yes |
| `verify-docx-source-media-input.mjs` | Ticket 17：由真实 FODT 经 LibreOffice 生成 DOCX，在 document.xml 与 header1.xml 放置真实形状；经 public publisher 走输入侧 LibreOffice PDF、逐形状裁图、digest-bound figures manifest/body 关联，再由真实 Screen 与 Print/PDF consumer 解析；同时覆盖 splitter、ZIP 内嵌位图、不可变 versioned Source Capture 与输入模块不得依赖已删除输出实现 | yes |
| `verify-paper-normalization-grammar-fill-browser.mjs` | Ticket 05 Phase A owner-QA regression: real Chromium renders the actual canonical PaperSurface for both proof assets in plain/lecture states at 1440px and 1004px; measures blank-edge to hint-glyph geometry and computed text-indent for every hinted blank, preserves q56 null-hint word spaces, and rechecks cloze 3.3em / sevenChoices 4.6em | no |
| `verify-paper-normalization-import-gate.mjs` | Ticket 06 public import validation/publish gate: all supported groups ready, additive sidecar schema/runtime checks, needs_review zero-write behavior, version/sidecar/DB/latest forced-failure rollback and retry sequencing, byte-stable latest, and stale version/fingerprint consumer rejection | yes |
| `verify-paper-normalization-print-html.mjs` | Ticket 07 public `buildPrintHtml` canonical consumer: real proof cloze/grammarFill semantic output for both marker dialects, shared blank ruling, student/teacher parity, continuous numbering and block order, valid/stale/invalid/missing sidecar selection, compatibility `needs_review`, and complete legacy fallback diagnostics | yes |
| `verify-c7-paper-import-contracts.mjs` | C7 schema / offline validator contracts; historical task-path allowlist retired, mixed import/renderer risk is enforced by `verify-import-paper-routing.mjs` and the all-pack/review gate | yes |
| `verify-c7-paper-import-publish.mjs` | C7 publish atomicity and storage protocol | yes |
| `verify-i1-paper-import-analysis.mjs` | I1 owner-only analysis / publish endpoints, provider seam, JSON preview, and C7 package bridge contract | yes |
| `verify-i2-seven-choices-ai-import.mjs` | I2 七选五 AI 导题接入：splitter / analysis / package / route contracts | yes |
| `verify-i3-cloze-ai-import.mjs` | I3 完形填空 AI 导题接入：splitter / package / route contracts | yes |
| `verify-i4-grammar-fill-ai-import.mjs` | I4 语法填空 AI 导题接入：splitter / package / route contracts | yes |
| `verify-i5-writing-ai-import.mjs` | I5 应用文写作 + 读后续写 AI 导题接入：splitter / package / publish path contracts | yes |
| `verify-application-model-answer-prompt.mjs` | 应用文参考范文生产护栏：运行时精确加载正式 V3 Prompt、附加完整重建题面、保留但不再使用 V2，并钉住交际对象推演与最小充分关系动作 | yes |
| `verify-continuation-analysis-v1.mjs` | 记叙型读后续写 V2 生产合同及 V1 读取兼容：四区 schema / tracked Prompt / provider seam 同形；段序、段二反约束证据、全局约束 ID、原文摘录、条件情绪与开放路线边界受检；退役字段不得回流 | yes |
| `verify-teaching-analysis-style.mjs` | 配套解析讲解力护栏：六类正式 Prompt 运行时只加载一次共享讲解规范，题型专项动作存在，固定 25 题 benchmark 数量正确且全部指向已跟踪原题和解析 | yes |
| `verify-i6-writing-render.mjs` | I6 写作卷面版面还原：从 content.blocks 派生写作页模型（题面外壳归属 / 续写开头句折叠进答题框 / 应用文空框 / 不串味） | yes |
| `verify-i7-application-given.mjs` | I7 应用文给定上下格式解析：末尾纯英文 + 正向信号守卫切给定骨架（信件/标题/无给定/负向守卫/称呼型），情境剔除、夹注不误判 | yes |
| `verify-i8-cloze-analysis.mjs` | I8 完形填空 AI 解析生成：prompt 合约、validate 校验器成功与阻断用例（stub provider）、路由 + 包构建 + 存储接线、磁盘 latest/analyses/cloze-analysis-v1.json 断言 | yes |
| `verify-i9-cloze-analysis-surface.mjs` | I9 完形填空解析 render 面：adapter 映射 + 多次出现证据 + 空白标记排除 + option-side 标记；panel 必要结构；harness fetch→fallback dispatch；availability 完整性 vs 不完整（blanks 键） | yes |
| `verify-i10-blank-rendering.mjs` | I10 空格渲染：paperBlankPattern 提取（刀⑤ Chunk B 起从 `shared/papersurface/blankPattern.mjs` 提取，PaperSurface.tsx 只 import）+ 行为测试（完形 `__41__` / 七选五 `_____36_____` / 语法填空 2空格变体）；重命名符号存在 + 旧名称不存在；MF-3 已接受误匹配记录 | yes |
| `verify-relay-json-format.mjs` | Chat-completions request body sends response_format json_object on every provider (incl. openai-compatible gpt relay); `thinking` stays native-only | yes |
| `verify-i11-symbol-normalization.mjs` | I11 符号归一 2a：normalizePassageText 纯函数表驱动用例（规则 1 半角化 / 规则 2 标点后空格 / 规则 3 生词括号空格）；mixed seam 边界；C2 空格标记字节完整哨兵；语法填空两阶段 compose 顺序；完整幂等性 | yes |
| `verify-i13-grammar-fill-analysis.mjs` | I13 语法填空 AI 解析生成（第一刀）：prompt + 16 叶 facet 注册表合约；validateGrammarFillShape 成功与所有阻断用例（stub provider）；C1 冻结 4-op 归一化（whether/if✓、worn-for-wore✗、were worn 多词✓）；C2 16 叶成员、父节点拒绝、blank_type 不匹配、role/path 条件约束；C3 evidence 精确子串 + SW-2 空格标记排除（  56   + (wear)）；MF-2 发布后磁盘 analyses/grammar-fill-analysis-v1.json 存在；MF-3 强制发布 guard | yes |
| `verify-i14-grammar-fill-analysis-surface.mjs` | I14 语法填空解析 render 面 + 入口（第二刀）：Step 0 facet 框架注册表漂移守卫（16 key == 服务端 JSON）+ non-finite 形变表；Step 1 GATE-1 空白容差匹配（plain indexOf 失败但容差命中、偏移映射回存储字节、3+空格折叠）+ MF-1 每个 range.sentenceId 存在于 textMap + 多次出现 + 空白标记排除 + 10 空映射 + framework/labelZh 解析 + role/path 仅 non-finite + unknown facetKey/schemaVersion 抛错；Step 2 panel 必要结构；Step 3 harness fetch→fallback dispatch + 各 cloze 触点镜像；Step 4 availability 完整 vs 不完整（blanks 键，语法解析） | yes |
| `verify-i15-grammar-fill-blank-focus.mjs` | I15 语法填空点正文空格聚焦 + 退数字排（第三刀）：blankFocusMode 在 types.d.ts 声明（默认 rail）；rail 两处渲染点被 !blankFocus 门控；grammarFillBlankPattern 必需点号区分（匹配 56._____ / 57._____(absorb)，排除 cloze __41__ / 七选五 _____36_____ / 数字噪声 2026·800g·3-5g·25-30g；64._____ 3-5g→["64"] 不取 3）；paperBlankPattern 字面量零改动守卫（刀⑤ Chunk B 起指向 `shared/papersurface/blankPattern.mjs`）；空格渲染为带 aria-label/aria-pressed 的 <button>、未匹配→非交互 span（SW-2）；harness 仅 grammarFillAnalysisModel 时传 in-passage | yes |
| `verify-i16a-teaching-dimension-search.mjs` | I16·A 教学维度检索层：extractor 四类（语法/七选五/完形/阅读）真实 960d0f8d 样本断言；MF-1 完形 signatureFacet 稀疏（13/15 缺失不崩）；reading 多组 join 3+4+4+4 无孤儿；MF-2 未解析题组（jslk grammar-fill/cloze）缺席索引；查询行为（bridge/noun/skill/多维 AND）；MF-3 路由注册 + invalidate 清缓存。需仓库外原始 v1 样本，见上方手动运行说明 | no (manual corpus audit) |
| `verify-i16b-theme-labels-backfill.mjs` | I16·B 主题标签批量回填：注入 mock 编排（全标/跳过/容错/摘要计数）；MF-2 diff 围栏（reading-choice-analysis-v1.md/topicTaxonomy.mjs/analyzeReading/packageBuilder 未耦合）；路由经工厂注册；前端 service 调 /api/topic-labels/backfill | yes |
| `verify-grammar-facets-v2.mjs` | D1 语法填空解析字段 v2 落库迁移 + I16·C 谓语 sidecar 退役收编：330 空 v2 完备性（schemaVersion/facetKey/role/tense/voice/agreementSensitive/form）；22 叶词表白名单（未知 facetKey/role/tense/voice 即红）；facetKey/role 分布对 step1 实测表 ±2；全站旧 facetKey 零残留含前端（含 similarQuestions.mjs 硬白名单排除）；v2 每个新 key 在 grammarFillFacetRegistry.ts 有条目；旧 verb-profile sidecar 文件/路由/teachingFacets 合并逻辑零残留；行为断言 teachingFacets 三轴直接从 v2 blank 取值、`?tense=`/`?voice=`/`?agreement=` 过滤参数名不变（agreement 值域换新）；负例 validator.mjs 拒绝 v1 形态 grammar-fill-analysis 上传 | yes |
| `verify-similar-v2.mjs` | E5 fixture-driven similar-passages and similar-questions: topic gate, position tiers, authenticity/year ordering, reading skills, grammar branches, unsupported/mixed seeds, poolStats, determinism, zero-AI and real route round-trips. Source domain uses schema.sql CHECK, rejects unknown values, and exercises real_exam/mock_exam/self_made/other with only real_exam boosted; optional read-only `--db` domain audit. | yes |
| `verify-similar-workbench-swap.mjs` | E7 工作台⇄换篇（`docs/cuts/similar-workbench-swap/plan.md`）：静态源码断言（行为对照见同刀 DP-2 脚本）——⇄ 入口 gate 恰好四题型（reading/cloze/seven_choices/grammar_cloze），writing 隐藏；替换/加入均走 services/draftPapers.ts 既有函数（deleteDraftPaperItem/addGroupToDraftPaper，无组件内旁路 fetch）；替换保留原槽位 pageBreakBefore；撤销互斥（moveItem/handleDrop/togglePageBreak/deleteItem/undoDelete 五处及 replace/add 两处均同时清两种快照）；抽屉复用 similarPassagesRecipeSummary（不发明第二套配方文案）；加入邻插 insertIndex=seedIndex+1（不跳尾） | yes |
| `verify-search-thinking-toggle.mjs` | AI 搜索 thinking 开关：askQuestionBankSteward 第三参 thinkingMode 进请求体；questionBankStewardSearch 形参含 thinkingMode 且传给 plan + semantic；steward 路由 forwards input.thinkingMode；ConciergeDesk 渲染 thinking toggle | yes |

## PaperSurface and Paper Intelligence

| Script | Scope | Runs in CI? |
| --- | --- | --- |
| `verify-canonical-paper-group-surface-adapter-declaration-parity.mjs` | Canonical Paper Group surface adapter and consumer projection `.d.ts` / `.d.mts` declaration parity | yes |
| `verify-paper-surface-mjs-declaration-parity.mjs` | `.mjs` declaration parity | yes |
| `verify-i0e-seven-choices-entry.mjs` | I0-E 七选五 PaperSurface entry availability and label gate | yes |

## Draft paper / export

| Script | Scope | Runs in CI? |
| --- | --- | --- |
| `verify-basket-persistence.mjs` | Basket persistence | yes |
| `verify-paper-draft.mjs` | Draft paper model / behavior | yes |
| `verify-concierge-desk.mjs` | Concierge desk behavior used by draft entry points; similar-passages-entry (E6, was E3): 找类似/triggerSimilar/buildSimilarIntent retired, ConciergeGroupCard's 相似篇章 is a toggle button opening the in-place shared candidate panel, gated on the four v2-supported groupTypes | yes |
| `verify-c8-draft-paper-contracts.mjs` | C8 draft-paper API/search/workbench contract | yes |
| `verify-print-pdf-error-classification.mjs` | `POST /api/draft-papers/:id/print-pdf` error classifier + sibling-parity with `GET /:id/pagination`: the per-item data error `questionGroupId not found: <id>` (thrown by `resolveDraftExportItems` when `getQuestionGroupDetail` returns null, e.g. under `identityConflict`) maps to **400** on both routes (was misclassified 503 on print-pdf by a broad `message.includes('not found')` substring match); the renderer-missing lane (`RENDERER_MISSING` / `ENOENT` from `resolvePagedjsPolyfillPath` / `chromium.launch`) stays **503**; `NOT_FOUND_MESSAGES` sentinels stay **404**. Hermetic — imports `createDraftPaperRoutes` and invokes the route handlers directly with a stubbed `context.draftPaperStore`; no HTTP server / no Chromium | yes |
| `verify-c8-my-space-contracts.mjs` | C8 PR B My Space storage/API/UI contract; cut-specific | no |
| `verify-my-space-shelf.mjs` | my-space-shelf + dossier-cabinet: MySpacePage rebuilt as a token-only, month-grouped card shelf — zero hardcoded palette hex in MySpacePage.css (empty allowlist; `--paper-*` tokens sanctioned for the miniature-A4 card thumb), no `window.confirm` (custom `role="alertdialog"` confirm modal with upgraded copy: "删除草稿卷 PDF" title + "删除 PDF" confirm action instead), `.my-space-grid` card grid (`repeat(auto-fill, minmax(200px, 1fr))`), primary action class filled with `var(--eqb-color-primary)`, danger action class referencing `var(--eqb-color-danger)`, old triple-heading text gone, folder filter chips gated on `folders.length > 0`, artifacts grouped into month-archive sections | yes |
| `verify-c8-draft-paper-render-model.mjs` | C8 draft paper render model；print-renderer.mjs 曾冻结 rendering logic（H9/C8），restart-cut-③ 与刀⑤ render-fidelity Chunk B 是已授权的两次例外，diff 级冻结校验已随刀⑤ Chunk B 退役（见脚本内注释） | yes |
| `verify-c8-print-ready-gate.mjs` | C8 print-ready gate | yes |
| `verify-print-form.mjs` | print-form: `draft_papers.print_form` additive lazy-ALTER (idempotent, mirrors `verify-draft-student-field.mjs`'s pattern) + 记住上次 default inheritance; `evaluatePageBreakAcrossPages`/`derivePageBreakSuggestions` pure judgment (a4 breaks every boundary, a3 breaks only on an even first-page — 翻面/换张 wording by mod-4 position — odd never breaks) against a contract-shaped HTML fixture; `print_form` excluded from `draftPaperPaginationSignature` (裁点2: toggling form alone never invalidates the render cache) | yes |
| `verify-error-copy-mainline.mjs` | Cut ⑧ error-copy-mainline: `describeError` human-copy helper contract, MySpacePage + DraftPaperWorkbench zero raw `error.message`/`String(error)` residue, my-space failure-state retry button + single-render de-dup, draft-paper workbench errors don't clear in-progress work | yes |
| `verify-ai-server-key-fallback.mjs` | Cut ai-key-server-fallback: `runConciergeSearch` gate matrix (no key+no server→local `missing-api-key`; no key+server available→steward call with `apiKey===''`; key present→steward, no regression; steward throws→`api-error` fallback), timeout selection (default 20000ms / thinking 60000ms / explicit `stewardTimeoutMs` wins), `GET /api/ai/status` route shape + MF-3 key-leak negative test (sentinel absent from response body AND all console output), `api.mjs` MF-1 TDZ guard (`serverContext.serverKeyAvailable` assigned post-hoc, not in the `:93` literal) | yes |
| `verify-auth-gate.mjs` | M0-2 invite-login plus Import Review least privilege: spawns the real server against temp DBs; proves bootstrap-open/enforced auth, secure stdin account creation, login/logout/disable, `import_agent` isolation from teacher/Owner APIs, Agent token upload/inbox scope, a distinct ship token as the only credential that can reach shipping guards, and restart-based rotation where old tokens return 401 | yes |
| `verify-owner-gate.mjs` | M0-3 owner/member role gate: spawns the real server against temp DBs — owner + member accounts (real `create-user.mjs` CLI) each hit all `ownerOnly` routes (topic-label-backfill/verb-profile-backfill whole modules + question-group and paper-set per-route gates; legacy-import/paper-import/paper-import-ai routes retired, see ADR-0016); member gets 403 `{ error: 'forbidden' }` on every one (never a different body shape), owner never sees 401/403 on any of them; member allowed-surface sample (question-groups/paper-sets/my-space/draft-paper-items/auth-me) never 403; bootstrap-open mode (empty users table) leaves a gated-route sample un-403'd (ADR-0013 decision 2, positive-authMode-check regression guard per PA MF-3) | yes |
| `verify-user-scope.mjs` | M0-4 user data isolation: hermetic (all 4 path envs + port -> temp dirs, no vivliostyle — artifact rows are inserted directly via `saveMySpaceArtifact` against the running server's temp user-data DB file). Three fixtures: (1) open-mode regression — empty users table, full draft/my-space CRUD + `in_current_draft` button state, then a direct DB check that every touched row is `user_id='local'`; (2) two-user isolation — CLI-created owner A + member B, each add-to-draft without a composite-index collision, cross-user 404 on draft GET/PATCH/items PATCH+DELETE/print-html, owner has no private-data privilege (A 404s on B's draftId too), same folder name succeeds for both users but collides within one user, cross-user artifact download/delete 404s, PA MF-3's "B borrows A's draftId via `POST /api/my-space/artifacts`" 404s before the paged.js/Chromium pipeline is ever invoked (draft-desk-b step4: `exportDraftPaperPdf` now routes through `getDraftPaperPagination`'s own ownership-gated lookup), and B filing into A's folderId is rejected by `saveMySpaceArtifact`'s ownership check; (3) migration — hand-built v2-shape DB -> `ensureUserDatabaseShape` -> column/backfill/composite-index/`user_version=3`/`foreign_key_check` assertions + idempotent re-run, plus a hand-built half-migrated DB (PA MF-2 crash-reentry: `draft_papers`/`my_space_artifacts` already have `user_id`, `my_space_folders` does not, `user_version` still 2) converging to v3 with folder data intact | yes |
| `verify-ai-daily-limit.mjs` | M0-5 AI global daily request-count limit: spawns the real server against a temp DB + a temp AI-usage snapshot path + a local mock DeepSeek HTTP server (`DEEPSEEK_API_URL` env override, additive to `server/api.mjs`). Five assertions: (1) `AI_DAILY_REQUEST_LIMIT` set to 2 -> 2 server-key `POST /api/ai/semantic-search` calls succeed, 3rd 429s with `{ code: 'ai-daily-limit-exceeded' }`, mock DeepSeek reached exactly twice; (2) a call with a client-supplied `apiKey` still succeeds (200, mock reached a 3rd time) after the limit is exceeded; (3) `GET /api/ai/status` returns `dailyLimit: {limit, used, exceeded}` alongside `serverKeyAvailable`, `used` counts only server-key calls, `exceeded` flips true; (4) kill + respawn the server process against the same snapshot path -> `used` reads back unchanged (fail-soft write-through persistence, not reset to 0); (5) a hand-written snapshot with a stale (year-2000) Beijing `dayKey` and `count:100` rolls over to `count:1`/today's `dayKey` on the first request of the day, not `count:101` | yes |
| `verify-classic-retire-2.mjs` | Rejects retired per-question/group analysis markers (merged analysis-layering guard); detail-consume-only (ADR-0015, formerly classic-retire-2-detail-view): source assertions (no duplicate API behavior checks; verify-owner-gate.mjs already covers the questionGroupRoutes 403/200 gate). Asserts `QuestionGroupDetailView.tsx` is props-driven (zero internal `useState`), keeps 编辑/删除 owner-gated, and no longer contains any retired 现场生产 control (verify/AI-parse/topic-label generate-bind/difficulty rating) or AI ops-trace field, while member-visible surfaces (加入草稿卷, passage text, 已绑定话题标签, 答案对比统计, AI 答案验证 verify-list) stay unconditional; App.tsx no longer defines the retired WRITE handlers but still defines the READ-only parse/verify state, `runAiEnhancementAnswerParse`, and `handleBackfillTopicLabels`; `onOpenDetail` is threaded through all three ConciergeDesk render points (2x `ConciergePaperRow` + `ConciergeGroupCard`) and wired in App.tsx; `ConciergeGroupCard` no longer shows a difficulty dot | yes |
| `verify-classic-retire-3.mjs` | classic-retire-3-cleanup: source assertions deleting the last classic-mode dead code from App.tsx/App.css — homeMode state machine, classic list view, filter bar, classic sidebar (basket-panel incl. steward-chat-panel), and the print-preview viewMode branch. Asserts App.tsx has zero `homeMode`, no `className="basket-panel"`, no `steward-chat-panel`, `viewMode` no longer has a `'preview'` value, no `openPreview`; ConciergeDesk renders unconditionally under the `viewMode === 'list'` branch only; the app-shell className is the fixed literal `"app-shell home-mode-ai"`; App.css still carries `.version-toggle`/`.paper-page`/`.paper-meta`/`.basket-item`/base `.eyebrow`/`.app-shell.home-mode-ai` as negative-deletion sentinels (these have live users outside the deleted classic UI); `handleBuildObjectivePaperSet` no longer jumps to print preview | yes |
| `verify-launch-deploy.mjs` | Complements the independently registered H11 browser/SSR HTTP helper checks; retains service/bundle old-origin guards and public bootstrap isolation; Caddy routing, systemd and Node/deploy syntax; local-only backup dry-run with SQLite integrity; fake-remote pull/push proving user-data isolation, stop-before-swap, atomic rename, backups and temp cleanup. No HTTP variable-name, declaration-shape or unused-alias existence constraints. Does not deploy | yes |
| `verify-paper-assets-consistency.mjs` | Always checks tracked assets: renderability, JSON/identity, swap/backup residue. Real-schema SQLite regressions reject both orphan directions, failed-publication references and unrenderable known assets. Explicit read-only `--db` plus optional `--paper-assets` performs the strict complete-corpus bidirectional audit, with no allowlist and no missing-input fallback. See SQLite verification authority above. | yes |
| `verify-paper-browse.mjs` | paper-browse (刀B 整卷预览页 v1): App.tsx `paperBrowseRoute` state boot-read from `view=paper-browse`, `openPaperBrowse` push-state wiring (no reload), `paperBrowseOnBackToWorkbench` replace-state (no reload), the early-return `<PaperBrowsePage>` branch ordered with the other route branches, mutual exclusion with draft-paper/my-space routes, and the detail-page `onOpenPaperBrowse` handler resolving `paperId` from `paperSurfaceHref` (no new server field); `QuestionGroupDetailView.tsx` gains exactly one prop + one 看整卷 button gated on `paperSurfaceHref`, existing member-visible surfaces untouched; `PaperBrowsePage.tsx` reuses the paper-intelligence per-groupType adapters read-only (`lectureFocus={null}`, `onFocusIntent` no-op), renders `content.blocks` in document order with a case per known block type plus a default placeholder, no 移出/整卷加入 affordance; cross-checked against the real `paper-2026-i` paper-asset fixture (all five group types present + an unhandled block type falling through to the placeholder); similar-rail (E2, items 53-59): `similarView`/`similarSeed` state, the 配相似 CTA gate (4 E1-supported groupTypes), `/api/similar-questions` request shape, add-to-draft reuse; similar-entrypoints (E3, items 44-48ish extended): `similar=1` URL contract threaded through `openPaperBrowse`'s options bag + `paperBrowseRoute` + popstate + `paperBrowseOnBackToWorkbench` param-strip, the replaceState sync effect also syncing `similar` (E6: the E3-era `buildPaperBrowseSimilarHref` deep-link helper is retired — entries open the in-place shared panel; legacy `similar=1` URLs still handled by PaperBrowsePage's deep-link effect) | yes |
| `verify-paper-selection-source.mjs` | Paper selection translation (#486): source streams, adjacent-v1 context, UTF-16 ranges, prompt DATA JSON, cache-key occurrence isolation, and lecture-focus arbitration | yes |
| `verify-paper-translation-cache.mjs` | Paper translation cache/budget (#486): temp SQLite persistence, single-flight, restart hits, feature-off/no-key zero upstream, truncated output not cached | yes |
| `verify-paper-translation-routes.mjs` | Paper translation HTTP (#486): status booleans without key leakage, CSRF, sourceRevision tamper, client prompt rejection, Flash request shape, SSRF endpoint allowlist | yes |
| `verify-paper-selection-browser.mjs` | Paper selection browser (#486): drag-select and double-click do not lecture-focus; ordinary click still does; Escape and print hide the overlay | yes |
| `verify-sentence-analysis-contract.mjs` | Sentence analysis contract (#494): fixture compile/validate, tokenizer and UTF-16 ranges, derived capsules/relations/restorations, target resolution from a selection, and rejection of malformed or overlapping authoring | yes |
| `verify-sentence-analysis-server.mjs` | Sentence analysis server (#494): auth/CSRF/body caps, canonical-source mismatch, rate and daily AI limits, model span conversion (main clauses, split predicates, inversion, cleft focus), repair/lenient retry, SQLite reply store restart hits, stale-reply re-ask, store-unavailable fallback, and eviction | yes |
| `verify-sentence-analysis-interaction.mjs` | Sentence analysis interaction (#494): one click answers one question, capsule/relation selection state, underline and annotation layout without collisions | yes |
| `verify-sentence-analysis-browser.mjs` | Sentence analysis browser (#494): 分析所在句 toolbar → card flow on a real paper, glide/insert animations, card width matches the outside-click boundary, and no browser errors | yes |
| `verify-vocabulary-notebook.mjs` | Vocabulary notebook (#490): save one circled word's sentence, keep the same occurrence idempotent, separate passages, reject half words and client user ids, enrich with one sense plus the sentence translation, and bold a Chinese gloss only when it matches once | yes |
| `verify-paper-dictionary.mjs` | Paper dictionary lookup (#486): word-token classification, form-index lookup and ambiguous entries, audio license/author/dialect rules, same-origin mirrored Commons audio (no direct Wikimedia URL served, mirror files exist and stay under the 60 MB budget), gaokao badge and synthetic-audio fallback, learner-IPA notation, 本文义 sense-pick (the circled word only, not the following words; qwen-mt-flash must copy one listed gloss of that word or the card stays unmarked; shares the translation key/ledger/rate limits, cache and budget paths), lookup+sense route CSRF/auth/rate-limit/byte caps, browser harness for the 查词 toolbar → dictionary card flow incl. 本文义 gating and sense-pick-off | yes |
| `verify-paper-canonical-detail-screen-consumption.mjs` | Prevents the detail Screen from falling back to caller-shaped paper meaning instead of the confirmed Canonical consumer projection | yes |
| `verify-list-groups-perf.mjs` | list-groups-perf: `GET /api/question-groups` N+1 fix — parity of `getPrintReadyByGroupId(db, ids)` batch judgments vs. calling `isGroupPrintReady(db, id)` per id over every question group in the real local `data/question-bank.sqlite`; `selectQuestionGroupCards` no longer contains a per-row `isGroupPrintReady(` call and uses the batch function instead; batch call over all question groups completes in <1500ms. Requires the real local corpus; see manual instructions above | no (manual corpus audit) |
| `verify-add-to-draft-feel.mjs` | add-to-draft-feel: client `addGroupsToBasket` no longer `await refreshQuestionGroups()` (source assertion) and does patch `draftPaperButtonState`/`currentDraftPaperId` optimistically before the add request resolves; server `getDraftPaper`/`getDraftPaperItems` calls the injected `selectQuestionGroupCards`/`getPrintReadyByGroupId` exactly once for a 5-item draft (behavioral, real `ensureUserDatabaseShape` user DB + real store, was once per item before) | yes |
| `verify-draft-student-field.mjs` | draft-student-field (E4): `draft_papers.student_label` additive column — source backstop proving `buildDraftPaperExportInput`/`buildDraftPaperBlocks`/print-renderer.mjs never read it (paper-face hard boundary); behavioral against a real `ensureUserDatabaseShape` user DB confirming the shared migration does NOT add the column (store-owned, lazy `ensureStudentLabelColumn` ALTER); a hand-built pre-existing column-less `draft_papers` row survives the lazy migration with `studentLabel: null` and an untouched title; create/update/get/list round-trip (with label, without label, whitespace-only normalizes to null); idempotent against a re-run of the shared migration | yes |
| `verify-draft-workbench-visual-unify.mjs` | draft-workbench-visual-unify (design review 26/40): `DraftPaperWorkbench.css` has zero non-whitelisted palette hex (only `#ffffff` foreground-on-accent/dark, matching App.css's own `.primary-button` convention, is exempt); `.draft-a4-sheet` carries a real ink-tinted Resting-tier `box-shadow` (D1); `.draft-workbench-shell` background resolves through `var(--surface)` (D3); the export menu is a custom floating panel — no `<details>`/`<summary>` JSX, `aria-expanded` wired to state, Escape + outside-click dismiss, right-anchored panel with a Floating-tier shadow and `max-width: calc(100vw - 32px)` so it can't clip past the viewport (D5); the save-space dialog's submit button carries `className="primary-button"` and the shared ghost-button selector explicitly excludes `.primary-button` so specificity doesn't clobber it (D2) | yes |
| `verify-paper-blocks-numbering.mjs` | Paper block numbering | no |
| `verify-paper-layout-roundtrip.mjs` | Layout model roundtrip | no |
| `verify-paper-export-flow.mjs` | Export flow | no |
| `verify-paper-export-payload.mjs` | Export payload | no |
| `verify-print-renderer.mjs` | Print renderer；刀⑤ Chunk B 起含 @page 边距/页脚页码/行距/字体栈 token 化断言 + paperBlankPattern 挖空样式与写作答题区断言 + 真实 paper-2026-i 资产行为级挖空计数与真 PDF 字节冒烟（PA F2，非合成样例） | yes |
| `verify-print-pdf-export-flow.mjs` | Print PDF export flow | no |
| `verify-figure-render.mjs` | figure-render cut (fig-token P0): manifest-driven (zero hardcoded figure id), scans every published `figures/manifest.json` and exercises the live Screen/detail/Print-PDF paths on real paper-2026-i data — paperAssetSurfaceAdapter.ts textMap figure resolution + PaperSurface.tsx source-structure branch, the detail-page `<pre>` path (`passageFigureSegments.ts`), and print-renderer.mjs (`imageMode: 'web'`/`'file'`) covering PDF/A4 预览/草稿卷预览. Plus: MF-4 paragraph-initial invariant re-asserted against published data, a whole-library anti-pattern sweep (all 33 papers, zero raw `[表: fig-`/`[图: fig-` in any rendered output), the "no manifest hit → placeholder card" path on a real no-manifest paper-asset group, and backward-compat controls (omitting the new optional params reproduces pre-cut byte-identical output) | yes |
| `verify-draft-pagination-renderer.mjs` | draft-desk-b step1 (MF-2): same synthetic multi-page fixture rendered three times through the shared pinned full Chromium; asserts stable page count/group landing, normalized paginated HTML determinism, script removal, and real PDF bytes. Runs as a dedicated `e2e` step; this table's `no` means it is intentionally outside the daily verify-ci registry. | no |
| `verify-draft-pagination-perf.mjs` | Local-only warm-render latency and event-loop probe against the shared full Chromium; excluded from CI because an absolute timing ceiling would be noisy on shared runners. | no |
| `verify-draft-pagination-dom-contract.mjs` | draft-desk-b step2 (MF-3): real shared-Chromium proof of page-count/group mapping, split-fragment merging, no marker leakage, fail-loud mismatch, and real figure pixels after data-URI inlining. Runs as a dedicated `e2e` step. | no |
| `verify-draft-pagination-cache-trigger.mjs` | draft-desk-b step2/3 (MF-4 / DP-title): `draftPaperPaginationSignature`'s field sensitivity (the pagination cache's entire hit/miss decision) — layout edits (reorder/add/remove item, toggle `pageBreakBefore`, swap `groupId`, `versionType`) AND **`title`** (DP-title Option B, owner ruling 2026-07-12 — title is baked into every page's printed footer) change the signature; non-layout edits (`studentLabel`, an item's `updatedAt`-only bump) do not. No Chromium needed (plan.md step2: "行为断言,不用浏览器") — the cache-hit decision inside `getDraftPaperPagination` is this one signature-equality check. Also a source-structure backstop confirming `getDraftPaperPagination` actually wires to `draftPaperPaginationSignature` (not `draftPaperPrintSignature`, retired in step4 along with the old Vivliostyle-line 30s cache — `exportDraftPaperPdf` now goes through `getDraftPaperPagination`/`draftPaperPaginationSignature` too) | yes |
| `verify-draft-chromium-pool-lifecycle.mjs` | chromiumPool `getContext()` lifecycle guard (Detail #368): a connection-preserving `newContext()` failure must close the live browser instead of leaving it reachable-but-contextless for the next acquire to overwrite and orphan; next acquire relaunches exactly once and recovers. Stubbed playwright-core at the module-cache seam — no real Chromium | yes |
| `verify-reorder-suggest.mjs` | Pure candidate determinism plus live shared-Chromium proof of zero-write suggestion lookup, cache stability, response shape, not-found behavior, and real apply/undo clicks. Runs as a dedicated `e2e` step. | no |
| `verify-a3-imposition.mjs` | Shared-Chromium proof of A4 zero-diff, A3 face/sheet pairing and seam mapping, then real live UI clicks for movement, pagination, rail/scrollspy, responsive overflow, and A4 restoration. Runs as a dedicated `e2e` step. | no |

## Process / workflow gates

| Script | Scope | Runs in CI? |
| --- | --- | --- |
| `verify-cut-artifacts.mjs` | Multi-session contract check: `node scripts/verify-cut-artifacts.mjs <cut-dir> <tier>` requires a non-empty `spec.md` or legacy plan for medium/large work; Matt-native flow has no standing CR/RM/cut-note artifact gate | no |
| `verify-c8-forbidden-scope.mjs` | C8 cut-specific forbidden-scope audit (historical) | no |
| `verify-paper-canonical-migration-ledger.mjs` | Ticket 21 read-only 33-paper latest census, byte/tree manifest, deterministic disposition queue, DB/version/sidecar/Consumer Contract/rollback inventory, and before/after zero-mutation proof; `--write` only refreshes the two checked-in migration artifacts. | no |
| `verify-paper-canonical-full-corpus-dry-run.mjs` | Ticket 22 zero-write compile over the frozen 33-paper denominator. Each public-compiler request is assembled only from manifest-locked `latest` files; it records evidence-bound compiler and closure diagnostics plus deterministic inspection-cost and source-closure-risk measures. `--write-evidence` may refresh only the checked-in diagnostic record after a clean preflight. | no |

## Miscellaneous / older Paper Intelligence cuts

| Script | Scope |
| --- | --- |
| `verify-i0c-seven-choices-analysis-v1.mjs` | I0-C 七选五 analysis v1 asset contract |
| `verify-i0d-seven-choices-surface.mjs` | I0-D 七选五 surface render contract |
| `verify-paper-surface-interaction-model-doc.mjs` | PaperSurface interaction model doc |
| `verify-paper-surface-textmap-adapter-plan.mjs` | Text-map adapter plan |
| `verify-paper-surface-tokens.mjs` | Token contract |
