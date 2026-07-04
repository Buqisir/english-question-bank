# classic-retire-3-cleanup — 经典模式尸体清理（刀 3）

Cut size: small-medium（纯删除，可逆产品面）。PA：跳过（纯删除、
git 可逆、无数据契约变化；依 AGENTS.md 降档规则，理由记于此，CR 复核）。
Branch: `cut/classic-retire-3-cleanup`。

前置事实来自 PM 侦察+抽验（2026-07-04）。行号为写 plan 时的快照，
编辑中会漂移——**按符号/代码块定位，不要盲信行号**。

## 目标

删掉经典模式全部死代码：homeMode 状态机、经典列表、筛选栏、经典侧栏
（basket-panel）、题库管家聊天面板、排版预览分支、保存/载入题集。
删完后 ConciergeDesk 是唯一首页视图，AI 模式行为零变化，admin 管理台
行为除「不再跳排版预览」外零变化，member 视角零变化。

## 删除地图（App.tsx，主战场）

### D1 homeMode 状态机
- state 声明 `const [homeMode, setHomeMode]`（~734-741）删除；
  `localStorage.getItem/setItem('home-mode')` 一并消失（storage 里的
  旧键不用清）。
- 模式切换按钮 `home-mode-toggle`（~3273-3288，isOwnerView 门控）删除。
- 所有 `homeMode === 'classic'` 分支整块删除：顶栏 data-status 徽章
  (~3211)、顶栏 topbar-ai-group DeepSeek key 输入组(~3230)、filter-bar
  (~3338-3398)、basket-panel aside(~3654-4124，含内层 steward-chat-panel)。
- 所有 `homeMode === 'ai'` 条件变无条件：ConciergeDesk 渲染(~3449)、
  悬浮 basket-chip(~4128)。
- `className={\`app-shell home-mode-${homeMode}\`}`(~3204) 改为字面量
  `"app-shell home-mode-ai"`——**CSS 的 .app-shell.home-mode-ai 规则系
  绝不可动**（verify-home-default-feed 断言它们）。

### D2 viewMode 收窄为 'list' | 'detail'
- `'preview'` 从 union 类型删除；preview 渲染分支(~3602-3651，含
  PaperBlockCanvas 用点)删除；`openPreview`(~1503) 删除。
- import PaperBlockCanvas(~63) 删除（该组件文件本身不动，仍由
  paperAssembly/index.ts 导出）。
- `previewDetails` state(~823) / `loadPreviewForBasketItems`(~1415) /
  previewStatus/previewError：删除分支后 grep 确认无存活读者再删
  （useConciergeDesk.ts:24 注释已证不共享）。
- view-tabs 整块删除（~3420-3444，题组/详情/预览三个 tab）：详情有
  自己的返回按钮（onBack=backToList），tab 栏是经典残留。
- library-header 的 h2 标题保留 list/detail 两态文案，去掉 preview 文案。
- filter-bar-summary 计数(~3417)：`filteredGroups.length` 改
  `questionGroups.length`（AI 模式下二者本就恒等，因筛选 UI 从不可达）。
- **保留**：`backToList`、`openDetail`（AI 增强面板 ~4794 与
  ConciergeDesk 都在用）、`viewMode === 'detail'` 分支写法原样不动
  （verify-classic-retire-2.mjs:109 断言其结构）。

### D3 admin「生成客观题整卷」去 preview 跳转
`handleBuildObjectivePaperSet`(~2698)：删 `setViewMode('preview')` 和
`await loadPreviewForBasketItems(nextBasket)` 两行，其余不动
（paperBuildStatus/paperBuildResult 在 AdminWorkbench 里展示结果，
草稿卷已被 replaceDraft 填好，owner 可从草稿卷工作台继续）。

### D4 经典列表 + 筛选态
- `viewMode === 'list'` 内层三元的经典列表侧(~3464-3538)删除，
  ConciergeDesk 变唯一 list 渲染。
- 随之孤儿化的 state/handler/useMemo 删除：`query, semanticSearchEnabled,
  semanticSearchResult, difficulty, sourceType, groupType, selectedTag`
  (~715-733 区)、`filteredGroups`(~1121)、`semanticMatchByGroupId`(~1159)、
  `handleQueryChange`(~1175)。
- 题库管家：`questionBankSteward*` 5 个 state、`stewardChatInput/
  stewardChatMessages`、`handleQuestionBankSteward`(~1181) 删除。
  services 层的 steward API 封装**不动**（verify-h5i 只测 service/server）。

### D5 经典侧栏 handler 群
随 basket-panel JSX 死掉的专属 handler 删除：`addFilteredGroupsToBasket`
(~1277)、`clearBasket`(~1516)、`moveBasketItem`、`updateScore`、
`updateBasketItem`、`removeFromBasket`、`handleSavePaperSet`(~2753)、
`handleLoadPaperSet`(~2777)、`handlePaperTitleChange`、
`handleVersionTypeChange`、`handlePaperExportStyleChange`、
`handleQuestionNumberStartChange`。
**逐个先 grep 确认唯一调用点在被删 JSX 内再删**——`basket`、
`addToBasket`、paperDraft hook 及其派生（paperTitle/versionType/
paperBlocks 等）有 AI/admin 存活用户，**必须保留**。
半共享 state 组 `saveStatus/saveError/lastSavedPaper/savedPapers/
savedPapersStatus/savedPapersError`：`savedPapers` 及其 fetch useEffect
(~1015) 被 handleBuildObjectivePaperSet 用，保留；删除后变 write-only
孤儿的（如 lastSavedPaper 若再无读者）可连 setter 调用一起清，清前 grep。
`loadPaperStatus/loadPaperError` 随 handleLoadPaperSet 死。

### D6 「新建题组」死路径
`entryMode` state(~761) 全仓只被赋 'edit'（openEditEntry ~1591、
handleEntrySaved ~1615），'create' 不可达。删 state，给 EntryModal 传
字面量 `mode="edit"`；`handleEntrySaved` 里的重置调用删除。
**EntryModal.tsx 内部 create 分支本刀不动**（挂账，单独小刀）。

### 挂账（CR MF-1 落档，PM 依全权授权代拍，待 owner 追认）
删除经典列表卡片连带删掉 `handleDeleteQuestionGroup`——它是
`deleteQuestionGroup` service 与 `externalRemoveByGroupId` 的**唯一**
UI 挂载点。本刀之后全应用没有删题组的 UI 入口（server DELETE 路由与
service/hook 均保留原样）。PM 裁定：接受该能力暂缺，保持本刀纯删除；
后续单独小刀把删除入口安家到 QuestionGroupDetailView（owner-only，
带确认），恢复成本低。owner 若不同意可要求提前补。

### D7 App.css 死 CSS
铁律：**每删一个 class，先 grep app/src 全量确认零存活使用者**
（正反两查——不光看侦察列了什么，还要防它漏了什么）。
- 可删候选（侦察 A 表）：filter-bar*/search-field、basket-panel/
  basket-toolbar/basket-stats/basket-list/basket-index/basket-content/
  basket-fields/basket-note/basket-actions、steward-*、paper-title、
  paper-blocks-*/paper-block-*、block-settings-*、saved-paper-*、
  preview-box/preview-button、export-secondary、paper-preview/
  paper-preview-toolbar/paper-page-header、topbar-ai-group/ai-key-input/
  ai-model-select/topbar-thinking-toggle、data-status、home-mode-toggle、
  group-list 的 App.tsx 侧规则（注意 PaperImportAiWorkbench 也用
  group-list——若 App.css 规则是全局的就不能删）。
- **明确不可删**（全局选择器 + AI 侧存活使用者）：`.version-toggle`
  (App.css:49,537——DraftPaperWorkbench 用)、`.paper-page`(:1777——
  PaperSurfacePrototype 用)、`.paper-meta`(:1813——ConciergePaperRow 用)、
  `.basket-item`(:2177,3751——PaperIntelligencePreview 用)、
  `.app-shell.home-mode-ai` 全系规则、基础 `.eyebrow` 规则
  （verify-home-default-feed:267 断言 color: var(--muted)）、
  detail-button/add-button/icon-button/ghost-button/back-button/
  empty-state/save-button/panel-heading/group-card/source-line/tag-row/
  detail-message 等跨组件通用类。
- 拿不准的留下不删——本刀宁可少删 CSS，不许误删。

### D8 verify 脚本
- `scripts/verify-classic-retire-2.mjs`：~122-124 断言经典列表「详情」
  按钮存在——改为断言该按钮**不存在**且 ConciergeDesk 的 onOpenDetail
  仍在（断言方向翻转，不是删断言）。
- `scripts/verify-concierge-desk.mjs` Test 1（pickHomeMode 镜像，~115-129）：
  homeMode 删除后成僵尸断言——删掉该 test，注释注明刀 3 退役原因。
- 新增 `scripts/verify-classic-retire-3.mjs`，至少断言：
  1. App.tsx 无 `homeMode`、无 `steward-chat-panel`、无 `basket-panel`、
     无 `'preview'` viewMode 取值、无 `openPreview`；
  2. ConciergeDesk 渲染不再有 homeMode 条件（正则证无条件渲染）；
  3. `.app-shell.home-mode-ai` 字面量 className 在位；
  4. App.css 仍含 `.version-toggle`/`.paper-page`/`.paper-meta`/
     `.basket-item`/基础 `.eyebrow`（防误删哨兵）；
  5. `handleBuildObjectivePaperSet` 不再含 `setViewMode('preview')`。
  注册进 `scripts/verify-ci.mjs` + `scripts/README.md`（housekeeping
  guard 强制）。

## Forbidden

- server/ 目录零改动。
- EntryModal.tsx、ConciergeDesk、QuestionGroupDetailView、
  DraftPaperWorkbench、AdminWorkbench 等子组件文件零改动
  （只动 App.tsx / App.css / 三个 verify 脚本）。
- **App.tsx 主 return 不许 early-return 重构**（刀 1 教训）；只做删除
  和条件展开，不做结构重组。
- 不动 `.app-shell.home-mode-ai` CSS、不动基础 `.eyebrow`。
- 不删任何有存活使用者的 CSS class；拿不准=不删。

## 验收

1. `pnpm -C app run typecheck`（或 build）零错——孤儿 state/import
   全靠它兜底。
2. `node scripts/verify-classic-retire-3.mjs` 绿。
3. `node scripts/verify-classic-retire-2.mjs`（改后）、
   `verify-concierge-desk.mjs`（改后）、`verify-home-default-feed.mjs`、
   `verify-h12a-entry-modal.mjs`（若 mode 字面量致其红，同步收窄）绿。
4. `pnpm -C app run verify:all` 全绿。
5. 报告 App.tsx / App.css 删除行数。
