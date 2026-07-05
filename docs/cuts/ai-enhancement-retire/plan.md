# ai-enhancement-retire Plan — 退役 App.tsx 内嵌 AI 增强面板（B）

## Cut Size

medium（单文件为主：`App.tsx` 删内嵌 AI 增强面板 + `App.css`；碰 member READ
命脉的精细 READ/WRITE 保留切分）。可逆（纯前端删除，DB/后端不动，git revert
即回）。

Touches schema, data contract, product boundary, or teaching interpretation:
**yes（product boundary）** —— 落地 ADR-0015「网站只消费」挂账「AI 增强面板
退役」。不碰 schema / data-contract / server。

## Objective

退役 B = App.tsx 内嵌的「AI 增强面板」（普通导题草稿入库后弹出，对入库题组
批量跑 简介 / 主题标签 / 答案解析）。删这个现场生产面 + 其 state / handler /
渲染块 + 导题提交后的 `showAiEnhancementPanel` 调用 + `App.css`。**保留 member
看已存解析的 5-state READ 命脉**（只删 B 对 5-state 的 WRITE，跟
detail-consume-only 删详情 handler 同款切法）。A（独立 AI 导题页）不在本刀
（单独立项）。后端 + 普通导题 workbench + 全局 AI 配置不碰。

## Locked Product Decisions

见 `decisions.md`（D1–D3）。摘要：
- D1 本刀只退 B；A 单独立项（删 A 牵连 8 前后端一体 verify）。
- D2 删 B 现场生产，保留 5-state READ 命脉（openDetail 回填 + build*VerifyResult）。
- D3 后端 + 普通导题 + 全局 AI 配置不碰。

## 硬契约（不得偏离；偏离 = CR 打回）

- **C1 删 B 现场生产面**：`ai-enhancement-panel` 渲染块（App.tsx ~3091-3202）+
  其全部 state / handler / 常量 / 类型 / 工厂删除。导题草稿入库后不再弹 AI
  增强面板。
- **C2 保留 member READ 命脉**：打开有后台已存解析的题组，member 与 owner 仍
  看到 已存各题型解析 / 答案对比 / AI 验证列表 / 已绑定话题标签。这些由
  `openDetail` 从 `QuestionGroupDetail` 回填 5-state + `build*VerifyResult` 本地
  派生驱动，**不得随 B 的 WRITE 一起删**。
- **C3 保留导题入库自洽**：`handleCommitDraftGroup` /
  `handleBatchCommitObjectiveDraftGroups` 删掉 `showAiEnhancementPanel(...)` 调用
  后，导题草稿仍能提交入库（`setQuestionGroups` + `refreshQuestionGroups` 保证
  列表刷新），只是不现场增强。
- **C4 后端 + 普通导题 + 全局配置零改动**：`server/**`、`services/*` 定义文件、
  `PaperImportWorkbench`（非 AI 导题）、`aiApiKey` / `aiModel` / `aiThinkingMode`
  全局 AI 配置 —— 一律不碰。
- **C5 verify 全绿**：B 无专属 verify（grep 确认 `aiEnhancement` 在 `scripts/`
  零命中）。删 B 后 `verify:all` 保持全绿，`verify-ci` 注册表不需增删（无 B
  相关脚本）。DEV 跑 `verify:all` 确认无脚本因删 B 而 fail。

## 参考实现（DEV 照此逐条 grep 核对；行号会漂，符号 + 文件定位）

### 删除 —— App.tsx 内嵌 AI 增强面板（B）

**类型 / 常量 / 工厂（模块级）：**
- `type AiEnhancementTask`(~106)、`type AiEnhancementTaskState`(~108)
- `const aiEnhancementTasks`(~279)、`aiEnhancementTaskLabel`(~284)、
  `aiEnhancementTaskStatusLabel`(~289)
- `function createEmptyAiEnhancementTaskState`(~330)、`createAiEnhancementStatus`(~337)

**state（~786-802，9 个）：** `aiEnhancementTargets` / `aiEnhancementSelection` /
`aiEnhancementStatus` / `aiEnhancementRunStatus` / `aiEnhancementError` /
`aiEnhancementTopicCandidates` / `aiEnhancementSelectedTopicValues` /
`aiEnhancementTopicBindStatus` / `aiEnhancementTopicBindError`。

**useEffect（~978-989）：** rehydrate `aiEnhancementStatus`（依赖
`aiEnhancementTargets`）。

**handler：**
- `showAiEnhancementPanel`(~1413)
- `updateAiEnhancementTaskStatus`(~1430)
- `updateAiEnhancedQuestionGroup`(~1454) —— ⚠️ 只 B 用（caller 1495 / 1628 均在
  B 内）；删后导题入库列表刷新走 `handleCommit*` 里已有的 `setQuestionGroups` +
  `refreshQuestionGroups`，不依赖它。
- `runAiEnhancementAnswerParse`(~1489) —— ⚠️ 含 `if (selectedDetail?.id === detail.id)`
  的 sync-into-open-detail 分支（写 5-state）。**整个函数删（含 sync 分支）**；
  5-state **本身保留**（`openDetail` 回填用）。
- `handleRunAiEnhancement`(~1589)
- `handleBindAiEnhancementTopicLabels`(~1689-1744) —— ⚠️ 内含
  `setSelectedDetail(...topicLabels)` 是 B 的 WRITE，随函数删；member 看已绑定
  标签走 `openDetail` 回填的 `selectedDetail.topicLabels`（detail-consume-only
  C2 保留），不受影响。

**渲染块（~3091-3202）：** `{aiEnhancementTargets.length > 0 && (<div className="ai-enhancement-panel" …>…</div>)}` 整块删。（嵌在导题草稿视图 batchCommit
面板与 objectiveDraft 面板之间，删后视图自洽。）

**caller 去调用（保留其余逻辑）：**
- `handleCommitDraftGroup`(~1817)：删 `showAiEnhancementPanel([saved], 'append')`
  一行。
- `handleBatchCommitObjectiveDraftGroups`(~1883)：删
  `showAiEnhancementPanel(savedGroups, 'replace')` 一行。

**import 清理（`noUnusedLocals` + `tsc -b` 硬失败，不是 lint）：**
- 删 B 后仅 B 用的 service import 变 unused → 删 App.tsx 的 import（**service
  定义文件保留**）。⚠️ DEV 逐个 grep 确认其余 caller 后删：
  `parseReadingQuestionGroupRequest` / `verifyQuestionGroupRequest` /
  `saveReadingParseResultRequest` / `parseClozeGroupRequest` /
  `saveClozeParseResultRequest` / `parseSevenChoicesGroupRequest` /
  `saveSevenChoicesParseResultRequest` / `parseGrammarGroupRequest` /
  `saveGrammarParseResultRequest` / `generateQuestionGroupSummaryRequest` /
  `generateTopicLabelsRequest` / `bindTopicLabelsRequest`。
  这些多是「现场生产」请求，detail-consume-only 删详情 WRITE 后 caller 只剩
  B；删 B 后大概率全 unused。**但先 grep 确认**：`openDetail` 回填不调它们
  （灌 detail 自带的 parseResult）、`build*VerifyResult` 是本地派生（不调
  verify request）—— 确认无其余 caller 再删 import。
- lucide 图标 import（如 `Save`）若删 B 后 App.tsx 别处不用 → 删。DEV grep。

### 删除 —— App.css

- `.ai-enhancement-panel` 及其子类（`.ai-enhancement-head` 等，~2554+）。grep
  `ai-enhancement` 找全，确认无别处引用后删。

### 保留（member 命脉 + 共享，不得动）

- **5-state + status/error/saveStatus/saveError**：`readingParseResult` /
  `clozeParseResult` / `sevenChoicesParseResult` / `grammarParseResult` /
  `verifyResult`。
- **`openDetail` 回填** 这 5-state（member 看已存解析命脉）。
- **`build*VerifyResult` 本地派生**：`buildClozeVerifyResult` /
  `buildSevenChoicesVerifyResult` / `buildGrammarVerifyResult`。
- **全局 AI 配置**：`aiApiKey` / `aiModel` / `aiThinkingMode`（别处用）。
- **通用 setter**：`setQuestionGroups` / `setSelectedDetail`（B 只是 caller 之一）。
- **普通导题**：`PaperImportWorkbench`（非 AI）+ `handleCommitDraftGroup` /
  `handleBatchCommitObjectiveDraftGroups` 主体逻辑（只删 `showAiEnhancementPanel`
  调用）。
- **service 定义文件**：`services/questionGroups.ts`（及其余 service）不删（后端
  保留原则；即便某函数变 call-less，module export 不触发 `noUnusedLocals`）。

## Forbidden

- 不碰 `server/**`（含 paper-import-ai routes + question-bank routes + ai-proxy）。
- 不碰 `data/sql/**`、schema、VIEW、publisher、seed。
- 不删 5-state / `openDetail` 回填 / `build*VerifyResult`（member READ 命脉）。
- 不碰 A（`app/src/features/paper-import-ai/**`、`services/paperImportAi.ts`、
  App.tsx 的 `paperImportAiRouteActive` 路由、AdminWorkbench 的 A 入口）—— A
  单独立项。
- 不碰普通导题 workbench + 其导题逻辑（只去 `showAiEnhancementPanel` 调用）。
- 不碰全局 AI 配置（`aiApiKey` / `aiModel` / `aiThinkingMode`）。
- **DEV 不许 spawn 子代理**（classic-retire 刀 3 血泪：转包并发编辑 + token
  翻倍）。全部编辑在本 DEV 上下文内完成。

## Suggested Files

- `app/src/App.tsx`（删 B：类型 / 常量 / 工厂 / state / useEffect / handler /
  渲染块 + 两处 caller 去调用 + import 清理）
- `app/src/App.css`（删 `.ai-enhancement-panel` 及子类）

## Verification

- C1：Browser QA —— 普通导题草稿提交入库后**不再弹 AI 增强面板**；App.tsx
  grep `aiEnhancement` 零命中。
- C2：Browser QA —— 打开有后台已存解析的题组（member + owner），确认 已存解析 /
  答案对比 / AI 验证列表 / 已绑定话题标签 仍展示（member READ 命脉未断）。
- C3：Browser QA —— 导题草稿仍能提交入库、列表刷新。
- C4：`git diff --stat` 确认 `server/**`、`data/sql/**`、`services/*` 定义、
  `paper-import-ai`、普通导题 workbench 零改动。
- C5：`pnpm -C app run verify:all` 全绿；`pnpm -C app build`（`tsc -b` + vite）
  通过（删 B 后无 orphan import / unused local）。

## Browser QA Matrix

| Case | Expected result |
| --- | --- |
| 普通导题提交草稿入库 | 题组入库、列表刷新；**不再弹 AI 增强面板** |
| member 打开有解析的题组详情 | 见 passage / 题目 / 答案 / 已存解析 / 答案对比 / AI 验证 / 已绑定标签（member READ 命脉未断） |
| owner 打开同题组详情 | 上述 + 编辑 / 删除（detail-consume-only 保留项，本刀不碰） |
| App.tsx grep `aiEnhancement` | 零命中（B 删净） |

## DEV Readiness

- 依赖：本 plan + `decisions.md` + `docs/adr/0015-web-surface-consume-only.md` +
  `docs/cuts/detail-consume-only/plan.md`（5-state READ/WRITE 切法先例）。
- 建议 DEV 顺序：① 删渲染块(~3091-3202) → ② 删 handler（含
  `runAiEnhancementAnswerParse` 的 sync 分支，**保留 5-state**）→ ③ 删 state /
  useEffect / 常量 / 类型 / 工厂 → ④ 两处 caller 去 `showAiEnhancementPanel`
  调用 → ⑤ import 清理（grep 每个 service import 其余 caller）→ ⑥ `App.css`
  删 → ⑦ 增量 `tsc` + `verify:all` → ⑧ 自查 Forbidden。
- ⚠️ 每步增量 `tsc`，避免删 state 后 App.tsx 大面积 TS 崩。
- ⚠️ 核心红线：删 B 的 5-state WRITE（sync 分支），**5-state 声明 + `openDetail`
  回填 + `build*VerifyResult` 保留**。这是 member 看解析的命脉。
- DEV 档位：dev-hard（Sonnet high）—— App.tsx 分散删除点 + READ/WRITE 精细切分。

## PA Follow-Up Decisions

（待 PA。PA verdict + Must Fix 映射由 PM 压进本节后再 DEV。）
