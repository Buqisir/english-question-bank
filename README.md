# 英语题库工作台

本项目是一个本地优先的英语题库与组卷工作台，第一阶段面向个人使用，后续保留公开/云端访问的扩展空间。

## V0 目标

- 录入并管理“篇章 + 题组 + 小题”结构的英语题目。
- 支持关键词全文搜索与基础筛选。
- 支持手动加入组题篮、调整顺序、设置分值。
- 支持保存一套试卷/题集。
- 支持导入 DOCX/PDF 原件并导出学生版与教师版 DOCX/PDF；主入口优先服务“题目+答案/解析同文件”的单份资料。
- 支持 AI 建议标签，但必须人工确认。

## 当前目录

```text
app/      # 前后端正式代码
data/     # 本地数据库与应用运行数据
imports/  # DOCX/PDF 导入原件
exports/  # DOCX/PDF 导出试卷与题集
docs/     # 产品设计、数据结构、开发记录
design/   # open-design 视觉原型与界面实验
```

## 本地开发

```bash
cd app
pnpm install
pnpm dev
```

`pnpm dev` 会先初始化本地 SQLite，再同时启动本地 API 和 Vite 前端。当前 V0 外壳已包含题库列表、题组详情、关键词搜索、基础筛选、组题篮、顺序调整、分值设置、保存题集、已保存题集回载、学生/教师版排版预览、DOCX/PDF 导入留痕、文件夹批量导入队列、资料组工作台、DOCX 文本抽取预览、拆题草稿预览、答案解析题组级对齐、多卷闭环状态面板和 DOCX/PDF 导出；DOCX 导出已对七选五公共选项、语法填空空号列表和学生/教师版答案呈现做题型化处理。当前已完成 `2020年全国丙卷 客观题`、`2020年全国乙卷 客观题`、`2020年全国甲卷 客观题`、`2020年新课标I卷 客观题` 和 `2020年新课标II卷 客观题` 五套真实试卷闭环，均已生成学生版与教师版 DOCX 并完成渲染检查。后续产品主线不再继续堆批量入库能力，而是优先打磨“单份有答案资料 -> 拆题草稿 -> 教师逐组确认 -> 入库/组卷/导出”的稳定路径。
点击右上角 `录题` 可以打开手动录入面板，写入来源、篇章、题组、多道小题、选项、答案、解析和标签；点击 `导入资料` 可以保存 DOCX/PDF 原件并生成导入记录，导入时可标记为 `题目文件`、`答案解析文件` 或 `题目+解析同文件`。默认推荐使用 `题目+解析同文件`，让单份资料先生成可审读草稿，再由教师逐题组确认入库；文件夹批量导入保留为资料搬运和压力测试辅助，不作为日常正式入库主流程。资料组工作台会按同一 `bundleId` / `bundleTitle` 汇总题目和解析是否齐全，卡片上的 `补解析文件` 会把导入表单直接绑定到同一资料组，并能从已解析文本生成可审读的拆题草稿；草稿题组会自动整理为短标题，并在预览中显示题干、答案和选项数量；草稿题组经人工确认后优先单组入库，必要时才批量入库阅读、七选五、完形和语法填空等客观题，写作类题组继续留在草稿中单独处理；客观题入库后可一键生成整卷题集、保存到组题篮并进入排版预览；已在题库中的同标题草稿会自动禁用重复入库；点击题组卡片的 `详情` 可以查看篇章、小题、选项、答案和解析，也可以继续编辑该题组。

## 本地数据库

```bash
sh scripts/init-db.sh
sqlite3 data/question-bank.sqlite "SELECT id, title, question_count, tags FROM v_question_group_cards;"
```

V0 数据库入口是 `data/question-bank.sqlite`，结构定义在 `data/sql/schema.sql`，示例种子数据在 `data/sql/seed-v0.sql`。

本地 API：

```bash
cd app
pnpm api
curl http://127.0.0.1:8787/api/question-groups
```

手动录题接口：

```bash
curl -X POST http://127.0.0.1:8787/api/question-groups \
  -H 'content-type: application/json' \
  --data '{"sourceType":"self_made","year":2026,"region":"校本","paperName":"课堂训练","section":"阅读理解 B","passageTitle":"示例篇章","summary":"示例摘要","groupTitle":"示例题组","groupType":"reading","difficulty":"medium","defaultScore":2.5,"questionCount":4,"questionStem":"示例题干","tags":["示例"]}'
```

完整小题录入接口：

```bash
curl -X POST http://127.0.0.1:8787/api/question-groups \
  -H 'content-type: application/json' \
  --data '{"sourceType":"self_made","year":2026,"region":"校本","paperName":"课堂训练","section":"阅读理解 B","passageTitle":"示例篇章","summary":"示例摘要","groupTitle":"示例题组","groupType":"reading","difficulty":"medium","defaultScore":2.5,"questionCount":2,"questionType":"细节理解","questionStem":"备用首题题干","questions":[{"questionNo":"1","questionType":"细节理解","stem":"What is recorded?","answer":"A","explanation":"示例解析。","options":[{"label":"A","content":"A full question."},{"label":"B","content":"A placeholder."}]},{"questionNo":"2","questionType":"推理判断","stem":"Why does it matter?","answer":"B","explanation":"示例解析。","options":[{"label":"A","content":"It only changes the title."},{"label":"B","content":"It persists multiple questions."}]}],"tags":["示例"]}'
```

更新题组接口：

```bash
curl -X PUT http://127.0.0.1:8787/api/question-groups/<question-group-id> \
  -H 'content-type: application/json' \
  --data '{"sourceType":"self_made","year":2026,"region":"校本","paperName":"课堂训练","section":"阅读理解 B","passageTitle":"示例篇章","summary":"更新后的摘要","groupTitle":"更新后的题组","groupType":"reading","difficulty":"medium","defaultScore":2.5,"questionCount":1,"questionType":"细节理解","questionStem":"备用首题题干","questions":[{"questionNo":"1","questionType":"细节理解","stem":"Updated stem?","answer":"A","explanation":"更新后的解析。","options":[{"label":"A","content":"Updated option."}]}],"tags":["示例","已更新"]}'
```

导入资料接口：

```bash
curl http://127.0.0.1:8787/api/import-files
curl http://127.0.0.1:8787/api/import-bundles

node -e "const fs=require('fs'); fetch('http://127.0.0.1:8787/api/import-files',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({fileName:'example.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',dataBase64:fs.readFileSync('imports/example.docx').toString('base64'),note:'待解析'})}).then(r=>r.json()).then(console.log)"
```

文件夹批量导入接口：

```bash
curl http://127.0.0.1:8787/api/import-batches

curl -X POST http://127.0.0.1:8787/api/import-batches/scan \
  -H 'content-type: application/json' \
  --data '{"directoryPath":"/Users/huangxuewei/Desktop/10_日常工作/真题答案版","title":"真题答案版批量导入队列","recursive":false,"contentRole":"question_with_analysis"}'

curl -X POST http://127.0.0.1:8787/api/import-batches/<batch-id>/import \
  -H 'content-type: application/json' \
  --data '{"parseDocx":true,"limit":10}'
```

批量扫描只建立待处理队列，不直接写入正式题库。执行导入后，系统会把原文件复制到 `imports/`，写入 `import_files` 和资料组记录，并自动解析 DOCX；`limit` 可控制单次处理数量，便于先跑 5/10 个文件观察效果，省略时会处理全部待导入文件。若同一资料组里已经存在同名、同角色文件，批量导入会绑定既有记录并跳过重复复制。PDF 目前先归档留痕，后续再接 OCR/版面解析。批量导入是辅助入口，正式生产仍以单份有答案资料的草稿审读和逐组确认入库为主；导入后的资料仍需经过拆题草稿、答案对齐、人工审读和确认入库，不能绕过教师判断。

资料组会显示基础质检提示。来源口径以试卷文件名和资料组标题为准；若 DOCX 抽取文本开头的内文题名与文件名不一致，例如“2020年全国乙卷-答案版.docx”内文疑似为“2020年广东卷……”，工作台会显示“来源口径提示”，但不阻塞客观题入库。

资料角色：

- `question`：题目文件。
- `answer_analysis`：答案解析文件。
- `question_with_analysis`：题目和答案解析在同一个文件。
- `other`：其他参考资料。

## 已验证真实闭环

- `2020年全国丙卷 客观题`：7 组 / 50 题 / 85 分，学生版 10 页，教师版 12 页。
- `2020年全国乙卷 客观题`：7 组 / 50 题 / 85 分，学生版 11 页，教师版 13 页。
- `2020年全国甲卷 客观题`：7 组 / 50 题 / 85 分，学生版 11 页，教师版 18 页；阅读 A-D 已写回精解析。
- `2020年新课标I卷 客观题`：7 组 / 45 题 / 80 分，学生版 10 页，教师版 16 页；阅读 A-D 已写回精解析。
- `2020年新课标II卷 客观题`：7 组 / 45 题 / 80 分，学生版 10 页，教师版 16 页；阅读 A-D 已写回精解析。

五套样例都走完了 `DOCX 导入 -> 拆题草稿 -> 教师质检 -> 客观题入库 -> 保存题集 -> 学生/教师版 DOCX 导出 -> 渲染验收`。学生版不输出答案解析，教师版输出答案解析。若内文题名与文件名不一致，来源以试卷文件名和资料组标题为准，内文差异只作为提示保留。答案解析对齐已改为题组级匹配：优先按 `题目+解析同文件` 的题型块和阅读解析文件中的 `A篇/B篇/C篇/D篇` 边界对齐；多题组场景下缺少可靠边界时不会使用全局小题号硬配。新高考卷会优先读取小节标题中的 `每小题 x 分`，因此支持阅读/七选五 2.5 分、完形 1 分、语法填空 1.5 分的客观题分值结构。

双文件导入时，让题目文件和答案解析文件使用同一个 `bundleId` / `bundleTitle`，后续按题号对齐。若没有显式传入 `bundleId`，后端会按完全一致的 `bundleTitle` 复用已有资料组；在前端也可以直接点资料组卡片的 `补解析文件` 绑定到已有资料组。

资料组状态：

- `single_file_ready`：题目和答案解析在同一个文件。
- `paired_files_ready`：题目文件和答案解析文件已配对。
- `missing_analysis`：已有题目文件，缺答案解析文件。
- `missing_question`：已有答案解析文件，缺题目文件。
- `reference_only`：当前资料组只有其他参考资料。

DOCX 文本抽取接口：

```bash
curl -X POST http://127.0.0.1:8787/api/import-files/<import-file-id>/parse
curl http://127.0.0.1:8787/api/import-files/<import-file-id>/parse
```

拆题草稿接口：

```bash
curl -X POST http://127.0.0.1:8787/api/import-bundles/<bundle-id>/draft
```

草稿只读已解析文本，返回候选题组和小题，不直接写入正式题库。当前规则优先识别高考卷面常见结构：完形填空、语法填空、阅读理解、七选五、写作任务；支持 `（1）` 这类全角空号、七选五公共选项和 `【答案】A；B；C` / `【答案】[["A","B"]]` 等常见答案串。答案和解析仍需经过解析文件或人工确认补齐。

草稿入库当前走前端审阅路径：在 `导入资料` 面板生成草稿后，先查看入库前质检摘要。质检会汇总客观题组数、小题数、写作类保留数、来源口径提示、缺答案、缺选项组、低置信组和结构提醒；来源口径提示只提醒不阻塞，正式来源仍以试卷文件名和资料组标题为准。日常生产优先点击单个题组的 `入库此题组`，逐组确认后写入正式 `Source -> Passage -> Question Group -> Questions`，并自动带上 `导入草稿`、`待审阅` 和题型标签。若确实要批量处理客观题，结构风险会锁定批量入库按钮，需要教师勾选“已核对来源题名、题数、选项和答案”后才可继续。

答案解析对齐接口：

```bash
curl -X POST http://127.0.0.1:8787/api/import-bundles/<bundle-id>/answer-alignment
curl -X POST http://127.0.0.1:8787/api/import-bundles/<bundle-id>/answer-alignment/apply \
  -H 'content-type: application/json' \
  --data '{"questionGroupId":"<question-group-id>"}'
```

答案对齐只生成预览，不自动覆盖正式题库。它会读取同一资料组内已解析的 `答案解析文件` 或 `题目+解析同文件`，尝试先按题库题组标题生成 `answer / explanation` 候选，再在题组内按小题号匹配；阅读解析支持 `A篇/B篇/C篇/D篇` 边界，整卷答案版支持过滤听力后按阅读、七选五、完形、语法填空分桶。没有解析文件时会明确提示缺解析文件；多题组且缺少可靠题组边界时会暂停自动匹配，避免跨题型错贴。

答案写回必须从预览中的单个题组确认触发，默认只填空白答案/解析，不覆盖已有内容。

保存题集接口：

```bash
curl -X POST http://127.0.0.1:8787/api/paper-sets \
  -H 'content-type: application/json' \
  --data '{"title":"示例题集","items":[{"questionGroupId":"g-2023-n1-b","score":2.5}]}'
```

读取已保存题集：

```bash
curl http://127.0.0.1:8787/api/paper-sets
curl http://127.0.0.1:8787/api/paper-sets/<paper-set-id>
```

多卷闭环状态接口：

```bash
curl http://127.0.0.1:8787/api/paper-workflows
```

该接口按试卷汇总 `资料导入 -> 客观题入库 -> 整卷题集 -> 学生/教师版成品` 四段状态。前端顶部 `闭环面板` 使用它显示每份试卷的下一步动作，并支持从面板直接查看题组、生成草稿和载入题集。

DOCX 导出接口：

```bash
curl -o exports/example.docx -X POST http://127.0.0.1:8787/api/exports/docx \
  -H 'content-type: application/json' \
  --data '{"title":"示例题集","versionType":"teacher","items":[{"questionGroupId":"g-2023-n1-b","score":2.5}]}'
```

PDF 导出接口：

```bash
curl -o exports/example.pdf -X POST http://127.0.0.1:8787/api/exports/pdf \
  -H 'content-type: application/json' \
  --data '{"title":"示例题集","versionType":"teacher","items":[{"questionGroupId":"g-2023-n1-b","score":2.5}]}'
```

## 设计原型

- Open Design 原型目录：`design/open-design-workbench-v0/`
- 可预览文件：`design/open-design-workbench-v0/english-question-bank-workbench.html`
- 运行记录：`design/open-design-workbench-v0/open-design-run-notes.md`

## 项目原则

- 语篇中心：阅读题、完形、七选五等都优先围绕完整材料建模。
- 教学可用：不只是存题，还要服务找题、组题、讲评和训练。
- 本地优先：先保证个人资料安全、离线可用、导入导出可靠。
- 人工把关：AI 可以建议标签和结构，不直接替代教师判断。
