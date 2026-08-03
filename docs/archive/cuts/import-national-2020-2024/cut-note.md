# Cut Note: import-national-2020-2024 — 全国甲/乙/丙卷导入

Status: **DONE (9/10 入库)**, 2026-06-19. 分支 `import-national-2020-2024`。

## 成果

全国老卷格式(甲/乙/丙)首次支持,只导 reading A-D / 七选五 / 完形 / 语法 4 题型(写作=短文改错+普通作文,PO 决策不导)。

**入库 9 套**(每套 50 题 / 总分 85 = 阅读15×2 + 七选5×2 + 完形20×1.5 + 语法10×1.5,无写作):

| 年份 | 甲 | 乙 | 丙 |
|---|---|---|---|
| 2020 | ✅ | ⏸ 暂缓 | ✅ |
| 2021 | ✅ | ✅ | — |
| 2022 | ✅(slice1) | ✅ | — |
| 2023 | ✅ | ✅ | — |
| 2024 | ✅ | — | — |

全部 `status=published`,`verify-publish-gate` ok:true,7×9 解析 agent 全 `validate-one` PASS。

## 暂缓:paper-2020-yi(2020 全国乙卷)

源文件 `2020年全国乙卷-答案版.docx` 三重异常,**疑似错标或非标准源**,需 owner 判断:
1. 结构:`第一部分：阅读理解`(无听力 + 全角冒号)/ `第二部分 英语知识运用`(非"语言知识运用")——切卷器 Format B 识别器不匹配。
2. **分值**:阅读 第一节 满分37.5(=**2.5 分/题**),与其它 9 套(2 分/题)不同;阅读理解部分满分 50(其它 40)。2.5 分/题 + 短文改错 = 既不像老全国卷(2分)也不像新课标(2.5分但无改错)的杂交。
3. 总分对不上(37.5 + 七选五10 = 47.5 ≠ 标注的 50)。

→ 若 owner 确认它是真·2020乙卷且 reading=2.5,需给 nationalLegacy 加 readingScore 覆盖或单独 profile + 放宽 Format B 识别器(英语知识运用 / 第一部分阅读)。否则当错标源剔除。

## 关键工程决策(durable)

- **格式真值表**(`packageBuilder.resolveFormatProfile`):cloze 题数为主键 → 15/缺=新课标;cloze=20 再按 distinct 阅读字母数分流(4篇=全国 / 3篇=浙江老卷),未知格 throw。PA MF-1/MF-2:阅读篇数是唯一分流键,严禁用 continuation 是否存在(对全国与续写解析失败的新课标都为 null)。
- **六题型门 scoped supersession**(ADR-0007 决策2):`requireWritingFamilies` 开关,nationalLegacy=false;四题型硬门不变 + 反向断言(不导写作的格式却带写作组→throw)兜住半解析新课标。
- **语法题号动态接力**(`lib.mjs buildGrammar stdStart`):完形结束处+1 → 新课标/浙江=56,全国=61。byte-diff 22 套回归全 identical。
- **分值**:nationalLegacy readingScore=2 / sevenScore=2 / clozeScore=1.5;reading 分值从 DEFAULT_SCORE 提为 profile.readingScore(新课标/浙江=2.5 byte 兼容)。

## 验证

- byte-diff: 22 套已有卷 groups.json identical(向后兼容)。
- `verify-national-format.mjs`: 真值表 + throw 守卫 + MF-3 对称,13 项过。
- 9 套各 `verify-publish-gate` ok:true + 总分 85 复核。
- PA(pa.md)APPROVE + 3 MF 全落实;CR(cr.md)APPROVE 零 Must Fix(独立证向后兼容 + 双向误判兜底)。

## 复用 / 续作

- slice 2 = 本批量(已完成)。
- 管线现支持三格式(新课标15 / 浙江老卷20×3篇 / 全国老卷20×4篇),`gen-configs` 自动识别新课标+全国甲乙丙文件名。
- 可选 backfill:vp(动词维度)/ topic-label,走既有 driver。
