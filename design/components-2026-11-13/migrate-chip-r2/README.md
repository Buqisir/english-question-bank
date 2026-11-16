# 胶囊构件第二轮（2026-11-14）

接第一轮（`../migrate-chip/README.md`）。照 Owner 2026-11-14「胶囊照你的」八条做：剩下的胶囊换上构件、补控件字号变量、胶囊不折行、草稿丸读屏名、`--radius-pill` 修正；协调方更正后，顶栏头像改成圆角族的 8px。没有提交。DESIGN.md、BRAND.md、PaperSurface、打印 / PDF 样式都没动。

对照图都是左改前、右改后，单张原图在 `before/`、`after/`，实测样式和读屏树在各自的 `measure.json`。

## 一、换了哪些处

| 位置 | 改前 | 改后 | 对照图 |
| --- | --- | --- | --- |
| 找题台筛选面板里的筛选胶囊（原 starter chip，`ConciergeDesk.tsx` 筛选那一排） | 手写 `<button aria-pressed>`：12.5px、上下 4 左右 10、高 27、透明底、写死边色 `#D8D8D2`；选中桌色底墨字 600 | `ChipToggle`：13px、高 28、左右 12、白底细边（`--eqb-color-border-subtle`）次要灰字；选中、悬停、滑块、焦点都走 chip.css。读屏仍是「切换按钮，阅读理解 107，已按下 / 未按下」 | `compare-filter.png` |
| 收起筛选后的已选筛选（原 active-filter chip） | 手写 `<button>`：桌色底墨字 500、12.5px、胶囊、悬停加深一档；读屏名「题型：阅读理解」，没说点了会怎样 | **`Button`（墨字 strong、小号 28）**，圆角 8；一直垫桌色底（Button「打开着」的样子），悬停、焦点照 Button；读屏名「题型：阅读理解，移除这个筛选」 | `compare-active-filter.png` |
| 详情页题型分布 `.peek-chip`、话题小签 `.peek-topic` | 墨字 12px、上下 3 左右 10、胶囊、桌色底 | `Chip`：次要灰字、上下 4 左右 8、高 24。题数「×N」仍比题型重一档（500）、数字等宽；话题小签自带的 `title`（完整路径）照旧 | `compare-detail.png`（测试数据只有完形题组配得出「15 题」，话题小签没拍到） |
| 讲评栏完形：词性 `pi-cloze-tag--pos`、考法 `pi-cloze-tag--sig`、证据类型 `pi-cloze-evidence-type-label` | 11px / 10px、暖棕字（`#5f554a`、`#221b15`、`#67594b`）、两档深浅底 | `Chip` | `compare-lecture.png`（样张，见下） |
| 讲评栏语法填空：有无提示词 `pi-gf-tag--type`、提示词 `pi-gf-blank-hint`（原来是描边胶囊）、考点 `pi-gf-tag--facet`、句法成分 `pi-gf-badge--role`、证据类型 `pi-gf-evidence-type-label` | 同上 | `Chip` | `compare-lecture.png` |
| 草稿丸读屏名（首页、整卷页） | 「打开草稿卷，已选 3 个题组」 | 「草稿卷（3 组）：打开草稿卷」；数量还没取到时「草稿卷：打开草稿卷」（看得见的字是「草稿卷」） | 样子不变，见 `after/measure.json` 的 `basketHomeAx`、`basketPaperAx` |
| 顶栏头像 `.topbar-avatar` | `border-radius: 6px` | `var(--eqb-radius-control)`（8px） | `compare-avatar.png` |
| 词汇听写公开页进度条、「重播本题」 | `var(--radius-pill)` | `var(--eqb-radius-pill)` | `compare-dictation.png` |
| chip.css 字号 | `13px` 字面值 | `var(--eqb-font-size-control)` | `compare-browse.png`（浏览页胶囊截图换前换后逐字节相同） |

讲评栏为什么是样张：测试数据（`INVENTORY_SEED=full`）里没有已发布的完形、语法填空解析，讲评栏只显示「解析未发布」（`before/measure.json` 的 missing 里留着两条没拍到的记录）。`scripts/component-inventory/chip-r2-lecture-sheet.mjs` 照两个面板的原样标记排出来，样式直接读仓库里的 `index.css`、`tokens.css`、`chip.css`、`lectureAnalysisPanels.css`，画的是真样式。

删掉的旧 CSS（被构件接手的）：

- `App.css`：`.concierge-starter-chip` 的底样、`position`、`[data-fluid-hover-active]`、`:focus-visible`、`.is-selected`、`.is-selected:hover` 六条；`.concierge-active-filter-chip` 本身、`:hover`、`:focus-visible` 三条。留下 `.concierge-starter-chip.is-zero`（这一项 0 条时变淡 0.45，写了 Explicit-Cascade 注释）和两个列表的排法；滑块圆角 `--fh-radius` 改成 `var(--eqb-radius-pill)`。
- `QuestionGroupDetailView.css`：`.peek-chip, .peek-topic` 那条；`.peek-chip b` 去掉颜色，只留字重和等宽数字。
- `lectureAnalysisPanels.css`：`.pi-cloze-tag / .pi-gf-tag / .pi-gf-blank-hint` 底样、`--sig / --facet` 深一档、提示词描边、`.pi-gf-badge` 和 `--role`、两个 `evidence-type-label` 的胶囊样子。证据类型小签只留和下面引文的 3px 间距。

类名都留在元素上当钩子（FluidHoverList 的 `itemSelector`、脚本、QA）。讲评栏那几个类没有样式了，加进了 `scripts/verify-lecture-panel-css.mjs` 的 `HOOK_ONLY`。

### 样子变了的地方

1. **筛选胶囊**：高 27 → 28、字 12.5 → 13、左右留白 10 → 12，每颗宽 6–7px（「阅读理解 107」95.3 → 102.3）；静止从透明底变白底、边从写死的暖灰变成 `--eqb-color-border-subtle`；键盘焦点从 `--focus-ring` 变成 chip.css 的 2px 石板墨环离 2px（和浏览页、Button 一致）。390 宽下每颗变宽，题型、年份两排各多折一行，面板高了约 40px。理由：和浏览页筛选胶囊是同一种东西，第一轮已定 ChipToggle 的样子。
2. **已选筛选**：不再是胶囊。仍是桌色底墨字，圆角 999 → 8；字 12.5 / 500 → 13 / 500；悬停原来加深到边框色，现在照 Button 仍是桌色底（悬停不再变深）；键盘焦点环照 Button。第一版改成过透明底，静止时只剩一行字加 ×，看不出能点、能移除，协调方审后改成常垫桌色底（`App.css` `.eqb-button.concierge-active-filter-chip`，带 Explicit-Cascade 注释）。理由见第二节第 1 条。
3. **详情页、讲评栏的小签**：字从墨色 / 暖棕统一成次要灰（Owner 第 2 条），讲评栏的 10–11px 小字变成 12px、高变成 24，所以讲评栏题头、证据卡都高了几像素；完形「考法」、语法填空「考点」原来比旁边的小签深一档，现在和旁边同一档（见第三节第 1 条）；语法填空「提示词」原来是描边胶囊，现在和别的小签一样是桌色底。
4. **顶栏头像**：圆角 6 → 8，原寸看几乎一样，放大 4 倍看角略圆。
5. **听写页**：进度条深色那段右端从直角变圆头；「重播本题」底是透明的，看得出来的只有键盘焦点环从直角变成胶囊形。

## 二、判断：是标签还是动作

1. **已选筛选归 Button**。它看起来是胶囊、写的是一个筛选，但点一下就是「移除这个筛选」，是动作，不是标记，也不是开关（按下去它就消失了，没有「未按下」的状态）。照「看起来是胶囊、其实是按钮或动作的，归 Button」，用墨字小号，常垫桌色底（Button「打开着」的样子），让人一眼看出「已经选了这个、点了能移除」。
2. **筛选面板里的胶囊归 ChipToggle**：点了切换这个筛选选没选，`aria-pressed`，是开关。
3. **详情页、讲评栏的小签归 Chip**：不可点，只告诉老师一件事。讲评栏证据类型小签在一个可点的证据卡（`<button>`）里面，小签本身不可点，按标记处理。

## 三、判断不准、没换的

1. **完形「考法」、语法填空「考点」的强调没了**：原来这一个比同一行的词性 / 有无提示词深一档（底 12% 墨、字近黑），表示它是这题的重点。Chip 只有一种样子，换上以后同一档。**Owner 2026-11-14 定：先不加**重一档的标记，和其它小签同一档。
2. **七选五题号小签 `pi-seven-blank-tag`**（选项卡里的「第 36 题」）：底色是这条推理链的颜色（`--seven-strong`，五种），和卷面上的高亮对得上。换成 Chip 会丢掉颜色对应，没换。
3. **七选五 A–G 跳转 `pi-seven-option-jump-chip`**：26×26 的圆形字母键，`aria-pressed`，带推理链颜色。是开关，但形状是圆钮，不是胶囊，颜色也有意思，没换。
4. **完形 / 语法填空答案 `pi-cloze-answer-badge`、`pi-gf-answer-badge`**：答案字母或单词放在一块深底上，是「答案」本身，比标记重，按徽章算，没换。
5. **A3 草稿卷缝上的建议 `.draft-seam-suggestion`**（「跨页断篇 · 建议前置分页」）：胶囊形，但点了是插一个分页，是动作，照规矩该归 Button。它绝对定位在卷面缝上、样子和 `.draft-group-suggestion` 是 Owner 2026-11-13 一起定的「提议的样子」，这一轮没动，建议和 `.draft-group-suggestion` 一起换。
6. **登录页「登录」`.login-submit`**：胶囊形的提交按钮，是动作，该归 Button，不在胶囊这一轮，没动。
7. **详情页浮着的「展开」`.peek-expand`**：胶囊形，是动作，同上。
8. **找题台骨架屏 `.concierge-skeleton-chip`**：筛选胶囊加载时的占位条，高 24、写死 999px。现在胶囊是 28 高，占位条比真东西矮 4px；它不是胶囊构件，没动。

其余写着 999px 的都不是标签：播放器的键和进度、听写 / 听力 / 复习页的进度条和音量格、卷面讲评里的小圆点（`::before`）、滚动条、思考模式开关、`pi-ps-analysis-trap-meta span`（透明底、无内边距，圆角不起作用，看上去就是一行字）、写作讲评 `dt`（没有底色，圆角不起作用）。

`App.css` 里还有 16 条带 999px 的规则，类名在页面代码里一个也找不到（`.version-toggle`、`.source-line span`、`.detail-facts span`、`.question-topline span`、`.difficulty-profile-score em`、`.synonym-difficulty-flags strong`、`.analysis-disclosure-toggle`、`.paper-meta span`、`.saved-paper-heading strong`、`.bundle-status`、`.draft-option-count`、`.calibration-reasons span`、`.difficulty-review-stats span`、`.review-q-flag`、`.calibration-report-chips span`、`.calibration-report-watch-item em`），是早先页面退役留下的。不是这次替换的，没删，建议单开一个清理。

## 四、窄栏不折行、截断怎么看全文

- `chip.css` 的 `.eqb-chip` 加了 `max-width: 100%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis`。胶囊是 `inline-flex`，flex 容器自己的字画不出省略号，所以 `Chip.tsx` 把字包进 `<span class="eqb-chip-label">`（`min-width: 0; overflow: hidden; text-overflow: ellipsis`），省略号由它画，和 Button 的 `.eqb-button-label` 同一个办法。
- **看全文**：
  - 读屏：DOM 里是全文，截断只是画面上的，读屏、复制都拿得到全文。`ChipToggle` 是按钮，读屏名就是全文。
  - 看得见的人：指针移上去（`Chip`、`ChipToggle`）或键盘停上去（`ChipToggle`）时，量一下字是不是被截了，截了就把全文写进元素的 `title`，没截就拿掉，所以没被截断的胶囊不会冒提示。调用方自己给了 `title`（详情页话题小签给的是完整话题路径）就不碰。实测草稿卷「换篇」窄栏里那条长理由，指针停上去后 `title` 是全文（`after/measure.json` 的 `similarDraftLongHover`）。
- 草稿卷「换篇」栏（`DraftPaperRail.tsx`）：栏只有 208 宽，理由小签原来挤在标题左栏（约 90px）里，「同话题：人与自然」折成两三行、胶囊变成大椭圆。只加不折行的话，连短理由也被截成「同话题：…」，信息全丢（第一版就是这样，协调方审后返工）。现在把理由小签那一行挪到卡片底部、「替换这篇 / 加入」两个键下面，跨满整张卡（左右到卡片内边距，约 166px）：短理由写全，只有特别长的（拍图用的长理由）才打省略号，指针停上去看全文。布局在 `DraftPaperWorkbench.css` `.draft-swap-drawer` 下三条，只管换篇栏，带 Explicit-Cascade 注释。见 `compare-similar.png`。
- 首页相似篇章面板（`SimilarPassagesPanel.tsx`）不动：面板宽，长理由一行放得下，样子没变。
- 筛选面板的胶囊包在 `<li>` 里，`<li>` 没设 `min-width: 0`，所以筛选胶囊实际不会被截（字都短）。

## 五、已定和待定

1. 完形「考法」、语法填空「考点」要不要重一档的标记：Owner 2026-11-14 定：先不加，和其它小签同一档。
2. 已选筛选：按协调方审定，改成 Button 常垫桌色底（「打开着」的样子）、墨字、圆角 8，不退回胶囊。

## 六、13px 清点

`tokens.css` 加了 `--eqb-font-size-control: 13px`，放在 `--eqb-font-size-xs` 和 `-sm` 中间，注释写明用在控件类（胶囊、紧凑按钮）。这次只换了 `chip.css` 一处。

`app/src` 的 css 里（不算 `shared-ui/papersurface`，那里没有）还有 **122 条** `font-size: 13px`：

| 文件 | 条数 |
| --- | --- |
| App.css | 57 |
| paper-intelligence/paperIntelligence.css | 20 |
| draft-paper/DraftPaperWorkbench.css | 7 |
| admin/adminWorkbench.css | 5 |
| question-detail/QuestionGroupDetailView.css、paper-intelligence/lectureAnalysisPanels.css、paper-browse/paperBrowsePage.css、my-space/MySpacePage.css | 各 4 |
| vocabulary-dictation-workbench/vocabularyDictationWorkbench.css、paper-browse/selection/sentence-analysis/sentenceAnalysis.css | 各 3 |
| vocabulary-practice/vocabularyPracticePage.css、vocabulary-notebook/vocabularyNotebook.css | 各 2 |
| shared-ui/button.css、shared-ui/menu.css、shared-ui/draftAddButton.css、vocabulary-review/vocabularyReviewPage.css、vocabulary-practice/vocabularyHandwriting.css、paper-browse/selection/selectionOverlay.css、auth/LoginPage.css | 各 1 |

其中 shared-ui 的三处（按钮、菜单项、加入键）是控件，最该先换；页面里的 13px 很多是正文小字而不是控件，换之前要一处处分。TSX 行内没有 13px 字号。

## 七、圆角族外的字面量

`app/src` 的 css（不算 `var()`）现在家族外还剩 **10 处**，全在 `scripts/verify-radius-family.mjs` 的 BASELINE 里，个数和 BASELINE 一致：

- 10px：`paper-intelligence/paperIntelligence.css:91`、`:330`
- 3px：`paper-intelligence/paperSurfaceLectureHighlights.css:47`、`paperIntelligence.css:370`、`:581`、`:618`、`:1406`、`:1415`
- 2px：`paperIntelligence.css:186`
- 6px：`vocabulary-review/vocabularyReviewPage.css:1846`（`@media print`，打印样式，没动）

第一轮清单里的**顶栏头像 `App.css` `.topbar-avatar` 6px 已改成 `var(--eqb-radius-control)`（8px）**，不再是族外。BRAND.md 第 105 条要它和浏览器图标同形；圆角按圆角族取，28px 高按「按高度选档」用 8，约是边长的 29%，比浏览器图标的 22% 略圆。原寸下差别很小，放大 4 倍见 `compare-avatar.png`（DPR 2 截图，最近邻放大）。

## 八、`--radius-pill` 换前实际是什么

`vocabularyDictationPage.css` 的进度条深色段（`.vocabulary-dictation-progress span`）和「重播本题」（`.vocabulary-dictation-replay`）写的是 `border-radius: var(--radius-pill)`，这个变量哪里都没定义。`var()` 引用了没定义的变量又没给兜底值，这条声明在计算值阶段作废，`border-radius` 不继承，所以退回初始值 **0（直角）**。实测：改前「重播本题」的 `border-radius` 是 `0px`；进度条深色段左端被外框（`overflow: hidden` + 999px）裁成圆头，右端是直角。改成 `var(--eqb-radius-pill)` 后两处都是 999px。

顺带看到：同一条「重播本题」写的 `font-size: var(--text-sm)` 也是没定义的变量，字号退回继承的 16px（实测 16px）。不在这次范围，没改，建议登记到 `docs/design-gaps.md` 或单开修正。

## 九、核对

- `cd app && pnpm build`（`tsc -b && vite build`）通过。
- 浏览页筛选胶囊（只换了字号变量）换前换后截图逐字节相同。
- 改了但**没跑**：
  - `scripts/verify-concierge-desk.mjs`：筛选胶囊那条改成要 `<ChipToggle` 加 `concierge-starter-chip`；草稿丸读屏名那条改成要以「草稿卷（N 组）：打开草稿卷」开头。
  - `scripts/verify-lecture-panel-css.mjs`：`HOOK_ONLY` 加了 7 个只当钩子的类。
- 没碰的检查：`smoke-concierge-stream.mjs` 用 `aria-label*="草稿卷"` 找草稿丸，新名字仍然匹配；`verify-radius-family.mjs` 不用改（族外个数只减不增）。

## 十、脚本

- `scripts/component-inventory/chip-r2-shots.mjs`：拍改前改后（`node scripts/component-inventory/chip-r2-shots.mjs before|after`，自己起停本地站，端口偏移 58、种子 full）。相似篇章拦接口回两条假结果（其中一条是造的长理由），听写页拦公开听写接口回三个假词条，只在截图里。
- `scripts/component-inventory/chip-r2-lecture-sheet.mjs`：讲评栏样张（`before|after`），要在 `chip-r2-shots.mjs` 之后跑（后者会清空输出目录）。
- 对照图是临时 python 脚本（PIL）拼的，没放进仓库。
