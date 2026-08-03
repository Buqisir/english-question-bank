# ui-p1-shell — UI 审计 P1 壳层批（审计 2026-07-10 报告 #1/#10/#11/#3半/#13半）

- Cut size: **medium**（多条小修打包，全站壳层）；touches schema/契约面：
  **no**（纯 CSS/TSX 展示；App.tsx 只动 pill 渲染条件一处）。
- 并行边界（三刀同期，主代理已核文件面）：**本刀独占**
  `app/src/App.css`、`app/src/App.tsx`、admin 工作台组件
  （AdminWorkbench 一族）。**Forbidden**：ui-p1-panels 刀的文件
  （paper-intelligence harness css/tsx、QuestionGroupDetailView、
  ConciergeDesk、DraftPaperWorkbench、paperBrowsePage.css）、
  draft-depassage 刀的文件（server/print-renderer.mjs、
  server/exports/docxRenderer.mjs）。
- 审计原文（证据/行号/刀法）：
  `.impeccable/critique/2026-07-10T05-30-00Z__full-project.md` L78/80/87/88/90，
  DEV 必读对应条目原文。设计法度：`DESIGN.md` + 审计引用的章程词汇。

## 条目

1. **#1 焦点环形同虚设**：根因 `App.css:214/3252/3909` 系统性
   `0 0 0 3px rgba(44,110,86,0.20)`（合成对比 ≈1.2:1，WCAG 2.4.7 +
   非文本 3:1 双违）。改 **2px 实色 `#2C6E56` outline + 2px offset**
   （审计首选方案），token 单点改全站。draft 家族按钮的
   `:focus-visible` 接入属 ui-p1-panels 文件面，**本刀不做**，在
   plan 里留字条给那刀。
2. **#10 窄屏壳层崩坏**：`App.css:2205` `@media(max-width:780px)`
   `topbar-actions button{flex:1}` 退役；改右对齐紧凑排布（禁 flex:1，
   两键并排自然宽度；容不下则溢出折行右对齐）。验收：760px 视口
   顶栏无整宽灰条、无第二行孤钮。
3. **#11 admin 布局+绿笔清零**：AdminWorkbench 面板脱掉
   `library-panel` 类（被 `App.css:3709` margin:auto 覆写致 ~310px
   悬空），给独立宽度类；「给题库打主题标签」升 primary（墨绿），
   补全页唯一签名操作。
4. **#3 半边——pill 路由泄漏**：`App.tsx:1146` 草稿卷 pill 渲染条件
   补 admin 路由排除（审计原文：缺 adminRouteActive 条件）。悬浮
   加卷钮锚定/面板底部净空属 panels 刀文件面，本刀不做。
5. **#13 半边——App.css 内的低对比暖灰**：`App.css` 范围内
   `#8A8177`/`#8A8272` 等 <4.5:1 正文级小字统一升到 `#6A6A64` 档
   （5.03:1；若已有 --ink-muted 类 token 则改 token 值并核连锁）。
   feature css 内的同类实例属 panels 刀。

## Verify / QA

- 既有 verify:all 全绿、tsc 干净；palette/hex 类守卫若因换色触发，
  按其白名单机制如实登记（不许绕）。
- 浏览器 QA：① Tab 走查首页/整卷/工作台/admin 各 3 个控件，焦点环
  肉眼可辨（截图）；② 760px 视口顶栏（截图）；③ admin 页面板占宽
  正常+主操作墨绿（截图）；④ admin 页无草稿卷 pill；⑤ 抽查 3 处
  升档后小字对比（给出实测比值）。证据入 docs/cuts/ui-p1-shell/qa/。
- DEV 断点锚：`wip(ui-p1-shell): impl complete, pre-QA`。
