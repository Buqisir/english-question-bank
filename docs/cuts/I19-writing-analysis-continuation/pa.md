# I19 PA — 写作解析续写（读后续写 Model Answer + Continuation Design + Highlight Expressions）

Reviewer: PA (小川, fresh cold-read). Branch `i19-writing-analysis-continuation`（HEAD `5f8984d`, base main `7967a7e`）。Tier: large（碰数据契约 + schema + 前端 + backfill 数据面）→ 4-session 全门。
Method: intrinsic 核实，每条带 file:line / 实跑命令。范文教学质量不评（owner 已逐篇 QA）。I18 已settled的 MF-1/2/3 只验继承，不重新litigate。

## Verdict

**APPROVE WITH MUST FIX.** 方向对、地基复用真成立、判别联合是干净加法、前端分支甚至比预期更轻（同一 `WritingAnalysisPanel` 内部 `taskType` 收窄、无需新 state / 新 render 路径）。7 个 pilot 实测全部符合契约（taskType=continuation、design 恰 2 段、theme 非空、3–5 highlight、substr 全命中、note 全非空）。envelope merge 经核实安全（每套已落 application 组，continuation 走另一 groupId 键 merge，现有 merge 逻辑保留旧键）。但有 **3 个 Must Fix** 必须先在 plan 钉死，DEV 才能开工：(MF-1) persist 投影只存 3 字段会丢 `continuationDesign`；(MF-2) 词汇 gate 的输入源与 `gate_check.py` 路径在 backfill 时不可复现，DEV 会即兴；(MF-3) schema 改 `taskType` const 是对 application 校验节点的修改而非纯加法，须钉死向后兼容写法。Open PO decisions = 1（在 3 以内）。

## Product Principle

老师/学生在 PaperSurface 读后续写组右侧看到一篇"够得着的好"两段范文 + 情节设计思路（theme + 两段设计逻辑）+ 3–5 条可迁移描写句块。离线 Claude 生成、在线只读，不碰运行时 AI。这是补 I18 没做的续写题型，复用 ADR-0010 存储（不进 ADR-0007 六题型发布门、不进 ADR-0009 DB 搜索库）。守住"展示 ≠ 搜索 ≠ 发布门"就守住了边界。续写比应用文多一层质量风险：续写奖励生动描写，而生动描写词常超纲——故新增的**词汇硬 gate** 是本刀的命门，必须可机检、可复现。

## Exact Architecture Model（核实后）

- **契约挂点真成立**：`app/src/domain/paperAsset.ts:245-249` 现 `WritingAnalysis` 是单 type（`taskType:'application'`）。改判别联合后 `GroupAnalysis.writing?`（:261）类型签名不变（仍 `WritingAnalysis`，只是该 type 成了 union）。✅
- **前端比 plan 描述更轻**：harness `PaperIntelligencePaperSurfaceHarness.tsx:442-468` writing 分支按 `groups[initialGroupId].writing` 取，深链 groupId = `group-<id>-writing-continuation` 时天然取到 continuation 组；`:460` 的 `as WritingAnalysis` cast 升级 union 后照收。面板 `WritingAnalysisPanel.tsx:29,42` 只读 `modelAnswer`/`highlightExpressions`（两分支公有字段），union 化后仍类型安全；渲染 `continuationDesign` 只需在面板内 `if (analysis.taskType === 'continuation')` 收窄——**标准判别联合 narrowing，无需新 state、无需 harness 改 fetch、无需新 render 分支**。plan Step 4 说"加 continuation 分支 + harness 接线"略重描，实际只动面板内部 + 可能一处类型。✅
- **存储/groupId 真成立**：实测每套 paper-asset 同时有 `group-<id>-writing-application`（taskType=application, starters=0）与 `group-<id>-writing-continuation`（taskType=continuation, starters=2）两个真实 writing 组。plan 的 `group-<id>-writing-continuation` 是**真实 groupId 不是合成键**，persist 直接用 `work.groupId` 即对。✅
- **envelope merge 真安全**：实测 `paper-2020-i/.../writing-analysis-v1.json` 已含 `group-2020-i-writing-application`（I18 落的）。`persistWritingAnalysisGroup`（service:229-235）`{...existingGroups, [groupId]: {...}}` 保留旧键——continuation 写入同文件不冲突。前提：DEV 走现有 persist 路径，不另起炉灶。✅
- **gate 输入可自洽**：实测 `materialText`(1674 字符) + `continuationStarters`(2) 就在 tracked `paper-asset.json` 的 `content.writingTasks[*]` 里——gate 的"原文+starters"允许集**可在 backfill 时从 paper-asset 直接取**，不必依赖 gitignored `.in.json`。但 plan/`gate_check.py` 没说这个（见 MF-2）。

## Must Fix Before DEV

### MF-1 — persist 投影只存 3 字段，会丢掉 `continuationDesign`（数据契约/数据丢失）

`persistWritingAnalysisGroup`（`server/writing-analysis/writingAnalysisBackfillService.mjs:222-227`）显式只构造 `{ taskType, modelAnswer, highlightExpressions }`，注释（:188-190）"Only the three contract fields … audit and other agent-side fields are discarded"。`validateWritingAnalysisCandidate`（:126-180）同样只校这三项 + `taskType==='application'` 硬卡（:132-133）。

**风险**：plan Step 3（:41）说"原子写 / resolvePaperAssetReadPaths / normalize 子串校验**全复用**"，但若 DEV 字面复用现有 persist 投影，`continuationDesign`（本刀新增必填字段）会被**静默丢弃**——文件落地后 design 字段消失，前端 continuation 分支无数据可渲染，且 schema 的 continuation `required:[continuationDesign]` 会让回读校验失败或前端拿到空。这是"复用地基"措辞掩盖的真实代码缺口：现有 persist 不是续写-ready 的。

**Disposition**：plan Step 3 必须明写：(1) persist 投影按 taskType 分支——continuation 时存 `{taskType, modelAnswer, continuationDesign, highlightExpressions}`；(2) `validateWritingAnalysisCandidate` 放宽 `taskType` 硬卡（:132）从 `!=='application'` 改为接受 application|continuation，并对 continuation 增校 `continuationDesign.theme` 非空 + `continuationDesign.paragraphs` 恰 2 且各非空（plan Step 3 校验清单已列，但要点明这是改现有函数、不是新写一个）。不可留给 DEV"复用"时自行发现。

### MF-2 — 词汇硬 gate 在 backfill 时的输入源不可复现，DEV 会即兴（parsing-reliability / 不可验证的校验）

`gate_check.py:11` 读 `{here}/pilot/{pid}.in.json` 取 `materialText`+`continuationStarters` 作允许集。实测：cut 目录是 `pilots/`（带 s）且**只有 `.out.json`，零 `.in.json`**；`.in.json` 仅存于 gitignored `.scratch/I19-continuation-research/pilot/`（`git check-ignore` 确认 IGNORED）。我实跑 `python3 .scratch/.../gate_check.py 2020-i /tmp/ma.txt` → `CLEAN ✅`，但**只在 .scratch 在场时成立**；从 tracked cut 目录跑直接 `FileNotFoundError`。

另：gate 依赖 `~/.claude/skills/guokao-vocab-checker/scripts/check.py`（仓库外、实测在场）+ 其 `data/` 词表 + `suspect_derived` 分诊。这是一条**跨仓库、跨机器的隐式依赖链**。

**风险**：(1) DEV 把 gate 固化为 backfill 校验步时，没有 tracked 的输入源（`.in.json` 被 ignore），会自己重新拼 allowlist——口径漂移 → 误杀（真课标词被判超纲，逼范文降质）或漏放（真超纲混入 12 个提交文件）。(2) skill 不在场则 gate 静默不可跑，CR/owner 无法复验。这正是 PA-persona 点名的"verify plan 不能证明风险"。

**Disposition**：plan Step 3 词汇 gate 段必须钉死：(a) allowlist 输入源 = **从 tracked `paper-asset.json` 的 `content.writingTasks[continuation].materialText + continuationStarters` 取**（已实测可取），不依赖 gitignored `.in.json`；(b) 显式声明对 `guokao-vocab-checker` skill 的依赖路径 + 版本基线（STATUS 记的 `expand_library.py` 补 72 派生那版），并说明 skill 缺失时 gate 的行为（须 **fail-hard 报错、绝不 silent-pass**）；(c) gate 输出口径锚定 `gate_check.py` 现有逻辑（GENUINE_OOV 必须为空才算 pass；SUSPECT 需人工/owner 核）。DEV 固化的是确定性脚本，不是重新发明口径。

### MF-3 — schema 改 `taskType` const 是对 application 校验节点的修改，须钉死向后兼容写法（数据契约/向后兼容）

`schemas/paper-import/writing-analysis-v1.schema.json:24` 现 `"taskType": { "const": "application" }`，:21 `required:[taskType, modelAnswer, highlightExpressions]`。plan Step 1（:33）称"application 分支不变""纯加法"——**不准确**：要让 continuation 文件合法，`:24` 的 `const:application` 必须改成允许两值（`enum:[application,continuation]` 或 if/then 分支），这是对**现有 application 校验节点的修改**，不是纯加法。向后兼容仍成立（旧 application 文件不带 continuationDesign，只要 continuationDesign 仅在 `taskType==='continuation'` 下 required），但写法必须钉死，否则 DEV 可能：(a) 把 continuationDesign 加进顶层 required → 旧 12 个 application 文件**全部回读校验失败**；或 (b) 漏改 const → continuation 文件压根过不了 schema。

注：`writing-analysis-v1.schema.json` 不在 `validator.mjs:44-49` 的 addSchema 列表（实测），故不进发布门——AJV 校验走 backfill/driver 的 ad-hoc 步（I18 CR 即如此跑的 12/12），plan Verify"AJV schema 12/12"合法，但"不破 validator.mjs addSchema 列表"是 I18 继承的 stale 措辞（本就不在该列表），无害。

**Disposition**：plan Step 1 schema 段改写为可执行规格：`taskType` 改 `enum:[application,continuation]`（或 if/then）；用 `if {taskType:const continuation} then {required:[continuationDesign]}` 的条件块，`continuationDesign` = `{required:[theme,paragraphs], theme:string minLength1, paragraphs:{type array, minItems2, maxItems2, items:{string minLength1}}}`；**顶层/groups 公共 required 不得加 continuationDesign**（保旧 application 文件合法）；schemaVersion 仍 `writing-analysis-v1`。Verify 段须含"旧 application 文件（不带 continuationDesign）仍 AJV pass"的回归项。

## Must Fix → Plan Disposition Checklist

| Must Fix | plan.md 须记录的处置 |
| --- | --- |
| MF-1 persist 丢 continuationDesign | Step 3：persist 投影按 taskType 分支存 continuationDesign；`validateWritingAnalysisCandidate` 放宽 taskType 硬卡 + 增校 design（恰 2 段各非空 / theme 非空）。点明"改现有函数非新写"。 |
| MF-2 词汇 gate 输入不可复现 | Step 3 词汇 gate 段：allowlist 取自 tracked paper-asset(materialText+starters)；声明 skill 依赖路径+基线；skill 缺失 fail-hard；口径锚定 gate_check.py（GENUINE_OOV 为空才 pass）。Verify 段同步"12/12 词汇 gate 零未注释超纲、可复跑"。 |
| MF-3 schema 条件校验/向后兼容 | Step 1 schema 段：taskType 改 enum、if/then 加 continuationDesign required、公共 required 不含 continuationDesign、schemaVersion 仍 v1。Verify 加"旧 application 文件仍 AJV pass"回归项。修正"application 分支不变/纯加法"措辞。 |

## Should Watch（不 block DEV）

- **SW-1 缺 5 套 ii-卷的生成质量（命门，但流程可接受）**：只 7/12 范文就绪（pilots/），缺 2020/2021/2022/2023/2024-ii，各与 i-卷同故事但须**逐卷独立生成**（继承 I18 MF-3 禁跨 paperId 复制）。风险真实——生成的 ii-卷可能 miss 第五档或带超纲。但 plan Step 5 的"LOCKED prompt 生成 → 课标-clean → gate 迭代到零超纲 → owner 逐篇 QA"是**可接受的 de-risk 流程**：硬 gate（结构 + 词汇）+ owner QA 双兜底。不 block DEV（DEV 先竖切代码，ii-卷生成是 backfill 数据阶段，CR 后 owner QA 前完成）。但 plan 须明记：5 套 ii-卷在 **owner QA 通过前不得 persist 进提交**；若任一套 gate 反复不过，单独记 follow-up 不阻塞已就绪的 7 套。
- **SW-2 wordCount 软警告区间须改续写口径**：service:175 现 `[60,180]` 是 application 口径。续写目标 ≈150、门槛 <120 扣分（STATUS:55）。plan Step 3（:46）说软警告 [120,180]——DEV 须把 service 的软警告下界对 continuation 用 120（不硬 block，沿用 I18 MF-2 词数不硬 gate）。记入实现注意，不单独 block。
- **SW-3 normalize 子串口径复用**：I18 SW-1 的 normalize（弯/直引号、dash、空白、大小写）已在 service `normalizeForSubstring` 落地、7 pilot 实测 substr 全命中（我跑过）。续写直接复用即可，无新风险。
- **SW-4 audit 字段不入库**：prompt 输出含 `audit`（continuation-prompt-v1.md:34），persist 已只存契约字段（service:223-227 + MF-1 扩 design）——DEV 须保证 audit 与 studentWordCount 不泄漏进文件（I18 已守，续写沿用）。Verify 已列"0 audit 泄漏"，OK。
- **SW-5 pilot 文件路径双写**：plan(:4,:54) 指 `.scratch/.../pilot/*.out.json`，但 tracked 副本在 cut `pilots/`。DEV backfill 应以 tracked `pilots/` 为源（.scratch 会被清/ignore）。建议 plan 统一指向 `pilots/`。记录即可。
- **SW-6 生成模型成本**：5 套 ii-卷各一次 Opus 离线生成 + gate 迭代，一次性可接受、不在运行时。OK。

## Allowed Files

- 契约（PreToolUse guard, ask 非 deny）：`app/src/domain/paperAsset.ts`（WritingAnalysis 改判别联合 + 加 ContinuationWritingAnalysis/ContinuationDesign；GroupAnalysis.writing? 签名不变）、`schemas/paper-import/writing-analysis-v1.schema.json`（taskType enum + if/then continuation 条件块）。
- server：新 `server/paper-import-ai/analyzeContinuationAnalysis.mjs`（镜像 analyzeWritingAnalysis.mjs，逐字搬 continuation-prompt-v1.md）；改 `server/writing-analysis/writingAnalysisBackfillService.mjs`（放宽 taskType 过滤 :93/:132、persist 投影分支 :223、新增 design 校验、词汇 gate 步、续写软警告下界）。
- 驱动：改 `scripts/import-pipeline/writing-analysis-driver.mjs`（list 放宽 :28 仅 application 注释、persist 续写）。
- 前端：`app/src/features/paper-intelligence/WritingAnalysisPanel.tsx`（内部 taskType 收窄渲染 continuationDesign，复用 pi-writing-* 类）；harness 仅在 cast/类型层随 union 升级（:460），不动 fetch/reducer/URL state/其他族 adapter。
- 提交物：12 套 `app/public/paper-assets/paper-*/latest/analyses/writing-analysis-v1.json` 的 `groups['group-*-writing-continuation'].writing`（envelope merge）。
- 文档：本 cut 目录（含 pilots/）、CONTEXT.md 已更（无须改）、ADR-0010（composition 变更落其内，无新 ADR）。

## Forbidden Files

- 不动 base 解析（reading/cloze/grammar/sevenChoices）类型/schema/adapter/渲染；不动 per-Question analysis。
- 不动 application 写作解析的形状/数据（旧 12 个 application 组文件不得被 clobber）。
- 不动 ADR-0007 六题型发布门 / `verify-c8-print-ready-gate.mjs` / `isGroupPrintReady`。
- 不写任何写作数据进 ADR-0009 DB 属性库 / teaching-facets index。
- 不动全国甲乙卷导入。
- 不提交 `versions/`(gitignored) / `data/*.sqlite` / `.scratch/**` / `.claude/launch.json`。禁 `git add -A`。
- 禁跨 paperId 复用 modelAnswer（i→ii 各自独立生成，继承 I18 MF-3）。

## Static Verify Requirements

- `tsc --noEmit` 绿（判别联合收窄、面板 continuation 分支、harness cast 升级类型安全）。
- AJV 对 12 个 writing-analysis 文件全绿（ad-hoc AJV against schema，如 I18 CR 跑法）；**回归：旧 application-only 文件仍 pass**（MF-3）。
- 续写硬 gate 12/12：结构（taskType=continuation + modelAnswer 非空 + design.theme 非空 + design.paragraphs 恰 2 各非空 + 3–5 highlight + 每 text normalize 子串命中 + note 非空）+ **词汇 gate 零未注释超纲、可复跑**（MF-2 口径）。
- 完整性 12/12：envelope 形状（schemaVersion/paperId/groups）、application 组未被 clobber、highlight 全逐字命中、design 各 2 段、0 audit/studentWordCount 泄漏、每 writing 仅契约字段。
- print-ready 门（ADR-0007 六题型）仍绿——写作解析未接发布 validator（设计如此）。
- `node scripts/verify-cut-artifacts.mjs docs/cuts/I19-writing-analysis-continuation large`（plan/pa/cr 齐）。

## Browser QA Matrix（owner PO QA）

- 续写组深链 `?view=paper-intelligence&source=paper-asset&paperId=<id>&surface=paper&groupId=group-<id>-writing-continuation`：右侧出现两段范文 + Continuation Design（theme 一行 + 第1段/第2段设计）+ 亮点表达（3–5 条，text+中文 note），不破题面/A4 布局。
- 抽含 2025-i 与 2025-ii（两道不同题，验 MF-3 不复用）+ 至少 1 套生成的 ii-卷（验生成质量）：范文与题面/原文融洽、亮点 text 真在范文里。
- 回归：同一套的 **application 组**（`group-<id>-writing-application`）照常渲染范文+亮点，未被 continuation 写入污染；任一 reading 组照常无报错（验加法不污染、envelope merge 未伤旧组）。
- 回归：一个无 continuation analysis 的状态（若有）优雅降级为纯题面，无报错。

## DEV Readiness

- 改进的老师动作：读后续写组讲评/自学时有现成范文 + 情节设计思路 + 高分句块。✅
- before/after：before 续写组右侧空白；after 范文+设计+亮点。✅
- 当前刀边界：续写一题型、范文+ContinuationDesign+亮点、离线生成只读、12 套、新增词汇硬 gate。✅
- future 边界：短文改错 / 评分细则 / 失分点 / AI 批改 / 搜索维度 / 视觉打磨（归 owner）——全 defer。✅
- allowed/forbidden：见上。✅
- verify/QA：见上。✅
- **DEV 不可开工，直到 MF-1/2/3 在 plan 钉死**（persist 存 design + 校验、词汇 gate 输入源+skill 依赖+fail-hard、schema 条件校验+向后兼容回归）。三条都是 plan 级决定，非 DEV 即兴。

## Open PO Decisions（≤3，当前 1）

1. **范文取向（vocab-clean vs 描写生动度）**：STATUS:41 记"owner 2026-06-06 待定取向"——续写奖励生动描写但生动词常超纲，doctrine/prompt 已定为"课标-clean（grin→smile/gallop→run）写出课标级生动、零未注释超纲"。7 pilot 已按此 owner QA 过。本 PA 核实 prompt 已 LOCKED、gate 实跑 CLEAN，故此取向**已隐性拍板**；列出仅供 owner 最终确认是否维持"课标-clean 优先于母语级生动"（若维持，无需回退，直接 build）。
   （MF-1 persist / MF-2 gate 输入 / MF-3 schema 写法均属 intrinsic 倒逼 + 工程处置，PM 压缩即可，无需 PO 单独拍。）
