# 行、底部提示 / 撤销：两个构件和换上记录（构件厂，2026-11-15）

清点出处：`design/components-2026-11-13/inventory.md`「行」（row-01，15 处）、「底部提示 / 撤销」（toast-01，2 处）、「行为」一节撤销 6 处。
规矩出处：`DESIGN.md` §5 Cards / Rows、§4 影子（浮层白底 e3）、Deletion-Cost Rule、§9 文案、质感六条；`docs/agents/ui-collaboration.md`「写 CSS 与 token 的纪律」。

## 一、两个构件

### 行 `app/src/shared-ui/Row.tsx` + `row.css`

- `Row`：`as` 是 `li`（默认，放在 `RowList` 里）/ `div`（行头在别的容器里，`<li>` 由外面给，卷行就是这样）/ `article`。
  `padding`：`paper` 10 / 14（默认）、`home` 12 / 16、`none`（调用处给）。`size`：`md` 最小高 48（默认）、`sm` 44（只给卷行展开后的题组行）。
- **不可点的行**：不给 `action`。只是一行内容，行里的键各自是键；不加手形、不加悬停底。
- **整行可点的行**：给 `action`。行里第一个子元素是一块盖满整行的透明「整行目标」`.eqb-row-hit`，是真的 `<button>` 或 `<a href>`：
  - **什么时候用链接、什么时候用按钮**：打开另一页、有自己地址的（详情 `?view=detail&groupId=`、草稿卷 `?view=draft-paper&draftPaperId=`）用 `<a href>`（`kind: 'link'`）：中键、Ctrl / ⌘ 点开新标签、复制链接都照浏览器的来；普通左键点由 `onNavigate` 走站内跳转，不整页刷新。就地做一件事、不离开这一页的（卷行展开 / 收起题组）用 `<button>`（`kind: 'button'`），带 `aria-expanded` / `aria-controls`。
  - 次要键（行尾「⋯」、加入草稿卷的「+」/「已加入 · 撤回」、「看整卷」）和整行目标是兄弟，不套在里面：键盘 Tab 先到整行目标、再到各个次要键；点次要键只触发它自己。次要键画在整行目标上面（`row.css` 给行里的键都加 `position: relative`，不加 z-index，免得每行各开一层压住下一行弹出的菜单）。
  - 读屏名字是 `action.label`，以行上看得见的标题开头（卷行：「2026 年 2026年新课标Ⅰ卷」，和原来 article 的名字一样；题组行：「A篇，打开详情」；首页行照原来的 `aria-label` 不改字）。
  - 悬停：整行铺桌色，由放行的那张列表的滑块画（`FluidHoverList`，2026-09-15 起全站这样），行自己不垫底。
  - 键盘焦点：整行垫桌色，整行目标上画 2px 石板墨焦点环，向里 2px（行在板的第一行、最后一行时不被圆角裁掉一半）。
  - 按下：鼠标按在整行目标上时整行垫深一档的 `--eqb-color-border`；按在次要键上不算。行不缩放。
  - 代价：行里的字盖在整行目标下面，选不了字（和原来整行是一个 `<button>` 的首页行一样；原来卷行、题组行的字能选，但一选就会触发整行点击）。
- `RowList`：`<ul>`，行间 1px 分隔线（`--eqb-color-border-subtle`，就是 `--desk-line`）画在后一行的上沿，默认放在板里（Surface board）、带滑块悬停。默认滑块只停在整行可点的行上。最小高说的是行本身，不含分隔线（有分隔线的行最小高 +1px，照原来首页行的量法，逐像素不变）。

### 底部提示 / 撤销 `app/src/shared-ui/Toast.tsx` + `toast.css`

- 写法：`<Toast message token kind detail action duration onClose className />`。`message` 为 `null` 时不显示；`token` 换了就重新计时（同一句话连着出两次）。`kind`：`undo`（默认）/ `success` / `info` / `error`。
- 样子照原来共用提示行的 floating 放法：白底、**e3**（`--elev-3`）、8 圆角，16px 图标 + 一行 14px 次要灰字，行尾一个墨字小号键（共用 `Button`）。字太长一行截断，整句在 `title` 和读屏里。文案由调用处写，构件不改字（§9：点名具体变化、不写「成功」、不加句号）。
- **一次只显示一条**：新的一条出来时，正在显示的那条被顶掉，它的 `onClose('replaced')` 被叫到（调用处顺手清掉撤销快照）。原来草稿卷四条提示各自独立，能叠在一起。
- **停留**：`duration` 毫秒（`null` 不自己消失）。鼠标停在提示上、或焦点在提示里时计时停住，移开后接着走剩下的时间。
- **读屏**：页面上常驻两块空的播报区（polite 一块 `role="status"`，出错用 assertive 一块 `role="alert"`），第一次渲染构件时两块一起放进 `<body>`，提示出现时把内容放进去——播报区和内容同一刻插进页面，很多读屏不念。原来的提示自己带 `role="status"`，是和内容一起插进去的。
- **Esc（自定）**：焦点在提示里时按 Esc 关掉这条，等于「不撤销了」（`onClose('escape')`），焦点回到进提示之前在的地方；焦点不在提示里时 Esc 不归它管（页面上的 Esc 还要关菜单、对话框），不抢。点了撤销键、提示收起时，焦点同样回去，不掉到 `<body>`。
- **Tab 能到**：提示在 `<body>` 最后，页面上最后一个能 Tab 到的东西之后按一下 Tab 就到撤销键（实测草稿卷：从「更多题组操作」按 1 下）。
- **放法**：视口底部正中，离底 24；窄屏（≤ 640）宽度跟着内容、居中，最宽左右各留 16，离底 16 加手机底部安全区（协调人复核改，见文末）。层级 32（见「缺的变量」）。
- **动效**：出现淡入上浮 8px（`--motion-base`），消失淡出下沉（`--motion-fast`）。系统设了「减少动态效果」时不做动画，直接出现、直接消失（原来减少动态效果时还淡入淡出）。

## 二、换了哪几处

| 位置 | 原来 | 现在 |
| --- | --- | --- |
| 首页「最近上新」卷行、首页搜索结果卷行、浏览页卷行（`ConciergePaperRow.tsx` 行头；`ConciergeDesk.tsx` 三张列表） | article 上整行 `onClick` + 「点的是不是键」判断；浏览页卷行键盘展不开；首页卷行的展开键是标题文字；列表是 `FluidHoverList` + `surfaceProps` | 行头 `<Row as="div" padding="paper｜home">`，整行目标是按钮（展开 / 收起，`aria-expanded`）；搜索结果行首小箭头留给鼠标，不进 Tab 顺序、对读屏藏起来（免得同一件事念两遍）；首页标题回成一行字；列表换 `RowList` |
| 卷行展开后的题组行（`ConciergeGroupCard.tsx`） | 行上 `onClick` + 判断；键盘只能从「⋯」→「详情」进 | `<Row as="div" padding="none" size="sm">`，整行目标是链接（去详情，左键走站内跳转）；「+」「⋯」是兄弟。不能开详情时（没传 `onOpenDetail`）行不可点、不再显示手形 |
| 首页「接着做」「今天翻到」（`ConciergeHomeSections.tsx`） | `<li><button class="home-row">` | `<Row className="home-row" padding="home">`（`<li>` 本身是行），整行目标是链接（详情 / 草稿卷） |
| 个人空间文件行（`MySpacePage.tsx`） | `div` 列表 + `<article>` 行 | `RowList`（`<ul>`）+ 不可点的 `<Row>`（`<li>`），三个键各自是键；滑块悬停照原来留着（见「要 Owner 定的」第 1 条） |
| 草稿卷底部提示 4 条（`DraftPaperWorkbench.tsx`） | `<Notice placement="floating">` + 四个计时 ref + `useToastPresence` / `usePresence` | `<Toast>`：「题组已移出 · 撤销」8 秒、「已替换这篇 · 撤销」8 秒、「已加入草稿卷」2.2 秒、「已保存到个人空间 · 查看个人空间」6 秒（时长照原来）；类名 `draft-undo-toast` 留作脚本挂钩 |
| 整卷页相似题栏提示（`SimilarQuestionsRailView.tsx`、`PaperBrowsePage.tsx`） | `<Notice placement="floating">`，父组件 2.2 秒计时 | `<Toast>`：成功 2.2 秒，没加入的不自己收起（带「重试」）；父组件的计时删了，加了 `onToastClose` |

**收掉的旧写法和旧 CSS**（这次被替换掉的规则）：
- `shared-ui/Notice.tsx`：第五种 `undo` 和第三种放法 `floating` 删了（站上再没有用的）；`notice.css` 里 floating 的四条（样子、退场、入场、减少动态效果）删了。
- `App.css`：`.concierge-paper-list` 的竖排和 `li` 分隔线；`.concierge-paper-row` 的 `cursor`；`.concierge-paper-row-head` 的 `padding`、`min-height`、`position`（两条）；首页卷行 `padding: 12px 16px`；`.concierge-recent-title` 的按钮重置和 `:focus-visible`；`.concierge-group-row-line` 的 `position`、`min-height`、`cursor`；`.home-row-list` 的竖排和 `li + li` 分隔线；`.home-row` 的 `width`、`min-height`、`padding`、`border`、`font`、`cursor`、`position` 和两条 `:focus-visible`（焦点那两条联动改成 `:has(> .eqb-row-hit:focus-visible)`）。
- `MySpacePage.css`：`.my-space-file-row` 的 `position`、`box-sizing` 和 `+` 分隔线。
- `paperBrowsePage.css`：把相似题提示抬到 32 层的那条（层级收进 `toast.css`）。

**核实「撤销 6 处」到底几处**：清点的 6 处是按函数名（undo / restore / revert）找出来的，逐个看过：
- 真的底部撤销提示只有草稿卷一处（「题组已移出」「已替换这篇」两条，另有两条不带撤销的「已加入草稿卷」「已保存到个人空间」）；再加整卷页相似题栏一条不带撤销的提示。一共 5 条提示、2 个文件，全换了。
- `MySpacePage` 的是 `restoreFocusRef`（还焦点，不是撤销；个人空间删文件是不可恢复的删除，走确认对话框，照 Deletion-Cost Rule 不该换成撤销提示）；`SentenceAnalysisCard` 的是 `restoreLayout`（不是撤销）。
- `VocabularyMeaningRecallPanel` 的 `undoPrevious`、`VocabularyReviewPage` 的 `undo`：练习里退回上一步的行内键，不是底部提示。
- `ConciergeGroupRowMenu` 已经不在了：加入草稿卷的撤销现在是行内「已加入 · 撤回」（共用 `DraftAddButton`，Owner 走查第四节第 6 条）。
- 草稿卷排序建议的「撤回」在建议卡上（Proposal → Decision，Owner 2026-11-13 定的不弹底部提示条），不动。
- `VocabularyDictationWorkbench` 的「撤销二维码」是收回分享，不是撤销操作。

## 三、没换的和原因

- **草稿卷左栏目录项**（`DraftPaperRail.tsx` `.draft-paper-rail-item`，清点「行」里 1 处）：它能拖动排序、有当前项的白底板、是 `role="button"` 的 div 带自己的键盘排序，行为比「整行打开一项」多，换成 Row 要连拖拽一起重做，超出「不加功能、不改结构」。留着，下一轮和拖拽一起看。
- **保存对话框里的「新建文件夹」一行**（`.draft-new-folder-row`）：是一行表单（输入框 + 按钮），不是列表里的一项，不归行构件。
- **个人空间「文件已删除。」那一行**：页面里固定位置的状态行（`Notice` 的 inline 用法），不是浮着的临时提示，不归底部提示。
- 词汇练习里的「撤销」、排序建议卡上的「撤回」、加入键的「撤回」：见上一节，都不是底部提示。

## 四、逐像素对照

脚本：`scripts/component-inventory/row-shots.mjs`（之前 / 之后，1440 和 390，静止和悬停，默认测试数据和满数据各一遍）、`toast-shots.mjs`、`row-compare.mjs`。
图：`before/`、`after/`（文件名前缀 `row--` 默认数据、`row-full--` 满数据、`toast--`），拼版 `compare-home.png`、`compare-browse.png`、`compare-other.png`、`compare-toast.png`，数据 `diff.json`。

| 一套 | 拍照稳不稳（同一份旧代码拍两遍） | 之后对之前 |
| --- | --- | --- |
| 默认数据（首页「接着做」「今天翻到」、首页卷行、浏览页、个人空间、草稿卷，1440 / 390） | 32 / 32 一样 | **32 / 32 逐像素一样** |
| 满数据（首页最近上新、首页搜索结果、浏览页，含悬停、展开、题组行悬停，1440 / 390） | 36 / 36 一样 | 28 / 36 逐像素一样；8 张不一样，见下 |
| 草稿卷撤销提示（1440 / 390） | 没拍第二遍 | 4 张都不一样，见下 |

**不一样的，逐个说明原因**：
- 满数据里 8 张「展开的第一套卷」裁图（`browse-expanded*`、`home-results-expanded*`，1440 和 390，静止和悬停）：**图高少 2 个像素（1 CSS 像素），内容没变**。裁的是第一个 `<li>`，原来行间分隔线画在前一行的下沿（`border-bottom`），现在画在后一行的上沿（`RowList`，`border-top`），第一个 `<li>` 自己就少了那 1px 线（线还在，算到第二个 `<li>` 里了）。顶对齐再比：1440 两种、首页 390 两种 0 像素不同；浏览页 390 两张的不同全在浮在页面右下角的「草稿卷（3 组）」浮钮上——裁图时页面滚动差了 1px，固定定位的浮钮相对内容挪了 1px，卷行本身一样。整页图（`*-page.png`）和不展开的列表裁图全部逐像素一样。
- 实算样式的不同（`diff.json` `measureDifferences`）都是上面这件事和标签换了：卷行列表 `<li>` 的 `border-bottom` → `border-top`、高 ±1；首页行从 `button` 变 `li`（内衬、最小高从按钮挪到 `li` 上，位置不变）；个人空间行从 `article` 变 `li`。
- 草稿卷提示 1440：3 个像素（提示右下圆角的抗锯齿；原来用 `left: 50%` + `translateX(-50%)` 居中，现在是播报区 grid 居中，位置算出来一样 `[629, 832, 182, 44]`）。
- 草稿卷提示 390：**故意改的**。原来窄屏提示按字宽居中（182 宽），现在照任务要的窄屏放法左右各留 16、宽度占满（358 宽），离底从 24 改 16（加安全区）。整页图另外在卷面上有大片不同：移出的是哪一组、卷面重排停在哪一步，两次拍照不一样（看 `compare-toast.png`），和提示无关。
- 提示的实算样式：`transition` 在减少动态效果下从「淡入淡出 160ms」变成 `none`（任务要的）；`liveIsAncestor` 从 false 变 true（提示现在放在常驻播报区里）。

没变的页面：默认数据 32 张全部逐像素一样，首页和浏览页的卷行（不展开）在两套数据里全部逐像素一样，悬停也一样。

**样张**：`sheet-row-new.png` / `sheet-row-new-390.png`（整行可点 · 按钮：静止、悬停、键盘焦点、按下、焦点在次要键上、展开；整行可点 · 链接：静止、悬停、焦点、按下；sm 44；不可点：静止、鼠标停着没有悬停）、`sheet-toast-new.png` / `sheet-toast-new-390.png`（撤销两种、做完了、做完了带键、出错带原话和重试、字太长截断、撤销键悬停、撤销键键盘焦点、被下一条顶掉、减少动态效果）。脚本 `row-sheet.mjs`、`toast-sheet.mjs`，画的是真构件。
**提案对照图**：`proposal-group-row-48.png`（见「要 Owner 定的」第 2 条）。

## 五、键盘和读屏实测

自动化实测（Playwright + Chromium 读屏树 `ariaSnapshot`），没有用真读屏软件（VoiceOver / NVDA）听过，这一项记为**没测**；播报区的写法（常驻、先空后填）是读屏都认的写法。
数据：`row-keys.json`、`toast-keys.json`（样张舞台）、`row-keys-site.json`（测试站真页面，满数据）。

| 测什么 | 结果 |
| --- | --- |
| 卷行：Tab 先到整行目标（按钮，名字「2026 年 2026年新课标Ⅰ卷」，`aria-expanded=false`），下一站「看整卷」 | 过（首页最近上新、首页搜索结果、样张） |
| 卷行：Enter 展开、空格收起 | 过（浏览页，原来键盘展不开） |
| 搜索结果卷行：行首小箭头不进 Tab 顺序，读屏树里没有它 | 过 |
| 展开后：看整卷 → 题组行整行目标（链接「A篇，打开详情」）→「+」→「⋯」→ 下一行 | 过 |
| 点「⋯」只开菜单，不打开详情；点「+」不打开详情 | 过（真页面、样张） |
| 题组行整行目标按 Enter 去详情（`?view=detail&groupId=…`） | 过 |
| 首页「接着做」：整行目标是 `<a href>`，名字照原来；Enter 走站内跳转到草稿卷 | 过 |
| 链接行：普通左键走站内跳转；Ctrl 点不走站内跳转，浏览器开新标签 | 过（样张：新开 1 个页面） |
| 点行里的字 = 点整行；点次要键只算次要键 | 过（样张计数） |
| 键盘焦点在整行目标上：整行垫桌色、2px 墨环、`:focus-visible` | 过 |
| 不可点的行：没有整行目标，Tab 只停在行里的键上；鼠标停着滑块不停 | 过（样张） |
| 提示出现前，`<body>` 里已有空的 `role=status` / `aria-live=polite` 和 `role=alert` / `aria-live=assertive` 两块 | 过 |
| 提示出现后读屏树：`status: 题组已移出 · button "撤销"`；出错进 `alert` | 过（真页面、样张） |
| Tab 能到「撤销」 | 过（草稿卷从「更多题组操作」按 1 下） |
| 焦点在「撤销」上，过了停留时长还在 | 过（草稿卷 9 秒、样张） |
| 鼠标停在提示上，过了停留时长还在；移开后剩下的时间走完才收起 | 过（草稿卷 9 秒；样张 3 秒时长：停 4 秒还在、移开 1 秒还在、3.6 秒收起） |
| 焦点在提示里按 Esc：收起，焦点回到进提示之前那一处 | 过（草稿卷回到「更多题组操作」） |
| 焦点不在提示里按 Esc：提示不收 | 过（样张） |
| 键盘按「撤销」：撤销生效、提示收起、焦点回去 | 过（样张） |
| 一次只显示一条：第二条出来，第一条 `onClose('replaced')`，页面上只剩一条 | 过（样张） |
| 减少动态效果：`transition: none`、不位移 | 过 |
| 真读屏软件实听 | 没测（环境里没有） |

注意：真页面上焦点在「看整卷」上时卷行也垫桌色——那是卷行原来就有的 `.concierge-paper-row:focus-within` 规则（verify 钉着），不是构件的；构件本身焦点在次要键上时整行不垫底（样张那一格）。

## 六、改了哪些 verify / smoke 断言（都没运行）

- `scripts/verify-concierge-desk.mjs`：
  - 「Paper row click guards interactive children」（查 `target.closest('button, a, …')`）→ 改成「Paper row head is shared Row with a button whole-row target」（查 `<Row … className="concierge-paper-row-head" … action={{ kind: 'button' … onTogglePaper(paper.key) … expanded, controls: detailId` 且没有 `target.closest(`）。
  - 「paper-row uses cursor: pointer」（查 `.concierge-paper-row {}` 里有 `cursor: pointer`）→ 改成「paper-row whole-row target uses cursor: pointer」（查 `row.css` 的 `.eqb-row-hit` 有手形，article 上没有）。
  - 其余几条（article 类名、`onTogglePaper(paper.key)`、焦点垫底规则、展开垫底、`concierge-row-expand` 带 `aria-expanded`）照样成立，没改。
- `scripts/verify-home-default-feed.mjs`：「home additions use real collection dates and a keyboard-operable title」（查标题按钮带 `aria-expanded`）→ 改成「… keyboard-operable whole-row target」（查 Row 的 `action={{ kind: 'button' … expanded, controls: detailId` 和标题 `<span className="concierge-recent-title">`）。
- `scripts/smoke-concierge-stream.mjs`：三处点 `.concierge-paper-body` 展开 → 点 `.concierge-paper-row-head > .eqb-row-hit`（行身的字现在在整行目标下面，Playwright 会判为被拦截）。
- `scripts/smoke-paper-draft-ui.mjs`：同上一处。
- 查过不用改的：`verify-draft-switch-mutations.mjs`、`verify-reorder-suggest.mjs`（`.draft-undo-toast[data-visible="true"] button` 照样有，类名留着）、`verify-my-space-shelf.mjs`（`my-space-file-row`、`my-space-file-list`、`gapClick={false}` 至少 3 处都还在）。
- 原来就不成立、这次没碰的：`verify-concierge-desk.mjs` 里「Group card uses always-visible + / … trail」查 `concierge-action-add`，改之前的代码里就没有这个类名（加入键 2026-11-13 换成了 `DraftAddButton`）。

## 七、缺的变量（已记进 `docs/design-gaps.md`「2026-11-15 行构件和底部提示构件的几处值」）

1. 行最小高 48 / 44：字面量。
2. 卷行内衬 10 / 14：字面量（DESIGN.md §5 原值，不在间距阶梯上，§8 存量半档）。
3. 行按下底色：借 `--eqb-color-border`（DESIGN.md 没写按下）。
4. 提示层级 32：字面量（没有层级变量）。
5. 提示最小高 28（小号键高）：字面量。

## 八、要 Owner 定的

1. **个人空间文件行要不要滑块悬停。** 行构件的规矩是不可点的行不加悬停（DESIGN.md §5「整行悬停」说的是可点的行）；但 Owner 2026-11-14 决定 #4 说过「滑块停在这一行时，行里的键自己垫底」，是照有滑块写的。这次照原来留着（逐像素不变）。**建议：去掉**——文件行整行点不了，铺一整行悬停底会让人以为能点；三个键自己有悬停，够了。点头的话只改一处 `itemSelector`。
2. **卷行展开后的题组行 44 → 48？** 现在照原值 44（`size="sm"`），DESIGN.md §5 Rows 写最小高 48。对照图 `proposal-group-row-48.png`：改 48 每行高 4px，一套卷 4～8 个题组，展开后多出 16～32px。**建议：改 48**，和首页、卷行一致，构件里就不用留 sm 这一档；点头的话改 `ConciergeGroupCard.tsx` 一处 `size`，再删 `row.css` 的 sm 两条。


## 协调人复核（2026-11-15）
- **窄屏提示不再铺满**：358 宽的白条里只有一句「题组已移出 · 撤销」，右边空一大片，还盖住卷面右下角的浮键。改回跟着字宽、居中（和原来 182 宽一样），最宽仍左右各留 16。上面「草稿卷提示 390」那条对照图拍的是改之前的铺满版。
- **第 1 条（个人空间文件行的滑块悬停）**：不改。Owner 2026-11-14 决定 #4 说过滑块停在文件行上时键自己垫底，这是 Owner 定的，留着。DESIGN.md 记为「不可点的行不加悬停」的例外。
- **第 2 条（题组行 44 → 48）**：先不改。题组行是卷行展开后的下一层，矮一档能看出层级，48 会让一套卷展开后长出一截。保留 `sm` 44，DESIGN.md 里写成「展开后的下一层行」。提案 · 单一来源。
- **第 3 条（证据目录 20M）**：`before/`、`after/` 里的原图删掉，留对照拼版、样张、提案图和 json。原图可以用 `row-shots.mjs`、`toast-shots.mjs` 重拍。
