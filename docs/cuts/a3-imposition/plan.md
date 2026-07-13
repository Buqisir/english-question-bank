# a3-imposition — plan.md（A3 拼版预览：按面显示，判据可视化）

- cut size: **medium（偏小）**；touches schema: no；data contract: no（纯前端
  展示层重组，server/路由/签名零改动）；product boundary: no；teaching
  interpretation: no（判据语义 print-form 刀已落，本刀只把它变成看得见的）。
- PA: **PA-lite**。降档理由：原型 `prototype.html` owner 四裁点逐条拍板
  （2026-07-13，本目录）；纯展示层可逆。CR 复核降档是否成立。
- **拍板记录（owner 2026-07-13，改判入档）**：本刀是对议题2 裁点2「不做按张
  分组预览视图」的 owner 改判——print-form 上线后 owner 主动提出 A3 拼版
  预览。四裁点：①缩放=**方案C 满幅拼版**（owner 提出的中道：A3 态破居中
  窄容器用满屏宽，每版约 80-85% 原大，字可读；窗口窄时自然缩小）②面语言=
  「第 N 张 · 正面/背面」标签 + 中缝对折线 + 面间缝「翻面 ⟲ / 换张 ✂」，
  **建议徽标挪到断点所在的缝上** ③贴纸操作条照常挂题组、rail 点击滚到所在面
  ④拼版只在 A3 对折态出现，A4 散页态零变化；导出 PDF 不动（真 2-up 拼版
  PDF 归刀E 后续）。
- 基线：`github/main` @ 28193ce；分支 `a3-imposition`，worktree
  `../wt-a3-imposition`。视觉契约 = 本目录 `prototype.html`（方案C 态）。

## 侦察事实（DEV 直接用，勿重查）

- 预览 = iframe srcDoc：`draftPaperPreviewHtml.ts`（76 行）把 server 分页
  HTML 包成完整文档并注入 CSS；`.preview-page` 分节、题组带 `data-group-id`
  （跨页切片也带）。**拼版在这层做**：printForm==='a3' 时把相邻
  `.preview-page` 两两包进 face 容器（(1,2)(3,4)…），加面标签/对折线/缝。
- 叠按钮是 React overlay，锚点经 groupAnchors 机制量 iframe 内元素位置
  （`DraftPaperWorkbench.tsx` :336-380 一带：srcDoc 变更即整文档重载，
  scrollspy/持久按钮/页徽标都在 load 后重读）——拼版改变几何但不删节点，
  重量位后应自然跟随；**必须实证不许假设**。
- scrollspy/rail 点击滚动：同一套 iframe 几何读数（:247-293 scrollToGroupInPaper
  / updateActive）。
- 建议徽标当前挂在题组操作条上（print-form 刀）；server 只发真断建议
  （判据已在 server），本刀**只挪显示位置**到面间缝，数据源/点击行为
  （前置分页 PATCH）零改动。
- 工作台纸列当前居中定宽（draft-desk 刀A 820px 语言）；方案C 需要 A3 态下
  纸列破宽满幅（rail 仍在右侧）——`DraftPaperWorkbench.css` 加 a3 态修饰类。

## Must Do

1. **拼版重组（iframe 包装层）**：printForm==='a3' 时 `draftPaperPreviewHtml.ts`
   输出 face 结构：两版并排 + 中缝虚线「对折线」+ 面标签 chip「第 N 张 ·
   正面/背面」+ 张分组标题「─── 第 N 张 A3 ───」+ 面间缝「翻面 ⟲ / 换张 ✂」；
   版尾不足偶数 → 「（此半面留白）」占位半面。视觉以 prototype.html 方案C
   态为准（暖纸/字号/缝语言）。a4 态输出零变化（裁点4，verify 断言盯死）。
2. **方案C 满幅**：A3 态工作台纸列破 820px 满幅（`min(94vw, 1440px)` 量级，
   rail 保留右侧），版内容按 aspect-ratio 等比缩放；A4 态布局零变化。
3. **建议徽标挪缝**：跨面断篇建议渲染在对应面间缝上（措辞沿现有
   「跨页断篇（第X/Y版，翻面/换张）」），点击行为不变（前置分页 PATCH →
   重渲收敛）；A4 态徽标维持现位置零变化。
4. **交互重锚实证**：叠按钮（上移/下移/前置分页/移除）、scrollspy 高亮、
   rail 点击滚动、重排徽章视口定位（刀B QA-1 教训）在拼版态全部可用——
   自验必须真点（headless Playwright 可），不许只靠源码断言。
5. **verify**：新 `verify-a3-imposition.mjs`（或并入 verify-print-form，二选一
   由实现形态定）：①a4 态包装输出与改动前逐字节一致（零变化断言）②a3 态
   face 配对正确（7 版→(1,2)(3,4)(5,6)(7,留白)）③面标签/缝文案存在
   ④建议徽标在缝上渲染的源码/行为断言。注册 README + verify-ci。
6. 自验（narrow + `pnpm -C app run verify:all`）+ checkpoint commit + 收口
   commit（一行 message）。

## Forbidden（本刀不许动）

- `server/**` 全部（分页引擎/判据/路由/签名零改动——拼版是展示层）
- `app/src/domain/questionBank.ts`
- `app/src/features/paper-browse/**`、`server/search/**`（无关面）
- PDF/打印/DOCX 出口（A3 拼版 PDF 归刀E）；A4 散页态任何可见变化
- 生产机/生产库

## 裁决点清单（PM 断点锚）

1. 【DP-1】DEV 完成 → 主代理复核（narrow + verify:all）→ fresh Opus CR →
   MF 处置。
2. 【DP-2】主代理浏览器 QA（A3 拼版实看对照原型、四交互重锚实点、A4 态
   零变化对照）→ merge → 盯 main CI。
3. 【DP-3】owner 观感 QA（部署后）。

## Verification（worktree 内逐条）

```
node scripts/verify-a3-imposition.mjs
node scripts/verify-print-form.mjs
pnpm -C app run verify:all
```
