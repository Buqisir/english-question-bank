# I19 CR — 写作解析续写（读后续写 Model Answer + Continuation Design + Highlight Expressions）

Reviewer: CR (小川, fresh cold-read). Branch `i19-writing-analysis-continuation`. Diff `eb70a20..03a4c4f`（HEAD `03a4c4f`），code-only commit，6 files +461/-46. Tier: large（碰数据契约 + schema + 前端 + backfill 管线）.
Method: intrinsic 核实——每条带 file:line 或实跑命令 + 实测输出。范文教学质量不评（owner 已逐篇 QA）。前端视觉打磨不评（owner 约定分工）。本刀是 **code-only**：Step 5 的 12 个 backfill 数据文件是 post-CR 独立阶段，不在此 diff，**不评数据缺失**。

## Verdict

**APPROVE WITH MUST FIX.** 实现忠实于 plan，**PA MF-1/2/3 三条全部正确落实、PA loop 闭环**，Forbidden 边界全守，范围精确（恰 6 个 allowed 文件、零数据文件、零 forbidden 文件）。竖切代码全跑通：`tsc --noEmit` 绿；AJV 5/5（含旧 application 向后兼容 pass + malformed continuation reject + if/then 条件块正确）；`validateWritingAnalysisCandidate` 7 个 pilot 全 accept、malformed 全 reject；**词汇 gate 实跑 CLEAN on 2020-i（GENUINE_OOV 空）、allowlist 源自 tracked paper-asset、与 canonical `gate_check.py` 口径字节级一致、OOV 注入测试证明真能拦、skill 缺失实测 FAIL-HARD**；persist envelope merge 实测保 application 组不被 clobber、存 continuationDesign、audit 不泄漏；print-ready 门 32/0 绿。

**唯一 Must Fix 是 RM 闭环物：缺 `cut-note.md`（large cut closeout 必需，I18 同款 MF）。** 代码可合，但 large cut 闭环前须补。

另有 1 条 **Should Watch**（非 block）：`normalizeForSubstring` 的 curly-quote 正则字符类被本 commit 无意改坏（U+2018/2019/201C/201D 被替成 ASCII 引号），子串归一化对弯引号失效——当前 7 套 pilot 无弯引号故不破，但是继承 helper 的潜在回归 + "别动没让碰的代码"破例，建议修回。

## 核实结论（逐条对 plan / PA MF）

### 1. 契约判别联合（`paperAsset.ts:245-264`）✅
- `WritingAnalysis` 从单 type 改为 `ApplicationWritingAnalysis | ContinuationWritingAnalysis` 判别联合，与 plan Step 1 逐字一致。`continuationDesign: ContinuationDesign` 在 continuation 分支**必填**（守"必填别设 optional"）、application 分支无该字段。`paragraphs: [string, string]` 是 2-tuple 类型。`GroupAnalysis.writing?` 签名不变。
- `tsc --noEmit` **实跑 EXIT 0**——判别联合收窄 + 前端 continuation 分支 + harness cast 升级全类型安全。

### 2. schema 条件校验 + 向后兼容（MF-3）✅
- `taskType` `{const:'application'}` → `{enum:['application','continuation']}`（schema:24）；新增 `continuationDesign` 属性定义（required[theme,paragraphs]、theme minLength1、paragraphs minItems2/maxItems2/items minLength1）；**公共 required 不含 continuationDesign**；`if {properties.taskType.const:continuation, required:[taskType]} then {required:[continuationDesign]}` 条件块；schemaVersion 仍 `writing-analysis-v1`。
- **AJV 实跑 5/5（用 server/node_modules/ajv Ajv2020, strict:false）**：
  - 旧 shipped application 文件（`paper-2024-i/.../writing-analysis-v1.json`，无 continuationDesign）→ **valid（向后兼容 ✅）**
  - 2020-i pilot 投影成 envelope → valid
  - malformed continuation 缺 design → invalid（`must have required property 'continuationDesign'` + `must match "then" schema`）
  - malformed paragraphs=1 → invalid（`fewer than 2 items`）
  - application 0 highlights → invalid（`fewer than 3 items`）
- blind spot #4 已核：`if` 含 `required:[taskType]`，故旧 application 文件（taskType=application）走 then 时 const 不匹配 → continuationDesign 不被 required → 向后兼容成立（实测确认）。

### 3. persist 投影 + 校验放宽（MF-1）✅
- `persistWritingAnalysisGroup`（service:393-415）投影**按 taskType 分支**：continuation 存 `{taskType, modelAnswer, continuationDesign:{theme,paragraphs:[p0,p1]}, highlightExpressions}`，application 保留原 3 字段。**实测**（沙盒 persist 2020-i pilot 到已含 application 组的 envelope）：merge 后两组共存、`group-2020-i-writing-application.modelAnswer` 原值保留、continuation 组有 design 且 paragraphs.length===2、**无 audit 字段泄漏**。envelope merge `{...existingGroups, [groupId]:...}`（:417-423）保旧键正确。
- `validateWritingAnalysisCandidate`（service:255-345）taskType 硬卡从 `!=='application'` 放宽为接受 application|continuation（:264-266）；新增 continuation 结构校验（:274-296）：design 是对象 + theme 非空 + paragraphs 恰 2 各非空。highlight 子串校验（normalize 后 substring of modelAnswer）+ note 非空沿用。
- **实测**：7 个 pilot（2020-i…2025-ii）全 accept；缺 design / paragraphs=1 / paragraphs=3 / 空 theme / highlight 非子串 全部正确 reject（带准确错误信息）。

### 4. 词汇硬 gate（MF-2）✅ — 本刀命门，重点核实
- `runVocabGate`（service:147-225）+ 驱动调用（driver:124-153）：
  - **(a) allowlist 输入源**：driver 从 `w.writingTask.materialText + continuationStarters` 拼 allowlistText（driver:128-131）——即 **tracked paper-asset.json**，不依赖 gitignored `.in.json`。**实测**：2020-i 的 paper-asset `materialText`+`starters` 与 `.scratch/.../2020-i.in.json` **字节级相同**（materialText eq=True、starters eq=True），故 MF-2 的输入源替换忠实。
  - **(b) FAIL-HARD**：skill 缺失 `throw`（service:158-163，module-level `existsSync` 检查 VOCAB_CHECKER_SCRIPT）。**实测**：把 HOME 指向无 skill 目录 → `[vocab-gate] FAIL-HARD: ... not found` 抛出，绝不 silent-pass。
  - **(c) 口径锚定 gate_check.py**：内联 Python 复现 canonical 的 src_words（allowlist 小写词）+ caps（专名）+ genuine（OOV 减 src 减 caps）逻辑。**实测**：用同一 allowlist 跑 canonical `gate_check.py` 逻辑 vs `runVocabGate` 内联脚本，2020-i 两者 GENUINE_OOV 均为 `[]`——口径一致。pass=GENUINE_OOV 空时 `clean=true`。
  - **真能拦**：注入 `xylophonically obfuscate` → `clean=false, genuineOov=["obfuscate","xylophonically"]`，driver 据此 `throw`（driver:139-145）阻 persist。SUSPECT 仅 warn 不 block（driver:147-151，符合 gate_check.py「疑似派生人工核」口径）。
- 调用顺序正确：driver 在 `validateWritingAnalysisCandidate` 之前对 continuation 跑 gate（driver:126→154），gate 不在 validator 内部（职责分离，注释 service:333-335 明示）。

### 5. prompt 忠实搬运（`analyzeContinuationAnalysis.mjs`）✅
- SYSTEM 段（:13-57）**逐字等于** `continuation-prompt-v1.md` SYSTEM 段（LOCKED 2026-06-06）——目标水平/评分第五档/创作准则①-⑤/输出 JSON 结构/输出前自检，全字符级一致（含 `grin→smile` 等课标-clean 示例、意象护栏）。
- USER 注入（:74-86）：materialText + 两个 starter（按序）+ wordCountTarget(默认 150) + 任务类型，与 prompt-v1.md USER 模板（:56-61）占位一一对应。`buildContinuationAnalysisMessages` 镜像 `analyzeWritingAnalysis.mjs`。

### 6. 前端 continuation 分支（`WritingAnalysisPanel.tsx:30-79`）✅
- 面板内 `if (analysis.taskType === 'continuation')` 标准判别联合收窄渲染：modelAnswer（按 \n 分段）+ Continuation Design（theme 一行 + 第1段/第2段 设计）+ highlightExpressions（3-5 条，length>0 守卫）。**application 分支字面未动**（:81 起，diff 确认）。
- blind spot #3 已核：harness `groupEntry.writing as WritingAnalysis`（harness:460）升级到 union；若运行时出现意外 taskType，面板 `continuation` 收窄不命中 → 落 application 分支，读 modelAnswer/highlightExpressions（union 公有字段）→ 优雅降级、不崩。tsc 绿确认类型安全。复用 `pi-writing-*` 类、无新设计系统（视觉归 owner）。

### 7. 范围遵守（Forbidden）✅
- 改动恰为 6 个 allowed 文件（contract / schema / 新 analyze / service / driver / panel），**零数据文件**（`git show --name-only` 确认无 paper-assets/*.out.json/*.in.json），**零 forbidden**（无 verify-c8 / validator.mjs / reading|cloze|grammar|seven / 甲乙卷 / isGroupPrintReady）。
- print-ready 门（ADR-0007 六题型）**实跑 32 passed / 0 failed**——写作 schema 未接发布 validator（设计如此）。
- `.claude/launch.json` 未跟踪且 `git check-ignore` 确认 IGNORED，不在 commit 内。
- driver default `taskTypeFilter='all'`（blind spot #2）：实测 `list`（无参）= 12 continuation work（application 12 组已 I18 persist → skip-when-done 跳过，:121），`list continuation`=12，`list application`=0。default 改动 benign，driver 是 service 唯一消费者（grep 确认）。

## Must Fix（blocks closeout）

### MF-CR-1 — 缺 `cut-note.md`（large cut RM 闭环物）
`docs/cuts/I19-writing-analysis-continuation/` 现有 plan.md / pa.md，**无 cut-note.md**。large cut closeout 需 plan/pa/cr/cut-note 齐（`verify-cut-artifacts.mjs ... large`，I18 同款 MF）。代码本身可合，但 large cut 闭环前须补。**注**：此为 RM/closeout 物，非代码缺陷——若 RM 流程在 merge 后补 cut-note，可降级为 closeout TODO。

## Should Watch（非 block）

### SW-CR-1 — `normalizeForSubstring` 弯引号正则被无意改坏（潜在回归 + 越界编辑）
service diff（:40-41）把字符类 `/[‘’ʼ]/`（U+2018/U+2019 弯单引号）改成 `/['']/`（两个相同 ASCII 撇号 + ʼ），`/[“”]/`（U+201C/U+201D 弯双引号）改成 `/[""]/`（两个相同 ASCII 双引号）。**实测非 ASCII 码点**：单引号行仅剩 `ʼ`(0x2bc) + `→`，双引号行仅剩 `→`——弯引号码点已消失。后果：modelAnswer/highlight 含弯引号时归一化失效，子串硬 gate 可能误杀真亮点（或存未归一化文本）。**当前 7 套 pilot 无弯引号（实测全部 substring 命中），故不破已就绪数据**；但 (a) 这是 plan「normalize 复用」承诺的继承 helper 的潜在回归，(b) 违"别动没让碰的代码"——疑似编辑器/编码转换误伤。**建议把这两个字符类的弯引号码点改回**（I18 原版 `/[‘’ʼ]/`、`/[“”]/`）。生成 ii-卷若出弯引号会触发。非 block：当前数据不受影响、且词汇 gate 与 AJV 双兜底。

## Verify（实跑证据汇总）

| 检查 | 命令/方式 | 结果 |
| --- | --- | --- |
| typecheck | `cd app && npx tsc --noEmit` | **EXIT 0 绿** |
| AJV schema 编译 + 向后兼容 + malformed reject | Ajv2020 against schema，5 用例 | **5/5 PASS**（旧 application valid、2020-i valid、缺 design/paragraphs≠2/0 highlights 全 reject） |
| validateWritingAnalysisCandidate | 7 pilot + 5 malformed | **全 PASS**（7 accept、5 正确 reject） |
| 词汇 gate CLEAN | `runVocabGate` on 2020-i，allowlist 源 tracked paper-asset | **CLEAN，GENUINE_OOV=[]** |
| 词汇 gate 口径忠实 | vs canonical `gate_check.py` 逻辑，同 allowlist | **GENUINE_OOV 两者均 []，一致** |
| 词汇 gate 真能拦 | 注入 `xylophonically obfuscate` | **clean=false，genuine=[obfuscate,xylophonically]** |
| 词汇 gate FAIL-HARD | HOME 指无 skill 目录 | **THREW FAIL-HARD（无 silent-pass）** |
| persist envelope merge | 沙盒 persist 到含 application 组的 envelope | **两组共存、application 保值、design 存、paragraphs=2、audit 不泄漏** |
| print-ready 门 | `node scripts/verify-c8-print-ready-gate.mjs` | **32 passed, 0 failed** |
| 范围 | `git show --name-only 03a4c4f` | **恰 6 allowed、0 数据、0 forbidden** |
| driver list | repo root，list / list continuation / list application | **12 / 12 / 0（skip-when-done 生效）** |

## PA Loop 闭环判定

**闭环 ✅。** PA 三个 Must Fix → plan disposition → code 实现，逐条核实落地：
- **MF-1**（persist 丢 continuationDesign）→ plan Step 3 ⚠️ → `persistWritingAnalysisGroup` 投影按 taskType 分支存 design + `validateWritingAnalysisCandidate` 放宽 taskType + 增 design 校验。**code 已落、实测正确**。
- **MF-2**（词汇 gate 输入不可复现）→ plan Step 3 词汇 gate 段 → allowlist 取自 tracked paper-asset、skill 缺失 FAIL-HARD、口径锚定 gate_check.py。**code 已落、实测忠实 + 可复跑**。
- **MF-3**（schema 改 const 非纯加法）→ plan Step 1 schema 段 → taskType enum + if/then + 公共 required 不含 design + schemaVersion 不变。**code 已落、AJV 实测向后兼容 + malformed reject**。

PA 吸收的 SW（SW-1 ii-卷 owner QA 前不 persist、SW-2 续写软警告下界 120、SW-5 源用 tracked pilots）：SW-2 已落代码（service:330-343 continuation [120,200]）；SW-1/SW-5 属 Step 5 backfill 数据阶段约束，本 code-only diff 无对应代码、待数据阶段守。

## Self-Review Blind Spots（喂给 Big CR）

- **gate 跨仓库依赖**：词汇 gate 依赖 `~/.claude/skills/guokao-vocab-checker/scripts/check.py` 及其 `data/` 词表基线（STATUS 记 expand_library.py 补 72 派生那版）。本机实测在场且 CLEAN；换机/换词表基线会改 OOV 判定。Big CR 若跨环境复核需确认 skill 基线版本。FAIL-HARD 保证缺失不 silent-pass，但词表"漂移"（同名不同版）不会被检测——这是设计内的隐式信任。
- **数据阶段未覆盖**：本 CR 只证代码正确，未证 12 套生成数据（尤其缺的 5 套 ii-卷）质量；SW-1（owner 逐篇 QA + 双兜底 + 单卷失败记 follow-up 不阻塞 7 套）是数据阶段的命门，留给 post-CR backfill + owner QA。
- **normalize 回归窗口**：SW-CR-1 的弯引号失效只在「生成文本含弯引号」时显形，当前 pilot 无弯引号故隐形；若 ii-卷生成出弯引号，子串 gate 行为会变（误杀/存未归一）。Big CR 在数据落地后应抽查含引号的 highlight 是否仍 substring-命中。
