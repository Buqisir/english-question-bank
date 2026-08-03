# CR — import-zj-2020-2022 (lib.mjs 题号动态接力)

Reviewer: 小川 (CR-lite, cold read, did not write the diff)
Date: 2026-06-18
Verdict: **APPROVE**

## Changed Scope

- Only one tracked file changed: `scripts/import-pipeline/lib.mjs` (38 ins / 32 del).
- `buildSevenGroup({...,stdStart=36})`: blank offset `+35` → `+(stdStart-1)`; question
  numbers `[36..40]` → `stdStart+i` (i=0..4).
- `buildCloze({...,stdStart=41})`: `offset=stdStart-1`; question parse moved BEFORE
  blank replacement so `blankCount` is learned from the parsed questions; blank-range
  cap `≤15` → `≤blankCount`; `no = local + offset`.
- `buildGroups`: seven receives `stdStart: readingStdNo` (both FmtA in-loop and FmtB
  out-of-loop branches); cloze receives `stdStart: readingStdNo + 5`.
- Forbidden scope untouched (confirmed from `git diff`, not from report): no
  `server/**`, no `02-publish.mjs`, no `validate-one.mjs`; grammar builder unchanged.

## Findings

### Must Fix
None.

### Should Watch
- **Cloze blank cap is now data-driven (`blankCount`), not bounded.** If a future
  source has a stray wide-spaced number ≤ the real blank count appearing in the
  passage prose, it would be converted to a false blank. On the actual 6-paper corpus
  this did NOT happen (exact 20/20 1:1 mapping, zero extra/missing/dup). Non-blocking:
  the SPLIT REPORT per-question answer check is the live guard, and owner reviews
  2020-jan before publish. Worth a glance if a 7th old-format paper is added.
- DEV verification is split-time only; AI analysis + publish are downstream steps
  gated separately by owner per plan. Correct per cut flow — not this CR's gate.

## Self-Review Blind Spots
- I verified split-level group construction (numbers, blank/question alignment,
  byte-identical regression) but did NOT run AI analysis or `02-publish` / the sqlite
  import. The number contract feeding `buildClozeAnalysisMessages` shape-gate passes
  (01-split shape-gate is green for all papers), but I did not exercise publish.
- I trust `full.txt` as a faithful textutil snapshot; I did not re-convert from the
  source.docx. If the cached full.txt differs from a fresh textutil run, my old/new
  diff is still valid (same input both runs) but absolute correctness vs docx is
  inherited from prior cut evidence.

## Verification Evidence (re-run independently, not copied from report)
1. **Regression byte-identical (proven by design, not coincidence):** Built groups
   with NEW lib.mjs vs OLD (via `git stash`) on `paper-2024-i` (FmtA), `paper-2025-ii`
   (FmtB new-standard), `paper-zj-2026-jan` (ZJ FmtB), comparing
   readingGroups+seven+cloze+grammar JSON. Result: **IDENTICAL** (`diff` empty).
   Root cause confirmed: new-format reading sums to exactly 15 questions →
   `readingStdNo`=36 → seven `stdStart`=36 → cloze `stdStart`=41, reproducing the old
   hardcoded constants. Defaults (`36`/`41`) also match old `+35`/`+40`.
2. **New-format ranges:** all three → reading 15Q, seven 36-40, cloze 41-55 (15),
   grammar 56-65. Unchanged.
3. **Old ZJ ranges (all 6 papers):** reading 21-30 (10Q), seven 31-35, cloze 36-55
   (20Q), grammar 56-65 (10Q). Exactly the plan contract.
4. **Cloze blank/question alignment (all 6 old papers):** 20 blanks, 20 questions,
   missingBlank=[], extraBlank=[], dupBlank=[] for every paper. The relaxed
   `≤blankCount` introduced no false positives and dropped no real blank.
5. **Caller coverage:** grep confirms the local `buildSevenGroup`/`buildCloze` have
   exactly 3+1 callers, all updated; other grep hits are the unrelated server
   `buildClozeAnalysisMessages`.
6. **Slice-timing side effect (risk #3):** `passage`/`optBlock` are sliced from `body`
   at the identical point as before; only the question-parse loop moved ahead of blank
   replacement. `optBlock` is independent of `passage` mutation; the `m` param shadow
   in the replace callback is block-scoped and harmless. No side effect.
7. Forbidden scope: `git diff --stat` = lib.mjs only; staged empty.

## Failure / Attack Angle
- The most plausible failure was risk #4: with the cap raised to 20, a real number in
  cloze prose (year/quantity) flanked by double-width spaces could be misread as a
  blank. I attacked this directly by diffing parsed blanks against parsed question
  numbers on all 6 real papers — zero divergence. The change cannot silently corrupt
  the 6 in-scope papers; a future paper is the only residual surface (Should Watch).
- A fake-green angle would be "regression passes because groups.json is cached." I
  defeated this by regenerating from full.txt under both old and new code, so the diff
  exercises the actual changed code path, not a stale artifact.

## Residual Risk
Low. The change is a pure number-derivation refactor with the old constants preserved
as the new-format special case and as function defaults. Proven byte-identical on
new-format and correct on all 6 target papers at split time. Downstream publish is a
separately-gated owner step, out of this CR's tier.

## Recommendation
**APPROVE.** Mergeable as-is. No Must Fix.

---

# CR-2: packageBuilder server 适配 (浙江老卷 heading/分值)

Reviewer: CR (cold read, fresh session, did not write this diff)
Date: 2026-06-18
Verdict: **APPROVE**

Scope: server publish-link 适配 — `server/paper-import-ai/packageBuilder.mjs`
(FORMAT_PROFILES + resolveFormatProfile) + `server/paper-import-ai/analyzeCloze.mjs`
(L54 cloze 15||20 gate). lib.mjs split 改动属上一阶段 (CR-1 above)，不在本节 scope，
diff 已核为纯 stdStart 接力 (无 score/heading/region 污染)。

## Changed Scope
- packageBuilder.mjs: 加 FORMAT_PROFILES{newStandard,zjLegacy} + resolveFormatProfile(clozeGroup)；
  把 4 个 section 的 reading part/section1、seven、langPart、cloze heading + seven/cloze 每题分
  + reading-label 门 改为读 profile。reading(DEFAULT_SCORE=2.5)/grammar(1.5) heading+分 未动。
- analyzeCloze.mjs: 输入门 `===15` → `15||20`（PA SW-1 确认正确，保留）。
- 本阶段 allowed files = 这 2 个；无 forbidden 触碰（02-publish/lib.mjs 契约/App.tsx 未动）。

## Findings

### Must Fix
无。

### Should Watch
- **SW-A（已自查为非缺陷，不阻断）**: zjLegacy 下 `layoutTree.parts[].title` /
  `sections[].title` 仍是新课标短描述 (`第二部分 阅读` / `第一节 阅读理解` / `第三部分 语言运用`)，
  而可见 A4 heading (`content.blocks[].text`) 已正确为浙江文本。我追到 publisher.mjs:42
  `findSectionTitleForGroup` 把 `${part.title} / ${section.title}` 写入 DB
  `sources.section`(L195) 与 `question_groups.instruction`(L249)。**但**：这套
  layoutTree-title 与 block-heading 的分层在 main 上对新课标就已存在（block 带分值文本，
  layoutTree title 是短类型标签），DB 字段历来存的就是短标签。浙江将得到
  `第二部分 阅读 / 第一节 阅读理解`，与既有 16 套同一约定，**非本 cut 引入的回归**。
  若 owner 希望 DB section 字段带浙江满分文本，是独立产品决策（新工作），不在本 cut。
- **SW-B**: `issue()` 抛出对象的属性是 `.status` 非 `.code`（probe 里读 `.code` 取不到，
  但 throw + message 正确）。与既有 issue() 用法一致，不阻断。
- **SW-C（继承 PA SW-2）**: 2020-jan 源 grammar 文本有 "每题5分满分15" 笔误；profile
  统一用 1.5（与生成输出和满分15一致），DEV 没去"修"成笔误值。已对。

## Self-Review Blind Spots
- 我没在真实浏览器里渲染一套已发布的浙江包，确认 A4 打印上 reading 第一节 heading 携带
  满分文本（SW-3 of PA）视觉无破版。本 cut 无 UI diff，且发布是 owner-gated 后置步骤，
  其 QA 由 owner/QA 负责；CR-lite 在静态层证毕。
- publisher.mjs 的 SQLite 导入我只读未跑（不在 allowed files，且 PA 已确认 region 不进
  builder）；real publish 是停 API→发布 的 owner step，本 CR 不覆盖该 runtime。

## Verification Evidence (我自跑，非抄报告)
1. **MF-2 byte-compat（决定性）**: stash server 改动→以 main 版 packageBuilder build
   `paper-zj-2026-jan`(newStandard,工作区有 analysis) vs 改后 build，`diff` 全文件
   **BYTE-IDENTICAL**（importedAt 经 verify 脚本 normalize）。新课标零回归。
2. **MF-1 ZJ 正确性**: build `paper-zj-2020-jan` →
   - block headings 9 条全为浙江文本（reading 满分35/第一节满分25、seven 每题2分满分10、
     语运满分45、cloze 共20每题1.5满分30）✓
   - answer-key score 直方图 `{2.5:10(reading), 2:5(seven), 1.5:30(cloze20+grammar10)}`，
     客观分合计 **80**（= PA 口径）✓
3. **MF-3 unknown-format throw**: 构造 cloze=18 → 直接 throw
   `完形题数 18 无法识别试卷格式…不能发布`（在 reading 门之前）✓；
   missing-cloze（clozeGroup=null）→ 走 newStandard，后续按既有 reading 门报错，
   **不** 误抛 unknown-format ✓。
4. **OPD-1 阅读门**: zjLegacy readingLabels=`[A,B,C]`，newStandard=`[A,B,C,D]`；
   2026-jan(newStandard) byte-identical 证明新课标仍严格出 A–D，门未削弱。
5. **scope**: `git diff main --name-only` = lib.mjs(上阶段) + 2 个 server 文件；
   本阶段 allowed files 之外零触碰。
6. **hoisting**: `issue` 是 function 声明(L102)，`resolveFormatProfile`(L38) 调用合法；
   `clozeGroup` 是 build 函数解构参数(L223)，L227 调用点在作用域内。

## Failure / Attack Angle
- 最可能的假绿: "byte-diff 绿是因为 analysis 缺失走了短路径"。我用工作区真实 2026-jan
  analysis 跑满全管线（reading a-d + seven + cloze + grammar + 写作块都生成），不是空壳。
- 最可能的隐性破坏: zjLegacy 误改到新课标共享字面量。已用 stash 对照证明新课标产物逐字不变，
  改动仅在 profile 选择处分叉。
- 未来脆弱面: 真实出现 cloze≠{15,20} 的新格式（如全国卷 15 完形但 reading 篇数不同）会在
  这里 throw 而非静默——这是 PA MF-3 期望的 fail-hard 姿态，正确。但 analyzeCloze 门也只认
  15||20，新格式会在更早的 analyze 阶段被挡（PA SW-1 已记，可接受）。

## Residual Risk
低。改动是 profile 选择 + 数据驱动 heading/score，新课标证毕零回归，浙江证毕正确，
unknown 证毕 fail-hard。唯一未在 CR 层证的是发布后 A4 视觉（owner-gated QA 后置）。

## Recommendation
**APPROVE.** 本阶段（server publish-link）无 Must Fix，可并入。
发布 6 套仍须按 plan 等 owner 看过 2020-jan + byte-diff 绿（MF-2 已绿）后执行。

---

## CR-3: 续写门 profile 化 (cold read, 2026-06-18)

**Scope**: 仅审 `packageBuilder.mjs` 续写门增量 —— `FORMAT_PROFILES.*.requireContinuationStarters`
(newStandard=true / zjLegacy=false) + 续写门 `if (profile.requireContinuationStarters && ...)`。
其余 heading/score/阅读门 profile 改动已在 CR-2 PASS，不重审。

### Verdict: PASS（无 Blocker）

### 验证(自跑，非接受声明)
1. **newStandard 等价性 ✓**: 老条件 `continuationGroup && (!starters || starters.length<2)` 与新条件
   `profile.requireContinuationStarters && (!starters || starters.length<2)`。L254-256 的
   `if(!continuationGroup) throw` 保证到 L258 时 `continuationGroup` 必为真，故老式左操作数 `continuationGroup &&`
   恒真——丢弃它无行为差。require=true 时两者逐字等价。**独立 byte-diff**: stash 还原 HEAD packageBuilder
   vs 改后，对 paper-zj-2026-jan(newStandard) 跑 verify-zj-package，package 产物 **byte-identical** ✓
   (实跑全管线 reading a-d+seven+cloze+grammar+写作，非空壳短路)。
2. **zjLegacy 放宽风险 ✓ 可接受**: require=false 完全跳过 starter 校验，starter=1(半截解析)也会放过。
   实测 6 套 zjLegacy: 2020-jan/2021-jan/2021-jun/2022-jan=2，2022-jun=3，2020-jul=0 —— **无 1 的情况**，
   当前数据无半截风险。理论缺口(=1 静默放过)存在但本批不触发；记为 Should Watch。
3. **`continuation_writing_missing` 仍生效 ✓**: L254-256「无续写题组」门未被 profile 化，两格式都硬 throw。
   只放宽 starter 数量，未放宽"无续写题"。实测 2020-jul/2020-jan build 产物含续写组引用。
4. **scope ✓**: 续写门改动只在 packageBuilder(profile 字段 + L258 判断)。git status 另有 lib.mjs/
   analyzeCloze.mjs 改动，但属本 cut 早前阶段(split 接力 / 15||20)，**不在 CR-3 审查范围**且 plan 已覆盖。

### 载重性(改动确实必要)
2020-jul(0 starters)在 OLD packageBuilder 下会 fail。注: OLD 代码先在 reading-D 门 throw
(reading_group_missing，因 zjLegacy 仅 3 篇)，starter 门是下游；CR-2 的阅读门 profile 化先放行，
再由本 CR-3 的 starter 放宽放行。两改动叠加才使 2020-jul 可发布——逻辑链完整，非冗余。

### Should Watch (非阻塞)
- **SW-CR3-1**: zjLegacy `requireContinuationStarters=false` 会放过 starter=1(半截解析)。当前 6 套无此情况。
  若未来浙江老卷出现"只解析出 1 段开头语"，会静默发布缺一段开头语的续写。可接受(本批不触发)，
  但若后续扩量，宜考虑 zjLegacy 改"0 或 ≥2"而非"任意数"。

### Self-Review Blind Spots (喂 Big CR)
- 我未审 starter 内容在下游(02-publish/渲染)如何被消费——若续写组 starters=[] 在前端有"必渲染 2 段"
  的假设，放行后可能渲染异常。CR 层只证 build 不 throw + 产物含续写组；A4 视觉/前端续写渲染属 owner-gated QA，
  本 CR 未覆盖(与 CR-2 残留风险同源)。

**结论**: APPROVE，无 Must Fix。续写门 profile 化对新课标零回归(byte-identical 证毕)、对浙江老卷正确放行
(2020-jul build 通过)、未削弱"无续写题"硬门。发布 6 套仍按 plan 等 owner 看过 2020-jan。

---

## CR-4: validator 第三阅读门 + 端到端验证脚本 (cold read, 2026-06-18)

Reviewer: CR-lite (fresh session, did not write this diff)
Verdict: **PASS — APPROVE, 无 Must Fix**

**Scope**: 审两件:
1. `server/paper-import/validator.mjs` L311-317 —— publish 期一致性闸 `validateReadingAnalysisBundle`
   的 `expectedLetters` 从写死 `[A,B,C,D]` 改为按完形题数派生(cloze===20→`[A,B,C]` / 否则 `[A,B,C,D]`)。
2. 新脚本 `scripts/import-pipeline/verify-publish-gate.mjs` 的可信度(能否作发布依据)。
CR-1/2/3 已审的 lib.mjs / packageBuilder / analyzeCloze 不重审。

### 1. validator 阅读门正确性 ✓
- **载重性(改动确实必要,绿是真绿)**: stash 还原 HEAD validator,对 `paper-zj-2020-jan` 跑
  verify-publish-gate → **ok=false, blocking=`paperAsset.readingGroupMissing: 缺少 Reading D 题组`**。
  改后 ok=true。证明老门确实拦浙江 3 篇,这道门是 publish 期独立第三门(packageBuilder 两门之外),
  初版漏补属实;现补正确。
- **分支表(直接 exercise)**: cloze=15→`[A,B,C,D]` / cloze=20→`[A,B,C]` / cloze=0(缺失)→`[A,B,C,D]` /
  cloze=18(未知)→`[A,B,C,D]`。**只有恰好 20 放宽到 3 篇,其余一律严格 4 篇**——新课标(15)、
  缺失、未知格式都不削弱,漏 D 照报 blocking。
- **同信号一致性**: validator 读 built `paper-asset.json` 的 cloze group `questionIds.length`
  (zj-2020 实测 20→A-C 配 3 篇 reading;2026-jan 15→A-D 配 4 篇),与 packageBuilder
  `resolveFormatProfile(clozeGroup)` 同一信号(完形题数),口径统一(符合 PA MF-3)。
- **scope 干净**: diff 只动 L312-317 `expectedLetters` 派生;其下 `analysis.groupMissing`(每个实存
  reading 组仍须有解析)、answer-key 一致性(L342-353)、optionLabel 集合(L361-367)、correct-answer
  匹配(L368+)全未动。放宽只改"要求哪些字母存在",不削弱对已存在题组的任何题级校验。

### 2. verify-publish-gate.mjs 可信度 ✓ —— 可作发布依据(有 1 处注释失真,非 fidelity 缺陷)
- **(a) 调真函数**: import 真 `validatePaperImportPackage`(validator.mjs)+ 真
  `buildPaperImportAiPackageFiles`(packageBuilder.mjs),无重写/绕过。
- **(b) files 组装与 02-publish 一致**: sourceHash 用 docx sha256 填(复现 02-publish L52-55)✓;
  sourceDocx 真实读 config.docxPath buffer 传入(6 套 + 2026-jan 的 docxPath 实测均 exists)✓;
  analyses 按 groupId 挂载、seven/cloze/grammar/application/continuation 与 02-publish payload 同形 ✓。
- **(c) `files.filter(Boolean)` 与真发布 publisher.mjs:461 `validatePaperImportPackage(files)` 等价 ✓**:
  `buildPaperImportAiPackageFiles` 返回的 `outputFiles[0]` **就是 sourceDocx**(packageBuilder L866)。
  因 docxPath 均 exists、sourceDocx 非 null,`filter(Boolean)` **不删任何元素**,docx 仍是 files[0]。
  validator L645-655 据此 **实跑** docx sha 校验(== paper.sourceHash,合法通过,非跳过)。
  → 脚本的内联注释「不传 sourceDocx(跳过 sha 校验)」**与实际行为不符**:docx 经 files[0] 传入、
  sha 门实跑。注释失真会误导后人,但实际行为比注释更忠实(更接近真发布)——记为 Should Watch,不阻断。
- **唯一真实偏差(已证无害)**: 脚本未做 02-publish L201-228 的 provenance override(改
  region/year/paperName/sourceType/defaultTags)。但 import-meta schema 对这些字段仅要求非空串/
  整数/枚举,builder 已从标题派生合法值(6 套 ok=true 即证),provenance 只会把合法值换成另一组
  owner 控制的合法值——**不可能把过门变成不过门**。故该偏差不产生假绿。

### 验证证据(自跑,非抄)
1. 6 套浙江 + 2026-jan 全 **ok=true, blocking=0**(改后)。
2. OLD validator 对 zj-2020-jan → ok=false(缺 Reading D)——证明绿是真修不是巧合。
3. 端到端构建 paper-asset.json,确认 cloze questionIds.length = zj 20 / 2026 15,reading 篇数 3/4 匹配。
4. 分支表 4 例直接 exercise:只 cloze===20 放宽。
5. scope: validator diff 仅 L312-317;verify-publish-gate.mjs 为新增脚本,**未注册进 verify-ci/CI**
   (手动发布闸,非 CI 强制——符合管线 02-publish 性质)。

### Should Watch (非阻塞)
- **SW-CR4-1**: verify-publish-gate.mjs L52 内联注释「不传 sourceDocx;跳过 sha 校验」失真。实际
  docx 经 buildPaper...Files 的 outputFiles[0] 传入、sha 门实跑。建议下次顺手改注释,免后人误读为"sha 未验"。
- **SW-CR4-2**: 该脚本未跑 provenance override,与真 02-publish 有此一处差异。已证对 validation 结果
  无影响(schema 仅约束类型/枚举),但脚本不是 02-publish 的逐字镜像;真发布仍应以 `02-publish.mjs --publish`
  为准,本脚本是"发布前能否过门"的可信预检,不替代真发布。
- **SW-CR4-3**: validator 第三门与 packageBuilder profile 各自独立读完形题数(两处实现同信号)。
  若将来改格式键(MF-3 锁的 15/20)须两处同步,否则会出现 build 过门、validate 拦下(或反之)的撕裂。

### Failure / Attack Angle
- 假绿角度①「脚本绕过 sha 门所以全绿」:已证伪——docx 经 files[0] 入参,sha 门实跑且通过。
- 假绿角度②「放宽门把坏新课标卷也放行」:已证伪——只 cloze===20 放宽,15/缺失/未知一律严格 A-D。
- 隐性削弱角度「放宽顺带松了题级校验」:已证伪——diff 仅动 expectedLetters,题级答案/label/correct 校验全保留。
- 残留面:脚本非 02-publish 镜像(无 provenance、未进 CI),作"预检"可信,但发布真相仍以
  `02-publish --publish` 走真 publisher 为准。

### 结论
**PASS / APPROVE,无 Blocker。** validator 第三阅读门补正确(载重、口径与 packageBuilder 一致、新课标不削弱、
scope 干净);verify-publish-gate.mjs **可作"6 套能否过 publish 门"的发布依据**——它调真校验函数、files 组装
忠实(docx+sha 实跑)、与真发布唯一偏差(provenance)已证对结果无影响。三处 Should Watch 均非阻塞(注释失真 /
非镜像 / 双实现同步)。发布 6 套仍按 plan 走 `02-publish --publish` 真路径 + owner 看过 2020-jan。
