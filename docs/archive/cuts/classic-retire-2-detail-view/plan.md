# 刀 2「题组详情进 AI 模式」— DEV 契约（plan v1）

Cut size: medium-large；touches product boundary: yes（member 可见面变化）
→ 按流程走 PA（fresh Opus），PA 结论压缩后 DEV 才开工。

前置档案：`docs/cuts/classic-retire/{inventory,proposal}.md`（owner 已圈定
Q2-A：只读详情对 member 开放）、刀 1 档案 `classic-retire-1-admin-corner/`。

## 目标（一句话）

把 classic `viewMode='detail'` 的题组详情（App.tsx 3678–4934，~1256 行 JSX）
抽成独立组件，ConciergeDesk 题组卡片加「详情」入口；member 只读、owner
额外见编辑/生成按钮。

## 侦察结论（已抽验 file:line，2026-07-03）

- detail JSX 分支：App.tsx 3678–4934，在 `viewMode` 三叉里、**不被
  homeMode 包住**（3588 处结构），AI 模式下 `openDetail(id)` 即可直接渲染，
  `backToList`（App.tsx:1648）回 list 后 AI 模式自然回 ConciergeDesk。
- **分支内部现在零 owner 门控**（isOwnerView 在 3678–4934 内零命中）；
  现状全靠"member 进不了经典模式"外闸（homeMode 强制 'ai'，App.tsx:828-834
  + 切换按钮 owner-only 3413）。→ 刀 2 的按钮门控是**新增逻辑**，不是搬运。
- 服务端已就位：GET /api/question-groups/:id 对 member 开放，16 条
  AI 生成/保存 POST 全 ownerOnly（server/question-bank/questionGroupRoutes.mjs
  15-19 注释 + 逐路由 `{ ownerOnly: true }`）。**本刀服务端零改动。**
- 状态面：~40 个 useState（App.tsx 857-899：detail 生命周期 / verify /
  cloze / sevenChoices / grammar / reading 四题型 parse 五件套 / topicLabel
  七件 / difficulty 三件）；handler ~17 个（handleVerifyQuestionGroup:2322、
  handleAnalyzeReadingQuestionGroup:2436、四个 save-parse、
  handleGenerateTopicLabels:2629、handleBindTopicLabels、
  handleSaveQuestionDifficulty:1609、updateDifficultyDraft:1588 等）。
  `aiApiKey/aiModel/aiThinkingMode` 只在 handler 内部读，handler 留
  App.tsx 作 props 传入即不受影响。
- 纯函数：`compactGroupMeta:434`、`getDifficultyDraftForQuestion:381`、
  `formatSavedAt:599`（模块级纯函数）；`answerCompareStats`（App.tsx:1302
  useMemo，只依赖 verifyResult）。
- ConciergeDesk 卡片链：ConciergeDesk.tsx（props 32-58）→
  ConciergePaperRow.tsx:242-243 → ConciergeGroupCard.tsx（group.id 可用
  :118；现有按钮只有 onAdd/onSimilar）。App 实例化于 App.tsx:3590-3602。
- 抽取先例：AdminWorkbench（features/admin/）纯 props 驱动、零内部
  state。
- CSS：detail-* 全在 App.css；**`detail-button` 在分支外也被使用
  （App.tsx:6127）** → 本刀不动 CSS，死 CSS 清理归刀 3。
- verify 脚本：全仓对 detail-view/openDetail/detail-hero/selectedDetail
  零断言，抽取无既有脚本会断。

## 实施步骤

### 1. 抽组件 `app/src/features/question-detail/QuestionGroupDetailView.tsx`

- 纯 props 驱动（AdminWorkbench 先例），**不拥有 useState**；App.tsx 保留
  全部状态与 handler。
- Props 按关注点分组成对象（避免 40 个扁平 prop）：
  `detail`（selectedDetail/detailStatus/detailError）、
  `verify`、`clozeParse`、`sevenChoicesParse`、`grammarParse`、
  `readingParse`（各含 result/status/error/saveStatus/saveError）、
  `topicLabel`（七件）、`difficulty`（drafts/saveStatus/saveErrors）、
  回调组（onBack/onEdit/onAddToBasket/onVerify/onAnalyzeReading/
  onSaveXxxParse×4/onGenerateTopicLabels/onToggleTopicLabel/
  onBindTopicLabels/onSaveQuestionDifficulty/onUpdateDifficultyDraft）、
  `isOwnerView`。
- 纯函数 `compactGroupMeta`/`getDifficultyDraftForQuestion`/`formatSavedAt`
  ：若 App.tsx 其他地方仍在用则抽到
  `app/src/features/question-detail/detailHelpers.ts` 并由 App.tsx 反向
  import（单一定义，禁止复制两份）；`answerCompareStats` 的 useMemo 搬进
  组件内部（只依赖传入的 verifyResult）。
- JSX 内容**原样搬运**，除步骤 2 的门控外不做改写、不改文案、不改 class。

### 2. 组件内 owner 门控（新增逻辑）

`isOwnerView === false`（member）时隐藏（不是 disable）：

- hero 的「编辑」按钮（openEditEntry 入口）。
- verify /「AI 解析生成」/「保存解析」全部按钮（四题型 + verify）。
- 话题标签的生成/勾选/绑定整块操作区。
- 难度评分表单（输入+保存）。

member 保留可见：hero 元信息、「加入草稿卷」按钮、原文+题目展示、
**已保存解析的展示区**（openDetail 已从 saved parse result 回填
verifyResult，无需按钮即有内容）、已绑定话题标签展示、已存难度展示。

边界判断规则：展示已存数据=member 可见；触发写操作（POST）=owner-only。
拿不准的按钮按其调用的 handler 是否打 ownerOnly 路由判定。

### 3. ConciergeDesk「详情」入口

- `onOpenDetail?: (group: QuestionGroupCard) => void` 从 ConciergeDesk
  props 一路穿到 ConciergeGroupCard；卡片加「详情」按钮（样式跟现有
  卡片按钮同族，放 onSimilar 旁）。
- App.tsx 传 `onOpenDetail={(group) => openDetail(group.id)}`。
- 经典列表的既有「详情」按钮（App.tsx:3648）不动，继续走同一 openDetail。

### 4. verify

- 新增 `scripts/verify-classic-retire-2.mjs`：
  - 行为断言优先：起 server（qa-temp 套路）以 member 身份 GET
    /api/question-groups/:id 得 200（详情数据面对 member 真开放）；
    以 member 身份打任一 parse POST 得 403（写面真关）。
  - 源断言兜底：QuestionGroupDetailView.tsx 存在且含 isOwnerView 门控；
    ConciergeGroupCard 含详情按钮/onOpenDetail；App.tsx 不再含
    detail-hero 内联 JSX（抽取真发生）。
- 注册进 `scripts/verify-ci.mjs` + `scripts/README.md`（housekeeping 闸）。
- 回归：`pnpm -C app run verify:all` 全绿；verify-owner-gate /
  verify-auth-gate 必过。

## 验收标准

1. AI 模式卡片点「详情」→ 详情页打开；返回回到 ConciergeDesk（筛选态
   不要求保留，现状 backToList 即可）。
2. 经典模式列表「详情」行为与改前一致（owner 全按钮在）。
3. member 视角：能进详情、能看原文/题目/已存解析/标签/难度；看不到
   编辑/生成/保存/绑定/评分任何按钮。
4. owner 视角详情页与改前逐块等价（四题型解析生成/保存、verify、
   话题标签、难度评分全流程可用）。
5. App.tsx 行数净减 ~1200+（抽取真发生，非复制）。
6. verify:all + CI 绿。

## Forbidden

- server/**（零服务端改动）。
- domain / schema / *Adapter / PaperSurface / print-export（契约面）。
- App.css（CSS 一律不动，刀 3 清）。
- preview 分支（4935 起）、经典列表分支、homeMode/viewMode 状态机形态
  （删状态机是刀 3）。
- 不做 URL 路由/popstate（全仓既有范式，独立挂账）。
- 不新增功能、不改文案、不"顺手美化"。

## 风险与已知坑

- App.tsx 主 return 内联着导入资料弹窗，刀 1 教训：**不许 early-return
  重构**，只做分支内容替换。
- 抽取类活的血泪教训（大重构记忆）：prompt 模板缩进污染 / TDZ /
  forwarding-wrapper——DEV 开工前读
  `docs/cuts/classic-retire-1-admin-corner/plan.md` 的搬运手法。
- `handleGenerateTopicLabels` 固定传 `DEFAULT_AI_MODEL, false`（非当前
  aiModel/thinking）——**现状如此，本刀不改**，只搬。

## PA Follow-Up Decisions

PA 裁决 GO-with-Must-Fix（pa.md @4dad339）。PM 处置如下，DEV 按此为准：

- **MF-1（member trace 暴露）已采纳**：5 处 AI 运维 trace 段
  （App.tsx:3867-3883、3971-3982、4096-4107、4833-4842、4908-4917，
  含 keyFingerprint/requestId/keySource/latency/provider）全部纳入
  isOwnerView 门控（member 隐藏）；解析正文对 member 可见不变。
  PM 依 owner 全权授权代拍（安全向默认），战报提请 owner 追认。
- **MF-2（props 清单缺口）已采纳**：分支实读的 5 个
  `*ParseByQuestionNo`/`verifyByQuestionNo` useMemo（App.tsx:1261-1293）
  与 `getParseSavedAt`（App.tsx:747）**不新增为 props**——组件内部用已
  传入的 parse/verify result 重算（useMemo 搬进组件）；`getParseSavedAt`
  若为纯函数则搬进 detailHelpers.ts，App.tsx 若还用则反向 import。
- **MF-3（member 隐藏零验证）已采纳**：步骤 4 的 verify 删去与
  verify-owner-gate.mjs 重复的 API 行为断言；改为（a）源断言：组件内
  门控块确实包在 isOwnerView 条件下、trace 段在门控内；（b）**强制
  浏览器 QA 必含 forced-auth member 账号实点详情页**（qa-temp 套路，
  member 看不到任何写操作按钮与 trace 段）——因 local open 模式
  isOwnerView 恒 true，纯本地跑不到隐藏分支。
- **SW-2 已采纳进边界规则主句**：member/owner 边界判定以「该按钮触发
  的路由是否 ownerOnly」为准绳（问 questionGroupRoutes.mjs），
  "展示已存数据 vs 触发写操作"只是助记。
- **SW-4 已采纳**：onOpenDetail 需 App→ConciergeDesk→ConciergePaperRow→
  ConciergeGroupCard 全程穿透，且 **三个渲染点全接**
  （ConciergeDesk.tsx:333、375 + ConciergePaperRow.tsx:239），漏一处
  部分列表入口失效；CR 逐点核。
- SW-1/3/5/6 记录在案无需改plan（props 对象分组已在步骤 1；addToBasket
  副作用对 member 合法；openDetail 留 App.tsx；difficultyDrafts 无污染）。
