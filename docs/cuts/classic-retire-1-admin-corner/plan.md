# 刀 1「管理角落」plan（classic-retire 三刀之一）

- Cut: medium（纯前端界面重排，服务端零改动）
- PA 降级理由（写在头部供 CR 复核）：可逆的产品表面重排——无 schema、
  无数据契约、无路由语义变化；全部走既有 owner-only API 与既有
  isOwnerView 裁剪；出错可整刀 revert。按 process-tuning「PA 触发按
  不可逆性」降级为无 PA。
- 上游：docs/cuts/classic-retire/{inventory,proposal}.md，owner 2026-07-03
  圈定全部推荐（Q1 独立管理台 / Q3-A 保存题集·载入·排版预览退役，
  整卷题集生成搬管理台）。
- 顺序修订（PM 拍板）：**模式切换按钮本刀不删**（题组详情仍只能从经典
  列表进，刀 2 落地前删切换会断 owner 策展流）；切换按钮留给刀 3。

## 背景坐标（PM 已 sed 抽验，非猜测）

- topbar 4 个 owner 策展按钮：App.tsx:3388-3417（导入资料/整卷导入/
  AI 导题/打标签+backfill summary span）
- topbar 闭环面板按钮（classic-only）：App.tsx:3382-3387
- view-tabs「试卷」tab：App.tsx:3553-3559
- workflow 面板 JSX：App.tsx:3588-3818（`viewMode === 'workflow'` 分支）
- workflow 动作 handler：addWorkflowGroupsToBasket 1415 /
  handleBuildWorkflowPaperSet 1422（结尾 setViewMode('preview')+
  loadPreviewForBasketItems 跳转）/ handleLoadPaperSet 2914 /
  showWorkflowQuestionGroups 2951 / openWorkflowDraft 2960
- 导入资料弹窗是 App 主 return 内联 JSX（App.tsx:5717 起）——因此
  **管理台不能做 early-return 路由**（会切掉弹窗渲染），要在主 return
  里替换主内容区。
- 独立路由 owner-only 初始化范式：App.tsx:776-785（`?view=paper-import`）
- verify-i16b（scripts/verify-i16b-theme-labels-backfill.mjs:328-337）
  grep App.tsx 里的 `backfillTopicLabels`/`给题库打主题标签`——backfill
  的 handler 和 state 留在 App.tsx 传 props 即满足；不要把 handler 一起
  搬走。

## 改动清单

1. **adminRouteActive 状态**：初始化从 `?view=admin` 读，member 视角
   恒 false（照抄 776-785 范式，含 URL 同步行为与 paper-import 一致）。
2. **AdminWorkbench 组件**（新文件 app/src/features/admin/
   AdminWorkbench.tsx）：
   - 渲染位置：App 主 return 内，`adminRouteActive` 时替换首页主内容
     （filter section、`<main class="workbench">`、经典侧栏都不渲染；
     topbar 与各弹窗照常渲染）。
   - 区块一「导入」：三个入口——导入资料（openImportPanel）、整卷导入
     （openPaperImportWorkbench）、AI 导题（openPaperImportAiWorkbench）。
   - 区块二「数据维护」：打标签 backfill 按钮 + 结果 summary（state/
     handler 留在 App，props 传入）；闭环面板（下条）。
3. **闭环面板搬家**（workflow JSX 3588-3818 → AdminWorkbench，带四处
   行为修订）：
   - 「载入题集」按钮删除（Q3-A 退役）。
   - 3794-3808 一带的双职按钮（canViewBankGroups ? show : openDraft）：
     只保留 openWorkflowDraft（生成草稿）职能；showWorkflowQuestionGroups
     跳经典列表的职能删除（函数若无其他调用点一并删）。
   - handleBuildWorkflowPaperSet：删结尾 `setViewMode('preview')` +
     `loadPreviewForBasketItems` 跳转；保存与 refresh 保留，反馈用现有
     paperBuildStatus/paperBuildResult 在管理台内联展示。
   - 「加入草稿卷」按钮保留（basket 与 AI 模式草稿卷 chip 共享，行为
     天然正确）。
4. **viewMode 收窄**：删 'workflow' 取值（topbar 闭环面板按钮、
   view-tabs「试卷」tab、workflow 渲染分支、setViewMode('workflow')
   调用点全清），union 收成 `'list' | 'detail' | 'preview'`。
5. **topbar 收敛**：4 个策展按钮 + backfill summary 移除，换成一个
   「管理」按钮（isOwnerView，进/出管理台 toggle）。模式切换按钮不动。
6. **CSS**：管理台布局用最小新增，优先复用既有 workbench/panel 类；
   不碰 tokens.css。

## Forbidden

- server/ 任何文件；ConciergeDesk；DraftPaperWorkbench；homeMode 状态机
  与模式切换按钮；经典 list/detail/preview 三个 view 本体；EntryModal；
  导入资料弹窗内容本身（只动入口）；tokens.css。

## 验收

- `pnpm -C app exec tsc --noEmit`、`pnpm -C app run build`、
  `pnpm -C app run verify:all` 全绿（尤其 verify-i16b 的 App.tsx grep）。
- owner 视角：topbar 只剩「管理」一个策展入口；管理台可进可出（含
  `?view=admin` 直达）；导入资料弹窗能从管理台打开；闭环面板在管理台
  内功能完好（刷新/加入草稿卷/生成整卷题集不再跳预览/生成草稿）；
  经典首页 tabs 只剩 题组/详情/预览。
- member 视角：无「管理」按钮，`?view=admin` 直达无效（同 paper-import
  范式），其余零变化。
- DEV 汇报改动文件清单 + verify 结果；浏览器真点 QA 由 PM 做。
