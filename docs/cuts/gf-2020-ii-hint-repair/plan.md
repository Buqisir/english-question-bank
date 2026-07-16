# gf-2020-ii-hint-repair — 2020-ii 语法填空 hint 修伤（回源卷查证小刀）

## Cut Size

small（单卷 analysis 数据修复 + verify baseline 同步刷新）；touches
teaching interpretation: **yes**（facet 重标）→ owner 判例表逐空拍板后
才落库（本文件即拍板记录）。schema / product boundary: no。

## 查证记录（2026-07-16）

- STATUS 账面「no-hint 3 空（057/063/064）疑似导入期数据损伤」——实核
  损伤面为 **7 空**（056/057/058/059/063/064/065），账面 3 空是抽样所见。
- 全库横扫（36 卷 grammar-fill analysis × passage 提示词标记交叉比对）：
  **仅 paper-2020-ii 一卷带伤**，其余全净。单卷导入期事故，非解析器
  全局 bug。
- 回源卷：`versions/v1/raw/2020年新课标II卷-答案版.docx`（sha256 与
  import-meta 一致 727ddf…f8ff）语法填空段与 asset passage 逐词一致；
  7 空源卷带提示词（begin/education/require/profession/be/encourage/
  we），060/061/062 三空（that/a/and）真无提示。**passage 数据完好，
  损伤仅在 analysis 文件的 blankType/hint/facetKey 三字段**；reason/
  evidence/teachingNote 当时按真语法写、全对，保留不动。
- 病理：v2 分类第一刀按有无提示词劈 given/no-hint 两族，hint 丢失后
  归类只能全塞 no-hint 族，帽子连锁错位。

## 判例表（owner 逐空过、2026-07-16「没问题」拍板）

| 空 | hint（源卷） | answer | 错桶（现状） | 改判 | 附字段 |
|---|---|---|---|---|---|
| 56 | begin | to begin | no-hint.conjunction.coordinating | given.verb.non-finite | role=subject（for sb to do 真主语）form=to-do path=fast |
| 57 | education | educational | no-hint.article | given.conversion.noun-to-adjective | 提示词是名词 education 非动词，方向名→形 |
| 58 | require | requirement | no-hint.article | given.conversion.verb-to-noun | — |
| 59 | profession | professions | no-hint.article | given.noun.number | 词性不变只变数，不入 conversion |
| 63 | be | is | no-hint.conjunction.adverbial-clause | given.verb.finite | tense=present voice=active agreementSensitive=true（the number of 单数） |
| 64 | encourage | are encouraged | no-hint.conjunction.adverbial-clause | given.verb.finite | tense=present voice=passive agreementSensitive=true |
| 65 | we | our | no-hint.pronoun | given.pronoun | 主格→形容词性物主代词，同 zj-2024-jan one→ones |

7 空同步：hint 补源卷词 + blankType no-hint→given。

## 连带修改

`scripts/verify-grammar-facets-v2.mjs` 分布 baseline 钉的是带伤实测值
（修后 no-hint.article 26→23 超 ±2 假红），随修刷新为修后真值：
non-finite 62→63、finite 52→54、article 26→23、coordinating 25→24、
noun.number 17→18、noun-to-adjective 15→16、verb-to-noun 14→15、
given.pronoun 9→10、adverbial-clause 5→3、no-hint.pronoun 1→0；
role 表 subject 2→3。

## Verification

- `node scripts/verify-grammar-facets-v2.mjs` 真退出码绿；
- `pnpm -C app run verify:all` 全绿 + main CI。

## 裁决点清单

- [x] DP-1 判例表逐空讲解 + owner 拍板（2026-07-16「没问题」）
- [x] DP-2 落库 + verify-grammar-facets-v2 67/0 + verify:all 82/0/0
  真退出码（2026-07-16）
- [ ] DP-3 部署（生产 analysis 仍带伤，owner 拍板随下次部署或即刻）
