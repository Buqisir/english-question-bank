# I6-writing-render Plan — 写作 section 卷面版面还原（教师 A4 视图）

Last synced: 2026-05-30 after 阿澈 PM grill (grill-with-docs). Source of truth for DEV.
Open review items: 0 blockers. Gates remaining: PA-lite (inline) → DEV → CR-lite → browser QA → PO QA → RM.

## Cut Size

Medium。

Touches schema, data contract, product boundary, or teaching interpretation: **no**。
`content.blocks`（含 `answerBox` / `partHeading` / `sectionHeading` / `instruction` /
`pageBreakHint`）已由 I5 导入器写入，本 cut 只**渲染**已有数据，不改 schema、不改 server
解析、不改产品边界（"答题区是否渲染"已由 PO 2026-05-30 拍板：渲染）。

## Objective

教师在 A4 视图（PaperSurface）里打开写作题组时，看到一张**向高考标准规范化的真实试卷页**：
部分/小节标题、情境提示/续写材料、注意事项、以及答题框——而不是现在这样只有一段裸文本。
版式标尺是 `docs/product/exam-paper-format-reference/`（page-11 应用文 / page-12 读后续写，
PR #149）。原则：**导入的真卷不是版式权威，保留语义内容、版式向参考集规范化**。

## Locked Product Decisions

- **范围 = 题面版面还原**：渲染部分/小节标题、情境提示/续写材料、注意事项、答题框。只在写作
  section，不动 reading / 七选五 / 完形 / 语法填空的现有渲染路径。
- **目标面 = 教师 A4 屏幕视图（PaperSurface）**。不碰导出/打印（DOCX/PDF）路径。
- **答题框：画框 + 框内给定内容**。续写框画出两段开头句（`continuationStarters` 已在数据里）。
- **应用文框先空**（B1）：应用文"给定标题"未被 splitter 抓取、且是单卷特有；本 cut 画一个**空的
  带框答题区**，不为它扩 splitter。保持纯渲染 cut。
- **渲染源 = `content.blocks`**：题面外壳（标题/注意/答题框/给定开头句）照导入器已写入的块渲染，
  单一真相，不在前端重新拼这些字符串。
- **PaperSurface 内核保持哑**：题面外壳在写作专属渲染层里包在 PaperSurface 外，PaperSurface 仍只
  渲染情境/材料正文。

## Deferred (明确不做，留给后续 cut)

- 空白书写区的**精确尺寸 / 行数 / 分页**（屏幕上给一个合理高度的空框即可）。
- 应用文**给定标题**的解析抓取（splitter 扩展）。
- 写作**解析 / 范文 / 评分**渲染（挂在 Writing Task 层，另起 cut；ADR 0007）。
- **导出 / 打印**路径渲染答题区。

## Must Do

### Step 1 — 写作页视图模型：从 content.blocks 派生题面外壳

- 扩展 `writingPaperViewAdapter.ts`：除现有 `surfaceData`（情境/材料正文）外，新增一个结构化
  **写作页模型**，按 `content.blocks` 的纸序（filter 到当前写作 group 的 section）产出有序的题面
  外壳：`partHeading` / `sectionHeading` / `instruction`(注意) / `answerBox`(label + 续写 starters)。
- 块归属规则：以当前 group 的 `{type:'group', groupId}` 块为锚，取其前的 part/section heading 与
  其后的 instruction / answerBox 块。`partHeading` 仅在首个写作 group 出现，按数据为准。
- 续写 starters 从 `content.blocks` 的 answerBox 关联数据 / 续写块取（导入器已拼 `Paragraph 1/2`）。

### Step 2 — 写作页渲染层（题面外壳，包在哑 PaperSurface 外）

- 新增写作专属渲染组件（例如 `WritingPaperPage.tsx`），按写作页模型渲染：
  part/section 标题 → PaperSurface(情境/材料正文) → 注意 → 答题框（应用文空框 / 续写框含两段开头句）。
- harness 在 `groupType === 'writing'` 时挂这个组件；harness 改动**仅限挂载点 + 显示**，不动 reducer /
  状态契约 / 数据获取 / URL 状态 / 跨组件同步。
- 视觉向 page-11 / page-12 参考图对齐：标题层级、注意缩进、答题框边框、续写开头句在框内分段。
  视觉细节调优属 UI direction（阿澈 / CR-lite），DEV 先把结构与可辨识度做到位。

## Forbidden

- `shared-ui/papersurface/PaperSurface` 内核、`shared/papersurface/**`：不改（保持哑）。
- `server/**`（splitter / packageBuilder / 任何解析）：不碰。
- `app/src/domain/paperAsset.ts` / `schemas/**`：不改数据契约。
- reading / 七选五 / 完形 / 语法填空的渲染路径：不动。
- 导出 / 打印（`server/exports/**`、`print-renderer.mjs`、`*Adapter.ts` 导出向）：不碰。
- harness 里的 reducer / 状态契约 / 数据获取 / URL 状态 / 跨组件同步：不改。
- 空白书写区精确尺寸 / 分页、应用文给定标题抓取：本 cut 不做。

## Suggested Files

- `app/src/features/paper-intelligence/writingPaperViewAdapter.ts` — 派生写作页模型。
- `app/src/features/paper-intelligence/WritingPaperPage.tsx`（新）— 题面外壳渲染层。
- `app/src/features/paper-intelligence/PaperIntelligencePaperSurfaceHarness.tsx` — 仅写作挂载点。
- 写作页 CSS（标题 / 注意 / 答题框边框 / 续写开头句）。
- `scripts/verify-i6-writing-render.mjs`（新）— 见 Verification。
- 参考：`docs/product/exam-paper-format-reference/images/page-11..12`（需 #149 合并后可见）。

## Verification

- Step 1:
  - 新增 `scripts/verify-i6-writing-render.mjs`：用六族 fixture asset（或 I5 fixture）构建写作页模型，
    断言：应用文模型含 part/section 标题 + 注意 + 空 answerBox（无给定标题）；续写模型含
    section 标题 + 注意 + answerBox 且含两段开头句；外壳块顺序符合纸序；不含 reading 等其他 section。
  - 注册进 `verify-ci.mjs` + `scripts/README.md`。
- Step 2:
  - `node scripts/verify-ci.mjs` 全绿；app typecheck / build 通过。
  - 浏览器 QA（见矩阵）。

## Browser QA Matrix

| Case | Expected result |
| --- | --- |
| 打开应用文写作题组 | 见 第四部分/第一节 标题、情境提示、注意（词数80）、一个空的带框答题区；无控制台报错 |
| 打开读后续写题组 | 见 第二节 标题、续写材料、注意（词数150）、带框答题区且框内有两段开头句 |
| 与 page-11/12 参考图对照 | 题面元素齐全、层级与可辨识度接近参考；非诊断面板、无 AI 仪表盘 |
| 切到 reading / 七选五等其他题组 | 渲染不受影响（回归） |

## DEV Readiness

- Step 1 可立即开始（数据已在 `content.blocks`，I5 fixture 可用）。
- Step 2 依赖 Step 1 的写作页模型 + verifier。
- 视觉对齐参考图需 #149 合并后取图；结构与 QA 可先行，不阻塞。

## PA Follow-Up Decisions

PA-lite inline（render-only、无数据契约变更，低 rework 风险）。若 PA 升出 Must Fix 再补本表。

| PA item | `pa.md` required disposition | `plan.md` handling | Status |
| --- | --- | --- | --- |
| — | — | — | — |
