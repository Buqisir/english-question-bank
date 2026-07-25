# 33 套 `latest` 试卷资产、生产者与消费者普查

日期：2026-07-25
范围：`app/public/paper-assets/*/latest`、其第一方生产/消费源码、`data/question-bank.sqlite`
固定点：`19ffc7744c656b526f55934c8c73e245acf7323f`（研究时 HEAD `354d4ac1c40790e759d917420238e371f28173f7`）
约束：本文不记录文章、选项、答案或写作正文，只记录 id、hash 前缀、shape/count、宽度、最小诊断和 `file:line`。

## 结论

1. 现有 33 套 `latest` 共 273 个 Question Group、1530 道客观题；按当前 producer 的结构信号可复算为 18 套 `newStandard`、9 套 `nationalLegacy`、6 套 `zjLegacy`。profile 只是运行时推断，没有稳定 id/version 或持久 artifact（`server/paper-import-ai/packageBuilder.mjs:5-83`）。
2. 33/33 的 `sources.primarySourceType` 都写成 `docx`，但 `paper-2026-i` 的真实文件名/扩展名和 `import-meta` 是 PDF；因此 `primarySourceType` 不能直接当 Source Capture 类型权威（`app/src/domain/paperAsset.ts:31-44`；本卷 `sources.docx.fileName = paper.pdf`）。
3. 33/33 七选五资产本身形状正确：每组 5 question（每个 question 自身 `options=0`）+ 一个组级 7 项 A–G `optionBank`。错误最早发生在 API detail projection：无逐题 options 时回退整个 shared bank（`server/api.mjs:1652-1693`），把每个 blank 投影成 A–G×7；Print/PDF 和 DOCX 再逐题照单消费。当前 fixed point **没有**复现“每空仅 A–D”，而是更宽的“每空 A–G”；旧观察若坚持为 A–D，需要另给可复现入口，不能据现状伪造。
4. 完形上游 33/33 都是逐题 A–D，错误最早在 renderer：Screen 用可换行 flex（`PaperSurface.css:474-490`），Print 用变宽 inline spans（`print-renderer.mjs:519-524,756-762`），DOCX 用空格拼接一个 run（`docxRenderer.mjs:1151-1153`），都没有列宽/制表位。真实 2026-I 打印 HTML 的 15 行中，A 列 x 恒为 28px，但 B/C/D x 分别漂移 36.5/70.1/107.3px，证明不是上游结构错，而是 renderer conformance failure。
5. 对全部 1035 个逐题 A–D set 用真实浏览器 Canvas、14px Times New Roman 度量 label+text advance；以 584px 可用行宽和 28px gutter 作 census 分类，得到 `four_columns=680`、`two_by_two=328`、`one_column=27`、`full_width_overflow=0`。当前真实资产没有 full-width-overflow proof；该分支必须使用合成 fail-closed fixture，不能冒充真实样本。
6. `latest` 目录没有任何 `versions/vN` 或 `paper-normalized-groups-v1.json`；但 DB 有 39 条 published version 记录（33 papers，`paper-2024-i` 到 v5、`paper-2025-i` 到 v3）。迁移时不能把 DB version record 当作历史文件仍存在的证明。
7. 唯一表/图 case 是 `paper-2026-i / group-2026-i-reading-a`：一个 `kind=table` PNG 和一个 `[表: …]` marker；manifest 的 pixel width/height/sha256 均为空。唯一 listening raw case 也是 `paper-2026-i`：questions、20 answers、10 transcript texts/10 timing rows，且没有 active listening Question Group。
8. `latest` 与 committed import config 都各有 33 套，但集合不同：`paper-2020-yi` 只有 config、没有 latest；`paper-960d0f8d` 只有 latest、没有 config。且 config 对应的 `groups.json` 中间产物未提交，fresh worktree 不能端到端重跑 publish gate。
9. 现有 gates 全绿仍漏过两类 source/splitter 污染：18 papers 的 49 个 reading stem 吞入下一篇单字母 heading；19 个 seven groups 共 95 处 blank marker 后残留局部序号。Canonical migration 不能把“schema valid”误当“source boundary valid”。

## 33 套资产明细

缩写：`r/s/c/g/w` = reading/sevenChoices/cloze/grammarFill/writing group 数；`A:x+y` = applicationGiven top/bottom 行数（`-` 为字段不存在）；`C:n` = continuation starters 数；`fig/listen` 为 manifest figure 数/raw JSON 文件数；末列为 `source sha256`/`paper-asset sha256` 的前 12 位。

| paperId | provenance/source file | inferred profile | groups | writing shape | fig/listen | asset state | hashes |
|---|---|---:|---:|---|---:|---|---|
| paper-2020-bing | 真题/docx | nationalLegacy | 7 (r4/s1/c1/g1/w0) | - | 0/0 | v1/published | 10b2966edaf8/31a752e59710 |
| paper-2020-i | 真题/docx | newStandard | 9 (r4/s1/c1/g1/w2) | A:-,C:2 | 0/0 | v1/published | 96ed0fd208ee/598fdfd3e57f |
| paper-2020-ii | 真题/docx | newStandard | 9 (r4/s1/c1/g1/w2) | A:-,C:2 | 0/0 | v1/published | 727ddf1cc357/72c218482cea |
| paper-2020-jia | 真题/docx | nationalLegacy | 7 (r4/s1/c1/g1/w0) | - | 0/0 | v1/published | 602b1cf82f8b/920624a8e769 |
| paper-2021-i | 真题/docx | newStandard | 9 (r4/s1/c1/g1/w2) | A:-,C:2 | 0/0 | v1/published | f0a4cef8571c/4c23fcc02981 |
| paper-2021-ii | 真题/docx | newStandard | 9 (r4/s1/c1/g1/w2) | A:-,C:2 | 0/0 | v1/published | 8cf6623dcedc/350d3f9024e4 |
| paper-2021-jia | 真题/docx | nationalLegacy | 7 (r4/s1/c1/g1/w0) | - | 0/0 | v1/published | 4ebf3956cbc4/d41a386b0cfe |
| paper-2021-yi | 真题/docx | nationalLegacy | 7 (r4/s1/c1/g1/w0) | - | 0/0 | v1/published | 156d7bed853b/ee1e91a3337a |
| paper-2022-i | 真题/docx | newStandard | 9 (r4/s1/c1/g1/w2) | A:-,C:2 | 0/0 | v1/published | efd4d8c1257a/16a08b962f4d |
| paper-2022-ii | 真题/docx | newStandard | 9 (r4/s1/c1/g1/w2) | A:-,C:2 | 0/0 | v1/published | b715de9a85ac/23385841243d |
| paper-2022-jia | 真题/docx | nationalLegacy | 7 (r4/s1/c1/g1/w0) | - | 0/0 | v1/published | 690f068167b4/81dbec136ea2 |
| paper-2022-yi | 真题/docx | nationalLegacy | 7 (r4/s1/c1/g1/w0) | - | 0/0 | v1/published | 3fb93b2cd30b/c48a46caadd6 |
| paper-2023-i | 真题/docx | newStandard | 9 (r4/s1/c1/g1/w2) | A:-,C:2 | 0/0 | v1/published | 791b4d659998/ebf76c5a60ca |
| paper-2023-ii | 真题/docx | newStandard | 9 (r4/s1/c1/g1/w2) | A:-,C:2 | 0/0 | v1/published | 26d167ff95e7/d4b0c04d2ea8 |
| paper-2023-jia | 真题/docx | nationalLegacy | 7 (r4/s1/c1/g1/w0) | - | 0/0 | v1/published | a9c98aed8c90/939760dd3479 |
| paper-2023-yi | 真题/docx | nationalLegacy | 7 (r4/s1/c1/g1/w0) | - | 0/0 | v1/published | a725c864ca04/2e8c36e2d2fd |
| paper-2024-i | 真题/docx | newStandard | 9 (r4/s1/c1/g1/w2) | A:-,C:2 | 0/0 | v5/published | ad26ff39e1d8/b706d2ef6360 |
| paper-2024-ii | 真题/docx | newStandard | 9 (r4/s1/c1/g1/w2) | A:-,C:2 | 0/0 | v1/published | 57c0ffc8f176/6728f9c56f4f |
| paper-2024-jia | 真题/docx | nationalLegacy | 7 (r4/s1/c1/g1/w0) | - | 0/0 | v1/published | 46665e1e6950/172adb090412 |
| paper-2025-i | 真题/docx | newStandard | 9 (r4/s1/c1/g1/w2) | A:-,C:2 | 0/0 | v3/published | 33a93bfa4af0/77bf44921521 |
| paper-2025-ii | 真题/docx | newStandard | 9 (r4/s1/c1/g1/w2) | A:-,C:2 | 0/0 | v1/published | 8f69042d114c/26a7297ec2be |
| paper-2026-i | 真题/pdf | newStandard | 9 (r4/s1/c1/g1/w2) | A:0+0,C:2 | 1/3 | v1/published | 31a87069e6d5/fe7feb2cc955 |
| paper-960d0f8d | 模拟题/docx | newStandard | 9 (r4/s1/c1/g1/w2) | A:-,C:2 | 0/0 | v1/published | 960d0f8d6fdd/2578eb70e069 |
| paper-zj-2020-jan | 真题/docx | zjLegacy | 8 (r3/s1/c1/g1/w2) | A:-,C:2 | 0/0 | v1/published | d752ee191e73/e0b7bda8541b |
| paper-zj-2020-jul | 真题/docx | zjLegacy | 8 (r3/s1/c1/g1/w2) | A:-,C:0 | 0/0 | v1/published | 1a447b5dc7bd/3698679f6e26 |
| paper-zj-2021-jan | 真题/docx | zjLegacy | 8 (r3/s1/c1/g1/w2) | A:-,C:2 | 0/0 | v1/published | 959303190176/c45b857db5af |
| paper-zj-2021-jun | 真题/docx | zjLegacy | 8 (r3/s1/c1/g1/w2) | A:-,C:2 | 0/0 | v1/published | 77e48ff126b6/d4f6f71a4d08 |
| paper-zj-2022-jan | 真题/docx | zjLegacy | 8 (r3/s1/c1/g1/w2) | A:-,C:2 | 0/0 | v1/published | 9c87c643ca84/76b0e999063e |
| paper-zj-2022-jun | 真题/docx | zjLegacy | 8 (r3/s1/c1/g1/w2) | A:-,C:3 | 0/0 | v1/published | a122274be755/929159382b2f |
| paper-zj-2023-jan | 真题/docx | newStandard | 9 (r4/s1/c1/g1/w2) | A:-,C:2 | 0/0 | v1/published | 7b5972933e4d/15013d3fc7d3 |
| paper-zj-2024-jan | 真题/docx | newStandard | 9 (r4/s1/c1/g1/w2) | A:-,C:2 | 0/0 | v1/published | 93439c92b66a/9e7cff02e83f |
| paper-zj-2025-jan | 真题/docx | newStandard | 9 (r4/s1/c1/g1/w2) | A:-,C:2 | 0/0 | v1/published | 211ab91c6306/7d9333604ae4 |
| paper-zj-2026-jan | 真题/docx | newStandard | 9 (r4/s1/c1/g1/w2) | A:-,C:2 | 0/0 | v1/published | b6575a699643/aca1cf9a2022 |

### Shape totals and anomalies

- Provenance：32 真题 + 1 模拟题；32 DOCX + 1 PDF by actual source filename；33/33 `paper.status=published`。33/33 的 `sources.docx.sha256` 都与 `import-meta.sourceFileSha256` 一致；矛盾只在 `paper-2026-i` 的 declared type=`docx` 与两个 filename=`paper.pdf`，不是 hash mismatch。
- Group shape：9 national legacy papers have 7 groups and deliberately no writing family；6 Zhejiang legacy have 8 groups（Reading A–C + two writing）；18 new-standard have 9 groups。
- Profile score signatures（按当前 builder 推断）：`newStandard` = cloze15/read4/writing2，reading/seven/cloze/grammar 每题 2.5/2.5/1/1.5；`nationalLegacy` = cloze20/read4/writing0，2/2/1.5/1.5；`zjLegacy` = cloze20/read3/writing2，2.5/2/1.5/1.5（`packageBuilder.mjs:7-55,68-83`）。
- Writing：24 papers × 2 tasks = 48 tasks。23 有 `writing-analysis-v1.json`；`paper-2026-i` 没有。21 套是普通 application + continuation(2 starters)；`paper-2026-i` 另有空的 `applicationGiven`；`paper-zj-2020-jul` continuation starters=0；`paper-zj-2022-jun`=3。其余 23 application tasks 没 `applicationGiven`。更细的数据异常（缺书信 skeleton、重复 starter prefix、提示词漏提取、杂散数字）见第一方只读 sweep `docs/import/data-health-sweep-2026-07-08.md:89-170,172-220`。
- Marker dialect：32/33 的七选五、完形、语法填空都使用 `__NN__`；`paper-960d0f8d` 混用：seven group 是 5 个长下划线包裹 marker，cloze 是 15 个 `__NN__`，grammar 是 10 个 `NN._____`（`app/public/paper-assets/paper-960d0f8d/latest/paper-asset.json:490,610`；下方只读命令可复算全组）。旧 sweep 在 `docs/import/data-health-sweep-2026-07-08.md:53-61` 把该 seven group 记成 `__NN__`，与当前 `latest` bytes 不一致，不能继续作为当前 marker 权威。当前导出硬断言已知会拦 5 组：该 grammar group，以及 4 个含杂散局部序号的 seven group（同文件 `:275-285`）。
- 完整性：33/33 questionNo 连续，answer key 一一对应，blocks↔groups 双向引用闭合（同文件 `:148-156,222-226`）。
- 标题异常：`paper-2026-i` 资产标题为 `paper`；浙江 2024/2025/2026 January 为 `source`（同文件 `:42-45`）。
- Table/figure：只有 `paper-2026-i` 有 `paper-figures-manifest-v1`；唯一 entry 是 `fig-paper-2026-i-reading-a-table-1`，`kind=table`，绑定 `group-2026-i-reading-a`。PNG 与 placeholder 都存在；同一 paragraph 还保存 flattened table text，是当前双存桥。manifest 的 `pixelWidth/pixelHeight/sha256` 都为 null。
- Listening：只有 `paper-2026-i` 有 raw assets；questions 分 section1=5、section2=15，answers keys=1..20，transcript texts=10、timingTable=10、notes=2。`content.groups` 与 `content.blocks` 都没有 listening entry，符合 raw/inactive 边界（`docs/product/nck1-paper-standard.md:56-65`）。

### Splitter boundary / marker contamination（现有 gates 未捕获）

49 个 reading question stem 以孤立 `A|B|C|D` 结尾，分布 18 papers；其中 12/49 恰好等于答案、37/49 不等，因此不能把 suffix 当答案字段，形态更符合“上一 passage 最后一题吞入下一 passage heading”。只记录 paper/qNo：

```text
paper-2020-bing 23,27,31       paper-2020-i 23,27,31
paper-2020-jia 23,27,31        paper-2021-ii 23,27,31
paper-2021-jia 23,27,31        paper-2021-yi 23,27,31
paper-2022-i 23,27,31          paper-2022-ii 23,27,31
paper-2022-jia 23,27,31        paper-2022-yi 23,27,31
paper-2023-jia 23,27,31        paper-2023-yi 23,27,31
paper-zj-2020-jan 23,26        paper-zj-2020-jul 24,27
paper-zj-2021-jun 23,27        paper-zj-2022-jan 23,26
paper-zj-2022-jun 23,26        paper-zj-2023-jan 23,27,31
```

19 个 seven groups 各有 5 个 marker 后局部 ordinal（共 95 处）；Print 会保留这些裸数字。group ids：

```text
group-2021-ii-seven-choices, group-2021-jia-seven-choices,
group-2021-yi-seven-choices, group-2022-i-seven-choices,
group-2022-ii-seven-choices, group-2022-jia-seven-choices,
group-2022-yi-seven-choices, group-2023-i-seven-choices,
group-2023-jia-seven-choices, group-2023-yi-seven-choices,
group-2024-ii-seven-choices, group-2024-jia-seven-choices,
group-2025-ii-seven-choices, group-zj-2021-jan-seven-choices,
group-zj-2021-jun-seven-choices, group-zj-2022-jan-seven-choices,
group-zj-2022-jun-seven-choices, group-zj-2023-jan-seven-choices,
group-zj-2024-jan-seven-choices
```

另有两个 grammar group 的 marker 后出现孤立数字，需要 source context 判断，不能与 seven ordinal 一起盲删：`group-zj-2021-jan-grammar-fill`（q60→2）、`group-zj-2021-jun-grammar-fill`（q57→1）。

跨 paper exact normalized payload 只有 writing-task 命中六对：2022 I/II application + continuation（hash 前缀 `078e1f2d`,`9d2c1691`），2023 I/II（`bb10768e`,`13a3516`），2024 I/II（`77bae79e`,`3b784e61`）。reading/cloze 等无跨卷 exact duplicate。这里只标 `needs_review` provenance 风险，不凭常识判定内容错误。

## 全部 A–D 宽度 census

### 测量与分类

- 集合范围：`question.options` 恰好四项且 labels 为 A/B/C/D；共 1035 set（465 reading + 570 cloze）。
- 字体：浏览器 Canvas `14px "Times New Roman", Times, "SimSun", "Songti SC", "STSong", serif`，精确复用共享 10.5pt token（`shared/papersurface/tokens.mjs:44-103`）。
- 每项 width 是 `label + ". " + option text` 的 `measureText().width`，保留 0.1px；不落 option text。
- 可用 row width=584px（真实 612px viewport 内的打印 option row），gutter=28px。
- `required4 = A+B+C+D+3×28`；`required2x2 = max(A+B, C+D)+28`；`required1 = max(A,B,C,D)`。
- densest-first：`required4<=584 → 4c`，否则 `required2x2<=584 → 2x2`，否则 `required1<=584 → 1c`，否则 overflow。这个分类是 census/prototype seed，不提前替代后续 selector ticket 对 margin、tab stops 和 cross-renderer rounding 的正式决定。

完整 per-set capture 没有把文本写进仓库：对每套 paper，以稳定 `questionId:A/B/C/D widths:required4/required2/required1:mode` 序列计算 sha256；下表记录 set 数、模式数和 digest 前 16 位。下方复现命令可打印任一 set 的全部数值并重算 digest。

| paperId | sets | 4c/2x2/1c/overflow | deterministic digest |
|---|---:|---:|---|
| paper-2020-bing | 35 | 26/9/0/0 | c3f173cbb4fa5201 |
| paper-2020-i | 30 | 19/10/1/0 | 6efdac9e9ad4a430 |
| paper-2020-ii | 30 | 20/9/1/0 | 7286ff40e5eeb81a |
| paper-2020-jia | 35 | 24/8/3/0 | d283fdf6e0aae8c0 |
| paper-2021-i | 30 | 21/9/0/0 | bb3f11007078bd89 |
| paper-2021-ii | 30 | 21/9/0/0 | b58dc694c64fee35 |
| paper-2021-jia | 35 | 25/8/2/0 | 9a10a85e4883566a |
| paper-2021-yi | 35 | 25/10/0/0 | e0c059680b073ca7 |
| paper-2022-i | 30 | 20/9/1/0 | 1e6e0bebe375962a |
| paper-2022-ii | 30 | 18/10/2/0 | 925f0b5e2f297c69 |
| paper-2022-jia | 35 | 23/11/1/0 | 4c683bf4429f19d9 |
| paper-2022-yi | 35 | 24/10/1/0 | 40463db4c495dcf6 |
| paper-2023-i | 30 | 19/11/0/0 | 81ab86012c501cd4 |
| paper-2023-ii | 30 | 18/11/1/0 | 2511cdcb1eec37d2 |
| paper-2023-jia | 35 | 23/12/0/0 | 9f9987aafba63292 |
| paper-2023-yi | 35 | 24/11/0/0 | de682f5e1a7292f9 |
| paper-2024-i | 30 | 17/12/1/0 | 1c2445fa63a24db2 |
| paper-2024-ii | 30 | 16/14/0/0 | 051c7de3b6a093d8 |
| paper-2024-jia | 35 | 23/12/0/0 | 4ddd85a2d32a0403 |
| paper-2025-i | 30 | 20/10/0/0 | 4e555401b43cbccb |
| paper-2025-ii | 30 | 16/14/0/0 | 8af6c82d08e01a4b |
| paper-2026-i | 30 | 17/13/0/0 | 35feb8fa5e7e25c3 |
| paper-960d0f8d | 30 | 17/12/1/0 | 805e7a6393b68fb3 |
| paper-zj-2020-jan | 30 | 23/5/2/0 | b8aa897df8068b13 |
| paper-zj-2020-jul | 30 | 20/9/1/0 | ed0eee5be622bc6e |
| paper-zj-2021-jan | 30 | 22/6/2/0 | dbadc9f02f979ee0 |
| paper-zj-2021-jun | 30 | 21/9/0/0 | 134e17bade0e13b6 |
| paper-zj-2022-jan | 30 | 22/7/1/0 | c6036674a7da7275 |
| paper-zj-2022-jun | 30 | 20/10/0/0 | 115f0baa5991330d |
| paper-zj-2023-jan | 30 | 20/8/2/0 | 76d0a74a1c690a0d |
| paper-zj-2024-jan | 30 | 17/11/2/0 | 678dc765588e2867 |
| paper-zj-2025-jan | 30 | 20/10/0/0 | ecf4f5b9f143a8c8 |
| paper-zj-2026-jan | 30 | 19/9/2/0 | f6ab1b0977c033e0 |
| **合计** | **1035** | **680/328/27/0** | — |

### Proof candidates

| mode | paper/group/question | A/B/C/D widths px | required evidence |
|---|---|---|---|
| four columns boundary | `paper-2022-jia / group-2022-jia-reading-a / q-2022-jia-021` | 131.4/115.1/129.5/123.1 | `required4=583.1`，距 584px 仅 0.9px；是 margin/rounding 压力样本 |
| two-by-two boundary | `paper-2020-jia / group-2020-jia-reading-c / q-2020-jia-030` | 185.4/252.1/289.8/265.1 | `required4>584`；`required2x2=582.9`，是 2×2 边界样本 |
| one column | `paper-2020-jia / group-2020-jia-reading-d / q-2020-jia-035` | 259.7/396.1/349.9/269.0 | `required2x2=683.8`；`required1=396.1` |
| full-width overflow | **无真实资产** | — | 1035/1035 的 `required1<=584`；后续必须合成显式超宽/换行 fixture |
| cloze gold-like dense | `paper-2026-i / group-2026-i-cloze` | 全 15 set 均落 4c | 用于证明 tab-aligned four-column，不应用当前 flex/space join |

## 两类 owner-observed failure 的最早错误层

### Seven Choices：shared bank 被复制进每个 blank

资产真值（33/33）：

```text
group.questionIds.length = 5
asset question.options.length = 0,0,0,0,0
group.optionBank.length = 7 (labels A..G)
```

真实 `group-2026-i-seven-choices` 诊断：

```text
getQuestionGroupDetail optionCounts = 7,7,7,7,7
buildPrintHtml label occurrences = A:5 B:5 C:5 D:5 E:5 F:5 G:5
buildDocumentXml label occurrences = A:5 B:5 C:5 D:5 E:5 F:5 G:5
```

定位：

1. `packageBuilder.mjs:410-450` 正确生成五个不带 options 的 questions 和一个 group-owned bank；validator 只验证 bank 完整性（`validator.mjs:444-460`）。
2. **最早 wrong**：`buildQuestionDetailsFromPaperAsset` 以 `sharedOptionBank` 作为每个缺 options question 的 fallback（`server/api.mjs:1652-1693`）。
3. Export implementation 必经 `getQuestionGroupDetail`（`server/exports/exportImplementation.mjs:85-107,227-248`）；Print 按 question 渲染 `printQuestion.options`（`print-renderer.mjs:499-525`），DOCX 同样逐题消费（`docxRenderer.mjs:1135-1171`）。
4. PaperBrowse/QuestionGroup detail 的专用 Screen adapter 没走这个错误投影：它令 `surfaceData.questions=[]`，另投一次 group bank（`sevenChoicesSurfaceAdapter.ts:179-224`；`PaperSurface.tsx:291-311`）。所以 Screen 专用面正确，Print/PDF/DOCX detail pipeline 错。
5. 历史静态 QA `docs/cuts/draft-numbering-style/qa/v2-draft-student-print.html:249-250` 也有五个 `.options-list`，每个包含 A–G，说明不是本次 census 的脚本假象。

与票面“per-blank A–D”的关系：当前输出确实含每 blank A–D layer，但没有止于 D，而是继续 E–G。没有任何当前入口把它裁成纯 A–D；应把“纯 A–D”视为未证实的旧入口/旧版本观察，后续 ticket 需要新的复现证据。

### Cloze：option 列失去横向对齐

资产和 API projection 都保留每题恰好 A–D；无错位、缺项或共享 bank。错误最早在三个 renderer 各自选择无列约束布局：

- Screen：empty stem 折叠为 `number + options`，`.ps-question-options-inline { display:flex; flex-wrap:wrap; gap:4px 16px }`；每项宽度随文本变化（`PaperSurface.tsx:720-779`；`PaperSurface.css:474-490`）。
- Print/PDF：cloze 无条件走 `.options-inline`，每项只有相同右 margin，没有共同 tab stop/column width（`print-renderer.mjs:366-374,519-524,756-762`）。
- DOCX：四项 join 成一个以四空格分隔的 text run；比例字体下空格不是制表列（`docxRenderer.mjs:1135-1153`）。

真实 QA HTML（`docs/cuts/draft-numbering-style/qa/v2-draft-student-print.html`）Playwright 几何：

```text
viewport/option row = 612/584px
15 cloze rows
A x spread = 0px
B x spread = 36.5px
C x spread = 70.1px
D x spread = 107.3px
```

因此 earliest error 是 renderer presentation rule，不是 Canonical Question Group、DB 或 answer alignment。所有 33 cloze groups 都使用同一规则，均属受影响面；`group-2026-i-cloze` 是最直接 proof candidate。

## Producer / consumer matrix

| stage | owner / evidence | produces or interprets | current authority/risk |
|---|---|---|---|
| DOCX capture/split | `server/paper-import-ai/docxSplitter.mjs:1-120,680-726,770-803` | sections、题组、A–D、A–G、blank prompts | source-format regex owner；多 dialect，可能丢 paragraph boundaries |
| legacy batch splitter | `scripts/import-pipeline/lib.mjs:12-25,88-110,284-320,404-430,533-560` | DOCX text → reading/seven/cloze/grammar/writing shapes | 与 shipped splitter 并行的第二 producer；format A/B 分支是迁移 hazard |
| PDF path | `scripts/import-pipeline/pdf-extract.mjs`；`scripts/import-pipeline/zj-2026-normalize.mjs:36-65,143-203` | PDF text、fullwidth option marker、flattened table lines | `docxPath` 字段仍可指 PDF；source type 与字段名冲突 |
| profile/package builder | `server/paper-import-ai/packageBuilder.mjs:5-83,264-430` | profile inference、blocks/layoutTree、numbering、score、instructions、groups/questions/banks | profile 未持久化；`layoutTree` 与 `blocks` 双 owner |
| writing builder | `packageBuilder.mjs:288-305` 及 writing 分支 | writing group/task、answerBox、starters | national legacy 是明确例外；application skeleton 在旧资产基本未结构化 |
| admission | `server/paper-import/validator.mjs:319-460,464-580,593-760` | schema、reading labels、A–G bank、answers/analysis checks | schema 对 blocks/writing/options 仍很宽；部分 non-reading 缺失只是 warning |
| canonical compatibility | `server/paper-import/normalization.mjs:14-111` | cloze + grammarFill sidecar、fingerprints/digests | 只支持两类；当前 33 latest 无 sidecar；reading/seven/writing/listening 无 canonical variant |
| version/latest storage | `server/paper-import/storage.mjs:24-126,134-180,199-311` | immutable `versions/vN`、latest swap、sidecar | 当前 filesystem 历史版本为空但 DB 有 39 record；读取优先 latest |
| DB projection producer | `server/paper-import/publisher.mjs:179-203,265-346` | Source/Passage/Question Group/Question/Option rows；score/sourceType projection | 删除再建 question/options；不存 shared A–G bank；DB 不能独立重建七选五 |
| raw extras producer | `scripts/import-pipeline/attach-paper-assets-extras.mjs:1-77` | listening/figures 复制到 latest 和 versions | publish transaction 外的 post-step；可产生 core 已发布但 extras 缺失 |
| API detail projection | `server/api.mjs:1652-1721,1724-1829` | asset+DB → QuestionGroupDetail | 七选五最早 wrong layer；writingTask 只投 taskType+starters，丢 instruction/material/applicationGiven |
| PaperBrowse loader | `PaperBrowsePage.tsx:492-540,1782-1840` | 直接读取 asset blocks、按题型 adapter | 只显式理解部分 block；notice/example/range/answerBox 是 placeholder |
| reading Screen | `paperAssetSurfaceAdapter.ts:187-298,560-624` | paragraphs/questions/options/figures → PaperSurface | 直接 asset；figure 是 paragraph whole-unit substitution |
| seven Screen | `sevenChoicesSurfaceAdapter.ts:179-224` | empty question list + one optionBank | 当前唯一严格保持 shared-bank 语义的消费面 |
| cloze Screen | `clozePaperViewAdapter.ts:42-135` | on-the-fly canonical/legacy surface data | 语义可 canonical；options layout 仍由通用 flex 破坏对齐 |
| PaperSurface | `PaperSurface.tsx:118-315,720-839`；`PaperSurface.css:419-490` | paragraph、blank、question options、bank | A–D 固定 2-column/inline flex；A–G one-column；无 whole-set selector |
| figure resolver | `shared/figures/resolveFigureMarker.mjs:1-49` | marker → image/placeholder | whole paragraph replacement；marker 后同 unit 的 flattened text 会被隐藏，表格双存迁移需谨慎 |
| Print/PDF | `server/exports/exportImplementation.mjs:227-260`；`server/print-renderer.mjs:320-540,737-762` | detail + draft blocks → HTML → Vivliostyle PDF | 当前 Seven repeated-bank、cloze misalignment；shortness 用 char-count≤20，不是 measured fit |
| DOCX | `server/exports/docxRenderer.mjs:370-434,971-1037,1040-1180` | detail → OOXML/PDF-via-LibreOffice | cloze space-join；reading 只 2×2/1c；七选五在 exam path 重复 bank |
| figures in export | `server/figures/paperFigures.mjs:35-76`；`docxRenderer.mjs:856-925` | per-group directory scan、PNG embed/placeholder | manifest缺尺寸/hash；每次按 group 扫全资产目录 |

## Migration hazards / gates for later tickets

1. **不要从 DB 回编 canonical seven**：publisher 不给 questions 写 group bank；API 为补 UI 方便而复制 bank 的 fallback 正是当前 semantic corruption。
2. **先声明两类 plan 身份**：source paper 的原题号/分值与 Draft Paper 连续重编号是两种合法 plan；不能让 draft renderer 的 display number 回写 canonical source identity。
3. **profile 必须显式、版本化且来源可审计**：现在由 cloze count + reading count 推断；未知组合 throw 是好门禁，但结果没有 artifact。
4. **`layoutTree`/`content.blocks` 需单 owner**：现状 builder 双写，schema 没证明两者一致（`paper-asset-v1.schema.json:24-49`）。
5. **历史缺口不能被 migration“修成新卷”**：9 套 national legacy 无写作是已接受 profile 差异；6 套 Zhejiang legacy Reading A–C 也不是缺 D。
6. **marker 清洗需 provenance**：`960d0f8d` 的 `NN._____`、18 套 seven 杂散数字、mixed parentheses 等不能静默正则覆盖；变换应进入 Normalization Report，歧义进 `needs_review`。
7. **A–D layout 是 renderer-only**：不写入 Canonical Question Group。三个 renderer 必须共享同一 measured selector 和 mode decision；当前 char-count、CSS auto-flow、空格 join 都应退休。
8. **真实 overflow fixture 不存在**：后续 prototype 必须明确这是合成边界 proof，而不是 corpus proof。
9. **figure/table 不能继续只靠 screenshot marker**：唯一 manifest 缺 pixel dimensions/hash；canonical table 应保 row/column 语义，figure 应保 immutable asset identity。当前 whole-unit marker replacement 可能隐藏 marker 后的 flattened text。
10. **listening 保持 raw/inactive**：schema 虽允许 listening group（`paperAsset.ts:143-154`），现状没有任何 active group；迁移只建立 plan slot/raw reference，不开启 Screen/DB。
11. **版本文件/DB 漂移要 fail closed**：DB `version_dir` 指向已不存在的 `versions/vN`；migration 应以 actual latest bytes + sha 为输入，不以 record path 假定文件存在。
12. **extras 是非事务 post-step**：canonical publish gate 若要求 listening/figures，必须把 post-copy 完整性纳入同一可观察零写/回滚边界。
13. **config/latest 不是同一集合**：不要用 config 目录枚举 migration corpus；以 actual latest 为 migration 输入，同时把 `paper-2020-yi` config-only 与 `paper-960d0f8d` asset-only 记录为 provenance review。
14. **现有 green gates 不足以证明 semantic boundaries**：`verify-paper-assets-consistency` 199/199、`verify-paper-asset-v1` 3182/3182 全绿，但仍容纳 49 个 heading suffix 和 95 个 seven ordinal。新 gate 应在 source slice / normalization report 层检查。
15. **canonical compatibility allowlist 不是 migration coverage**：Screen/Print 目前仅开放 `paper-2026-i` cloze/grammar 和 `paper-960d0f8d` grammar 三组（`canonicalPaperGroupSurfaceAdapter.mjs:5-9`；`print-canonical-group-adapter.mjs:14-18`），其余 latest 走 legacy。

## 可复现命令

以下命令从 worktree root 运行；都只读。它们不会打印 passages/options/answers。

### 资产、版本、marker、raw extras

```bash
find app/public/paper-assets -mindepth 2 -maxdepth 2 -type d -name latest | sort | wc -l
find app/public/paper-assets -type d -path '*/versions/v*' | wc -l
find app/public/paper-assets -type f -name 'paper-normalized-groups-v1.json' | wc -l
comm -3 \
  <(find app/public/paper-assets -mindepth 2 -maxdepth 2 -type d -name latest -print | sed -E 's#.*/([^/]+)/latest#\1#' | sort) \
  <(find scripts/import-pipeline/papers -mindepth 2 -maxdepth 2 -name config.json -print | sed -E 's#.*/([^/]+)/config.json#\1#' | sort)
sqlite3 -header -column data/question-bank.sqlite \
  "select count(*) rows,count(distinct paper_id) papers,min(asset_version) min_v,max(asset_version) max_v from paper_asset_versions;
   select paper_id,max(asset_version) db_v,count(*) records from paper_asset_versions group by paper_id order by paper_id;"
rg -l '\[表[:：]' app/public/paper-assets/*/latest/paper-asset.json
jq '{schemaVersion,figures:[.figures[]|{figureId,file,kind,sourcePage,pixelWidth,pixelHeight,sha256,placeholderMarker}]}' \
  app/public/paper-assets/paper-2026-i/latest/figures/manifest.json
node scripts/verify-paper-assets-consistency.mjs
node scripts/verify-paper-asset-v1.mjs
# Expected current reproducibility failure: committed config exists but groups.json does not.
node scripts/import-pipeline/verify-publish-gate.mjs paper-2026-i
```

### Seven projection / Print / DOCX failure

```bash
node --input-type=module <<'NODE'
import { getQuestionGroupDetail } from './server/api.mjs'
import { buildPrintHtml } from './server/print-renderer.mjs'
import { createDocxRenderer } from './server/exports/docxRenderer.mjs'
const gid = 'group-2026-i-seven-choices'
const detail = getQuestionGroupDetail(gid)
const input = {
  title: 'proof', versionType: 'student', printStyle: 'exam',
  items: [{ detail, score: detail.defaultScore }],
  blocks: [{ type: 'question_group', questionGroupId: gid, score: detail.defaultScore }],
  questionNumberStart: 36,
}
const html = buildPrintHtml(input)
const { buildDocumentXml } = createDocxRenderer({
  groupTypeLabels: { seven_choices: 'seven' },
  optionalString: (v) => String(v ?? '').trim(),
})
const xml = buildDocumentXml({ ...input, images: [] })
const count = (body, label) => (body.match(new RegExp(`${label}\\. `, 'g')) || []).length
console.log({
  optionCounts: detail.questions.map((q) => q.options.length),
  html: Object.fromEntries('ABCDEFG'.split('').map((x) => [x, count(html, x)])),
  docx: Object.fromEntries('ABCDEFG'.split('').map((x) => [x, count(xml, x)])),
})
NODE
```

### 全 1035 set 的 per-set width、mode 与 digest

从 `app/` 运行（使用已安装 Playwright）：

```bash
node --input-type=module <<'NODE'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { chromium } from 'playwright'
const root = '../app/public/paper-assets'
const paperIds = fs.readdirSync(root)
  .filter((id) => fs.existsSync(path.join(root, id, 'latest/paper-asset.json')))
  .sort()
const sets = []
for (const paperId of paperIds) {
  const asset = JSON.parse(fs.readFileSync(path.join(root, paperId, 'latest/paper-asset.json')))
  for (const q of Object.values(asset.content.questions)) {
    if (q.options?.length === 4 && q.options.map((o) => o.label).join('') === 'ABCD') {
      sets.push({
        paperId, questionId: q.questionId,
        strings: q.options.map((o) => `${o.label}. ${o.text}`),
      })
    }
  }
}
const browser = await chromium.launch()
const page = await browser.newPage()
const measured = await page.evaluate((input) => {
  const ctx = document.createElement('canvas').getContext('2d')
  ctx.font = '14px "Times New Roman", Times, "SimSun", "Songti SC", "STSong", serif'
  return input.map((x) => ({
    ...x,
    widths: x.strings.map((s) => Number(ctx.measureText(s).width.toFixed(1))),
  }))
}, sets)
await browser.close()
for (const x of measured) {
  const [a,b,c,d] = x.widths
  x.required4 = Number((a+b+c+d+84).toFixed(1))
  x.required2 = Number((Math.max(a+b,c+d)+28).toFixed(1))
  x.required1 = Math.max(a,b,c,d)
  x.mode = x.required4 <= 584 ? '4c'
    : x.required2 <= 584 ? '2x2'
    : x.required1 <= 584 ? '1c' : 'overflow'
  delete x.strings
}
for (const paperId of paperIds) {
  const rows = measured.filter((x) => x.paperId === paperId)
  const stable = rows.map((x) =>
    `${x.questionId}:${x.widths.join('/')}:${x.required4}/${x.required2}/${x.required1}:${x.mode}`
  ).join(';')
  console.log(paperId, rows.length,
    Object.fromEntries(['4c','2x2','1c','overflow'].map((m) => [m, rows.filter((x) => x.mode === m).length])),
    crypto.createHash('sha256').update(stable).digest('hex').slice(0,16))
  // For a full per-set diagnostic without text, uncomment:
  // rows.forEach(({questionId,widths,required4,required2,required1,mode}) =>
  //   console.log({questionId,widths,required4,required2,required1,mode}))
}
NODE
```

### Cloze geometric proof

```bash
cd app
node --input-type=module <<'NODE'
import { chromium } from 'playwright'
const file = new URL('../docs/cuts/draft-numbering-style/qa/v2-draft-student-print.html', import.meta.url).href
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 612, height: 900 } })
await page.goto(file)
const rows = await page.locator('.question-group').evaluateAll((groups) => {
  const cloze = groups.find((group) =>
    group.querySelector('.print-blank--short') && group.querySelector('.options-inline'))
  return [...cloze.querySelectorAll('.options-inline')].map((row) =>
    [...row.querySelectorAll('span')].map((x) =>
      Number(x.getBoundingClientRect().x.toFixed(1))))
})
console.log({
  rows: rows.length,
  spreads: [0,1,2,3].map((i) => {
    const xs = rows.map((r) => r[i])
    return Number((Math.max(...xs)-Math.min(...xs)).toFixed(1))
  }),
})
await browser.close()
NODE
```

## Evidence boundary

- 已完成：33/33 latest census；profile structural reclassification；producer/consumer trace；config/latest 与 DB/latest/version divergence；table/figure/listening raw inventory；1035/1035 A–D deterministic measured capture；真实 Seven Print/DOCX reproduction；真实 cloze HTML geometry proof；现有两套 asset gates。
- Gate 结果：`node scripts/verify-paper-assets-consistency.mjs` = 199 pass；`node scripts/verify-paper-asset-v1.mjs` = 3182 pass / 0 fail。`node scripts/import-pipeline/verify-publish-gate.mjs paper-2026-i` 因 committed config 对应的 `scripts/import-pipeline/papers/paper-2026-i/groups.json` 不存在而 ENOENT；这是 fresh-worktree 可复现性/provenance hazard，不是 latest asset validation failure。
- 无法从当前 fixed point 完成：纯“per-blank A–D only”的 Seven failure（当前真实输出是 per-blank A–G）；真实 full-width-overflow A–D proof（corpus 为 0）；源文件视觉金标对照（票面未提供 NEEA PDF，且本票不应复制源卷）。这些必须在后续 ticket 以新证据或合成边界 fixture 明示，不能由本 census 猜造。
