# detail-consume-only Plan — 详情视图退役回归看题页 + 全站难度 UI 下线

## Cut Size

medium-large（前端删除为主，多文件、含 `App.tsx` 分散删除点 + 精细的
READ/WRITE 保留切分，漏删风险高）。

Touches schema, data contract, product boundary, or teaching interpretation:
**yes（product boundary）**。落地 ADR-0015「网站界面只做消费」+ 难度维度
下线。**不碰 schema / data-contract 数据层**（难度数据层明确 Forbidden）；
碰一处 domain type 的 UI 导出（删 `difficultyLabel` 导出，保留 type 字段）。
可逆（纯前端删除，DB 数据不动，git revert 即回）。

## Objective

把题目详情视图从「classic-retire 逐字搬来的经典管理台」瘦回**看题页**：
删掉 owner-only 的「网站现场生产」动作（跑 AI 解析/保存、主题划分/绑定、
难度标定、AI ops-trace），保留 member 可见的消费内容（passage/题目/答案/
已存解析/答案对比 + AI 验证展示/已绑定话题标签展示/加入草稿卷）与 owner-only
的低频纠错运维（编辑、删除）。同时**全站下线难度维度的 UI/功能层**（找题卡、
详情、EntryModal、App.tsx 难度 state、校正模块、引导文案），**数据层完全保留**。
连带删 `App.tsx` 里这些动作的 handler / state。服务端零改动。

DEV 读完 ADR-0015 + decisions.md + 本 plan 即可执行；侦察已把「最容易漏」的
点钉在下面「参考实现」，逐条核对。

## Locked Product Decisions

完整见 `docs/cuts/detail-consume-only/decisions.md`（D1–D5）。摘要：

- D1 靶子=禁「网站现场生产」；编辑/删除属低频纠错运维，保留详情页
  owner-only 兜底，不搬后台、不建管理页。
- D2 详情视图删现场生产动作、回归看题页；**READ 回填链路必须保留**，只删
  `handle*` 现场调 AI 的 WRITE 路径。
- D3 难度全站下线，**只删 UI/功能层，数据层完全不碰**。
- D4 难度含 hero 题组级徽标一并删（详情页范围内）；ConciergeGroupCard 难度
  展示也删。
- D5 steward NL 搜索难度维度留后端不碰，只删引导按难度搜的示例文案。

## 硬契约（不得偏离；偏离 = CR 打回）

- **C1 详情视图删现场生产动作**：详情页不再有「跑 AI 解析/保存解析」（各
  题型）、「主题划分/绑定候选」按钮，及所有 AI ops-trace 段（provider/model/
  keySource/keyFingerprint/requestId/latency）。member 与 owner 视角都看不到。
- **C2 READ 回填链路保留**：打开一个已有后台解析的题组，member 与 owner 都
  仍看到：已存各题型解析（每题 question-ai-block）、题组说明里的答案对比统计、
  底部「AI 答案验证」结果列表、已绑定话题标签展示。这些由 `openDetail` 从
  `QuestionGroupDetail` 回填，**不得随 WRITE 路径一起删**。
- **C3 编辑 / 删除保留 owner-only**：详情页 hero owner 视角仍有「编辑」（开
  EntryModal）与「删除」；member 视角看不到。
- **C4 难度 UI 全站下线**：ConciergeGroupCard 无难度 pill/dot；详情页无任何
  难度 UI（含 hero 题组级难度徽标、每题标定卡、校正建议/报告、复核队列、
  DifficultyProfileGrid、同义替换难度卡）；EntryModal 无难度 select；引导按
  难度搜的示例文案改掉。
- **C5 难度数据层零改动**：`difficulty` 及各难度列、难度相关路由、
  `readingDifficultyNormalizer` / `synonymDifficultyService`、steward
  `difficultyLevels`、schema / VIEW / `publisher.mjs` / seed **一律不动**。
  writes 路径继续写 `difficulty`（`NOT NULL`），只是 UI 不展示。
- **C6 service 层 + AI Enhancement + server 零改动**：`services/questionGroups.ts`
  的解析/验证/标签 client 函数**保留**（AI Enhancement 面板共用）；`App.tsx` 的
  `runAiEnhancementAnswerParse` 及其 sync-into-open-detail 分支**保留**；
  `server/**` 不碰。（只删 `saveQuestionDifficultyRating`/`generateSynonymDifficulty`
  这类**仅难度相关且删 UI 后无 caller** 的 client 函数——删前 grep 确认零 caller。）
- **C7 verify 随动 + 全绿**：因删除而失效的 UI 断言更新/退役，`verify:all` 全绿，
  `verify-ci` 注册表与实际脚本一致。后端难度计算 verify（h5j/h5k/h5h/h5i/h1g/
  owner-gate）**不得因本刀失败**（数据层没动，它们应保持绿）。
  - **MF-1（断言反转，不是"update"）**：`verify-classic-retire-2.mjs` 现在断言
    「**存在**」本刀要删的东西（非-reading「AI解析」钮 / `onGenerateTopicLabels`
    钮 / 话题候选+绑定块 / `teacher-difficulty-card` / 5 段 AI ops-trace）→ 必须
    **反转成断言「不存在」**；同时保留「编辑钮 / passage / 加入草稿卷 /
    onOpenDetail 穿透」的断言。只写"update" 会让 DEV 表面改改就 ship 红。
  - **MF-3（formatSavedAt 断言冲突）**：`verify-classic-retire-2` 断言
    `formatSavedAt` 已定义，但其 call site 全在已删的 save 块里。处置=**保留
    `formatSavedAt` 在 `detailHelpers.ts` 的 export（哪怕 call-less）+ 保留该
    断言**（它是模块 export，不触发 `noUnusedLocals`）。别删函数、别删断言。

## 参考实现（DEV 照此清单逐条核对；行号会漂，以符号 + 文件定位，执行时 grep 确认）

来自两路侦察的 DELETE / KEEP 地图。**每一条都核对，尤其标 ⚠️ 的「最容易漏」。**

### 详情视图 `app/src/features/question-detail/QuestionGroupDetailView.tsx`

- 删：hero 里 owner-only 的「AI解析」按钮（reading 走 onAnalyzeReading / 其余
  走 onVerify）、hero 难度徽标 `<span className="difficulty">`。
- 删：话题标签 section 里 owner-only 的「主题划分」按钮、候选勾选/绑定、绑定
  状态消息、topicLabelTrace（ai-meta）。**保留**已绑定 `selectedDetail.topicLabels`
  展示（member 可见）。
- 删：各题型 AI 解析 section（reading/cloze/seven/grammar）里 owner-only 的
  「保存 AI 解析」按钮 + reading-ai-actions + AI ops-trace 段 + save error。
  **保留** section 本体的解析内容展示（parsedCount、脉络、故事大意、重要词块等
  member 可见部分）。
- 删：小题列表里所有难度块——difficulty-review-panel（复核队列）、
  calibration-report（校正报告）、每题 teacher-difficulty-card、
  calibration-preview-card、`<DifficultyProfileGrid>`、synonym-difficulty-card。
- 删：底部「AI 答案验证」section 内 owner-only 的 ops-trace 段（provider/model/
  requestId/…）。**保留** section 本体（verifyResult 驱动的 verify-list、
  答案对比统计 answerCompareStats）——member 可见（C2）。
- 保留：passage section、题组说明（除难度外）、每题 topline/stem/options/
  answer-grid、每题 question-ai-block（已存各题型解析展示）、加入草稿卷、返回。
- ⚠️ 删掉 owner-only 现场生产块后，包裹它们的 `{isOwnerView && …}` 变死代码，
  一并 unwrap/删除。编辑/删除的 `{isOwnerView && …}`（hero 两个按钮）**保留**。
- 组件 props 类型同步瘦身：删掉不再传入的 onVerify/onAnalyzeReading/onSave*Parse/
  onGenerateTopicLabels/onToggleTopicLabel/onBindTopicLabels/onSaveQuestionDifficulty/
  onUpdateDifficultyDraft + 对应 verify/parse/topicLabel/difficulty prop 分组里
  **仅 WRITE 用**的字段。**保留** READ 展示需要的字段（selectedDetail、各 parse
  result、verifyResult、topicLabels 展示、isOwnerView、onBack、onEdit、onDelete、
  onAddToBasket）。

### `app/src/App.tsx`（渲染点唯一：`<QuestionGroupDetailView>`）

- 删 handler：`handleVerifyQuestionGroup`、`handleAnalyzeReadingQuestionGroup`、
  `handleSaveReadingParseResult`、`handleSaveClozeParseResult`、
  `handleSaveSevenChoicesParseResult`、`handleSaveGrammarParseResult`、
  `handleGenerateTopicLabels`、`toggleTopicLabelSelection`、`handleBindTopicLabels`、
  `handleSaveQuestionDifficulty`、`updateDifficultyDraft`、`applyReadingAiDifficultyScores`。
  （侦察确认这些的唯一 call site 是传给 detail view 的 prop。）
- ⚠️ 删难度 state：`difficultyDrafts`/`difficultySaveStatus`/`difficultySaveErrors`
  + 其 rehydration `useEffect`（keyed on `selectedDetail?.id`）。100% 详情专属。
- ⚠️ 删 topic-label scratch state：`topicLabelStatus/Error/Trace/Recommendations/
  selectedTopicLabelValues/bindStatus/bindError`。100% 详情专属。
  （注意：`openDetail` 里 `if (detail.topicLabels?.length) setTopicLabelStatus('loaded')`
  这句若 state 删了则一并删；已绑定标签展示读 `selectedDetail.topicLabels`，不受影响。）
- ⚠️ **保留（只读回填态）**：`readingParseResult`/`clozeParseResult`/
  `sevenChoicesParseResult`/`grammarParseResult`/`verifyResult` 及其
  status/error/saveStatus/saveError —— 它们被 `runAiEnhancementAnswerParse`
  的 sync-into-open-detail 分支写。**保留 state + `openDetail` 回填 +
  `buildClozeVerifyResult`/`buildSevenChoicesVerifyResult`/`buildGrammarVerifyResult`
  本地派生 + AI Enhancement sync 分支**；只删详情 handler 的 WRITE 写入。
- ⚠️ 删 EntryModal 相关（detail-view-exclusive）：`isEntryOpen`、`entryInitialDetail`、
  `openEditEntry`、`handleEntrySaved`、`<EntryModal>` 渲染块。**但 onEdit/编辑
  能力保留**——重新想清：编辑要留（C3），所以 EntryModal 渲染 + open 链路
  **保留**，不是删。（侦察把它们列为「若删 onEdit 才连带删」；本刀 onEdit 保留，
  故 EntryModal 保留。）→ DEV 注意：这一项与「删除现场生产」相反，**保留**。
- ⚠️ 删两处硬编码 `difficulty: 'medium'` 字面量若属难度 UI 逻辑；但若是构造
  QuestionGroupCard/detail 的 fixture-shaped 默认值且下游 type 仍需该字段，
  **保留**（数据字段不删）。DEV 判断：删的是难度 UI，不是 difficulty 数据字段。
- 更新 `<QuestionGroupDetailView … />` 的 props 传入，与瘦身后的组件 props 对齐。
- `applyReadingAiDifficultyScores`：若仅服务于难度 UI 展示则删；若它写入
  `readingParseResult`/`verifyResult` 的 READ 展示所需字段，需保留那部分。DEV
  核实其副作用后决定。

### 找题卡 `app/src/concierge/ConciergeGroupCard.tsx`

- 删：`DIFFICULTY_CLASS` map、`pills.push(difficultyLabel[group.difficulty])`、
  `concierge-difficulty-dot` span。其余 pill（题型/年份/地区/来源）保留。

### 编辑弹窗 `app/src/workbench/EntryModal.tsx`

- ⚠️ **MF-5：只删可见的难度 `<select>`（约 line 362-372）+ 其 onChange。KEEP
  这三个 difficulty 字段种子**（删了会触发后端 `NOT NULL`）：`EntryFormState.difficulty`
  （type，line 28）、`initialForm.difficulty: 'medium'`（line 68）、
  `deriveFormFromDetail` 的 `difficulty: detail.difficulty`（line 109）。即：**删控件、
  留字段**，提交 payload 继续带合法 difficulty。

### 校正模块 / 文案 / 服务

- 删 `app/src/services/difficultyCalibration.ts`（纯前端，删 App/detail 后无 caller）。
- `app/src/services/questionGroups.ts`：删仅难度相关且零 caller 的 client 函数
  （`saveQuestionDifficultyRating`、`generateSynonymDifficulty` 等）+ 其类型。
  **grep 确认零 caller 再删**；解析/验证/标签函数保留（AI Enhancement 共用）。
- `app/src/domain/questionBank.ts`：删 `difficultyLabel` 导出（UI label）。**保留**
  所有 difficulty type 字段（`difficulty`/`aiDifficultyScore`/`teacherDifficulty`/
  `difficultyProfile`/… + `ReadingParseDifficultyProfile`/`SynonymDifficulty*`）——
  数据层不删。若某 type 仅被删掉的 UI 用且删后 TS 报未使用，也保留字段（导入/
  server 契约仍在）。
- 文案：`app/src/concierge/ConciergeDesk.tsx`（placeholder/hint 里的「中等难度」）、
  `app/src/concierge/clarificationCopy.ts`（「主题、题型、难度，或考法」）——把
  难度示例换成非难度示例（如「主题、题型、考法」/「说明文 / 主旨概括」）。
- `app/src/workbench/detail/DifficultyProfileGrid.tsx`：删文件（唯一 caller 是详情）。
- ⚠️ **MF-4：`noUnusedLocals`+`noUnusedParameters` on + `build = tsc -b && vite`
  → 每个 orphan import/local 是 build 硬失败，不是 lint。「逐函数核」是 build
  承重项，DEV 照下面精确清单删/留：**
  - `detailHelpers.ts` **文件保留**（共享 helper）；删的是 DetailView/App 里对
    难度 helper 的 import + 用法。
  - **DetailView imports 删**：`compactPreview`（唯一用处在已删复核队列）、
    `formatSavedAt`（用处全在已删 save 块——但 detailHelpers 里的**定义保留**，见
    MF-3）、`mainBlockerLabel`、难度 helper（`getDisplayDifficulty`/
    `mapAiDifficultyScoreToFive`/`requiresDifficultyReason`/`getDifficultyDraftForQuestion`/
    `DifficultyRatingDraft`）。
  - **DetailView imports 保留**：`compactGroupMeta`（hero 用）、`getParseSavedAt`
    （驱动 member 答案对比框，SW-2，别当 parse plumbing 扫掉）、`labelOf`（保留的
    干扰项块用）。
  - **App.tsx import（~line 107）**：删 `getDifficultyDraftForQuestion`/
    `DifficultyRatingDraft`，**保留 `compactPreview`**（App.tsx 别处 ~line 3554 还用）。
  - **`difficultyLabel`（domain 导出）**：**先删两个 call site**（DetailView hero
    徽标 + ConciergeGroupCard）**再删 export**，否则 tsc 红。`Difficulty` **type
    保留**（EntryModal/ConciergeGroupCard/domain 用）。
  - **不要删** `app/src/workbench/detail/readingProfileLabels.ts`（还 export
    `labelOf` 给保留的干扰项块，SW-4）。
  - `applyReadingAiDifficultyScores`（App.tsx）：唯一 caller 是已删的
    `handleSaveReadingParseResult`，AI Enhancement reading 分支不调它——**随
    handler 删、无 READ 依赖**（PA 已核）。

## Forbidden

- **不碰难度数据层**：`data/sql/schema.sql`、`v_question_group_cards` VIEW、
  `server/paper-import/publisher.mjs`、`data/sql/seed-v0.sql`、`server/api.mjs`
  的难度列/迁移/`saveQuestionDifficultyRating` 后端实现、
  `server/reading-analysis/readingDifficultyNormalizer.mjs`、
  `server/ai-parse/synonymDifficultyService.mjs`、
  `server/search/questionBankStewardService.mjs` 的 `difficultyLevels`。
- **不碰 `server/**` 任何文件**（后端已 ownerOnly，无需改）。
- **不删 READ 回填链路**（`openDetail` 的 parse/verify 回填、本地派生函数、
  AI Enhancement sync 分支）。
- **不碰 service 层解析/验证/标签函数**（AI Enhancement 共用）与 AI Enhancement
  面板本身。
- **不碰 domain type 的 difficulty 数据字段**（只删 `difficultyLabel` UI 导出）。
- **DEV 不许 spawn 子代理**（classic-retire 刀 3 血泪：转包并发编辑同一工作树 +
  token 翻倍）。全部编辑在本 DEV 上下文内完成。

## Suggested Files

- `app/src/features/question-detail/QuestionGroupDetailView.tsx`（大改：删现场
  生产 + 难度，瘦 props）
- `app/src/App.tsx`（删 handler/state，保留回填 + AI Enhancement + 编辑链路）
- `app/src/concierge/ConciergeGroupCard.tsx`、`ConciergeDesk.tsx`、`clarificationCopy.ts`
- `app/src/workbench/EntryModal.tsx`、`app/src/workbench/detail/DifficultyProfileGrid.tsx`（删）
- `app/src/services/difficultyCalibration.ts`（删）、`app/src/services/questionGroups.ts`
- `app/src/domain/questionBank.ts`、`app/src/features/question-detail/detailHelpers.ts`
- verify（**MF-1/MF-2/MF-3**，精确）：
  - `scripts/verify-classic-retire-2.mjs`：**断言反转**（MF-1）+ 保留 `formatSavedAt`
    断言（MF-3）。
  - `scripts/verify-h12b-difficulty-profile-grid.mjs`：删文件 **+ 从
    `scripts/verify-ci.mjs` 注册表移除**（它在注册表；不移除 verify-ci 会 spawn
    缺失文件而 fail）**+ 从 `scripts/README.md` 删行**。
  - `scripts/verify-calibration-preview.mjs`：删文件 **+ 从 `scripts/README.md`
    删行**。**它不在 verify-ci 注册表**（只在 README），故对它做「注册表同步」是
    no-op——别浪费动作找它的注册表行。
  - `scripts/verify-concierge-desk.mjs` / `verify-h12a-entry-modal.mjs`：PA 核实
    **无难度 pill 断言**，保持绿、不改。

## Verification

- C1/C3/C4：Browser QA（下表）+ `verify-classic-retire-2` 更新后断言「详情页无
  现场生产按钮、无难度 UI、owner 仍有编辑/删除」。
- C2：Browser QA——打开一个有后台已存解析的题组（member + owner 双视角），确认
  已存解析 / 答案对比 / AI 验证列表 / 已绑定话题标签 仍展示。
- C5：`git diff --stat` 确认 `server/**`、`data/sql/**`、难度 normalizer/service
  零改动；后端难度 verify（h5j/h5k/h5h/h5i/h1g/owner-gate）保持绿。
- C6：grep 确认 `services/questionGroups.ts` 解析/验证/标签函数仍存在且被
  AI Enhancement 引用；`runAiEnhancementAnswerParse` 未改。
- C7：`pnpm -C app run verify:all` 全绿；`node scripts/verify-ci.mjs` 注册表一致；
  `pnpm -C app build` + `tsc` 通过（删 `difficultyLabel` 后无 TS 报错）。

## Browser QA Matrix

| Case | Expected result |
| --- | --- |
| member 打开有解析的题组详情 | 见 passage/题目/答案/已存解析/答案对比/AI验证/已绑定标签/加入草稿卷；无编辑删除、无任何难度 UI、无现场生产按钮、无 AI trace |
| owner 打开同题组详情 | 上述 + hero「编辑」「删除」；仍无难度 UI、无跑解析/主题划分/保存/AI trace |
| owner 点编辑 | EntryModal 打开，可改题组（无难度 select），保存成功 |
| owner 点删除 | 确认后删除成功，返回列表 |
| 找题主面卡片 | 无难度 pill/dot；题型/年份/地区/来源 pill 正常 |
| 搜索框提示 / clarification | 示例文案不再出现「难度」 |
| 无解析的题组详情 | 正常展示 passage/题目/答案，解析区不报错、不显现场生产入口 |

## DEV Readiness

- 依赖：本 plan + `docs/adr/0015-web-surface-consume-only.md` +
  `docs/cuts/detail-consume-only/decisions.md`。
- 建议 DEV 顺序：① 详情视图删现场生产 + 难度（大头）→ ② App.tsx 连带删
  handler/state（保留回填/AI Enhancement/编辑链路）→ ③ 找题卡/EntryModal/文案/
  校正模块/domain 导出 → ④ verify 随动 + verify:all → ⑤ 自查 Forbidden 未越界。
- ⚠️ 每步 `tsc` 增量核，避免删 state 后 App.tsx 大面积 TS 崩。
- DEV 档位：dev-hard（Sonnet high）——删除点分散、READ/WRITE 精细切分、漏删
  风险高。

## PA Follow-Up Decisions

PA verdict: **APPROVE WITH MUST FIX**（`docs/cuts/detail-consume-only/pa.md`）。
3 个核心验证全 SOUND（READ/WRITE 可干净切、5-state 与 AI Enhancement 耦合确认、
数据层 Forbidden 守得住、编辑/删除保留自洽）。5 Must Fix 全为技术精化（0 Open PO
Decisions），PM 全部接受、已压进 plan 对应章节。

| PA item | pa.md 要求处置 | plan.md 落点 | Status |
| --- | --- | --- | --- |
| MF-1 | `verify-classic-retire-2` 断言**反转**（断言删掉的现场生产/难度/trace「不存在」，保留 编辑钮/passage/加入草稿卷/onOpenDetail 断言） | 硬契约 C7·MF-1 + Suggested Files verify | Resolved |
| MF-2 | verify-ci 注册表 vs README 精确：`verify-h12b` 从 **verify-ci 注册表**移除；`verify-calibration-preview` **只在 README**（对它做注册表同步是 no-op） | Suggested Files verify·MF-2 | Resolved |
| MF-3 | `formatSavedAt` 断言冲突：**保留** detailHelpers 的 export（call-less）+ 保留断言 | 硬契约 C7·MF-3 + 参考实现 MF-4 | Resolved |
| MF-4 | 枚举 `noUnusedLocals`+`tsc -b` build 硬失败 orphan：DetailView/App import 删留清单 + `difficultyLabel` 两 call-site 先删再删 export + **不删** `readingProfileLabels.ts` | 参考实现·MF-4 清单 + DEV Readiness tsc 注 | Resolved |
| MF-5 | 点名 EntryModal difficulty 字段种子 **KEEP**（`EntryFormState.difficulty`/`initialForm`/`deriveFormFromDetail`），只删 `<select>` | 参考实现 EntryModal·MF-5 | Resolved |

Should Watch（DEV 留意，非阻塞）：SW-1 `openDetail` 的 `setTopicLabelStatus('loaded')`
随 topic scratch state 删；SW-2 `getParseSavedAt` 是 READ 展示，保留（别当 parse
plumbing 扫掉）；SW-3 `difficultyCalibration.ts` 安全整文件删；SW-4
`readingProfileLabels.ts` **不删**（`labelOf` 存活）。
