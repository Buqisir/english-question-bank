# 盘点全库 latest 资产与所有生产消费变体

Status: closed
Type: research
Claim: claimed
Blocked by: None
Next on PASS: `docs/cuts/paper-canonical-unification/wayfinder/tickets/03-executable-standard-authority.md`
Terminal: no
Map: `docs/cuts/paper-canonical-unification/wayfinder/map.md`

## Question

For all 33 current `app/public/paper-assets/*/latest` papers, what source types, format profiles, group counts, marker dialects, writing-task shapes, table/figure cases, listening raw assets, anomalies, and version/provenance states actually exist? Trace every producer and consumer that creates or interprets paper structure, group semantics, numbering, scoring, instructions, answer regions, blank markers, option banks, tables/figures, or writing skeletons across import, DB projection, PaperBrowse/PaperSurface, Print/PDF, and DOCX. Reproduce and locate the owner-observed cloze option-alignment failure and the Seven Choices Print/PDF failure that creates a per-blank A–D layer and repeats or nests the shared A–G bank; record affected paper/group ids, surfaces, and the earliest layer where each output becomes wrong, using screenshots or minimal diagnostic excerpts rather than copyrighted content. For every current per-question A–D set, capture renderer-safe width metrics rather than full option text, classify the densest gold-reference layout that fits, and identify real four-column, two-by-two, one-column, and full-width-overflow proof candidates. Produce a reproducible census plus a producer/consumer matrix that identifies proof-asset candidates and migration hazards without copying full passages or answers.

## Resolution

[研究资产：33 套 `latest` 试卷资产、生产者与消费者普查](../../research/latest-assets-producers-consumers-census.md)

全库 33 套 `latest` 共 273 个 Question Group、1530 道客观题，按当前结构
信号分为 18 套 new-standard、9 套 national-legacy、6 套 Zhejiang-legacy。
研究资产逐卷记录了 source/provenance、group/writing/marker/version shape、唯一
table/figure 与 listening raw case、producer/consumer matrix、proof candidates
和 migration hazards；现有两套资产 gate 全绿，但仍漏过 reading heading
污染、seven ordinal 污染、config/latest/version 漂移与 source-type 矛盾。

两类 owner-observed failure 已定位：33/33 七选五资产本身均是题组级唯一 A–G
bank，最早错误发生在 API detail projection 把 bank 复制给五个 questions，
随后 Print/PDF 与 DOCX 各输出五份 A–G；当前 fixed point 没有“纯 per-blank
A–D”入口，旧观察在本票中保持未证实。33/33 完形上游均保留逐题 A–D，最早
错误是 renderer 没有共同列坐标；真实 HTML 中 B/C/D 起点跨 15 行分别漂移
36.5/70.1/107.3px。

全部 1035 个当前逐题 A–D set 已用共享 10.5pt 字体 token 做 deterministic
Canvas census，并按 source bytes、逐卷 mode counts 与 digest 固化：
four-columns 680、two-by-two 328、one-column 27、full-width-overflow 0。
前三类各有真实边界 proof；当前 corpus 没有真实 full-width-overflow，后续
只能明确使用 synthetic fail-closed fixture，不能冒充 corpus evidence。
本 resolution 不设计 canonical interface、authority hierarchy、schema、
迁移实现或 renderer selector；这些仍由既定后继票处理。
