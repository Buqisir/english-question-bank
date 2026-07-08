# 导题数据健康度全量普查（2026-07-08）

READ-ONLY 普查。范围：`app/public/paper-assets/*/latest/paper-asset.json` 全部
33 套（跳过 `paper-2024-jslk-english` 测试夹具），交叉核对
`data/question-bank.sqlite`（`sources` / `paper_asset_versions`）。未修改任何
仓库文件、DB 行、或 paper asset。脚本：会话 scratchpad
`data-health-sweep.mjs`（产出 `sweep-results.json`，本报告基于其结果人工复核
撰写）。

## 结论先行（最值得看的三条）

1. **七选五空号后混入杂散数字「1-5」**——33 套里 **18 套**中招（几乎覆盖
   2021-2025 全部新课标卷 + 部分浙江卷），每套通常 5 个空全中。形如
   `__37__ 2 \xa0Focus on spending...`——空号标记后紧跟一个 1-5 的杂散数字，
   与该空在七选五小节内的局部序号重合，明显是原文档「① Pick the most
   important」式列表编号残留、导入时未清干净。**这是本次普查里波及面最大
   的毛边**，建议优先批量修。
2. **甲/乙/丙卷（2020-2024，共 9 套）整个写作部分（应用文+读后续写）
   在 asset 和 DB 里都完全缺失**——不是解析漏字，是这 9 套压根没导写作
   小节。这是范围缺口，不是脏数据，但会让这 9 套卷子在"整卷预览/导出"
   时写作部分是空的。
3. **七选五 A-G 候选句现状：33/33 全齐**——cut-note 记录的 `paper-2026-i`
   候选句缺失（render-fidelity 收官时立的账）已经在同批清洗中修复，本次
   普查未复现。旧账可以核销。

---

## 一、按检查项的总表

| # | 检查项 | 结论 | 受影响套数 |
|---|---|---|---|
| 1 | 挖空格式一致性 | 32/33 纯 `__NN__` 新格式；1 套（960d0f8d）语法填空用旧格式与本卷七选五/完形的新格式混用 | 1 |
| 2 | 七选五 A-G 候选句 | 33/33 全齐（`optionBank` 均 7 条 A-G） | 0 |
| 3 | 写作脚手架 | 9 套整节缺失 + 4 套应用文无 Dear/Yours + 2 套 Dear 被并段 + 2 套续写开头语出现重复前缀 + 1 套续写开头语整体缺失 | 17（去重后） |
| 4 | 题号连续性 | 33/33 无缺号/重号/非数字 | 0 |
| 5 | 答案完整性 | 33/33 题目-答案一一对应，无空答案 | 0 |
| 6 | 语法填空提示词覆盖 | 多数套 6-7/10 有提示词（正常，功能词无提示属预期）；2 套异常 0/10 | 2 |
| 7 | 破折号/字符毛边 | 见下节，含全库最大发现（杂散数字） | 18（杂散数字）+ 4（其他字符毛边） |
| 8 | blocks 完整性 | 33/33 `content.blocks` 与 `content.groups` 双向引用一致，无孤儿 | 0 |
| DB | source_type / asset 对齐 | 33/33 本地目录与 `paper_asset_versions` 一一对应；`sources` 前缀无孤儿；每套 source_type 内部一致（32 套 real_exam，960d0f8d mock_exam，符合预期） | 0 |

额外发现（不在原 checklist，但普查中顺手抓到）：**4 套 paper.title 是占位符**
（`paper-2026-i` 标题字面量是 `"paper"`；`paper-zj-2024-jan`/
`zj-2025-jan`/`zj-2026-jan` 标题字面量是 `"source"`），不影响解析/渲染但
影响列表页可读性。

---

## 二、逐项详情

### 1. 挖空格式（__NN__ / NN._____ / 双空格 / 无标记）

- **32/33 套**：`cloze` / `sevenChoices` / `grammarFill` 全部小节统一用
  `__NN__` 双下划线新格式（如 `__36__`、`__56__`）。
- **`paper-960d0f8d`（唯一混用）**：
  - `seven-choices`、`cloze` 两节：新格式 `__36__` / `__41__`。
  - `grammar-fill` 一节：**旧格式** `NN._____`，样例：
    `"Eating more fibre, 56._____ fibremaxxing, may be the hottest new
    dietary trend of 2026."`，10 个空全部是这个旧格式，无一处新格式。
  - 判断：同一套卷内两种格式并存，是本卷独有的一致性问题（其余 32 套
    均已统一为新格式）。
- 双空格形式（`  NN  `，无下划线）作为独立"空号标记"未在任何套中出现
  （即没有卷子用纯空格当空号标记）；但见下文「字符毛边」一节——`\xa0`
  非断行空格在几乎所有卷子的七选五段落里广泛存在，属于另一类问题，
  不是空号标记本身的问题。
- 未发现"完全无可辨识标记"的挖空组（即所有该挖空的组都能找到至少一种
  标记形式）。

### 2. 七选五 A-G 候选句

33/33 套的 `sevenChoices` 组 `optionBank` 字段均为 7 条、标签齐 A-G。抽查
`paper-2026-i`：

```
"optionBank": [
  {"label": "A", "text": "This capability allows for timely restoration."},
  ...
  {"label": "G", "text": "AI is changing this by using image recognition technology to analyze exhibits."}
]
```

cut-note.md（render-fidelity 收官记录）记载的"`paper-2026-i` 数据缺口——
候选句无处可寻"在本次普查中**未复现**，`content.blanks` 虽仍只存语法填空
提示词，但候选句实际存在于 `content.groups[groupId].optionBank`（组级字段），
而非 `blanks`。结合 STATUS.md 记载"960d0f8d 段首语双前缀、七选五 A-G
缺失同批清洗"，判断该账已在 2026-07-08 当晚随 paper-browse-polish
（PR #281）批量清洗修复。**建议核销该笔旧账**，不需要再补数据。

### 3. 写作脚手架

**(a) 9 套甲/乙/丙卷整个写作部分（应用文+读后续写）完全缺失**（asset 与
DB 两侧都没有对应的 `writing-application` / `writing-continuation` group
或 source）：

`paper-2020-bing`、`paper-2020-jia`、`paper-2021-jia`、`paper-2021-yi`、
`paper-2022-jia`、`paper-2022-yi`、`paper-2023-jia`、`paper-2023-yi`、
`paper-2024-jia`。

这 9 套 `content.groups` 里只有 reading/sevenChoices/cloze/grammarFill 四类
组，DB `sources` 表里对应 source_id 前缀也没有 `-writing-application` /
`-writing-continuation` 行。两侧一致——判断是**导入时的范围缺口**（甲/乙/
丙卷当时可能刻意只导了阅读+语言运用），不是解析丢字。

**(b) 4 套应用文任务是"写信/写邮件"体裁，但 Dear/Yours 整段脚手架完全
不存在**（不是被吞了，是从来没进过 asset）：

`paper-zj-2020-jan`（"请给你的英国朋友George写封邮件"）、
`paper-zj-2020-jul`（"请给他写一封电子邮件"）、
`paper-zj-2022-jan`（"请你给他写一封邮件"）、
`paper-zj-2022-jun`（"请你给...写邮件"）——四套的 `passage.paragraphs`
只有任务说明段落，完全没有 `Dear X, / ... / Yours, Li Hua` 的信件模板段落。

**(c) 2 套 Dear 脚手架存在，但被错误拼接进上一段（缺段落分隔）**：

`paper-2022-i`、`paper-2022-ii` 的应用文倒数第二段是：

```
"（2）可适当增加细节，以使行文连贯。Dear Caroline,"
```

"Dear Caroline," 直接粘在说明文字末尾，没有独立成段；末段
`"Yours sincerely, Li Hua"` 也是称谓+签名合并成一段（对比 2024/2025 年
标准做法：`Yours,` 和 `Li Hua` 各自独立成段）。判断是 docx 分段解析时
漏掉了一次段落换行。

**(d) 双重 "Paragraph N: Paragraph N:" 前缀**（续写开头语被写了两遍）：

- `paper-960d0f8d`：
  `"Paragraph 1: Paragraph 1: What Skimmy had said made a lot of sense.\n\nParagraph 2: Paragraph 2: The next Saturday, I stepped onto the court with a different plan"`
- `paper-zj-2021-jun`：
  `"Paragraph 1: When I brought my paycheck home, it was 199—my dad wanted to talk to me.\n\nParagraph 2: Paragraph 2:"`（第二段开头语正文本身还缺失，只剩重复前缀）

**(e) 续写开头语整体缺失（不是重复，是压根没有）**：

`paper-zj-2020-jul` 的 `writing-continuation` 组有完整的续写材料（8 段故事
正文），但 `content.blocks` 里没有任何 `"Paragraph 1: ... Paragraph 2:
..."` 的 instruction block——全篇搜索确认不存在。同一套卷的应用文任务
也是 (b) 里提到的"体裁是邮件但无 Dear/Yours"案例，两个写作任务的脚手架
都缺，这套卷子的写作数据质量在 33 套里最差。

**排除的假阳性**（体裁本身不是书信，不需要 Dear/Yours，检出但非真问题）：
`paper-2020-i`/`2020-ii`（报道体）、`paper-2021-i`/`2021-ii`（短文体）、
`paper-2026-i`（投稿短文体）、`paper-zj-2021-jan`/`zj-2025-jan`（发言稿体）、
`paper-zj-2021-jun`（宣传稿体）、`paper-zj-2023-jan`（报道体）、
`paper-zj-2024-jan`/`zj-2026-jan`（短文体）——这些本来就不该有 Dear/Yours，
不计入问题数。

### 4. 题号连续性

33/33 套 `content.questions` 的 `questionNo` 序列连续、无重复、全为数字。
无发现。

### 5. 答案完整性

33/33 套 `answerKey.answers` 与 `content.questions` 一一对应，无缺失键、
无空字符串答案、无多余答案键。无发现。

### 6. 语法填空提示词覆盖

多数套的分布是 6/10 或 7/10 有 `prompt` 字段（3-4 个空是功能词——冠词/
介词/连词等——本就不需要提示词，属预期设计，不是缺陷）。两个异常：

- **`paper-2020-ii`：0/10**——全部 10 个语法填空空都没有 `prompt` 字段，
  但passage 原文里明明嵌了提示词，只是括号是**全角/半角混用**：
  `"__56__（begin) computer classes"`（左括号 `（` 全角，右括号 `)` 半角）。
  结构化 `blanks[].prompt` 完全没提取出这批提示词——原文有数据，结构化
  字段是空的，是一次真实的抽取遗漏。
- **`paper-960d0f8d`：0/10**——与检查项1 呼应，该卷语法填空用旧格式
  `NN._____(word)`，`blanks[].prompt` 同样全空，提示词只活在未结构化的
  passage 文本里。

### 7. 破折号 / 字符毛边

**(a) 全库最大发现：七选五空号标记后混入杂散数字「1-5」**，波及 18 套：

`paper-2021-ii`、`paper-2021-jia`、`paper-2021-yi`、`paper-2022-i`、
`paper-2022-ii`、`paper-2022-jia`、`paper-2022-yi`、`paper-2023-i`、
`paper-2023-jia`、`paper-2023-yi`、`paper-2024-ii`、`paper-2024-jia`、
`paper-2025-ii`、`paper-zj-2021-jan`、`paper-zj-2021-jun`、
`paper-zj-2022-jan`、`paper-zj-2022-jun`、`paper-zj-2023-jan`、
`paper-zj-2024-jan`——每套通常整节 5 个空全中。样例（`paper-2021-jia`）：

```
"•\xa0Invite 5-10 people so you have a nice selection. __37__ 2 \xa0, and there may not be enough..."
"•\xa0__38__ 3 \xa0. They should also prepare plenty of reusable bags..."
```

数字 `2`、`3` 紧跟在空号标记 `__37__`/`__38__` 之后，与该空在七选五
小节内的局部顺序（1-5）吻合，明显是原文档"①②③④⑤"式列表编号在导入
时没被清除干净、残留成了裸数字。**不影响候选句 optionBank 本身**（A-G
选项文本是干净的），但会污染屏幕/打印渲染出的正文（题号旁边多出一个
杂散数字）。

未受影响的对照组（无此问题）：`2020` 全系列（bing/i/ii/jia）、
`2021-i`、`2023-ii`、`2024-i`、`2025-i`、`960d0f8d`、`zj-2020-jan`、
`zj-2020-jul`、`zj-2025-jan`、`zj-2026-jan`。

**(b) `--` 双连字符当破折号**（已知 `paper-2026-i` 案例之外还有一套）：

- `paper-2026-i`：`"and arrive together--spaces cannot be sav..."`、
  `"...ghtened and inspired--than the control gro..."`（2 处）。
- `paper-zj-2023-jan`：`"a summer camp for kids aged 5 -- 13."`、
  `"Monday -- Friday, July 8 -- 2..."`、`"Week 1 | July 8 -- 12"`（3 处，
  且是 `空格--空格` 变体）。

**(c) ` - ` 单连字符当破折号**：

- `paper-zj-2021-jan`：`"saw in front of him - so he got on."`、
  `"a little planning - running shoes by the..."`（2 处）。

**(d) 全角/半角括号混用**（与检查项6 (a) 同源）：

- `paper-2020-ii`：7 处 `（word)` 形式（左全角右半角），已在检查6详述。

**(e) `\xa0`（非断行空格）广泛存在**：几乎每一套卷子的七选五/部分阅读、
语法填空段落里都能找到 `\xa0`，多数情况下渲染为普通空格、单独看不算
"坏字符"，但它是 (a) 杂散数字问题的载体（数字前后经常跟着 `\xa0` 而非
普通空格），值得在批量清洗杂散数字时一并处理，不建议单独立项。

**未发现**：替换字符 `�`（mojibake 指示符）——全库 0 处。

### 8. blocks 完整性

33/33 套 `content.blocks` 均非空，且所有 `{"type":"group","groupId":...}`
block 的 groupId 都能在 `content.groups` 里找到对应项，反向也成立
（`content.groups` 里没有"孤儿组"未被任何 block 引用）。无发现。

### DB 交叉核对

- `data/question-bank.sqlite` 的 `paper_asset_versions` 表恰好 33 条
  `paper_id`，与本地 33 个非 jslk 目录一一对应，无孤儿、无缺失。
- `sources` 表按 `paper_id` 前缀分组后同样与 33 个本地目录一一对应，无
  DB 侧多出的孤儿前缀，无本地资产缺 DB 记录的情况。
- 每套卷 `source_type` 内部一致（同一套的 reading-a/b/c/d、
  seven-choices、cloze、grammar-fill 等各 source 行 `source_type` 相同）：
  32 套 `real_exam`，`paper-960d0f8d` 为 `mock_exam`（该卷是重庆巴蜀中学
  月考卷，标记 mock_exam 符合预期，非异常）。

---

## 三、修复批次建议（仅归类，不展开动手方案）

1. **纯数据回填/批处理脚本**（无需人工判断，可脚本批量修）：
   - 七选五杂散数字清洗（18 套，检查7a）——规则明确：空号标记后紧跟的
     单个 1-5 数字（含前后 `\xa0`）系冗余，可用位置规则批量剥离，剥离后
     建议抽样 3-5 套人工复核再全量跑。
   - `paper-2026-i`/`paper-zj-2023-jan`/`paper-zj-2021-jan` 破折号归一
     （`--`/` -- `/` - ` → 标准 em dash，检查7b/7c）。
   - `paper-2020-ii` 全角/半角括号归一 + 语法填空提示词重新抽取
     （检查6a，7d 同源，建议一次处理）。
   - `paper-960d0f8d` 语法填空旧格式 `NN._____` → 新格式 `__NN__`
     统一改写，并回填 `blanks[].prompt`（检查1、6b 同源）。
   - `paper-2022-i`/`paper-2022-ii` "Dear Caroline," 段落拆分（检查3c）。
   - `paper-960d0f8d`/`paper-zj-2021-jun` 双重 "Paragraph N:" 前缀去重
     （检查3d）。
   - 4 套占位符标题（`paper-2026-i`="paper"、`zj-2024/2025/2026-jan`=
     "source"）改回真实标题——额外发现，非 checklist 项但顺手可修。

2. **需要重新导入（原始 docx/pdf 缺该段数据，脚本补不出来）**：
   - `paper-zj-2020-jan`/`zj-2020-jul`/`zj-2022-jan`/`zj-2022-jun` 应用文
     Dear/Yours 整段脚手架缺失（检查3b）——需要回源文件确认原卷有没有
     这段模板，若有则重新导入补齐。
   - `paper-zj-2020-jul` 续写开头语整体缺失（检查3e）——同样需回源确认。

3. **需要 owner 判断的范围决策**（不是"错"，是"要不要补"）：
   - 9 套甲/乙/丙卷（2020-2024）整个写作部分缺失（检查3a）——是否要
     补导这 9 套的写作小节，取决于这些卷子在产品里的定位（练习卷 vs
     仅阅读语用训练），建议 owner 拍板要不要立刀补。

---

*本报告由 READ-ONLY 普查脚本 + 人工复核生成，未修改任何 asset/DB/仓库
文件（除本报告本身）。*
