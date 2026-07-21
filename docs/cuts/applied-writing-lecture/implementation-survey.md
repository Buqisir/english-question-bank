# 卷面内嵌解析·实现落点侦察摘要（2026-07-20）

来源：[卷面内嵌解析的实现落点侦察](issues/04-implementation-survey.md)（三路
Explore 子代理产出压缩）。交互形态已按 02 票拍板 B2（答题框放大成解析区，
框内三块横向翻页），本摘要以 B2 为准，供 [立刀开工](issues/05-open-cut.md)
的 plan 直接引用。

## 0. 先纠一个前提：答题框不在 PaperSurface 里

写作卷面是双层结构：`WritingPaperPage.tsx` 渲 A4 chrome（标题/指导语/注意/
**答题框** `pi-writing-answer-box`，:55-75），把 dumb `PaperSurface` 作为
children 塞进 `passage` 槽（:53-54；宿主接线 `PaperBrowsePage.tsx:1407`）。
PaperSurface 只渲写作组的提示/材料正文，**不认识 answerBox**，没有
block-kind 概念（它消费 textMap/questions/evidence，`PaperSurface.tsx:116-130`）。

**推论：「放大答题框」天然不碰契约级的 PaperSurface。** map 硬约束里
「PaperSurface hook 硬拦」这条对本刀不构成障碍。

## 1. 内嵌解析块住哪一层 → 宿主层 overlay（推荐），不进 pageModel

### 推荐案：宿主层覆盖（仿七选五先例，零契约触碰）

- **现成先例**：七选五衔接句高亮覆盖层——`useSevenChoicesPaperHighlights.ts`
  用 `leftScrollerRef.querySelector('[data-paper-sentence-id=…]')`（:95-97）+
  `getClientRects()`（:53）算几何，`PaperBrowsePage.tsx:1864-1879` 在
  `.paper-browse-content` scroller 内渲绝对定位层。另有阅读跨栏证据动线
  `PaperIntelligenceEvidenceLine`（:1898-1908）同构。
- **改动面**：`PaperBrowsePage.tsx`（overlay 渲染 + 新 hook，如
  `useWritingAnswerBoxOverlay`）+ `paperBrowsePage.css`；`WritingPaperPage.tsx`
  加 1 个 data-attr 锚点（答题框 DOM 现在只有 className + aria-label，
  :55-61，没有 `data-paper-*` 锚，需加一行，非契约）。
- **不碰**：PaperSurface、schema、writingPageModel。

### 落选案：pageModel 加 `analysisPanel` block

要动 `writingPageModel.mjs:113-126` + `.d.ts/.d.mts` + adapter +
`WritingPaperPage.tsx` + `verify-i6-writing-render.mjs`，且把非试卷解析编进
写作视图模型，**撞 `verify-analysis-layering.mjs` 的「零解析残留在卷面」
断言**（detail-page-redesign 负空间纪律）。不推荐。

## 2. 卷面保真：四通道天然隔离，唯一要写的门控是 lectureOpen

两条完全独立、互不共享 DOM 的渲染管线：

- **屏显浏览（含讲评态）**：SPA React 树（PaperBrowsePage/PaperSurface）。
- **打印/PDF/DOCX/学生版**：服务端 `POST /api/exports/*` →
  `print-renderer.mjs` / `docxRenderer.mjs` 按 `questionGroupId` 从题库
  重新取数拼 HTML/XML。**从不 import 浏览器组件**；全仓 `app/src` 零
  `@media print`、零 `window.print()`；PDF 由服务端 vivliostyle 编
  （`exportImplementation.mjs:117-126`）。

推论与红线：

- 内嵌解析区只要活在浏览器 React 树里（overlay 即是），打印/PDF/DOCX/
  学生版**天生看不到它**，不需要任何导出侧排除逻辑。
- **要自己写的唯一门控是「挑题态 vs 讲评态」**：照抄 `lectureOpen &&`
  条件渲染（讲评栏 `:1881`、七选五覆盖层 `:1864`、证据动线 `:1898` 同款）。
- 学生版 = 服务端导出 + `versionType==='teacher'` 挡答案解析
  （`print-renderer.mjs:290/419-427`、docxRenderer 同理）；analyses JSON
  只在 SPA 讲评态 fetch（`PaperBrowsePage.tsx:611` `if (!lectureOpen) return`），
  学生根本不进这条路。
- **红线**：绝不把解析区做成新的 `PaperBlock` kind
  （`questionBank.ts:270-273` 只有 section_header/page_break/question_group）
  或在两个服务端渲染器里加分支——那是唯一能漏进四通道的路径。

## 3. 分页几何：讲评态是连续流，B2 放大无分页风险

- 屏显卷面=连续流：`paperBrowsePage.css:339-341` 注释明言「屏幕卷面是
  连续流，分页是纸的语义」；`.paper-browse-content` 是 overflow-y:auto
  滚动容器（:70-71），`pageBreakHint` 屏显渲成零高度（:342-345）。
- 答题框放大只把 scroller 内容向下顺延，**不存在页可被挤出**。B2 的
  320ms 高度过渡在连续流里是普通 layout 动画。
- 真分页只在打印/导出面：`print-renderer.mjs:482` `@page A4` + paged.js
  （草稿卷 `paginationRenderer.mjs`），答题框在那儿是固定 mm 原子块
  （`heightMm = continuation ? 57 : 65`，:254/:262，`break-inside: avoid`
  :672/:715）——与屏显解耦。
- 「屏显可变高、打印固定高」先例就是答题框自己：屏显 min-height 216px/
  书信 246px 随内容长（`writingPaperPage.css:89-95,122-124`），打印固定
  57/65mm。

## 4. `pi-writing-*` 白名单收账路径

13 个 HOOK_ONLY 类（`verify-lecture-panel-css.mjs:33-45`）的分支归属：
**5 个续写专用**（`pi-writing-continuation-*`）、**8 个两分支共用**
（panel/section-title/model-answer/model-answer-line/highlights/
highlight-item/highlight-text/highlight-note）、**0 个应用文专用**。

- stale 断言（:87）两种情况要求移出白名单：类获得 CSS，或失去使用者
  （死类会被抓，不会静默留存）。
- **收账取决于内嵌区用不用旧类名**：
  - 内嵌区用**新类名**（如 `pi-writing-review-*`）+ WritingAnalysisPanel
    保留 continuation 分支 → 13 个类全部仍被续写分支使用且零 CSS，
    **白名单一个都动不了**，全批留到续写刀收账。
  - 内嵌区（或右栏概览残留）**复用共用类名并补 CSS** → 8 个共用类必须
    移出白名单（CSS 对续写分支同样生效，等于顺手把续写面板也穿衣），
    5 个续写专用类留下。
- 陷阱备忘：`WritingAnalysisPanel.tsx` 还用了不在白名单的
  `pi-writing-section`，靠 `writingPaperPage.css:67`（卷面同名类）巧合
  命中 verify 的子串检查——立刀动类名时别误伤。
- plan 需拍的小板：右栏组级概览在 B2 下还渲不渲 WritingAnalysisPanel
  application 分支（现状：概览=标题+WritingAnalysisPanel 或「解析未发布」，
  无答案行 `:239-240`、无配相似 `:263`）。若概览瘦身为纯指引，
  application 分支可删，共用类仍由 continuation 分支持有，不产死类。

## 5. 入口手势接线：写作卷面现在完全不可点，B2 双手势全是新接线

- `onFocusIntent` 在 `PaperBrowsePage.tsx:1401` 对写作组也接了线，但
  **永远不会被触发**：写作组 `surfaceData.questions` 被硬置 `[]`
  （`writingPaperViewAdapter.ts:107`），无 question 行可点；写作不在
  blankFocusMode 三题型内（`PaperBrowsePage.tsx:1352-1366`），无可点空格。
  `WritingPaperPage` DOM 纯展示、零事件（:44-80）。
- `selectLectureQuestion` 的兜底分支（:1258）逻辑上支持写作 groupId，
  只是没有入口调它——B2 的「点答题框」手势在宿主层/WritingPaperPage
  加 onClick 即可复用这条选中链，不必动 PaperSurface 的 intent 协议。
- scrollspy 已能让右栏跟随写作组（组级概览路径），与 B2「右栏保留显
  概览」拍板兼容。

## 一句话给立刀

宿主 overlay + `lectureOpen` 门控 + 答题框 data-attr 锚点：零契约触碰、
四通道天然隔离、连续流无分页风险；白名单收账走「新类名、全批留续写刀」
或「复用共用类、8 出 5 留」二选一，在 plan 里定。
