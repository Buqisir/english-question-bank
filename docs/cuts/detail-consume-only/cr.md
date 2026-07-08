# CR — detail-consume-only

- Reviewer: independent CR (cold-read), 2026-07-05
- Diff reviewed: `75a98b8..HEAD` (`43bb4e9`), 15 files, net +152 / −2185 (pure-deletion cut)
- Method: cold-read against plan.md C1–C7 / Forbidden / MF-1..MF-5 + ADR-0015 + decisions.md;
  `pnpm -C app build` (tsc -b + vite) and `pnpm -C app run verify:all` run locally.

## Verdict: APPROVE

C2 READ 回填命脉完整、Forbidden 数据层零触碰、5 个 Must Fix 全部落实、build 绿、verify:all 全绿。
纯删除刀最危险的两项（误删 member 消费命脉 / 越界碰数据层）都干净。可合并 redeploy。

## Verification run (proven, not assumed)

- `pnpm -C app build` → tsc -b + vite 全过（`noUnusedLocals`+`noUnusedParameters` on，orphan import/local
  零残留是 build 硬保证，非目测）。
- `pnpm -C app run verify:all` → **PASS 67 / SKIP 1 / FAIL 0**（唯一 SKIP=off-repo fixture 缺失的
  i16a，与本刀无关）。后端难度 verify（owner-gate 等）保持绿。

## 逐维度核对

### 1. C2 READ 回填链路（最高风险）— 完整保留 ✅
- `App.tsx:1112-1139` `openDetail` 的 reading/cloze/seven/grammar parse + `readingVerifyResult` +
  本地派生 `buildClozeVerifyResult`/`buildSevenChoicesVerifyResult`/`buildGrammarVerifyResult`
  回填分支全在（`App.tsx:479/526/573` 三个 build 函数定义未删）。
- 5 个 READ state（`readingParseResult`/`clozeParseResult`/`sevenChoicesParseResult`/
  `grammarParseResult`/`verifyResult` 及 status/error/saveStatus/saveError）保留。
- `runAiEnhancementAnswerParse`（`App.tsx:1489`）+ 其 sync-into-open-detail 分支（1497-1519）保留，
  未改；`updateAiEnhancedQuestionGroup` 保留。
- `QuestionGroupDetailView.tsx` 只读渲染分支全在：passage、answerCompareStats（243-254）、
  4 处 `question-ai-block`（495/569/602/632）、`verify-list`（683）、`selectedDetail.topicLabels` 展示
  （275-277）、加入草稿卷（203）。
- WRITE/难度/ops-trace 标记全部 ABSENT（grep 全 0）：`onVerify`/`onAnalyzeReading`/`onSave*Parse`/
  `onGenerateTopicLabels`/`teacher-difficulty-card`/`DifficultyProfileGrid`/`keyFingerprint`/
  `requestId`/`keySource`/`reading-ai-actions` 等。
- **`applyReadingAiDifficultyScores` 删除安全**：AI Enhancement reading 分支（1489-1520）确认不调它，
  只 set parse/verify，无 aiDifficultyScore READ 依赖（MF-4 disposition 成立）。

### 2. Forbidden / 数据层零改动 ✅
- `git diff --stat server/ data/` = **空**。schema/VIEW/publisher/normalizer/steward `difficultyLevels`
  一律未动。C5 守住。
- domain 只删 `difficultyLabel` UI 导出；`Difficulty` type + 所有 difficulty 数据字段保留。
- service 只删 `saveQuestionDifficultyRating`/`generateSynonymDifficulty`（难度专属、grep 确认零 caller）+
  其未用 import；解析/验证/标签 client 函数保留。
- 未 spawn 子代理（编辑集中，符合 Forbidden 纪律）。

### 3. MF-1 断言反转 ✅（真反转，非裸删）
- `verify-classic-retire-2.mjs` 的现场生产/难度/5 段 ops-trace 断言全部改为 assert-absent
  （`!pattern.test(detailView)`），且新增保留面正向断言（topicLabels 展示 / answerCompareStats /
  verify-list / 删除钮 owner-gated / 编辑钮 / passage / add-to-basket / onOpenDetail 穿透）。
- 正确区分保留 `handleBackfillTopicLabels`（新增正向断言）vs 删除 `handleGenerateTopicLabels`
  （新增 absent 断言）。
- 细节到位：区分 member 可见的 `verifyResult.totalLatencyMs` 汇总行（C2 保留、加正向断言）
  与 owner-only parse-result 的 `全量耗时` ops-trace（断言 absent）。这是 cold-read 容易漏、
  DEV 处理正确的点。

### 4. MF-3 formatSavedAt ✅
- `detailHelpers.ts` 的 `formatSavedAt` export 保留，verify 断言保留（loop 里从 4 项减为 3 项，
  仅移除 `getDifficultyDraftForQuestion`，`formatSavedAt` 仍在）。export 不触发 noUnusedLocals，build 绿。

### 5. MF-2 verify-ci 注册表 ✅
- `verify-h12b-difficulty-profile-grid.mjs`：从 `verify-ci.mjs` 注册表 + README 双双移除，文件已删。
- `verify-calibration-preview.mjs`：仅从 README 移除（本不在 verify-ci 注册表，正确 no-op），文件已删。
- grep 确认无任何 dangling 引用 → verify-ci 不会 spawn 缺失文件。

### 6. MF-5 EntryModal ✅
- 只删可见 `<select>` + onChange；3 个字段种子全留（type line 28 / `initialForm` line 68 /
  `deriveFormFromDetail` line 109）。提交 payload 继续带合法 difficulty → 后端 NOT NULL 不破。

### 7. Correctness / proven-ness ✅
- `difficultyLabel` 两 call-site（DetailView hero 徽标 + ConciergeGroupCard）已随组件删，export 后删，tsc 绿。
- `readingProfileLabels.ts` 未删，`labelOf`（line 72）存活（SW-4）。
- App.tsx tricky imports 复核：`generateTopicLabelsRequest`/`bindTopicLabelsRequest`/`TopicLabel`/
  `ReadingParseQuestionGroupResult` 仍被 AI Enhancement 分支真实使用（非孤儿），保留正确。
- C3：编辑/删除保留于 `isOwnerView` 门内（DetailView 183-197），member 隐藏。
- C4：ConciergeGroupCard 难度 pill/dot + DIFFICULTY_CLASS 删除；ConciergeDesk/clarificationCopy
  难度示例文案换非难度示例（D5）。

## Should Watch（非阻塞）

- **SW-1**：DetailView props 的 parse 分组仍保留 `saveStatus`/`saveError` 字段，而删除现场保存 UI 后
  DetailView 不再渲染 save 状态、也未从 props 解构它们（`QuestionGroupDetailView.tsx:96-107`）；App.tsx
  render 仍传这两个字段。属"传而不用"的良性冗余（TS 不报错，因选择性解构）。plan 明确要求保留 state 本体，
  故不构成问题；将来若想彻底瘦 props 可从分组里摘掉这两字段。纯清洁度，不阻塞。
- **SW-2**：`app/src/App.css` 里 `concierge-difficulty-*` / `teacher-difficulty-card` / 校正相关的
  死 CSS 类可能仍残留（本刀 diff 未含 CSS）。不影响功能，将来 UI 清洁刀可一并清。未纳入本刀范围，合理。

## Self-Review Blind Spots（喂给后续 Big CR）

- 本 CR 未做浏览器 QA（无真教学数据的 worktree）。Browser QA Matrix（member/owner 双视角看有解析题组、
  编辑弹窗无难度 select、找题卡无难度 pill、无解析题组不报错）需在 eqbank.cc redeploy 后由 owner 抽验，
  这是 source-level review 覆盖不到的运行时确认——尤其"member 打开有后台已存解析的题组仍看到解析/答案对比/
  AI 验证列表"这条 C2 命脉，源码链路已核实完整，但活体渲染仍建议实机点一下。
