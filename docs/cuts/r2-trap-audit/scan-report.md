# r2-trap-audit — scan-report

生成时间：2026-07-16T13:42:15.005Z（重跑 `node scripts/trap-audit-scan.mjs` 复算）

## 规模真相

- 全库 trap 总数（wrong 选项且带 `trap` 字段）：**1395**
- 按 primaryType 分布：unsupportedClaim=566，scopeShift=229，sourceLexicalTrap=221，polarityReversal=192，entityMismatch=186，timeOrderReversal=1

## 四类检查命中计数

| checkId | 命中数 | 摘牌档位 |
| --- | --- | --- |
| `rogueType` | 1 | 按结构可否安全取解释分 badge/row |
| `labelExplanationContradiction` | 7 | badge |
| `structuralIncompleteness` | 0 | row |
| `evidenceFieldLeak` | 0 | 不摘牌——待第二段 owner 判例 |

「无中生有」懒人桶里实锤贴错占比：**7 / 566 = 1.2%**（labelExplanationContradiction 命中数 / unsupportedClaim 总数）

## 判据原文（DEV 按数据实况定义，程序在 `scripts/trap-audit-lib.mjs`）

1. **rogueType**：`trap.primaryType` 不在受控词表 `["sourceLexicalTrap","polarityReversal","scopeShift","entityMismatch","unsupportedClaim"]` 内。
2. **labelExplanationContradiction**：`primaryType === 'unsupportedClaim'` 且（`sourceQuote`/`sourceText` 任一非空的窜入字段 或 `explanation` 文本中含引号包裹的英文原词钩，正则 `/["'"“']([a-zA-Z][a-zA-Z0-9 ,.'-]{2,})["'"”']/`）。判据收紧到「引号里是英文原词」而非任意中文引号使用——后者是「原文未提及…」这类合法的对比性论证，若不收紧会把 566 条里 144 条正常表述误伤成矛盾。
3. **structuralIncompleteness**：按 `primaryType` 对应子 schema 逐字段查空值/非法枚举（`sourceLexicalTrap` 用 `sourceText/optionText/relationNote` + `matchType` 枚举；`polarityReversal`/`scopeShift` 用 `sourceQuote/sourceHighlight/optionText/optionHighlight/explanation` + 各自 `subtype` 枚举；`entityMismatch` 用 `sourceQuote/sourceEntity/optionText/optionEntity/explanation`；`unsupportedClaim` 用 `claim/explanation`）。
4. **evidenceFieldLeak**：`primaryType === 'unsupportedClaim'` 且选项自身的 `trapEvidence`/`evidence` 字段仍带非空 `quote`（本次全库实测命中 0 条——语料里「无中生有」桶目前没有通过这条证据字段路径泄漏，真正的矛盾路径是上面第 2 条的引号钩子）。

## 自动摘牌批（步骤 3，仅 rogueType + labelExplanationContradiction + structuralIncompleteness）

- badge（标签贴错、解释仍显）：**8** 条
- row（子结构坏死、整行不显）：**0** 条
- evidenceFieldLeak 不摘牌，留待第二段 owner 判例：**0** 条

## 复算

本报告的每个数字都可以由 `scan-findings.json` 用一行 `jq`/`node` 重新数出来——例如 `node -e "console.log(require('./scan-findings.json').filter(f=>f.checkId==='rogueType').length)"`。

