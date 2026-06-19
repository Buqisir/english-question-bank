# Cut: import-national-2020-2024 — 全国甲/乙/丙卷真题导入（只导阅读+语言运用 4 题型）

cut size: **medium**（偏大）; touches schema/data contract: **yes**(发布门 FORMAT_PROFILE + 六题型门松绑 + lib.mjs 解析契约); product runtime: no; teaching interpretation: no.

PO 决策(2026-06-19): 全导入全国甲乙丙，**只导 reading A-D / 七选五 / 完形 / 语法填空**；写作部分(短文改错 + 普通书面表达)**不导**——短文改错是新高考已删的将死题型、无产品支持，普通作文无范文基建。paperId 用 `paper-<year>-{jia,yi,bing}`。

## 背景：10 套答案版 docx（缺的全国卷）

源目录: `~/Desktop/教学资料库/05_真题模拟与试卷库/高考真题/阅读解析与答案版/真题答案版/`

| paperId | 文件 |
|---|---|
| paper-2020-jia | 2020年全国甲卷-答案版.docx |
| paper-2020-yi | 2020年全国乙卷-答案版.docx |
| paper-2020-bing | 2020年全国丙卷-答案版.docx |
| paper-2021-jia | 2021年全国甲卷-答案版.docx |
| paper-2021-yi | 2021年全国乙卷-答案版.docx |
| paper-2022-jia | 2022年全国甲卷-答案版.docx |
| paper-2022-yi | 2022年全国乙卷-答案版.docx |
| paper-2023-jia | 2023年全国甲卷-答案版.docx |
| paper-2023-yi | 2023年全国乙卷-答案版.docx |
| paper-2024-jia | 2024年全国甲卷-答案版.docx |

10 套已抽样核实 100% 同构（答案版自带 `【答案】X`）。

## 题型（全国老卷，Format B「第X部分/第X节」，10 套统一）

听力1-20(**不导**) / 阅读 A-D **15题**(21-35) / 七选五5(36-40) / 完形**20**(41-60) / 语法10(**61-70**) / 短文改错(**不导**) / 普通书面表达(**不导**)。

对比已支持的两格式：

| 格式 | 阅读 | 七选五 | 完形 | 语法 | 写作 |
|---|---|---|---|---|---|
| 新课标(cloze 15) | A-D 15题 21-35 | 36-40 | 15题 41-55 | 56-65 | 应用文+续写 |
| 浙江老卷(cloze 20) | A-C 10题 21-30 | 31-35 | 20题 36-55 | **56-65** | 应用文+续写 |
| **全国老卷(cloze 20)** | **A-D 15题 21-35** | 36-40 | 20题 41-60 | **61-70** | 短文改错+普通作文 |

全国老卷的两处"第一次出现"：① cloze 20 但阅读 4 篇（浙江老卷 cloze 20 是 3 篇）→ 撞格式键；② 完形结束在 60 → 语法 61-70（新课标/浙江老卷完形都结束于 55，语法都 56-65，所以语法题号当年写死没出事）。

## 根因 & 改动（4 文件）

### 1. `scripts/import-pipeline/lib.mjs`（切卷器；Format B）

- **语法题号动态接力**（当前 `buildGrammar` 写死 `[56..65]` / blank 偏移 `+55`）：
  - `buildGrammar({ sectionText, tail, stdStart })`：题号 `Array.from({length:10},(_,i)=>stdStart+i)`，blank 偏移用 `stdStart-1`。
  - 调用点 `lib.mjs:840`：`stdStart: readingStdNo + 5 + cloze.questions.length`。
  - 验算：全国 `36+5+20=61` / 浙江老卷 `31+5+20=56` / 新课标 `36+5+15=56`。**新课标/浙江老卷数值不变（向后兼容）**。
- **写作部分跳过（全国老卷）**：Format B 段落识别器当前在写作部分找不到 第一节/第二节 就 throw（`lib.mjs:252-253`）。改为：写作部分 第一节 命中"短文改错" → 判为全国老卷 → `appStart=contStart=-1`；`buildGroups` 在 `appStart===-1` 时令 `application=null, continuation=null`（不调 buildApplication/buildContinuation、不 throw）。
- 听力已天然跳过（Format B 阅读部分关键词 `阅读` 非 `听力`，`lib.mjs:216`）；DEV 用便宜 `01-split` 预检确认。

### 2. `server/paper-import-ai/packageBuilder.mjs`（发布门 / 契约）

- 加 `FORMAT_PROFILES.nationalLegacy`：`readingLabels: A-D`、`sevenScore: 2`、`clozeScore: 1.5`、`requireContinuationStarters: false`、新增 `requireWritingFamilies: false`，headings 用全国老卷字面量。
- 给 `newStandard` / `zjLegacy` 加 `requireWritingFamilies: true`。
- `resolveFormatProfile` 增信号区分 cloze20 的两格式：cloze 20 + 阅读 **4 篇(A-D)** → nationalLegacy；cloze 20 + 阅读 **3 篇(A-C)** → zjLegacy。改签名收 readingGroups（结构信号，非 region/paperId 元数据，守原注释纪律）。
- 六题型门（`packageBuilder.mjs:250-256`）包进 `if (profile.requireWritingFamilies) { … }`。其余四题型门（reading/七选五/完形/语法）不动，仍硬拦。

### 3. `server/paper-import/validator.mjs`（发布期阅读门 / 契约）

- `validator.mjs:317` 阅读门当前 `cloze20 → 期望 A-C`。镜像 packageBuilder：cloze20 且实际阅读 4 篇 → 期望 **A-D**（别削弱 guard，全国卷漏 D 要照报）。

### 4. `scripts/import-pipeline/gen-configs.mjs` + `02-publish.mjs`（管线胶水）

- `gen-configs.mjs`：文件名匹配 `20XX年全国{甲|乙|丙}卷-答案版.docx` → paperId `paper-<year>-{jia,yi,bing}`。
- `02-publish.mjs`：全国卷 `applicationGroup/continuationGroup` 传 null（groups.json 里本就是 null）；出处注入 region=全国甲/乙/丙、paperName、year、tags。

## Forbidden

- **不导写作**：不碰 schema、不加"短文改错"题型、不动前端展示。短文改错/普通作文一律丢弃。
- 不改新课标/浙江老卷已有行为：byte-diff 回归必须全绿。
- 不动其它契约文件（domain/schema/Adapter/PaperSurface/print）。
- DEV 阶段不发布入库（发布是独立 step，需 owner QA 过 2022 甲卷后才做）。

## 验证

1. **回归(byte-diff)**：改 lib.mjs 前后对 `paper-2024-i`(FmtA)、`paper-2025-ii`(FmtB)、`paper-zj-2026-jan`(浙江B 新)、`paper-zj-2020-jan`(浙江老卷 cloze20) 四套重跑 `01-split`，`groups.json` 必须 byte-identical。
2. **2022 全国甲卷**：`01-split` 的 SPLIT REPORT 逐题核对答案 vs 答案版原文；题号必须 阅读21-35 / 七选36-40 / 完形41-60 / 语法61-70；application/continuation paras=0。
3. **发布门**：`verify-publish-gate.mjs paper-2022-jia` → `ok:true`、blocking 空（解析齐后跑）。
4. **新课标/浙江回归**：`verify-publish-gate.mjs` 对 1 套新课标 + 1 套浙江老卷仍 `ok:true`（确认六题型门松绑没误放其它格式）。

## 流程（slice 1 先打通 1 套 → slice 2 批量）

**Slice 1（本 cut 主体）**
1. DEV：改 4 文件 + byte-diff 回归绿 ← Sonnet dev（lib.mjs 改动 gnarly，可 dev-hard）
2. PA：全新会话审 packageBuilder 格式解析改动（cloze20 双格式区分）+ 六题型门松绑是否契约安全 ← 已派
3. 打通 2022 甲卷：`01-split` 核对 → 7 个 Opus 解析 agent（reading a-d/七选/完形/语法）→ `verify-publish-gate` 绿
4. CR：全新会话冷读 4 文件 diff
5. 发布 2022 甲卷（停API→`02-publish --publish`→重启）← **owner QA 过目后**
6. owner QA：库里看 2022 甲卷

**Slice 2（下一 cut）**：剩 9 套走已验证管线，~63 个 Opus 解析 agent，分批发布。

## PA Follow-Up Decisions（PA 已审 2026-06-19 → APPROVE WITH MUST FIX，pa.md）

- **MF-1（全真值表 + throw 不静默回退）**：`resolveFormatProfile(clozeGroup, readingGroups)` 完整真值表已实现且锁定——cloze=15/缺→newStandard（**永不查阅读篇数**，cloze 主键优先）；cloze=20∧4篇→nationalLegacy；cloze=20∧3篇→zjLegacy；cloze=20∧其它篇数→**throw `unknown_paper_format`**；cloze∉{15,20}→throw。另加**反向断言**：落到 `requireWritingFamilies:false` 的格式却带着写作组→throw `unexpected_writing_groups`（兜住"完形被误判成20的半解析新课标"）。verify 覆盖：`verify-national-format.mjs` §1/§2。
- **MF-2（禁用 continuation 作格式键）**：cloze20 双格式分流键 = **阅读篇数 only**；continuation/application 是否存在**严禁作格式键**（对全国=合法 null、对续写解析失败的新课标=故障 null，分不开）。已写进 `packageBuilder.mjs` resolveFormatProfile 注释 + 下方 Forbidden。
- **MF-3（两门同口径 + 对称 verify）**：validator 阅读门改为按 **distinct A-D 字母数**判期望（cloze20∧含D→A-D 报缺D / cloze20∧无D→A-C），与 packageBuilder `countReadingLetters` 同口径。对称 verify：`verify-publish-gate.mjs paper-2022-jia` 同时跑两门→`ok:true` 即两侧一致；`verify-national-format.mjs` §3 另断言期望篇数一致。
- **SW-1（buildGrammar 两处偏移都要动）**：题号数组 `lib.mjs:573` + blank 偏移 `:561` 均已改为 `stdStart`。byte-diff 回归（新课标/浙江 stdStart 仍=56）已全绿守住。
- **SW-3（ADR-0007 决策2 的 scoped supersession）**：六题型门松绑仅对 nationalLegacy，是 ADR-0007 决策2"永远导完整卷"的**范围化让位**（四题型硬门不变 + MF-1 反断言兜底）。已在 `packageBuilder.mjs` 写作门处注释记录；本 cut 不导写作=该格式本就无写作可导，非削弱 parse-correctness。
- **SW-4（全国分值需从源设，非抄浙江）**：全国甲卷实测 阅读2/七选五2/完形1.5/语法1.5。nationalLegacy 已设 `readingScore:2, sevenScore:2, clozeScore:1.5`（浙江老卷 readingScore 2.5，故 reading 分值从 `DEFAULT_SCORE` 提为 `profile.readingScore`，新课标/浙江=2.5 byte 兼容）。语法 heading/分值硬编码 1.5×10=15 全国正好同。**owner QA 须核 2022 甲卷 A4 总分 vs 官方**。

## 已验证（DEV + 静态门，2026-06-19）

- byte-diff 回归：22 套已有卷 `groups.json` 全 byte-identical（含浙江老卷 cloze20 语法仍 56-65）。
- 2022 甲卷 split：阅读 21-35(4篇) / 七选 36-40 / 完形 41-60(20) / 语法 61-70 / 写作 null。
- `verify-national-format.mjs`：真值表 + throw 守卫 + MF-3 对称，13 项全过。
- `verify-publish-gate.mjs paper-zj-2020-jan`（浙江老卷回归）→ `ok:true`，六题型门松绑未误放。

## PA 待审点（原始，写给 PA）

- `resolveFormatProfile` 用"阅读篇数"区分 cloze20 双格式：结构信号是否够稳？是否该改用"无 continuation group"作信号、或两者结合？边界：新课标若误把 cloze 解析成 20 题会被误判 nationalLegacy 吗（现状已信任 cloze 计数）？
- `requireWritingFamilies: false` 是否削弱了"永远导完整卷"(ADR-0007 决策2)的 parse-correctness 保证？对全国老卷，四题型完整 + 写作明确不导，是否等价的完整性 guard？
- validator 阅读门与 packageBuilder 是否仍"同一信号"、不会一边放一边拦？
