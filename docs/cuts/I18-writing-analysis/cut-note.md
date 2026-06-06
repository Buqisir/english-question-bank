# I18 写作解析 — Cut Note（收口记录）

**状态**：实现完整、CR 通过、待 RM 合并。分支 `i18-writing-analysis`（`d900aa8..dc7a590`，5 commit）。

## 落地了什么

给 **12 套新课标真题（2020–2025，i+ii）的应用文写作组**点亮**只读写作解析**（ADR-0007 留的「future writing analysis」坑）：每组一篇 **Model Answer 范文** + 3–5 条 **Highlight Expression 亮点表达**（英文句块 + 中文 note）。离线用 Claude 生成、落成 paper-asset 文件、前端只读展示。

- **契约**：`paperAsset.ts` 加 `WritingAnalysis`/`HighlightExpression`，`GroupAnalysis` 加可选 `writing?`（纯加法）；新 `schemas/paper-import/writing-analysis-v1.schema.json`（自描述 envelope）。
- **生成/落库**：`server/paper-import-ai/analyzeWritingAnalysis.mjs`（锁定 prompt）+ `server/writing-analysis/writingAnalysisBackfillService.mjs`（list/validate/persist）+ `scripts/import-pipeline/writing-analysis-driver.mjs`（镜像 vp-driver）。
- **前端**：新 `WritingAnalysisPanel.tsx` + harness writing 分支 fetch + 渲染（404 优雅降级）。
- **数据**：12 个 `app/public/paper-assets/paper-*/latest/analyses/writing-analysis-v1.json`（git 跟踪）。

## 关键决定

- **ADR-0010**：写作解析 = **可回填的文件型展示解析**——存 paper-asset 文件、**不进发布完整性门**、**不进 ADR-0009 DB 搜索库**。分界线 = 展示 vs 搜索。
- **范文 doctrine（`范文准则.md`，课标为纲·评分为尺）**：目标 = 水平二的优秀执行（评分第五档）；必修(\*)级语法为主、得体刚需时亮点伸 1–2 个选必/选修；课标词；110–120 学生词；体裁自适应。**prompt（`prompt-v1.md`）经 7 道全语料题 + 2 道收紧重生成压测锁定，全部第五档 14–15。**
- **范围**：v1 只做**应用文**；读后续写、短文改错、评分标准/失分点、交互式 AI 批改、全国甲乙卷 —— 全部不在本刀。

## 全门流程

`PM grill（课标/评分/外脑三源调研）→ ADR-0010 + plan.md → fresh PA（3 条 Must-Fix 全落实：envelope / 词数降软警告 / i-ii 非全同题禁跨卷复制）→ DEV（后端 Step1-3 + 前端 Step5）→ fresh CR（APPROVE，无代码缺陷）→ PO QA（2024-i 在 app 内合格）→ RM`。

## 验证

- `tsc --noEmit` 绿。
- 12/12 完整性：envelope 形状对、**57 条亮点全部逐字命中范文**、0 audit 泄漏、每条 writing 仅 3 契约字段。
- AJV schema 12/12 ok；硬 gate 12/12 pass。
- print-ready 门（ADR-0007 六题型）32/0 绿——**写作解析未接入发布 validator，发布门未动**（设计如此：展示解析、可回填、非门控）。
- Forbidden 全守：未碰 base 解析；2025-i≠2025-ii 内容各异；报道/投稿无 Dear/Yours；无 versions/sqlite/scratch 进 diff。

## PA / CR 记录

- PA：`pa.md`（APPROVE WITH MUST FIX，3 条已折叠进 plan）。
- CR：`cr.md`（APPROVE WITH MUST FIX，唯一 Must-Fix = 本 cut-note，非代码缺陷）。

## Deferred / 后续

- **视觉打磨**：`WritingAnalysisPanel` 的 `pi-writing-*` 暂无 CSS（浏览器默认样式）——owner 接手打磨（约定分工）。
- **精确学生词数硬 gate**：有意取舍（骨架埋 instruction、`applicationGiven` 全空，代码扣不出）→ 由 prompt 自控 + PO QA 兜底（CR Should-Watch）。
- **续写/短文改错**：以后另起刀，复用本刀的存储/前端地基（换内容形状）。
- 浏览器 QA：PO 已验 2024-i；建议 RM 前再抽检 1–2 套 backfill（CR Should-Watch）。
