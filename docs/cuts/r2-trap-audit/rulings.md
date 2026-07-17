# R2 干扰项判例集 — trap 标签边界（词钩 vs 无中生有等）owner 裁决

Campaign: analysis-fields R2 干扰项（第二段判例，2026-07-16 当场收）
Date started: 2026-07-16
机审规模: 1395 条；`scripts/trap-audit-scan.mjs`（判据 `trap-audit-lib.mjs`）
抽检基线: 21 条分层盲审（2026-07-10，`trap-sample.json`）
边界规则版本: v1

判例裁决制分工（AGENTS.md）：小川机审全量、挑边界例、执行返修；owner
只裁边界判例。本批 8 条摘牌项 owner 全部落判（审卷页
`ruling-card.html`，裁决已就地标注）。

## 核心判例：词钩（sourceLexicalTrap）的 owner 定义

> 「我对词钩的定义更像是：**选项的词句在原文有原词或者同义替换，但是
> 这选项是错误的。这里我说的是词句，不是整体意思。**」（owner 原话，
> 2026-07-16）

经 #4/#5 两条追裁磨准：「词句有原词或同义替换」**含近场景词联想**
（dinner → cook 算）**与句式复现**（原文 *too big, too bright* →
选项 *too fast* 算）。判定层面是词句/句式，不是整体语义。

## 判例

### CL-1 词面无钩的错误释义 = 无中生有维持

- 样本: 2022甲 q028-D *Stick to a promise.*（题干问 *take the plunge*
  释义）；2024-II q032-A *If read by someone poorly educated.*
  （题干问 *wrong hands* 释义）
- 机判: labelExplanationContradiction 命中（解释含引号英文）
- owner 裁决: **维持 unsupportedClaim，回牌**
- 理由: 选项自身词句（promise / poorly educated）在原文无原词无同义
  替换；解释引原文短语是合法的对比论证，不构成词钩证据
- 边界规则: 解释引用原文词句 ≠ 选项借用原文词句；判词钩只看**选项**
  的词句与原文的对应
- 适用范围: 全部 trap 标签判定；机审启发式（引号英文钩）由此降级为
  「需裁候选」而非「实锤」

### CL-2 选项词句与原文有原词复现 = 改判词钩

- 样本: 2023乙 q024-D *By creating settings in the **corn** fields.*
  （原文 *corn state*）
- 机判: 同上命中
- owner 裁决: **改判 sourceLexicalTrap**
- 理由: corn 原词在原文复现，选项错误——正中词钩定义
- 边界规则: 选项词句与原文共享原词（实义词）且选项错 → 词钩
- 适用范围: 同上

### CL-3 近场景词联想算词句替换 = 改判词钩

- 样本: 2025-II q032-D *He helped to **cook** at home.*（原文
  *dinner time*）
- 机判: 同上命中
- owner 裁决: **改判 sourceLexicalTrap**（owner：「第四，我觉得是词钩」）
- 理由: dinner → cook 属近场景词的词句级联想钩
- 边界规则: 同场景高频伴随词（dinner/cook 类）视同同义替换
- 适用范围: 词钩判定；注意与「整体意思引申」区分——仍须落在具体词句上

### CL-4 句式复现算词句钩 = 改判词钩

- 样本: 960d0f8d q026-C *It runs the risk of expanding **too** fast.*
  （原文 *too big, too bright*）
- 机判: 同上命中
- owner 裁决: **改判 sourceLexicalTrap**（owner：「第五，我觉得也算是」）
- 理由: too ___ 程度句式在原文复现，学生被句式面钩住
- 边界规则: 句式/结构复现视同词句钩（词句 = 词 + 句式）
- 适用范围: 同上

### CL-5 特征安错主体 = 张冠李戴

- 样本: 浙江20-1月 q021-C *Humorous.*（幽默情节属「母亲」，选项安给
  Mrs. Calloway）
- 机判: 同上命中（现标签 unsupportedClaim）
- owner 裁决: **改判 entityMismatch**
- 理由: 原文确有幽默，但属另一实体——不是无据，是错主体
- 边界规则: 原文存在选项所述特征、但归属主体不同 → entityMismatch，
  不入无中生有
- 适用范围: 人物/机构/事物特征类选项

### CL-6 引号命中选项自身文本 = 机审假阳

- 样本: 浙江20-7月 q029-D（解释引 *introducing a concept* 即选项文本）
- 机判: 命中（假阳，CR 实证）
- owner 裁决: **维持 unsupportedClaim，回牌**
- 理由: 解释引选项文本以说明其无据，标签本就贴对
- 边界规则: 机审引号钩必须排除「引文 = 选项自身文本」的命中
- 适用范围: `labelExplanationContradiction` 判据实现

### CL-7 时序/步骤颠倒无专类 = 归无中生有，不动词表

- 样本: 2023-I q025-B *To build an ecosystem.*（原文先成生态系统后加
  污泥；选项把既成步骤当目的）；现标签野类型 `timeOrderReversal`
- 机判: rogueType 命中（词表外，全库仅 1 条）
- owner 裁决: **改判 unsupportedClaim；`timeOrderReversal` 不转正**
- 理由: 量=1 不值得动 schema；「原文不支持该目的声称」归无中生有可讲通
- 边界规则: 野类型出现先看量；单例改判入现有最近类，不扩词表
- 适用范围: schema 词表治理

## 规则汇总（机审配置的直接输入）

- R1 判词钩只看**选项**词句与原文的对应；解释引用原文 ≠ 选项借用原文
  （源: CL-1）
- R2 选项与原文共享实义原词且选项错 → sourceLexicalTrap（源: CL-2）
- R3 近场景伴随词联想视同同义替换（源: CL-3）
- R4 句式/结构复现视同词句钩（源: CL-4）
- R5 特征真、主体错 → entityMismatch（源: CL-5）
- R6 引号钩排除引文=选项自身文本（源: CL-6）
- R7 野类型单例改判入最近现有类，不扩词表（源: CL-7）

## 本批处置清单（8/8 落判）

| 项 | 处置 |
|---|---|
| 2022甲 q028-D、2024-II q032-A、浙江20-7月 q029-D | 回牌（撤 suspension，标签维持） |
| 2023乙 q024-D、2025-II q032-D、960d0f8d q026-C | 改判 sourceLexicalTrap（按其子 schema 重铸 trap 对象）＋撤 suspension |
| 浙江20-1月 q021-C | 改判 entityMismatch（重铸）＋撤 suspension |
| 2023-I q025-B | 改判 unsupportedClaim（重铸，解释不得引英文引号以免再触发启发式）＋撤 suspension |

第二段战役规模裁定（owner，2026-07-16）：机审真数不支持全量重分类
战役——本批 8 条落判即第二段收官；剩余懒人桶留日常讲评撞到再报。
