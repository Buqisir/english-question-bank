# ui-shell-unify（UI 一致性刀①：外壳统一）— DEV 执行契约

cut size: medium; touches schema/data-contract/product boundary/teaching
interpretation: no（纯 display 层；grey-zone 文件仅限 display 编辑）。
PA: 不需要（可逆产品表面，medium 标准流程）。
背景与证据：`docs/cuts/ui-coherence/audit.md` 优先问题 ①。

## 目标

四套顶栏 → 一套 AppShell 语言；「返回」统一命名；卷面顶栏去掉
`Paper Surface (C4)` 脚手架标签；全局导航在所有页面可达。

## 设计契约（UI direction 已定，照做）

1. 新建 `app/src/components/AppTopbar.tsx`（+ 样式并入 App.css 现有
   `topbar` 词汇，不建新 css 文件）。结构：
   - 左：返回链接（子页才有，形制统一为 `← 返回找题`，ghost 样式）+
     品牌区。首页品牌区 = 现状（eyebrow `English Question Bank` +
     h1 `英语题库工作台`）；子页品牌区收缩为一行小字标
     `英语题库工作台`（可点，回首页 `/`），旁边跟当前页标题
     （如 `草稿卷` / `个人空间` / 卷面为「卷名 · 题组名」）。
   - 中：可插槽（children）放页面上下文工具（草稿卷的标题输入、
     学生版/教师版分段、导出按钮原样迁入；其它页为空）。
   - 右：全局动作恒定出现：`个人空间`（Archive 图标 ghost）、
     `管理`/`退出管理`（owner-only，Tag 图标 ghost）、用户名 + `退出`
     （沿用现状逻辑）。回调从各页现有 handler 传入，**不新建状态**。
2. 替换四处使用：
   - `App.tsx:805` 首页/管理台 topbar → AppTopbar（首页形态）。
   - `DraftPaperWorkbench.tsx:414` 一带 header → AppTopbar（上下文工具
     进插槽；`返回取题台` → 统一返回）。
   - `MySpacePage.tsx:163` header → AppTopbar。
   - `PaperIntelligencePaperSurfaceHarness.tsx:1257/1259/1271/1300/1304`
     harness topbar → AppTopbar；**tagline 处改为
     `{asset.paper.title} · {group.title}`**（harness 内已有该数据；若
     取不到则只显示卷名，绝不显示 cut 代号）。
3. 「返回」全站统一文案 `返回找题`：上表四处 + 
   `QuestionGroupDetailView.tsx:165`（`返回列表` → `返回找题`）。
   `PaperIntelligencePreview.tsx:458/462`（reading-analysis 孤儿支）**不动**。
4. 样式：只用现有 token/类（ghost-button、topbar、eyebrow）；圆角 6px、
   焦点态沿用现状；不引入新颜色、不动 `--eqb-*` token。
5. 900px 宽下顶栏不得换行成两层以上：右侧全局区允许在 <960px 时把
   用户名隐藏（只留退出图标按钮，带 aria-label）——用 CSS 媒体查询，
   不加 JS。

## Forbidden

- 不改 reducers / state 契约 / 数据获取 / URL 状态 / adapter 输入输出
  （DraftPaperWorkbench、Harness 是 grey-zone 文件，只做 display 结构）。
- 不碰 `shared/papersurface/**`、`server/**`、schema、`*Adapter.ts`。
- 不加依赖、不建新路由、不改登录页。
- 不顺手修本刀外的烂点（loading 骨架、hover 按钮等是后续刀）。

## CR Follow-Up（2026-07-07，PM/UI-direction 处置）

- **MF-1**：设计契约 §1「工具迁入插槽」条目**作废**，改为「壳 + 页内
  sticky 工具卡」两条式——草稿卷工具卡随滚动常驻（导出/版本切换始终在
  手边），比塞进壳条更贴工作流。插槽机制（children / .topbar-tools /
  1160px 断点）作为死代码已删除；将来真有页面需要壳内工具时再按需加回。
  PO 可在 QA 时否决此裁定。
- **SW-2**：确认接受——`管理` 是模式开关非日常导航，保持 home 专属；
  子页跨切需要新路由状态，超出本刀 Forbidden。
- **SW-4**：已修——harness 内壳条加 `flex-shrink: 0`。

## 验收（DEV 自证后报告）

1. `npm run build --prefix app` 绿（tsc + vite）。
2. `node scripts/verify-classic-retire-3.mjs`、
   `node scripts/verify-c8-draft-paper-contracts.mjs`、
   `node scripts/verify-c8-my-space-contracts.mjs` 绿（若断言钉了旧
   header 结构导致红，属预期变更的要在报告里列明具体断言，不许静默改
   verify 脚本——改动 verify 断言须在完成报告单列一节）。
3. Playwright 实测截图（1440×900 与 900 宽双档）：首页、草稿卷、
   My Space、管理台、卷面-阅读 5 页，顶栏结构一致、`(C4)` 不再出现、
   返回文案统一、900px 不叠层。截图放
   /private/tmp/claude-501/-Users-huangxuewei-Projects-english-question-bank/9adddf3b-2f53-4faf-bf50-a4aefe6df666/scratchpad/dev-shell/。
   （环境：`node --env-file-if-exists=.env server/api.mjs` 起 8787，
   `cd app && npx vite preview --port 4173 --strictPort` 起预览；跑完杀掉。）
4. 完成报告：改动文件清单、verify 结果摘要、截图路径、已知风险、
   是否动过任何 verify 断言。
