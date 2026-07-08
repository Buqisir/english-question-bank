# Cut: cloze-panel-polish（UI 精美化 + 信息分层，medium）

## 背景

PI 解析页（PaperIntelligencePaperSurfaceHarness）右栏按题型分发面板。七选五（SevenChoicesAnalysisPanel，`pi-seven-*`）和阅读（PaperAssetAnalysisPanel，`pi-ps-*`）有完整精致的样式：暖色笔记本质感、选项卡片、彩色徽章、标签 chips、「展开细节」折叠。而完形（ClozeAnalysisPanel，`pi-cloze-*`）和语法填空（GrammarFillAnalysisPanel，`pi-gf-*`）**一行 CSS 都没有**——纯裸 HTML，owner 判为不可接受。

样式全部住在 `app/src/features/paper-intelligence/paperIntelligencePaperSurfaceHarness.css`（文件尾部已有一小段 pi-cloze/pi-gf group-overview 折叠样式，是刚落地的简介折叠刀，保留其行为）。

## 目标

完形 + 语法填空面板达到七选五同档的视觉与信息层级。动手前先通读 SevenChoicesAnalysisPanel.tsx / PaperAssetAnalysisPanel.tsx 及它们在 harness css 里的样式段（`pi-seven-*`、`pi-ps-analysis` 起），完形/语法填空的视觉语言必须从这套现有 idiom 派生（同一套颜色变量、圆角、间距、字号节奏），不许发明新设计系统。

## 信息分层（owner 已拍板）

每个空的解析卡（两个面板同构处理）：

**常显区**：
1. 卡片头：`第 N 题` + 词性/考点 tag（chip 样式，修掉现在「第 41 题noun」贴在一起的裸排版）+ signatureLabel（若有）。
2. 答案：答案字母做成徽章（参照 pi-seven 序号徽章/pi-ps 正确项打勾的分量感）+ 一句话解析正文。
3. 干扰项释义（完形）：紧凑列表，每行 `A. stories — 故事，与…`，字号略小、弱化颜色，不占主视觉。

**折叠区（默认收起，按钮文案「展开细节」，参照七选五的展开钮样式）**：
4. 证据定位：展开后逐条渲染。证据 type 目前直接显示英文 slug（如 `collocation-partner`、`repetition-echo`）——加一个 type→中文短标签的映射（枚举值从 clozeAnalysisSurfaceAdapter / grammarFillAnalysisSurfaceAdapter 及其上游 schema 里穷举，翻译成 2-4 字教学用语，如 搭配线索/复现呼应；映射不到的值原样兜底显示）。证据按钮的 `data-pi-evidence-id` / `data-pi-question-id` / `aria-pressed` 及 onSelectEvidence 行为**一字不动**（跨栏证据连线依赖这些锚点）。
5. 解题提示（teachingNote）：折叠区内，弱化样式。

折叠状态用面板内 useState（按 questionId 记忆或切空即重置均可，选实现简单的，注释说明）。注意：证据按钮在折叠时不在 DOM，证据连线只在用户展开并点击后出现，这是预期行为。

## 约束

- 只改：两个 Panel tsx、harness css、（若需要）两个 surfaceAdapter 加 label 映射、对应 verify 脚本断言。
- 不改：数据结构/adapter 的输出 shape（除新增 label 字段）、Harness 分发逻辑、其他题型面板、server。
- 简介折叠（details/summary，刚上线）行为保留，样式可以在新视觉语言下顺一遍。
- 移动端（<=1199px stacked 模式）必须同样成立：卡片全宽、触控目标不小于现有 pi-seven 的标准。
- 深浅色：harness css 现有变量体系若含暗色适配则跟随；没有就不新增。

## 验收

1. `node scripts/verify-i9-cloze-analysis-surface.mjs` 和 `node scripts/verify-i14-grammar-fill-analysis-surface.mjs` 绿——结构断言若因分层重构失效，更新断言使其钉住**新**结构（更新处逐条在报告里列出理由）。
2. `pnpm -C app run verify:all` 全绿。
3. 用 `pnpm -C app run build` 产物无警告错误。
4. 自检截图：起本地 dev（app 目录 `pnpm run dev`，server 目录 `node api.mjs`，若 worktree 缺 data/*.sqlite 从主树 /Users/huangxuewei/Projects/english-question-bank/data/ 复制，只读用途）——若环境起不来，说明原因并以 verify 为准，不硬凑。
5. 提交 `docs/cuts/cloze-panel-polish/plan.md`（本契约落档）+ 实现。commit 规范 `feat(pi): ...`，结尾 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。

## 实现落地摘要（DEV 补记）

- 两个 surfaceAdapter 各加一个 `type → typeLabel` 教学用语映射（`CLOZE_EVIDENCE_TYPE_LABELS` / `GRAMMAR_FILL_EVIDENCE_TYPE_LABELS`），`EvidenceRowView` 各新增 `typeLabel: string` 字段（映射不到原样兜底），面板证据 chip 直接消费 `row.typeLabel`。
- 两个 Panel 均新增 `useState<Set<questionId>>` 记录展开状态；`analysis` 为 `null` 时新 blank 天然不在 Set 里，无需显式 reset。
- 证据按钮的 `data-pi-evidence-id` / `data-pi-question-id` / `data-pi-evidence-kind="support"` / `aria-pressed` / `onClick={() => onSelectEvidence(...)}` 完全未动，只是外层多包了一层折叠容器。
- harness css 尾部的 pi-cloze / pi-gf 样式段整体重写（chip 头、答案徽章、紧凑干扰项列表、折叠证据卡、解题提示弱化框），`.pi-seven-panel-actions button, .pi-seven-details-toggle` 选择器扩展为同时覆盖 `.pi-cloze-details-toggle, .pi-gf-details-toggle`（复用而非重新发明按钮视觉）。
- 两个 verify 脚本（i9 cloze / i14 grammar-fill）现有的结构性断言全部是「源码字符串包含某子串」的检查，未强绑 DOM 层级/可见性，因此**零断言改动**即可通过——旧断言检查的 `analysis.pos` / `correctFit.reason` / `data-pi-evidence-id={row.evidenceId}` 等字面量在新布局里原样保留，只是被包进了折叠容器。
