# draft-desk 刀B「真分页引擎」— 技术侦察（PA 前，只读）

- 日期：2026-07-12
- 性质：DEV 未开工、plan.md 未立时的只读技术侦察，喂给 PA。
- 结论一句：命门「屏幕分页 == 导出分页 parity」现状 = **三套互不知情的分页引擎**，
  收敛需要 owner 先拍一个 one-way-door 的架构方向（见文末「待拍板」）。
- 未做：运行时实测（没有肉眼对比同一份草稿卷「浏览器打印」vs「下载 PDF」的实际断点）；
  下面全部是静态读码得出的架构事实。

## 1. 屏幕分页管线

- `app/src/features/draft-paper/draftPaperPreviewHtml.ts:106-219` — 分页不是 CSS 分页，
  是注入 iframe `srcDoc` 的手写 JS（`paginateA4Preview` IIFE）：
  - `flatten()`（119-158）把每个 `.question-group` 拍平成直接子节点，**但不递归拆
    `.passage` 内部的 `<p>` 行** —— 一整篇阅读原文是不可再分的原子节点。
  - `run()`（182-215）贪心装箱：逐节点 append，用真实 DOM 测量
    `scrollHeight > clientHeight`（207）判溢出，溢出且非唯一子节点就回退开新页。
    测量是真实的，但**颗粒度是「整块」不是「整行」，且完全不读 CSS 的
    `break-inside`/`break-after`**（这条路径根本没触发 CSS 分页媒体）。
- 页数真值：`DraftPaperWorkbench.tsx:293-299`（`handleIframeLoad`）数
  `doc.querySelectorAll('.preview-page').length`。
- 徽标：`DraftPaperWorkbench.tsx:807-809`「共 N 页 · 双面 ⌈N/2⌉ 张 · A4」——「M 张」纯
  UI 算术 `Math.ceil(pageCount/2)`，无对应数据字段。

## 2. 导出分页管线（三条路各不相同）

- **浏览器打印**：`DraftPaperWorkbench.tsx:644-658`（`browserPrint`）把
  `draftPaper.printHtml`（`buildPrintHtml` 原始输出，**不经** `buildA4PreviewHtml` 包装、
  无 `.preview-page` 结构）`document.write` 进新窗再 `window.print()`。分页交给浏览器原生
  CSS Paged Media 引擎读 `server/print-renderer.mjs` 的 `@page`(456-468)、
  `.page-break`(507-509)、`.question{break-inside:avoid}`(616-618)、
  `.writing-answer-box{break-inside:avoid}`(627) 等。**`.passage`/`.passage p` 无任何
  break 规则**(534-542)——CSS 允许原文段落中途断页，与 #1「整篇 passage 不可拆」正相反。
- **下载 PDF**：`server/draft-paper/draftPaperStore.mjs:830-899`（`exportDraftPaperPdf`），
  883 行 `execFileSync(vivliostyleBin, ['build', htmlPath, '-o', pdfPath])` shell 出去跑
  Vivliostyle CLI（第三套 CSS Paged Media 实现）。**这份调用是草稿卷自己内联的**，跟旧
  paperAssembly 的 `server/exports/exportImplementation.mjs:129` 那份是**两份重复代码、不共用**。
- **DOCX**：`server/exports/docxRenderer.mjs` 能力完整（能插 `w:br type=page` 强制分页），
  但**草稿卷根本没接**——只被旧 paperAssembly 的 `usePaperExports.ts` 调用，而该 hook 的
  export 函数在 `App.tsx` 里零调用，触发它的 `PaperBlockCanvas.tsx` 全仓库无人 import。
  → **DOCX 对草稿卷是死代码，不可达**。

## 3. 分页建议逻辑

- 真实函数：`server/draft-paper/draftPaperStore.mjs:305-329` `buildPageBreakSuggestions`
  （纯 server 端，`app/src` grep 不到属正常）。
  - `estimate = materialWords*1.2 + questions.length*80 + optionCount*12`（314）。
  - 魔法数字三连（316/318/320）：`materialWords>600`、`questions>4 && optionCount>16`、
    `estimate>700 && prev+estimate>1000`。
  - `getDraftPaper` 里 431 行挂 `pageBreakSuggestions` 到每个 DraftPaper 响应。
- **下游消费链路不用改结构**（新函数只要产出同形 `{itemId,groupId,reason}[]`）：
  `draftPaperStore.mjs:431` → `domain/questionBank.ts:153-158`（类型）→
  `DraftPaperWorkbench.tsx:246-249`（映射）→ `draftPaperPreviewHtml.ts:166-180`
  （`insertBreakHints` 注入 `.break-hint`）→ 点击 `DraftPaperWorkbench.tsx:316-323` →
  `togglePageBreak`(521-534) → 落库 `page_break_before=1`。
- **硬约束（删启发式的连带修改）**：`scripts/verify-c8-print-ready-gate.mjs:62-69` 用正则
  断言 `draftPaperStore.mjs` 和 `docs/cuts/C8-draft-paper-composer/decisions.md:131-145`
  里出现相同的 600/4/16/700/1000。刀B 删魔法数字**必须同刀改这个 verify 脚本 + decisions.md**，
  否则 CI/verify 直接红。
- 误锚澄清：`PaperBlockCanvas.tsx` 的「+分页↓」是旧画布**手动**插分页 UI，与自动建议无关，
  且该组件当前不渲染。

## 4. 草稿卷 schema

- 表**不在** `data/sql/schema.sql`（那是共享题库库），在 `server/api.mjs:702-728`
  `ensureUserDatabaseShape`（用户库 schema 唯一真源是代码，ADR-0011；
  `verify-c8-draft-paper-contracts.mjs:27-29` 断言 schema.sql 不得再定义这两表）。
  - `draft_papers`(704-714)：`id,user_id,title,subject,status,current_marker,
    last_printed_at,created_at,updated_at`。
  - `draft_paper_items`(715-725)：`id,draft_paper_id(FK CASCADE),group_id,
    source_paper_id,order_index,page_break_before,...`，`UNIQUE(draft_paper_id,group_id)`。
- **加字段两条路**：
  1. 正规路：改 `ensureUserDatabaseShape` 的 CREATE TABLE + `userVersion<N` 分支加
     `hasColumn` 守卫的 ALTER + 提 `user_version`（745-749 有 `user_id` 补列范例）。
  2. 边界特例路：照抄 `ensureStudentLabelColumn`（`draftPaperStore.mjs:66-93`，就是
     `student_label` 的懒 ALTER 先例：模块标志位 + `PRAGMA table_info` 检查 + ALTER，
     在各入口懒执行）——原因注释写明「Forbidden 清单不许动 `ensureUserDatabaseShape`」。
- `print_form`(枚举 a4/a3) 落点：挂 `draft_papers` 表（跟草稿卷走，非 item），默认 `'a4'`。
  走哪条路取决于刀B plan 会不会把 `server/api.mjs` 划进 Forbidden（有并行 cut 共享边界
  → 特例路更省；无冲突 → 正规路更干净）。

## 5. 版面/张数/正反面概念

- **不存在**。无 sheet/正反面/版面结构；「双面 M 张」= `ceil(pageCount/2)` 一行算术，
  无字段/类型/服务端概念。
- owner 已拍板的语言只在原型 `docs/cuts/draft-desk/prototype-print-form-v2.html`
  （`facesA4`/`facesA3`/`sheets` 数组，179-221）：
  - A4 散页：每面只印一个版面，任何跨版面都要翻纸 → 都算断。
  - A3 对折：一张 A3 正面并排版 N+N+1、背面并排版 N+2+N+3；**同面相邻两版**（版3→版4）
    不用翻纸即可同见 = 不算断；版2(正)→版3(背)要翻面 = 真断。这就是「同面可见不算断篇」。
  - 原型只为 6 版面示例硬编码，**不是公式**。刀B 要抽象成：给定总版面数 N + `print_form`
    → 推出 (a) 张数 (b) 任意两相邻版面是否同面。
- 2-up 拼版 PDF 导出（真把两版面图像物理拼进一张 PDF 页）**归刀E**（program:27 + 原型:173）。
  仓库无任何 2-up/imposition 代码；`exam-paper-format-standards.md` 无 A3 字样——排版标准也从零。

## 【parity 现状判断】核心

**不是同一套。** 三条渲染面只共享「语义 HTML+CSS 内容」一层
（`print-renderer.mjs::buildPrintHtml` 头注自述「covers ALL THREE print/A4 surfaces...
preview/workbench only pretty-print + paginate it」），**但「在哪断页」的算法是三套互相
独立、互不知情的实现**：

1. 屏幕预览 = 自研 JS 贪心装箱，单位「整块」（整篇 passage 不可分），不读 CSS break 规则。
2. 浏览器打印 = 浏览器原生 CSS Paged Media，允许 `.passage` 段落边界断页。
3. PDF = Vivliostyle CLI（第三套 CSS Paged Media，规则同 #2 但引擎不同、版本不同，边界
   情况如孤行寡行/页码计数器可能有出入）。

**最实锤分歧点**：同一篇超长阅读原文——屏幕预览当整块（塞不下就撑破 297mm 页框，因为
`.preview-page` 用 `min-height` 会长高），而打印/PDF 允许它在段落边界拆两页。这是直接读
`flatten()`（不递归拆 passage）+ CSS 规则表（`.passage` 无 `break-inside:avoid`）两处代码
对比出的结构性差异，非猜测。

**历史**：C8 立项 `decisions.md` 原文是「Preview and print/PDF must use the same rendering
model **as much as possible**」——用「尽量」非硬保证。此分歧从 C8 起就是**已知、有意搁置的
近似**，非刀A 引入；刀B 是第一次被要求真正收敛它。

## 待拍板（owner，one-way-door 方向）

### A. parity 收敛方向（二选一，各有实质代价）

- **路① 预览向打印靠**：改屏幕预览算法去模拟 CSS 分页（`flatten` 拆到 `<p>`、贪心算法照抄
  `break-inside`/`break-after` 决定节点能否留页尾）。本质=前端重实现一遍 CSS Paged Media
  子集。代价：**永远是「近似」**——两套算法规则同源但仍非同一份代码，边界仍可能偏。工作量在前端。
- **路② 打印向预览靠**：把预览算出的断点固化成显式 `.page-break` 标记喂给导出（或用
  Puppeteer 照预览渲的样子出片）。代价：**构造上真 parity**，但牺牲 Vivliostyle 的排版保真
  （孤行寡行、页码计数器等），且屏幕预览现在是纯客户端 iframe 脚本，服务端复现同一次测量有
  「用什么引擎跑这段 JS」的工程难题（Vivliostyle CLI 本身是 shell 出去调 headless Chromium）。
- 关联产品红线：Super Teacher Boundary「最忌不可信建议」+ program 柱子2「所见即所印」——
  屏幕给老师看的分页若 ≠ 实际打印，分页建议本身就不可信。这是刀B 存在的理由，也是选路的准绳。

### B. DOCX 边界（建议明确排除）

DOCX 现为死代码，且天然做不到「测量级」parity（Word/WPS 打开时自行重排），纳入 = 新增功能
非收敛。建议 owner 拍板：**刀B parity 范围 = 屏幕预览 + 浏览器打印 + PDF 三面，DOCX 不进**。
