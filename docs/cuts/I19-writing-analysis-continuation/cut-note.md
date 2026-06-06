# I19 读后续写写作解析 — Cut Note（收口记录）

**状态**：实现完整、PA/CR 通过、owner PO QA 通过、待 RM 合并。分支 `i19-writing-analysis-continuation`（base main `7967a7e`）。

## 落地了什么

给 **12 套新课标真题（2020–2025，i+ii）的读后续写组**点亮**只读写作解析**（I18 应用文那刀的续写姊妹篇）：每组一篇 **Model Answer 范文** + **Continuation Design 情节设计思路**（theme + 两段设计逻辑）+ 3–5 条 **Highlight Expression 亮点表达**（英文句块 + 中文 note）。离线用 Claude 生成、落成 paper-asset 文件、前端只读展示。复用 ADR-0010 存储。

- **契约**：`paperAsset.ts` 的 `WritingAnalysis` 从单 type 改为**按 taskType 判别的联合** `ApplicationWritingAnalysis | ContinuationWritingAnalysis`；新增 `ContinuationDesign = {theme, paragraphs:[string,string]}`（continuation 分支必填，守"必填别 optional"）。`schemas/.../writing-analysis-v1.schema.json` 加 `if/then` 条件校验（schemaVersion 不变、向后兼容）。
- **生成/落库**：新 `server/paper-import-ai/analyzeContinuationAnalysis.mjs`（LOCKED prompt 逐字搬入）+ `writingAnalysisBackfillService.mjs` 放宽 taskType 过滤 + persist 投影分支 + **词汇硬 gate（`runVocabGate`）** + driver `[application|continuation|all]` 参数。
- **前端**：`WritingAnalysisPanel.tsx` 加 continuation 渲染分支（面板内 `taskType` 收窄，复用 `pi-writing-*` 类）；application 分支不动。
- **数据**：12 个 `app/public/paper-assets/paper-*/latest/analyses/writing-analysis-v1.json` 的 `group-*-writing-continuation`（envelope merge，git 跟踪）。

## 关键决定

- **判别联合（无新 ADR）**：composition 变更落 CONTEXT.md + ADR-0010 内。continuation 分支 `continuationDesign` 必填、application 分支无该字段。
- **词汇硬 gate（本刀新增命门）**：modelAnswer + 每条 highlight 须**零未注释超纲**；口径 = 课标 ∪ 库派生 ∪ 本题原文+starters ∪ 专名（锚定 `gate_check.py`，allowlist 取自 tracked paper-asset、skill 缺失 fail-hard）。续写奖励生动描写但生动词常超纲——doctrine 走**课标-clean**（grin→smile / gallop→run / tremble→shake…），"课标词也能写生动"。
- **范文 doctrine + LOCKED prompt**（`续写准则.md` + `continuation-prompt-v1.md`）：目标 = 课标水平二 / 评分第五档；NSDD 情节法 + 意象护栏（点题意象须原文真有）；7 道全语料压测 + 5 套 ii 卷生成均第五档。
- **范围**：v1 只做**读后续写**；短文改错、评分细则/失分点、AI 批改、搜索维度、视觉打磨（归 owner）—— 全部不在本刀。

## 全门流程

`fresh PA（3 MF：persist 丢 design / 词汇 gate 输入不可复现 / schema 改 const 非纯加法 —— 全折叠进 plan）→ DEV（Steps 1-4 代码）→ fresh CR（APPROVE，唯一 Must-Fix=本 cut-note；1 Should-Watch=normalizeForSubstring 弯引号被误伤已修）→ import-data fix（2020-ii/2021-ii starter 损坏）→ backfill 全 12（7 pilot + 5 ii 卷独立生成）→ owner PO QA（5 套新 ii 卷逐篇满意）→ RM`。

## 验证

- `tsc --noEmit` 绿（判别联合收窄、前端分支类型安全）。
- 词汇 gate 12/12 CLEAN（可复跑；CR 实测口径与 gate_check.py 字节级一致、OOV 注入能拦、skill 缺失 fail-hard）。
- AJV 12/12 ok（含旧 application-only 文件向后兼容仍 pass）；硬 gate 12/12 pass。
- 完整性 12/12：envelope 形状、**application 组未被 clobber**、highlight 全逐字命中、continuationDesign 各 2 段、**0 audit/studentWordCount 泄漏**、每 writing 仅契约字段。
- print-ready 门（ADR-0007 六题型）32/0 绿——写作解析未接发布 validator（设计如此）。
- 浏览器 QA：续写面板（范文 + 情节设计 + 第1段/第2段 + 亮点）渲染正常、application 组回归正常（不显示续写设计）、无 console 错误。owner 逐篇 QA 5 套 ii 卷通过。

## PA / CR 记录

- PA：`pa.md`（APPROVE WITH MUST FIX，3 MF 已折叠进 plan「PA Follow-Up Decisions」）。
- CR：`cr.md`（APPROVE WITH MUST FIX，唯一 Must-Fix=本 cut-note 非代码缺陷；SW-CR-1 弯引号回归已修）。

## 顺带修复（单独 commit）

- **import-data fix（2020-ii / 2021-ii starter 损坏）**：backfill 前 intrinsic 全扫发现 2 套 ii 卷 starter 源数据坏（2020-ii 全角逗号；2021-ii starter[1]=`'Paragraph 2：'` 坏占位，学生侧也坏）。从同故事 i 卷复制干净值修回。owner 拍板修齐凑 12/12。print-ready 门 32/0 确认未破。

## Deferred / 后续

- **视觉打磨**：`WritingAnalysisPanel` continuation 分支结构搭好、复用现有 `pi-writing-*` 类——视觉精修归 owner（约定分工）。
- **精确学生词数硬 gate**：有意取舍（骨架埋自由文本扣不出）→ prompt 自控 + 软警告 [120,200] + PO QA 兜底（沿用 I18 PA MF-2）。
- **词汇 gate 跨环境依赖**：依赖 `~/.claude/skills/guokao-vocab-checker`（仓库外）+ 其词表基线；fail-hard 保证缺失不 silent-pass，但词表"漂移"不被检测（CR Self-Review Blind Spot，设计内隐式信任）。
- **短文改错 / 评分细则**：以后另起刀，复用本刀地基（判别联合 + 存储 + 前端，换内容形状）。
