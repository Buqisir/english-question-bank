# figure-render — 卷面图表渲染（fig-token P0 销账）

- Cut size: **medium**（多渲染面一致性）；touches **PaperSurface +
  print/PDF/DOCX 导出面 = 契约面，formal PA 先行**（本文件为 PM 草案，
  PA 意见回填后才派 DEV）。
- Touches schema / data contract: **no**（figures/manifest.json 契约已由
  导入标准 §8 定死，本刀只做消费端；数据零改动）。
- 契约解锁：DEV 开工时主代理 `touch .claude/contract-unlock`，收官删除。
- 并行边界（与 similar-entrypoints E3 同期施工，硬条件①核对过）：
  本刀 **Forbidden 碰** `App.tsx`、`PaperBrowsePage.tsx`、
  `app/src/concierge/**`、`QuestionGroupDetailView.tsx` 及 E3 更新的
  verify 脚本（verify-paper-browse / verify-concierge-desk /
  verify-home-default-feed / verify-paper-intelligence-route-integration /
  smoke-concierge-stream / smoke-golden-path）。收口串行，后合并者 rebase。

## 问题（审计唯一 P0）

卷面直出内部 token `[表: fig-paper-2026-i-reading-a-table-1]`——详情页
语篇卡、整卷页卷面、工作台 A4 预览三处同源可见；print/DOCX 同源，
**学生拿到手的卷子上会印着内部 token**。违反 PRODUCT 原则 5、
「所见即所印」、标准 §8 保真分级。

## 数据实况（2026-07-10 侦察）

- 全库唯一实例：paper-2026-i 阅读 A，段落
  `para-2026-i-reading-a-3`，文本 = `[表: fig-…] <拍平的赛程表文本>`。
- 原料齐全：`figures/reading-a-table-1.png` +
  `figures/manifest.json`（schema `paper-figures-manifest-v1`，含
  figureId/groupId/kind/file/caption/placeholderMarker）。
- 标准 §8 双存桥：拍平文本保语义（搜索/解析），截图保观感；长期解
  （表格结构化+按考卷样式绘制）明确是**另一把刀**，本刀不做。
- §8 消费降级条款（含图不可入草稿卷）**从未在代码落地**——本刀渲染
  落地后该条款自动满足（图在场），无需补 ban。

## 目标

任何用户可见渲染面**永不直出 `[表: …]` / `[图: …]` token**：

1. 有图原料 → 渲染真图（manifest 的 placeholderMarker → file 映射）；
2. 无原料/文件缺失 → 兜底占位卡（「〔表格：见原卷〕」+ manifest
   caption 若有），绝不裸 token。

## 渲染面清单（四处，一致处理）

| 面 | 载体 | 图片来源 |
|---|---|---|
| 详情页语篇卡 / 整卷页卷面 / 工作台 A4 预览 | `app/src/shared-ui/papersurface/PaperSurface.tsx`（三处同源） | `{assetBase}/figures/<file>`，manifest 由已加载 asset 的页面侧同路取回传入 |
| print/PDF（vivliostyle） | `server/print-renderer.mjs` 合成的 HTML | 服务端读 paper-assets 磁盘路径 |
| DOCX | `server/exports/docxRenderer.mjs` | PNG 嵌入 DOCX（docx 库图片能力 DEV 实证；若成本失控，降级方案见 PA 议题② |
| 草稿卷预览 | `app/src/features/draft-paper/draftPaperPreviewHtml.ts`（若独立合成） | 同上，DEV 摸清同源关系后定 |

## 拍平文本处置（关键行为规则）

manifest note 契约：拍平文本紧跟 placeholderMarker 之后、同段落内。

- 真图渲染成功 → 该段落 marker 之后的拍平文本**在视觉面隐藏**
  （数据不动，搜索/解析照常吃拍平文本）；图下渲 caption 无（caption
  是运维描述含 "source paper.pdf p.4"，**不给学生看**——PA 复核）。
- 兜底占位卡 → 拍平文本**保留显示**（语义完整优先，学生仍可做题）。
- marker 出现在段中任意位置的防御：只按 manifest 的 placeholderMarker
  精确匹配替换；无 manifest 命中的 `[表:`/`[图:` 模式 → 占位卡兜底
  （不吞正文）。

## PA 待议题

1. 拍平文本「图成功即隐藏」规则是否过激（vs 恒显/恒藏）；
2. DOCX 嵌图若实证成本高，v1 降级为占位文案是否可接受（标准保真
   分级要求试卷面达真题观感——降级即违标，需 owner 知情）；
3. PaperSurface 改动的最小切口（新 block 类型 vs 段落内联替换）；
4. 缩放/版式：A4 面图片宽度约束（不超版心）、print/PDF 分页处
   图片不跨页断裂；
5. 全库单实例——verify 断言怎么写才不 hardcode 这一张图（用 manifest
   驱动遍历，零图卷零断言零失败）。

## Forbidden

- 数据侧零改动（paper-asset.json / figures/ / manifest 均只读）。
- 不做表格结构化长期解、不动 adapters 的输入输出契约。
- 不实现「含图不可入草稿卷」ban（渲染落地后条款自动满足）。
- 并行边界文件（见头部）。

## Verify / 验收（草案，PA 后定稿）

- 新 `scripts/verify-figure-render.mjs`：manifest 驱动——对每个含
  figures/manifest.json 的卷，断言四渲染面输出含 `<img>`（或 DOCX 含
  图片部件）且不含任何 placeholderMarker 裸 token；对全库断言任何
  渲染输出不含 `[表: fig-` / `[图: fig-` 模式。
- 既有 verify:all 全绿；`tsc` 干净。
- QA（owner + 主代理）：paper-2026-i 阅读 A 在详情页/整卷页/工作台
  A4/print 预览/导出 PDF/导出 DOCX 六处目检——表格图在场、无 token、
  无拍平文本重复、版式不破。
