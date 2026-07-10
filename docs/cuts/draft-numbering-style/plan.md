# draft-numbering-style — 草稿卷小题号篇章内重计（owner QA round，2026-07-10）

- Cut size: **medium**（编号语义 + 文内空号渲染时重映射）；touches
  schema/data contract: **no**（数据零改动，纯渲染时换号）。
- 契约面：`server/print-renderer.mjs` + `server/exports/docxRenderer.mjs`
  （与 draft-depassage-letter 同面，该刀已收官，文件空闲）。DEV 开工时
  主代理 touch `.claude/contract-unlock`。PA-lite（同 draft-depassage
  降档理由：可逆展示、调用面已实证、无 schema；CR 复核）。
- 并行边界：ui-p1-shell / ui-p1-panels 两刀在飞，均不碰 server/**，
  零交集。

## Owner 拍板（v2，2026-07-10 owner QA 二轮改判——本节为最终形态）

一轮实现（组内 (1)(2) 重计）owner QA 证伪：空线上印「(1)」观感怪
（真卷空线号无括号），且组内重计=一张卷多个 (1) 变相撞号。三案
（A 保源号/B 全卷重排/C 组内重计）重议后 owner 定 **B**：

- **大题头：汉字「一、阅读理解（每题 2.5 分）」→ 二、三、四…**
  （汉字序号避免与小题阿拉伯号同型撞层级；中文试卷惯例；数字改
  汉字是对一轮「1、题型」形态的改判）。
- **小题号：阿拉伯 1. 2. … N，全卷连续，无括号**（回归 draft-
  depassage 现状形态）。
- **文内空号：重映射到与小题列表同一套全卷连续号，无括号**——
  重映射机制/硬断言全保留，只把映射目标从「组内序」改「全卷序」。
  这同时治好比本刀更老的病：文内源卷号(41)与列表连续号(7)从来
  对不上。
- A 案否决理由存档：跨卷混组（配相似本命场景）必撞源号。

一轮的（1）(2) 形态废弃。

## 连带硬需求：文内空号渲染时重映射（本刀核心难点）

小题列表改 (1)(2)… 后，完形（41-55）/语法填空（56-65）/七选五
（36-40）**文内烤死的空号必须同步换号**，否则学生无法把文中空与
题目列表对应。

- 机制：两渲染器的 blank 渲染路径（print `renderPassageLineWithBlanks`
  的 `paperBlankPattern` 捕获组 / docx 对应函数）已结构化捕获原号——
  按**组内出现顺序**建映射 `原号 → 组内序 (1..n)`，渲染时替换。
  显示形态与小题列表一致：`(n)`。
- 映射按「组内 blank 出现顺序」而非原号算术偏移（防原号有跳号/
  乱序的脏数据；顺序即真相）。
- 断言：同组内「文内空号序列」与「小题列表编号序列」一致（数量+
  顺序），不一致硬失败（宁可导出红也不出对不上的卷子）。
- 语法填空 `__NN__` 形态若 `paperBlankPattern` 不吃（STATUS 旧账
  「点空不着」提示其形状特殊），DEV 先实证该 pattern 对三题型真数据
  的捕获覆盖率；有洞先补 pattern 或如实上报，不许静默漏映射。

## 小题列表侧

- 计数器从「全卷连续」改「每 question_group 重置」，格式 `(n)`
  （半角括号+半角数字+空格后接题干/选项行）。
- 大题头维持 draft-depassage 形态：`n、题型（每题 N 分）`，n 全卷连续。
- 教师版答案/解析行随小题号走（同一循环内，自然一致；DEV 确认无
  别处引用旧连续号——如 answer-key 汇总段）。
- `questionNumberStart` 参数语义检查：小题改组内重计后该参数是否
  还有消费者（可能只剩大题头无关）；如已无意义，保留兼容不删，
  注释记录。

## Forbidden

- 数据侧零改动；papersurface/**（屏幕整卷页编号不在本刀）；
  draftPaperPreviewHtml.ts；App/concierge/harness（UI 两刀地盘）。
- 七选五 A-G 选项字母零触碰（只映射文内空号数字）。

## Verify / QA

- verify-print-renderer / verify-h5g-docx-renderer 断言更新：小题
  `(1)` 重计、文内空号与列表一致性断言（上述硬断言进 verify）、
  大题头回归断言保持。verify-figure-render 回归确认。
- verify:all 全绿。
- QA：同 draft-depassage 的五面（A4 预览/print/PDF/DOCX 学生/教师），
  实卷含 阅读+完形+语法+七选五：大题头 1-4、每大题小题 (1) 起计、
  **完形文中 (1)-(15) 与选项列表 (1)-(15) 逐空对得上**、七选五文中
  (1)-(5)、A-G 池原样。证据入 docs/cuts/draft-numbering-style/qa/。
- DEV 断点锚：`wip(draft-numbering-style): impl complete, pre-QA`。
