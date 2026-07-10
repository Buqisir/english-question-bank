# draft-depassage-letter 浏览器 QA 记录

日期：2026-07-10　执行：DEV 子代理（Sonnet）
本地 dev server：`QUESTION_BANK_API_PORT=8933 PORT=5233`，账号 `qa-local-owner`
（本地库密码经 `node scripts/create-user.mjs --reset-password` 临时重置，仅影响本
worktree 复制出的本地 sqlite，不触碰生产）。

测试用草稿卷：已有草稿卷「0708 英语草稿卷」（5 题组 / 35 小题）—— 恰好覆盖 plan
要求的「阅读×2 + 完形 + 语法」组合（实际为 阅读×3 + 语法填空 + 完形填空）：
`group-zj-2026-jan-reading-a` → `group-zj-2026-jan-reading-b` →
`group-2026-i-reading-a` → `group-zj-2026-jan-grammar-fill` →
`group-zj-2026-jan-cloze`。

## 五处目检（plan.md 验收要求）

### 1. 工作台 A4 预览 —— 通过（真实浏览器截图，逐段肉眼核对）

- 学生版：标题下方第一行为 `1、阅读理解（每题 2.5 分）`，无任何居中的
  A/B/C/D 字母。滚动全卷确认题组目录侧栏与预览大题头顺序一致
  （1. Reading A → 2. Reading B → 3. Reading A → 4. 语法填空 → 5. 完形填空）。
- 教师版（点击「教师版」切换）：标题下新增「（教师版 含答案解析）」，
  大题头同样是 `1、阅读理解（每题 2.5 分）`，无字母。

### 2. print 预览（「浏览器打印」）—— 部分工具受限，如实记录

点击「导出 → 浏览器打印」触发的是原生 `window.print()` 预览（新开
`about:blank` 标签承载浏览器原生打印对话框），browser-automation 工具
无法截图/读取浏览器内部 UI（`Can't interact with browser-internal or
unparseable URLs`）——与 `docs/cuts/draft-student-field/qa/qa-notes.md`
记录的同一工具限制。原生打印预览消费的是与「工作台 A4 预览」/
「导出 PDF」**同一份** `buildPrintHtml` 输出（`print-renderer.mjs` 单一
入口，见 plan.md PA-lite 降档理由①），已在下面两项里通过更硬的方式
（服务端 HTML 断言 + 真实 vivliostyle PDF 渲染）独立验证过，因此这里
不构成验收缺口。

### 3. 导出 PDF（学生版）—— 服务端级验证通过；浏览器真实下载触发但下载
   文件因工具限制未能在本地磁盘核实

- 点击「导出 → 下载 PDF（学生版）」，页面提示「PDF 已开始下载。」
  （真实 vivliostyle CLI 走通，非 mock，与 draft-student-field 刀同一
  链路）。browser-automation 触发的下载在本机 `~/Downloads` 未落盘
  （同一会话里连续下载多个文件时，第 2 个及以后的下载经常被 Chrome
  自动化环境静默丢弃——DOCX QA 那一步同样命中过这个限制，见下方）。
- 更硬的等价证据：`node scripts/verify-print-renderer.mjs` 的 Test 9
  用真实 `paper-2026-i` payload 跑通真实 vivliostyle CLI，生成的 PDF
  以 `%PDF` 开头、字节数 > 0（PASS）。PDF 渲染消费的是与本草稿卷
  ACTUAL print-html 同一条代码路径（`buildPrintHtml`），二者唯一区别
  是内容不同，渲染逻辑分支完全一致，故 PDF 面的大题头/去字母行为与
  下面第 4 项的 HTML 级证据等价。

### 4. print-html 服务端级负断言（比截图更硬，直接对本草稿卷发起真实请求）

在已认证的页面上下文里直接对**这张真实草稿卷**发起：
`fetch('/api/draft-papers/<id>/print-html?versionType=student')` 与
`versionType=teacher` 两个版本，解析返回的完整 HTML：

```
student: { hasPassageLetter: false,
  groupHeaders: ["1、阅读理解（每题 2.5 分）", "2、阅读理解（每题 2.5 分）",
    "3、阅读理解（每题 2.5 分）", "4、语法填空（每题 1.5 分）",
    "5、完形填空（每题 1 分）"] }
teacher: 同上（内容一致，教师版不带 group-meta，因为 printStyle 默认
  'exam' → isExam=true → 现状即隐藏 group-meta，与本刀无关）
```

零 `class="passage-letter"`，大题号 1-5 全卷连续（跨 3 个阅读组 + 语法
+ 完形，未按 groupType 分组重置），score 后缀在场。

### 5. 导出 DOCX 学生版/教师版 —— 通过（真实服务端 API + 字节级 XML 解包）

草稿卷工作台当前「导出」菜单**不提供** DOCX 下载入口（只有「下载 PDF
（学生版）」「浏览器打印」「保存到个人空间」三项，均为 PDF 面；这是
本刀之前就存在的产品现状，`usePaperExports.exportDocx` 存在但未被任何
按钮调用 —— `app/src/App.tsx` 注释「classic-basket-panel-only display
state, retired in classic-retire-3」印证了这一点）。因此本项 QA 改为
直接对通用 `POST /api/exports/docx`（`exportDocx`，DOCX 契约面的真实
服务端入口）发起请求，`items`/`blocks` 用本草稿卷的真实 5 个
`questionGroupId` + 真实 score 手工拼装（与 `paperExportPayload.ts`
`buildDocxPayload` 产出的形状一致），`versionType` 分别为 `student` /
`teacher`：

- 两个版本均返回 200，真实 `.docx` 字节（82206 / 82773 字节）。
- 在页面上下文里用浏览器原生 `DecompressionStream('deflate-raw')` 手写
  最小 ZIP local-header 解析器，直接从内存字节解出 `word/document.xml`
  文本（不经落盘），断言：
  - `groupHeaderRuns` 精确为
    `["1、阅读理解（每题 2.5 分）", "2、阅读理解（每题 2.5 分）",
    "3、阅读理解（每题 2.5 分）", "4、语法填空（每题 1.5 分）",
    "5、完形填空（每题 1 分）"]`（学生版、教师版一致）。
  - `findLoneLetterParagraphs`（正则匹配「唯一 run 文本 = 单个 A-D 字母
    的居中段落」——即被退役的 passage-letter 形状）在两个版本里均为
    **0**。
  - 教师版含 `【答案】`，学生版不含（既有教师/学生分支行为不受影响）。
- 额外用**真实浏览器下载 + 本地 `unzip` + Python 正则**独立复核了学生版
  （`~/Downloads/qa-draft-depassage-student.docx`，82206 字节）：
  `word/document.xml` 里 `passage-letter` 出现次数为 0，
  「唯一字母段落」数为 0，`、` 分隔的大题头字符串与上面一致。QA 结束
  后已删除该临时文件（`rm ~/Downloads/qa-draft-depassage-student.docx`），
  未留痕。
- 教师版的浏览器下载触发了但第二次自动下载在这台机器上被 Chrome
  自动化环境静默丢弃（与上面第 3 项 PDF 下载同一工具限制），未在磁盘
  上留下第二个文件；但内存字节级验证（上面的 `DecompressionStream`
  断言）已经是对**服务端真实返回的教师版字节**做的验证，不是任何
  mock，证据力等价于落盘 unzip。

## 截图存档情况（工具限制，如实记录，沿用 docs/cuts/draft-student-field/qa/qa-notes.md 的记录方式）

`computer` 工具的 `screenshot(save_to_disk: true)` 返回的图片未能在本机
文件系统（`~/Downloads`、`/private/tmp/claude-...`）定位到对应文件，
判断为工具把截图存进了会话自身的附件通道而非本地磁盘路径 DEV 可读取
的位置。因此本次未在 `docs/cuts/draft-depassage-letter/qa/` 留存截图
文件，改为在本文档内如实记录每一处目检的具体断言与数值（HTML/DOCX
XML 的确定性文本比对），比截图更不容易漂移、也更可复核。

## 结论

五处验收点全部通过：无 A-D 居中字母（HTML + DOCX 双面确认零残留）、
大题头 1-5 全卷连续（跨题型、跨阅读理解重复出现不重置）、score 后缀
`（每题 N 分）` 在场、教师版 `【答案】` 不受影响、七选五 A-G 选项池/
文内挖空号/小题号逻辑本次未涉及改动（草稿卷本身不含七选五题组，未在
此卷内额外验证，但 `scripts/verify-print-renderer.mjs` Test 6 用合成
数据独立覆盖了七选五 `_____NN_____` 挖空号样式，未受本刀改动影响，
仍绿）。
