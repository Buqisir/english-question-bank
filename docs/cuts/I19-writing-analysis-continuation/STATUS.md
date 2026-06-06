# I19 读后续写写作解析 — 进度（2026-06-06）

**当前状态：build 全门完成，已 RM 合并（见 `cut-note.md`）。**
- ✅ PM 阶段：三源调研 → grill 锁契约 → doctrine → **prompt LOCKED** → 7 个不同故事范文 owner QA 过 → plan.md。
- ✅ **build 全门**：fresh PA（3 MF 折叠进 plan）→ DEV（Steps 1-4 代码）→ fresh CR（APPROVE，弯引号回归已修）→ import-data fix（2020-ii/2021-ii starter 损坏）→ backfill 全 12（7 pilot + 5 套 ii 卷独立生成、词汇 gate 全 CLEAN）→ owner PO QA 通过 → RM 合并。
- ✅ 机检：tsc 绿 / AJV 12/12（含向后兼容）/ 词汇 gate 12/12 CLEAN / 完整性 12/12（application 未 clobber、0 audit 泄漏）/ print-ready 32/0 / 渲染 + 回归无错误。
- **收口**：`pa.md` `cr.md` `cut-note.md` 齐；详见 `cut-note.md`。

---
（以下为 vocab 加固记录，已完成）

词库瑕疵（B）已解决 ✅：
- `guokao-vocab-checker` skill 加了 `suspect_derived` 分诊 + `expand_library.py`，补 72 个安全派生，全仓库语料误杀=0、真超纲零漏放（见 `~/.claude/skills/guokao-vocab-checker/TASK-derivation-expansion.md`）。
- **gate 口径确认有效**：允许 = 课标∪库派生∪疑似派生(词根课标·人工核)∪本题原文+starters 出现的词∪专名。名字/原文词已正确滤除。

**下一步 = 范文 vocab-clean**：7 篇范文经改进版 skill 查出 **≈29 个真超纲描写词**要换成课标词（详见恢复步骤）。

## 已完成（done）

1. **三源调研**：评分标准（owner 贴的 25 分分档，存 `.scratch/I19-continuation-research/评分标准-读后续写.md`）+ 课标 + 外脑 vault（M 讲义/艾米/13 篇真题解析）。
2. **Grill 锁定契约**（CONTEXT.md 已更新；无新 ADR，落 ADR-0010 内的 composition 变更）：
   - `WritingAnalysis` 改**判别联合**：`ApplicationWritingAnalysis | ContinuationWritingAnalysis`（按 taskType）。
   - continuation 分支必填新字段 **Continuation Design（情节设计思路）**：`{ theme: string, paragraphs: [string, string] }`（2 条按 starter 一一对应；theme 一句话、每段一句话讲设计逻辑）。
   - `modelAnswer` 单 string 含 2 个 starter 句；`highlightExpressions` 沿用 `{text, note}`、逐字命中、无 category。
   - 语法天花板 = **受控提升**（必修\*主体 + 刻意埋 \*\*/\*\*\* 级"够得着高分记叙句"作亮点）。
3. **Doctrine + prompt**（`续写准则.md` + `continuation-prompt-v1.md`，prompt 仍 DRAFT 未锁）：含 NSDD 情节法、衔接、描写重心、**意象护栏**（点题意象必须锚定原文真有的，2025-i clean-floor 教训）。
4. **全语料压测**：7 个不同故事各生成范文（`.scratch/I19-continuation-research/pilot/*.out.json`），PM QA 全部第五档、融洽度对原文逐篇核过；2025-i 因 clean-floor 重生成已修。
5. **词汇自查**：用 `guokao-vocab-checker` 查 7 篇范文 → 发现范文新引入了真超纲词（详见下）。这是 park 的原因。

## 范文 vocab-clean：要改的真超纲（2026-06-06 改进版 skill 重测）

每篇要换成课标词的真超纲描写词（名字/原文/starters 词已滤除）：
- 2020-i: pop, jingling, trembling, cheeks
- 2021-i: scolding, reassuring, sleeves, melted, tray, upstairs(starter 给的, 可放)
- 2022-i: chin, trembled, flickered, whistle, vanished, beaming
- 2023-i: galloping, trophy
- 2024-i: scribbling, scrap, palm, squeezed, grin/grinned
- 2025-i: wagging, trembling
- 2025-ii: creeping, dodge, bloom

**张力**：续写奖励生动描写，但生动描写词常超纲（gallop/grin/tremble…）。范文 doctrine = "学生照着能学会、课标词为主"，故走**课标-clean**（grin→smile、tremble→shake、gallop→run 等），用课标词写出课标级的生动。owner 2026-06-06 待定取向。

## 恢复步骤

1. **prompt 加硬约束**：`continuation-prompt-v1.md` 增"用词限课标词汇、范文须零未注释超纲（描写也用课标词）"，并把 vocab gate（check.py + 原文/starters/专名过滤）作生成后校验。
2. **重生成 7 篇课标-clean** → 过 gate 至零未注释超纲。
3. 范文交 owner 逐篇 QA → 满意 → **锁 prompt-v1**。
5. **写 plan.md**（DEV 合同：判别联合类型 + schema 条件校验 + persist/前端 continuation 分支 + backfill driver；放宽 `taskType==='application'` 硬过滤）。
6. fresh PA（碰契约+数据面）→ DEV → fresh CR → 全 12 套 backfill 生成（逐卷独立、禁跨 paperId 复制；i=ii 同故事仍各自生成）→ PO QA → RM。

## 关键事实（恢复时复用）

- 12 套续写 = **7 个不同故事**（2020/2021/2022/2023/2024 各 i=ii 同题；2025-i ≠ 2025-ii）。
- 续写数据：`taskType:'continuation'`、`wordCountTarget:150`、`continuationStarters` 恰 2 句（12/12）、`materialText` ~1700 字符。
- 评分门：学生续写 < 120 词扣分（目标 ≈150，瞄 140–160）。
- `app/src/domain/` + `schemas/` 受 PreToolUse 契约 hook 守护（ask 非 deny）。`server/**` 不守护。
- 写作解析落 paper-asset 文件（非 DB）→ 不需停 API。
