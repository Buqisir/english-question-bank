# r2-trap-audit — fresh CR（冷读，2026-07-16）

**Verdict: APPROVE WITH MUST FIX** — 1 Must Fix（文档/报量框定，非代码）、3 Should Watch、2 Nice-to-have。

代码/数据改动本身正确、纯增量、可回滚、在范围内、verify 非假绿。唯一挡道项：`labelExplanationContradiction` 这条判据把「解释里含引号英文」当成「实锤贴错」上报给 owner，但正则并不验证引号里是**原文**词——它对**选项自身**被引用也会命中（case 7 实证），所以喂给裁4 的「7/566＝1.2% 实锤贴错」高估了确定性。摘牌本身安全（badge 保解释），改的是报量话术，不动代码/数据。

---

## Changed Scope（从 diff 实核，非报告转述）

- 数据（纯增量）：8 个 `latest/analyses/reading-choice-analysis-v1.json`，每个只在一个 trap 对象里加 `suspension:{level,reason,suspendedAt}`，解释文本逐字节未动。`versions/` 零文件进 diff。
- 契约：`paperAsset.ts` 新增 `TrapSuspension`/`TrapSuspensionLevel` + 5 类 trap 各挂 `suspension?`（可选）。
- 门控：`PaperAssetAnalysisPanel.tsx`（badge 隐徽章+兼有/细分、row 整块 null）、`analysisText.mjs`（row 跳过 explanation）。`paperAssetSurfaceAdapter.ts` 仅新增 `trapSuspension` 透传 + `describeTrap` 防崩。
- 工具/验证：`trap-audit-lib/scan/apply-suspension.mjs`、`verify-r2-trap-audit.mjs`（已注册 verify-ci + README）、`qa/dp2-*.mjs`、`scan-report.md`/`scan-findings.json`、`program.md` R2 勾第一段。
- Forbidden 全遵守：零 `primaryType`/解释文本改写、`server/search/**` 零 diff、无「存疑」占位 UI（row 走 `null`，不渲染空 `<h4>`）。

---

## Findings

### Must Fix（挡合并 / 至少挡裁4 报量）

**MF-1｜`labelExplanationContradiction` 判据把「引号英文」当「实锤贴错」上报，正则不区分原文引证 / 对比引用 / 选项自引，7 条里混入非实锤项。**
- 位置：`scripts/trap-audit-lib.mjs` `QUOTED_ENGLISH_HOOK` + `isLabelExplanationContradiction`；话术落点 `scan-report.md`「无中生有懒人桶里实锤贴错占比 7/566＝1.2%」与 `program.md` 同句。
- 实证（读 findings.json 7 条命中原始 explanation）：
  - `paper-zj-2020-jul` q029 D：命中的引号英文是 **选项文本** `"introducing a concept"`，解释用它来**否定**选项（"…在原文没有依据，属无中生有"）。这是**加固**无中生有判定、不是自相矛盾——正则注释自称「quotes real source wording」，实际对选项自引也开火。这是判据实现与其声称意图的客观偏差。
  - `paper-2022-jia` q028 D / `paper-2023-yi` q024 D：引号里是原文词（`take the plunge` / `corn state`），但被用来**说明选项与原文无关**，属合法无中生有解释，非贴错。
  - 另一侧确有真阳：`paper-zj-2020-jan` q021 C（幽默属"母亲"非管理员，疑 entityMismatch）、`paper-960d0f8d` q026 C（原文确谈体量，疑 scopeShift/polarityReversal）读起来像真·标签贴错。
- 结论：7 条是「真贴错 + 假阳 + 边界」的**混合**，不是同质「实锤」。这正是 plan 说要留给第二段 owner 判例的「边界存疑」地带。
- 失败场景：owner 在裁4 把「1.2% 实锤贴错」当已结论的真实报量，据此定第二段战役规模——被高估的确定性误导范围判断；且面向老师隐掉了若干**分类正确**的定性徽章（虽 badge 级保留了解释，危害有界）。
- 修法（取其一，均不动安全的数据批）：① 报告/`program.md` 把这 7 条从「实锤贴错」降述为「引号英文钩启发式命中，需 owner 逐条过目」，并在裁4 让 owner 亲眼过 7 条再报量；或 ② 若要留在自动摘牌批，正则至少排除「命中串等于本选项 optionText」这类选项自引（case 7）。推荐 ①，最小改动、尊重既定裁4 人闸。
- 注：`rogueType`（1 条 paper-2023-i timeOrderReversal）与 `structuralIncompleteness`（0 条）是真机器可证伪，不在此列；MF-1 只针对 `labelExplanationContradiction` 这一条判据。

### Should Watch（不挡本次合并）

**SW-1｜`describeTrap` 去掉 `assertNever` 穷尽性守卫，换 `default` 尽力读取。** 位置：`paperAssetSurfaceAdapter.ts`。运行期这是**必要修复**——badge 级摘牌要保留 paper-2023-i 的 explanation，而该记录 `timeOrderReversal` 在旧 switch 会走 `assertNever` **抛错**、连带整个 model build 崩（即 main 现状对 paper-2023-i 阅读解析很可能已是活崩，本刀顺带修好、且是本刀自身摘牌能工作的前提，判为在范围内、非越界）。代价：编译期穷尽性保护丢失——将来往联合类型加**合法**新 trap 类型时，不再有 tsc 报错提醒补 case，会静默走尽力读取。非阻断，记账：加类型时手动确认 `describeTrap`。

**SW-2｜`row` 档全程无真语料/真 DOM 证。** 语料现 0 条 row（structuralIncompleteness 0/1395）。row 的面板整块隐藏仅靠 `PaperAssetAnalysisPanel.tsx` 静态源断言 `/hideTrapDetailEntirely \? null/`；analysisText 的 row 跳过靠合成临时磁盘 fixture 真模块调用（这条够实）。DP-2 无 row 可实点。首次出现真 row 摘牌时，面板隐藏路径是生产未跑过的路径。可接受（现无可崩之物），挂账：第二段若产生 row 项，补一次真渲染证。

**SW-3｜`labelExplanationContradiction` 正则随语料增长的稳健性。** 现判据是粗代理（引号英文 = 命中），未来新导入卷可能带来新的假阳/漏网。每次新卷导入后重跑 scan、人核新增命中。

### Nice-to-have

**NTH-1｜`scan-report.md` 的「144 条」避坑说法未独立复算。** 我未重跑「若不收紧会误伤 566 里 144 条」的具体数；收紧方向（要求英文引号、放过中文否定散文）判据合理，数值本身不影响本刀结论。

**NTH-2｜`suspension.suspendedAt` 为纯日期字符串无格式校验。** apply 批与 schema 都不校验格式；当前值一致（2026-07-16），低风险。

---

## 八项焦点逐条结论

1. **扫描判据无误伤**：四条判据 vs scan-report 判据原文一致。`rogueType`/`structuralIncompleteness`/`evidenceFieldLeak` 判据干净。**`labelExplanationContradiction` 有误伤/过声明**——见 MF-1，正则命中选项自引（case 7 实证）与合法对比引用，非纯实锤。「收紧避开 144」方向成立、数值未独立复算（NTH-1）。
2. **摘牌批纯增量**：8 个 JSON diff 严格只加一个 suspension 对象、零其他字节变动（逐个核对通过）。**但「全部机判实锤」不成立**——1 条 rogueType 实锤 + 7 条 labelExplanationContradiction 中混入边界/假阳（MF-1）。
3. **契约面改动最小必要**：paperAsset.ts 新类型 + 5 处可选字段，最小。adapter 透传最小。`describeTrap` 防崩**属正当顺带且为本刀摘牌工作的前提**（badge 保解释要求 timeOrderReversal 不抛错），非越界；穷尽性守卫丢失记 SW-1。
4. **门控归属**：确认 badge/row 隐藏逻辑在 `PaperAssetAnalysisPanel.tsx`（hideTypeBadgeAndMeta/hideTrapDetailEntirely）与 `analysisText.mjs`（row 过滤）各自持有，adapter 仅透传 `trapSuspension`、其余字段无条件计算。返工无残留——adapter 无任何门控分支。
5. **DEV 自报盲区裁定（row 无真 DOM 证）**：**可接受**，挂账 SW-2。理由：语料 0 条 row，无可实点；analysisText row 跳过有真模块证；面板 row 隐藏有静态断言。首个真 row 出现时须补真渲染证。
6. **Forbidden 遵守**：零 primaryType/解释文本改写（数据 diff 逐字节确认）、server/search/** 不在 file list、无「存疑」占位（row 渲染 `null`）。全过。
7. **PA-lite 降档理由仍成立**：schema 纯增量、显示门控、revert 可回滚——三条对 diff 成立。降档针对 schema 风险成立。（MF-1 是报量话术问题，不推翻 PA-lite 的 schema 风险判断。）
8. **verify 脚本质量**：非假绿。真模块导入 `buildPaperAssetSurfaceModel`（真 adapter）与 `loadGroupAnalysisTexts`（真 server 模块，临时磁盘 fixture），以 MARKER 断言 badge 留/ row 删/ control 留，回归即挂；组1 从活语料重算 findings 逐条比对已提交 JSON，摘牌被抹或 finding 漂移即 FAIL。已注册 verify-ci + README。63 断言真检行为。（未重跑，依主代理已核的真实退出码。）

---

## Verification Evidence

- 未重跑 tsc/verify（主代理已亲跑真实退出码：verify-r2-trap-audit 63、verify:all 83/1/0、DP-2 14，全绿；versions/ gitignored、git 内仅 latest/258 路径——按任务约定采信不重复付成本）。
- 独立冷读实核：`git diff main...r2-trap-audit` 全量文件清单（22 文件，仅计划允许集）、8 个数据 JSON 逐个 diff（纯增量）、7 条 labelExplanationContradiction 命中的原始 explanation（findings.json 坐标逐条读）、panel/adapter/analysisText 门控 JSX 与 switch 全文、verify 脚本行为断言尾段全文。

## Failure / Attack Angle

- 最可能的坏路径不是崩，是**静默误报量**：MF-1 让 owner 以为无中生有桶「实锤贴错率 1.2% 已定」，据此把第二段判例战役缩小或跳过——而真实的边界/贴错分布未被人核。badge 级摘牌又把危害藏得很浅（解释仍显、散文仍说"属无中生有"），不易在 QA 中被 owner 一眼发现「徽章没了」。
- 未来 agent 误用：把 `labelExplanationContradiction` 当「已验证的贴错判据」直接扩到重分类/改判——它只是引号钩启发式，改判须走第二段人判例，勿把启发式当判据。
- 陈旧回落：`describeTrap` 旧 `assertNever` 已删干净（tsc 绿证明无其他引用），无双路径残留。

## Self-Review Blind Spots（喂 Big CR 先看这些）

- 我只读了 7 条命中的 **explanation 文本**，未读对应**原文段落+选项全文**，故「真贴错 / 假阳」的逐条归属是基于解释措辞的推断，非定论——这恰恰印证 MF-1：这类判断需要 owner 看原文，不该被机审当实锤自动定案。
- `describeTrap` 我推断 main 对 paper-2023-i「已活崩」，但未在 main 实跑 buildPaperAssetSurfaceModel 复现崩溃（worktree 在 main 只读，且任务限定不重跑）；若该消费方在 main 有上层 try/catch 兜底，则「顺带修真崩」的表述应弱化为「消除潜在抛错」。
- 「144 避坑数」「1395 总数」「63 断言全绿」我采信主代理已核的重跑，未亲自复算。
