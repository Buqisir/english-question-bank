# OCR 逐页校对规则（public-paper-v1 扫描源）

本规则供 `ocr-proofread.mjs` 生成的逐页草稿使用。每个校对任务只负责分配给它的页：
打开页面图片逐行对照工作单，只编辑对应的草稿 JSON，不改其他文件，不运行导题命令。

## 草稿格式

```json
{
  "documentId": "question-source-1",
  "page": 4,
  "image": "/abs/page.png",
  "items": [
    { "lines": "L02-L06", "text": "确认后的原文" },
    { "lines": "L20", "text": "26. What does the underlined phrase “through the roof” in paragraph 4 mean?",
      "emphasis": [{ "text": "through the roof", "marks": ["bold", "underline"] }] }
  ],
  "furniture": ["L41", "w133-w139"]
}
```

- `items` 按原页阅读顺序排列，一个 item 就是一个源段落、标题、题干或选项组。
- `lines` 写一个或多个识别行：`"L03"`、`"L03-L06"`、`"L03,L05"`。一行需要拆给两个 item 时改用
  `words`（如 `"w120-w135"`，词号见工作单“逐词编号”）。
- `furniture` 放页脚页码、水印（行内“微信公众号IAI English”、页面大字“IAI English”）和扫描噪点。
  列入 furniture 的词会自动从 item 的行里剔除；草稿已预填页脚和水印候选，核对后保留或修改。
- 每个识别词必须且只能归属一次（某个 item 或 furniture）。`compile` 会列出遗漏或重复的词号。

## 文字（`text`）

忠实转写原页。不改源文本身的拼写或语法错误（后续“源文本预处理”阶段统一处理），
不解题、不补答案、不润色、不按题意猜字。

题卷（`question-source-*`）：

- 正文每个段落一个 item：跨行合并，英文行间一个空格，中文直接相连；行末连字符只有确属换行断词才去掉。
- 部分标题、节标题、答题说明各一个 item（跨行合并）。篇目标记 `A`、`B`、`C`、`D` 单独成 item；
  文章标题、小标题单独成 item。
- 工作单标注「粗体标题乱码，草稿已按卷面结构重建」的行，草稿已预填重建后的标题。照常对图核对序号、
  题数、分值和标点；无误时删掉预填的 `uncertain`，有误按原页改正。
- 每道题题干一个 item，以 `24. ` 开头（题号、半角句点、一个空格）。
- 阅读、完形和听力题：同一题的全部选项合成一个 item，写成 `A. … B. … C. … D. …`，选项间一个空格，
  即使原页分行或分栏。七选五的 A–G 选项每项单独一个 item。
- 完形、七选五、语法填空的空位写成 `__41__`；语法填空提示词照录，如 `__56__ (list)`。
- 写作题：任务说明、要点、“注意：”及各条、作文标题、给定开头语（`Paragraph 1: …`）各自成 item，保持原页顺序。

答案（`official-answers-*`）：

- 按印刷行逐行成 item，不合并段落。答案行照录，如 `1-5 ABCBC 6-10 ACCAB 11-15 BAACB 16-20 BACBA`。
- 听力原文的 `Text 1`、`M: …`、`W: …` 逐行保留；范文、评分说明也逐行保留。
- 不要手工合并听力原文的折行，也不要把下一轮话拼进上一行：`compile` 按版面把同页内同一轮话的折行
  自动合并成一段（下一行以 `M:`、`W:` 等说话人标签开头，或上一行没有排满本栏时，不合并）。
  说话人标签必须照原页写在行首，漏写会导致两轮话被合并。

标点与字符：

- 英文内容用半角 `? . , ! : ;`；引号和撇号按原页用弯引号 `’ “ ”`；破折号按原页（`—` 或 `–`）。
- 中文内容用全角 `，。：；（）、“”`，数字与汉字之间不加空格（`2026年4月`），题头 `绝密★启用前` 照录。
- 选项字母后是半角句点加一个空格：`A. Neighbors.`。

## 强调

原页正文或题干里真实的局部粗体或下划线，在 item 加
`"emphasis": [{"text": "through the roof", "marks": ["bold", "underline"]}]`。同一 item 出现多次时加
`"occurrence": 2`。不标题号、选项字母或整段标题。

## 图片与图表

未合并、未嵌套、无单元格强调的语义表格用独立文字 item 逐格转写，给每个 item 唯一的
`cell` 名称；不要标 `figure`。页面顶层 `semanticTables` 显式声明像素区域、行列和表头：
`[{"name":"scoring","region":{"x":100,"y":200,"width":600,"height":300},"rows":[{"header":true,"cells":[["r0c0"],["r0c1"]]},{"header":false,"cells":[["r1c0"],["r1c1"]]}]}]`。
`cells` 中是该格 item 的 `cell` 名称数组，按行再按列排列；所有表格 item 必须连续，
每个名称只出现一次。每个 item 仍须绑定本格真实 OCR 词号，不借用相邻格的词。
漏识别整格时先补真实 OCR 证据，不能凭空造词坐标。
答案表格仅作为答案证据，由 `references` 生成 `source-references-v2` 逐格定位；
不进入学生题组，默认 `answerOnly` 不显示评分。

Tesseract 底稿不带图形标记。校对员必须对照整页图自行补齐 `figure` 和 `figureRegion`
（页面图片像素坐标 `{ "x": 100, "y": 200, "width": 600, "height": 300 }`），
包括应用文题的海报、阅读里的流程图和图表。把图内对应的连续 items 标为同一 `figure` 名称，
在首个图形 item 写 `figureRegion`；图前保留一个文字 item 作为锚点，图中文字仍须归属 OCR 词。

若图形区域完全没有 OCR 词，在前一条普通文字 item 后插入纯图条目：
`{ "figure": "espresso", "figureRegion": { "x": 720, "y": 730, "width": 370, "height": 220 }, "imageOnly": true, "reason": "图形及图注未识别出 OCR 词，按原页保留" }`。
必须填写 `figureRegion` 和理由，不带 `lines`、`words`、`text`、`emphasis`，同名 figure 只能有这一条。
区域只框图形及图注，不借用旁边正文的词；编译后图插在前一条普通文字 item 之后，正文与强调仍保留。
区域内只要有 OCR 词（包括部分重叠）就不能用纯图条目，应改用上面的词归属 figure 写法。

`compile --pages` 和整卷 `compile` 会检查正文指图线索；本页或紧邻下一页都没有
`figure` / `figureRegion` 时拒绝通过。听力原文不检查。这个文字护栏不能代替看图，
没有指图用语的图形也必须补齐。
`after-proofread` 在 materialize 后还会拒绝以 subtitle / title / heading 结尾的非写作篇章；遇到此提示须回原页补图或正文，再用 `--redo-from compile` 重跑（应用文与读后续写除外）。

若核对原页确定没有图，在当前分片的 `source-flags/<第一个页键>.json` 增加本地专用声明：
`"noFigures": [{ "page": "question-source-1-p03", "kind": "no_figure", "reason": "核对原页无图，说明具体原因" }]`。
必须写对应页键和非空理由；不要放进文字纠错用的 `flags`。该声明只用于本地校对，
不进入服务端确认输入。

## 疑点

看不清或拿不准的字词：保留最可能的源读法，在 item 加 `"uncertain": "简短中文原因"`，继续完成，不要停下来问。
改动识别文字时可以写 `"reason"`（中文）；不写时工具自动生成“「原识别」改为「校正」”的说明。

## 顺带记录：原文错误、答案、小标题、水印

逐字读原页时，把下面几类信息写进 `imports/ocr-proofread/<paperId>/source-flags/<第一个页键>.json`。
只写这一个文件；`drafts/` 仍然与原页一致，不在草稿里改印刷原文的错误。

```json
{
  "pages": ["question-source-1-p02", "question-source-1-p03"],
  "flags": [
    { "page": "question-source-1-p02", "quote": "Back at office", "after": "Back at the office",
      "category": "grammar", "reason": "office 指具体办公室，at 后应为 the office。" },
    { "page": "question-source-1-p06", "quote": "on my notebook", "decision": "uncertain",
      "note": "原页为“on my notebook”，一般用 in，但属搭配选择，保留原文。" }
  ],
  "answers": { "1": "A", "56": "to protect" },
  "subtitles": [{ "page": "question-source-1-p03", "text": "● What should I know?" }],
  "watermarks": ["IAI English"]
}
```

- `flags` 只收印刷原文里明确的错误。`spelling`：`quote` 和 `after` 各是一个完整英文单词。
  `grammar`：两者只含英文单词和空格，取能改对的最小连续词组；需要插入词时带上相邻单词
  （`as` → `as the`）。`quote` 要在该页文字里原样出现。`quote` 很短、在同段里不止一处（如人名
  `Mario` → `and Mario`）时，再加 `"context": "mind, Mario"`：包含 `quote` 的一小段原文，可带标点，
  只用来定位。同一篇在别处重复出现（如续写材料）时只记一次。
- 只记文字 item 里的错误；整图保留的图片、流程图里的文字不进入文字审校，不记。
- 不润色，不改用词习惯、英美拼写、人名术语、大小写、标点或答案。破折号、弯引号空格和词间
  连续空格由脚本按规则处理，不用记。
- 拿不准的写 `"decision": "uncertain"` 和中文 `note`，不写 `after`。
- `reason`、`note` 用中文，保留所讨论的英文原文。
- `answers`：负责的页里有答案卷答案时，按原页逐题抄录（客观题写字母，填空题照抄单词），不解题。
- `subtitles`：篇章内独立成行的小标题（如加粗的圆点标题），整行原样抄录；篇章标题和题型说明不算。
- `watermarks`：在草稿里删掉的水印或机构标识原文；没有就写 `[]`。
- 没有内容的键写空数组或空对象，文件一定要写。

## 完成后回报

处理了哪些页、各页 item 数、疑点清单，以及图片、表格等无法用文字 item 表达的版式。
