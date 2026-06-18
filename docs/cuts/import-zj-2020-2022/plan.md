# Cut: import-zj-2020-2022 — 浙江卷 2020–2022 真题导入

cut size: **medium**; touches schema/data contract: **yes** (lib.mjs 解析契约 + 数据入库,可重发布); product runtime: no; teaching interpretation: no.

## 背景

6 套**答案版** docx(答案格式干净 `【答案】X`,不是答案埋解析里的解析版):

| paperId | 文件 |
|---|---|
| paper-zj-2020-jan | 2020年浙江卷高考真题英语试卷（1月）-答案版.docx |
| paper-zj-2020-jul | 2020年浙江卷高考真题英语试卷（7月）-答案版.docx |
| paper-zj-2021-jan | 2021年浙江卷高考真题英语试卷（1月）-答案版.docx |
| paper-zj-2021-jun | 2021年浙江卷高考真题英语试卷（6月）-答案版.docx |
| paper-zj-2022-jan | 2022年浙江卷高考真题英语试卷（1月）-答案版.docx |
| paper-zj-2022-jun | 2022年浙江卷高考真题英语试卷（6月）-答案版.docx |

源目录: `~/Desktop/教学资料库/05_真题模拟与试卷库/高考真题/不完全统计真题/原版/浙江1月6月卷/答案版/`

## 题型 (老浙江卷, 6 套统一)

阅读10题(21–30,多篇) / 七选五5(31–35) / 完形**20**(36–55) / 语法10(56–65) / 应用文 / 读后续写。
总题数 45,与新课标同,但中段分布不同。

对比已支持 Format-B(2023–2026浙江/新课标ii): 阅读15(21–35)/七选5(36–40)/完形15(41–55)/语法10(56–65)。

## 根因 & 改动 (lib.mjs)

阅读题号已动态(`readingStdNo += group.questions.length`),但:
- `buildSevenGroup`: 题号写死 `[36..40]`、blank 偏移 `+35`
- `buildCloze`: 题号偏移写死 `+40`、blank 范围写死 `≤15`(锁 15 题)

改成动态接力:
- `buildSevenGroup({...,stdStart})`: 题号/blank 偏移用 `stdStart`(老31/新36)
- `buildCloze({...,stdStart})`: 偏移=`stdStart-1`,blank 范围放宽到实际题数;题号 while 循环已动态
- `splitPaper`: `readingStdNo`(阅读累加结果)→ `sevenStdStart=readingStdNo` → `clozeStdStart=sevenStdStart+5`
- **grammar 不动**: 两格式完形都结束于 55,语法都 56–65

**向后兼容**: 新课标阅读15→接力出七选五仍从36起→完形仍41起,数值不变。

## Forbidden

- 不改 `server/**` 产品运行时
- 不改 `02-publish.mjs` / `validate-one.mjs` 契约逻辑
- grammar build 题号不动
- DEV 阶段不发布入库(发布是独立 step,需 owner 确认 2020-jan 核对结果后才做)

## 验证

1. **回归(byte-diff)**: 改前后对 `paper-2024-i`(FmtA)、`paper-2025-ii`(FmtB)、`paper-zj-2026-jan`(浙江B) 三套重跑 `01-split`,`groups.json` 必须 byte-identical。
2. **2020年1月**: `01-split` 的 SPLIT REPORT 逐题核对答案 vs 答案版原文;题号必须 阅读21–30/七选31–35/完形36–55/语法56–65。
3. **风险核对**: ①阅读分篇累加正好到30(七选五起点31);②老卷七选五答案是 `[[...]]` 数组格式(否则需 normalize 预处理)。

## 流程

1. 改 lib.mjs + 回归 ← DEV
2. 打通 2020年1月 split + 核对 ← 给 owner 过目
3. 独立 CR 审 lib.mjs diff
4. Workflow 扇出 6套 AI 解析
5. 发布入库(停API→发布→重启) ← owner 确认后
6. (可选) 写作解析 backfill

## 执行记录

- **lib.mjs 改动已落地**(8 处 Edit): buildSevenGroup/buildCloze 加 `stdStart` 参数 +
  buildCloze 改为"先解析 questions 得 blankCount 再替换 blank"+ splitPaper 题号接力
  (`readingStdNo` → seven `stdStart` → cloze `stdStart=readingStdNo+5`)。
- **回归 byte-identical**: paper-2024-i(FmtA) / paper-2025-ii(FmtB) 改前后 groups.json 完全相同 ✓
- **6 套 split + 答案核对 100% 通过**: 每套 阅读10(21-30)/七选五5(31-35)/完形20(36-55)/语法10(56-65),
  R+S+C 答案逐题对上答案版原文; 2020年1月连 grammar 也人工核过。
- **两个风险点已排除**: ①阅读分篇累加正好到30 ②答案版七选五就是 `[[...]]` 格式(无需 normalize)。
- 答案版 docx 自带干净 `【答案】`,**直接 01-split 即可,不需要 zj-inject-answers**(那是给原版无答案的新卷用的)。
- owner 拍板: **全速 6套解析+发布**(2026-06-18)。
- 解析 Workflow runId: wf_0bf3e674-572 (36 Opus agent); CR PASS。
- **AI 解析 36/36 PASS**(2021-jan/cloze socket断重跑补齐;只改 analysis json,未碰 server)。

## Server publish-link 适配 (PA: APPROVE WITH MUST FIX, 2026-06-18)

发现 server 发布链路(`packageBuilder.mjs`)为新课标硬编码题数/分值,浙江老卷会错。
owner 拍板**做对**(改 server 正确支持,非带瑕疵入库)。

**方案(PA 推荐 option a narrowed)**: 一个 `FORMAT_PROFILE`(newStandard / zjLegacy),
**按完形题数选**(cloze=15→新课标 / 20→浙江 / 其它→throw)。题数已数据驱动
(`group.questions.length`),只需 profile 提供分值 + heading 文本。

**改 `packageBuilder.mjs` 的 4 个 section(其余 byte 不变)**:
| 元素 | 新课标(保持逐字) | 浙江老卷 |
|---|---|---|
| reading part heading | `第二部分 阅读` | `第二部分 阅读理解（共两节，满分35分）` |
| reading 第一节 | `第一节 阅读理解` | `第一节（共10小题；每小题2.5分，满分25分）` |
| seven heading | `第二节 (共5小题；每小题2.5分，满分12.5分)` | `第二节（共5小题；每小题2分，满分10分）` |
| seven 每题分 | 2.5 | **2** |
| lang part heading | `第三部分 语言运用(共两节，满分30分)` | `第三部分 语言运用（共两节，满分45分）` |
| cloze heading | `第一节(共15小题；每小题1分，满分15分)` | `第一节（共20小题；每小题1.5分，满分30分）` |
| cloze 每题分 | 1 | **1.5** |
| grammar/写作/reading每题分(2.5) | 不变 ✅ |

### PA Follow-Up Decisions (MF → 处理)

- **MF-1(修每题 score 不只 heading)**: seven 2.5→2、cloze 1→1.5 与 heading **同一改动**;
  reading(2.5)/grammar(1.5) 不变。Verify: 浙江 answer-key 每题分 + 试卷总分=135。
- **MF-2(byte-diff 证向后兼容)**: newStandard 分支必须逐字复现旧字面量(含标点:seven
  `第二节 (` 有空格、cloze `第一节(` 无空格、半角括号)。Gate: 改前后对 `paper-zj-2026-jan`
  (newStandard,工作区有 analysis)跑 `verify-zj-package.mjs` 比 package files **byte-identical**;
  不绿不发布 6 套。(baseline 趁 packageBuilder 未改时先存。)
- **MF-3(格式键=完形题数)**: 锁 cloze count(15/20);**禁** region/paperId 作键
  (provenance 在 packageBuilder 之后注入且 region 浙江也匹配新格式 zj-2026);未知题数 **throw**,不静默回退。
- **OPD-1(阅读门要4篇,浙江只3篇)**: 采纳 PA Option1 — 阅读门 `READING_LABELS` → `profile.readingLetters`
  (新课标 a/b/c/d、浙江 a/b/c),**不造假第4篇**;新课标仍严格要4篇(不削弱)。

### Forbidden (本阶段)

- 不改 `lib.mjs`/`01-split.mjs`/`groups.json`(不重 split — 题数已够,分值走 profile)
- 不改 `02-publish.mjs` 契约逻辑(provenance override 不动,不把 region 喂进 builder)
- 不改 `App.tsx`/app 渲染(score/heading 走数据)
- `analyzeCloze.mjs:55` 的 15||20 **保留**(PA SW-1 确认正确)
- 发布 6 套必须等 byte-diff 绿 + owner 看过 2020-jan

### Verify (静态)

1. byte-diff: `paper-zj-2026-jan` 改前后 package files identical (MF-2)
2. 浙江正确性: build `paper-zj-2020-jan` → heading=浙江文本 + 每题分(reading2.5/seven2/cloze1.5/grammar1.5) (MF-1)
3. unknown-format: 构造 cloze≠{15,20} → `buildPaperImportAiPackageFiles` throw (MF-3)
4. 六题型发布门不误伤浙江(阅读放宽后)

### 补充: validator.mjs 第三阅读门 (初版 PA/verify 漏, 2026-06-18 补)

发布期一致性闸 `server/paper-import/validator.mjs:312` 有**独立于 packageBuilder** 的阅读门
(硬编码 Reading A-D),浙江3篇(A/B/C)撞它 → `publishPaperImportPackage` 返回 `validation_failed`。
初版只覆盖 packageBuilder 的两道门(阅读/续写),漏了 publish 期 validator 这道 ——
**首次"6/0发布成功"是误判**(02-publish exit 0 但 status=validation_failed,事务性未写脏数据,DB 已确认干净)。

- 改: validator expectedLetters 按完形题数(20→`[A,B,C]` / 否则 `[A,B,C,D]`),与 packageBuilder profile 同信号;新课标仍严格 4 篇。
- 新增端到端 verify: `scripts/import-pipeline/verify-publish-gate.mjs` —— build + 调真 `validatePaperImportPackage`
  (复现 02-publish: docx sha256 填 `paper.sourceHash` + sourceDocx 传入 + filter null)。**6套 + zj-2026 全 ok=true 无 blocking**。
- **教训**: 发布链路有 3 道格式门(packageBuilder 阅读/续写 + validator 阅读),散在 2 模块;PA prompt 只指了 packageBuilder → 漏 validator。
  端到端 verify(走真 publish 门)能比"只单测 packageBuilder"更早抓到。下次导异格式卷:先 `verify-publish-gate` 跑通真 publish 门再发布。
- CR-4 审 validator 改动 + verify 脚本可信度中。
