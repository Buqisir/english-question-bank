# r2-trap-audit — scan-report

生成时间：2026-07-17T00:20:32.209Z（重跑 `node scripts/trap-audit-scan.mjs` 复算）

## 规模真相

- 全库 trap 总数（wrong 选项且带 `trap` 字段）：**1395**
- 按 primaryType 分布：unsupportedClaim=563，scopeShift=229，sourceLexicalTrap=224，polarityReversal=192，entityMismatch=187

## 四类检查命中计数

| checkId | 命中数 | 摘牌档位 |
| --- | --- | --- |
| `rogueType` | 0 | 按结构可否安全取解释分 badge/row |
| `labelExplanationContradiction` | 0 | badge |
| `structuralIncompleteness` | 0 | row |
| `evidenceFieldLeak` | 0 | 不摘牌——待第二段 owner 判例 |

「无中生有」懒人桶里实锤贴错占比：**0 / 563 = 0.0%**（labelExplanationContradiction 命中数 / unsupportedClaim 总数）

## 判据原文（DEV 按数据实况定义，程序在 `scripts/trap-audit-lib.mjs`）

1. **rogueType**：`trap.primaryType` 不在受控词表 `["sourceLexicalTrap","polarityReversal","scopeShift","entityMismatch","unsupportedClaim"]` 内。
2. **labelExplanationContradiction**：`primaryType === 'unsupportedClaim'` 且（`sourceQuote`/`sourceText` 任一非空的窜入字段 或 `explanation` 文本中含引号包裹的英文原词钩，正则 `/["'"“']([a-zA-Z][a-zA-Z0-9 ,.'-]{2,})["'"”']/`）。判据收紧到「引号里是英文原词」而非任意中文引号使用——后者是「原文未提及…」这类合法的对比性论证，若不收紧会把 566 条里 144 条正常表述误伤成矛盾。
3. **structuralIncompleteness**：按 `primaryType` 对应子 schema 逐字段查空值/非法枚举（`sourceLexicalTrap` 用 `sourceText/optionText/relationNote` + `matchType` 枚举；`polarityReversal`/`scopeShift` 用 `sourceQuote/sourceHighlight/optionText/optionHighlight/explanation` + 各自 `subtype` 枚举；`entityMismatch` 用 `sourceQuote/sourceEntity/optionText/optionEntity/explanation`；`unsupportedClaim` 用 `claim/explanation`）。
4. **evidenceFieldLeak**：`primaryType === 'unsupportedClaim'` 且选项自身的 `trapEvidence`/`evidence` 字段仍带非空 `quote`（本次全库实测命中 0 条——语料里「无中生有」桶目前没有通过这条证据字段路径泄漏，真正的矛盾路径是上面第 2 条的引号钩子）。

## 自动摘牌批（步骤 3，仅 rogueType + labelExplanationContradiction + structuralIncompleteness）

- badge（标签贴错、解释仍显）：**0** 条
- row（子结构坏死、整行不显）：**0** 条
- evidenceFieldLeak 不摘牌，留待第二段 owner 判例：**0** 条

## 复算

本报告的每个数字都可以由 `scan-findings.json` 用一行 `jq`/`node` 重新数出来——例如 `node -e "console.log(require('./scan-findings.json').filter(f=>f.checkId==='rogueType').length)"`。

## 判后状态（rulings.md 判例战役收官，2026-07-16）

- **R6 修复**：`labelExplanationContradiction`（`trap-audit-lib.mjs`）新增排除条件——引号钩命中的英文短语若是选项自身 `claim` 文本的子串（大小写不敏感），判定为「解释复述选项自身文本以驳斥之」的合法论证，不算自相矛盾。修复后 `paper-zj-2020-jul` q029-D（命中串 `introducing a concept` 即选项 `claim` 子串）不再命中，findings 从 7 降到 2。
- **已判白名单**（`docs/cuts/r2-trap-audit/adjudications.json`，R6 修后仍会被启发式抓的边界例——owner 已裁合法，扫描器跳过上报）：**2** 条
  - paper-2022-jia/q-2022-jia-028/D（labelExplanationContradiction，判例 CL-1）：选项自身词句（promise）在原文无原词无同义替换；解释引原文短语（take the plunge）是合法的对比论证，不构成词钩证据——owner 回牌，维持 unsupportedClaim。
  - paper-2024-ii/q-2024-ii-032/A（labelExplanationContradiction，判例 CL-1）：选项自身词句（poorly educated）在原文无原词无同义替换；解释引原文短语（wrong hands）是合法的对比论证，不构成词钩证据——owner 回牌，维持 unsupportedClaim。
- **本批处置清单（8/8，rulings.md 判例 CL-1~CL-7）**：
  - 回牌 ×3（撤 suspension，标签/内容不动）：2022甲 q028-D、2024-II q032-A（CL-1）；浙江20-7月 q029-D（CL-6，R6 修后机器已不再命中）
  - 改判 sourceLexicalTrap ×3（重铸子 schema + 撤 suspension）：2023乙 q024-D、2025-II q032-D、960d0f8d q026-C（CL-2/CL-3/CL-4）
  - 改判 entityMismatch ×1（重铸子 schema + 撤 suspension）：浙江20-1月 q021-C（CL-5）
  - 改判 unsupportedClaim ×1（重铸子 schema、explanation 不含英文引号钩 + 撤 suspension）：2023-I q025-B（CL-7，`timeOrderReversal` 单例不转正）
- **当前库 suspension 计数：0**（8 条摘牌全部经 owner 裁后撤销——回牌 3 条撤 suspension 标签维持，改判 5 条撤 suspension 重铸子 schema；摘牌机制本身保留，等下一批机器可证伪的实锤命中）
- **scan-findings.json 判后状态：0 条**（白名单生效后剩余的未处理命中——本批全部 8 条已落判，故为 0；已判的 2 条命中未消失于 evaluateOption()，只是被扫描器按白名单跳过上报，机审判据本身不因白名单而改变判定）

