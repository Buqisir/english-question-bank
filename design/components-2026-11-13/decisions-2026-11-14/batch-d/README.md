# 拍板落地 D 批：按钮第 18 到 22 条

状态：第 18 条是**已定**（Owner 2026-11-14，原文见上一级 `README.md` 第五节）；第 19 到 22 条和这一批的落地细节（怎么区分弹出类和就地展开类、`data-opens-popup` 这个名字、各处负边距、「重播」的读屏字怎么拼）是**提案 · 单一来源**，只经过脚本和四项检查。同事访谈按 11-08 的决定没做。已在本地提交，没有推送。

第 23 条（只问「可以吗」的几处，Owner 认下）不用改代码，这批没动。

- 拍图脚本：`scripts/component-inventory/decisions-d-shots.mjs before|after` → `before/`、`after/`（`shots/*.png` + `measure.json`）。`before` 是在改代码以前用原来的源码拍的。Chromium，1440 和 390，DPR 2，减少动效。
- 对照：`compare/compare-*.png`（左改前、中改后、右红色标出变了的像素），`pixel-diff.json`（每张图变了多少像素、在哪个框里；任一通道差 > 3 算变）。做对照图的 PIL 脚本放在临时目录，没进仓库，和前几批一样。
- 读屏是 Chrome 自己算的读屏树（CDP `Accessibility.getPartialAXTree` 的 name / description / expanded / disabled / hasPopup），改前改后各量一次。
- 脚本自己起一套 Vite + API（`rig.mjs`，端口偏移 40，数据在 `.scratch/component-inventory/rigdata-40`），没用也没停别人起的本地网站。平时出不来的状态只在截图里拦接口：相似篇章 `POST /api/similar-passages` 回 500（出「重试」）；讲评、七选五解析、整卷预览、词典假词条「destination」同 B 批；过生词词库照 `vocab-review-shots.mjs` 导进这份临时数据。

## 1. 改了什么

### 第 18 条：只有弹出类的键「打开着」才垫底

先把全站传了 `aria-expanded` 的 `Button` / `ButtonLink` 调用处都列出来（`grep aria-expanded` 全部 `.tsx`，再逐个看是不是 `Button`；`ButtonLink` 没有一处传它）：

| 类 | 键 | 文件:行（改后） | 语气 | 有没有 `aria-haspopup` |
|---|---|---|---|---|
| 弹出类 | `Menu` 的所有触发键（草稿卷题组「⋯」更多题组操作、草稿卷「导出」、首页题组行「⋯」、个人空间文件行「⋯」、详情页「更多操作」） | `app/src/shared-ui/Menu.tsx:222` | 各处不同 | 有，`menu` |
| 弹出类 | 草稿卷顶栏「⋯」（草稿卷更多信息，开一块 `role="group"` 的弹层） | `app/src/features/draft-paper/DraftPaperWorkbench.tsx:1469` | subtle | 没有 |
| 弹出类 | 首页「筛选」开关（开筛选面板） | `app/src/concierge/ConciergeDesk.tsx:703` | strong | 没有 |
| 弹出类 | 过生词「下载」（开一组下载选项） | `app/src/features/vocabulary-review/VocabularyReviewPage.tsx:1327` | solid | 没有 |
| 不算（solid） | 整卷预览「讲评」开关（开着时语气换成 solid，同时有 `aria-pressed`） | `app/src/features/paper-browse/PaperBrowsePage.tsx:4063`、`:4101` | quiet / solid | 没有 |
| 就地展开 | 首页「更多筛选 / 收起筛选」 | `app/src/concierge/ConciergeDesk.tsx:820` | quiet | 没有 |
| 就地展开 | 讲评栏「文章简介」 | `app/src/features/paper-browse/PaperBrowsePage.tsx:3501` | quiet | 没有 |
| 就地展开 | 词典卡「更多义项 / 收起」「详细解释 / 收起解释」「署名与隐私」 | `app/src/features/paper-browse/selection/DictionaryCard.tsx:277`、`:495`、`:511` | quiet | 没有 |
| 就地展开 | 过生词「新建学生 / 取消」 | `app/src/features/vocabulary-review/VocabularyReviewPage.tsx:1470` | strong | 没有 |
| 就地展开 | 过生词「查看 / 调整进度 / 收起进度」 | `app/src/features/vocabulary-review/VocabularyReviewPage.tsx:1514` | quiet | 没有 |
| 就地展开 | 七选五「展开细节 / 收起细节」（第 19 条换成 Button 以后） | `app/src/features/paper-intelligence/SevenChoicesAnalysisPanel.tsx:188` | quiet | 没有 |

（另外几处传了 `aria-expanded` 的是手写 `<button>`：首页结果行展开键、句子分析卡难点旗、整卷解析选项行、听力播放器，不归 `button.css` 管，没动。）

**怎么区分**：`button.css` 里「打开着」那条（`app/src/shared-ui/button.css:101`）和嵌在行里垫 border 色那条（`:145`）的 `[aria-expanded='true']` 后面都加了 `:where([aria-haspopup]:not([aria-haspopup='false']), [data-opens-popup])`。

- `Menu` 的触发键本来就带 `aria-haspopup="menu"`，不用改。
- 草稿卷顶栏「⋯」和首页「筛选」开的不是菜单。给它们补 `aria-haspopup` 会让读屏多念「弹出式菜单」（`true` 就等于 `menu`），`dialog` 也不对（弹层没有 `role="dialog"`），都会改读屏语义。所以在调用处挂一个只给样式看的 `data-opens-popup=""`（`DraftPaperWorkbench.tsx:1478`、`ConciergeDesk.tsx:708`）。`Button` 把多出来的属性原样放到 `<button>` 上，**没改 `Button.tsx`**。
- 过生词「下载」是 solid，本来不归这条管，也挂了 `data-opens-popup`（`VocabularyReviewPage.tsx:1331`），只是标明它是弹出类，样子不变（实测它这次没拍到，见第 6 节）。
- 选「弹出类自己举手」而不是「就地展开类举手」：要挂属性的只有 3 处（反过来要 8 处），以后新加的展开收起键默认就是不垫底的样子，新加的弹出键用 `Menu` 就自动带 `aria-haspopup`。
- 条件放在 `:where()` 里不加特指度：「打开着」那条仍是 (0,3,0)；行里那条的 `:is(:hover, …)` 仍取 `:hover` 的 (0,1,0)，整条仍是 (0,6,0)。和 `.fluid-hover-list …:hover 透明` (0,5,0) 等别的规则的先后关系一个都没变。

### 第 19 条：七选五「展开细节」

- `SevenChoicesAnalysisPanel.tsx:187-196`：手写 `<button>` 换成 `<Button tone="quiet" size="sm" className="pi-seven-details-toggle" aria-expanded={detailsOpen}>`，类名留着当挂钩。
- `lectureAnalysisPanels.css`：删了 `.pi-seven-details-toggle` 那条带框奶油底的手写样子（内边距 5px 9px、1px `#d8d0c4` 边、圆角 4、`#fffaf0` 底、`#3f352b` 字、12px）；留下原来的 `margin-bottom: 8px`；新加 `.eqb-button.pi-seven-details-toggle { margin-left: calc(-1 * var(--eqb-space-2)) }`（`:536`），照「全部显示」的办法让字贴齐上面那行解析的左边。`.pi-seven-panel-actions` 上方那段注释里「展开细节仍用手写样式」改掉了（`:392`）。

### 第 20 条：相似篇章面板「重试」悬停垫桌色

- `paperBrowsePage.css:1839-1847` 加一条：`.fluid-hover-list .similar-passages-panel .similar-rail-error > .eqb-button.similar-btn:hover:not(:disabled, [aria-disabled='true']) { background: var(--eqb-color-desk) }`。和 B 批给「收起」的那条同一个办法。覆盖：本条 (0,7,0) 盖过 `button.css`「`.fluid-hover-list .eqb-button…:hover` 透明」(0,5,0)，也盖过「嵌在被选中行里的键垫 border 色」(0,6,0)（面板不在行里，碰不上）。
- 上面两条注释里「重试……待 Owner 定」改成指向这一条（`:1825`、`:1834`）。
- 这个「重试」实际在面板的出错块（`.similar-rail-error`）里，不在 `.similar-passages-head` 里；A1 README 第 5 节第 3 问说的就是它。

### 第 21 条：过生词「重播」换成 Button

- `VocabularyReviewPage.tsx:1758-1770`：`<Button tone="subtle" size="md" className="vocabulary-word-replay" icon={<VolumeFeedbackIcon …/>}>`，字是 `重播<span className="visually-hidden"> {headword} 的{美音|英音}</span><kbd aria-hidden="true">空格</kbd>`。原来的 `aria-label` 是 `重播 ${headword} 的${美音|英音}`，现在由看得见的「重播」加只给读屏的「 X 的美音」拼出同样的字；「空格」键帽留着，`aria-hidden` 让它不进名字（原来被 `aria-label` 盖掉，也不在名字里）。
- `vocabularyReviewPage.css`：删了 `.vocabulary-word-replay` 整条（描边、白底、内边距、14/600 等）和焦点选择器列表里的 `.vocabulary-word-replay:focus-visible`（焦点环改由 `button.css` 给）。键帽那条加 `display: inline-block`（Button 的字标签为了省略号是 `overflow: hidden`，键帽是行内框时上下边会被裁掉；排成 inline-block 撑开行高）和 `margin-left: calc(var(--eqb-space-1) * 1.5)`（原来的 6px 间距）。键帽原有的边、底、字号没动。

### 第 22 条：音标发音键左负边距

- `vocabularyReviewPage.css:681`：`.vocabulary-pronunciation` 加 `margin-left: calc(-1 * var(--eqb-space-3))`，抵掉 md 的左内边距。

### 其他

- `DESIGN.md` §5 Buttons：加「打开着的键（Owner 2026-11-14 定）」一条；「纯文字键」里「静止时仍像一行字」补一句「展开以后也是」，并记下七选五「展开细节」后来也换了；「描边键」里「『重播』等没换」改成「『重播』后来在 D 批换了」。
- `docs/design-gaps.md` 没有新增：这批新写的 CSS 只用了 `--eqb-space-1/2/3` 和 `--eqb-color-desk`，没有缺的 token。

## 2. 没改的和原因

| 什么 | 为什么 |
|---|---|
| `Button.tsx` | 用调用处的 `data-*` 属性就够了，不用加新属性。 |
| 整卷预览「讲评」开关 | 开着时语气换成 solid，不归「打开着垫底」那条管；它是开侧栏还是弹出，这次不用定。 |
| 手写的展开键（首页结果行展开、句子分析难点旗、整卷解析选项行、听力播放器） | 不是 `.eqb-button`，规矩里也不让碰句子分析卡和听力播放器。 |
| 七选五等 `<summary>` 做的「文章简介」 | B 批第 5 问，等它自己那一批。 |
| 句子分析卡的「重试」 | C 批第 2 问，等句子分析卡那一批。 |
| `App.css` 里「筛选」开关的注释 | 还说「展开时用构件的打开着样子」，现在仍然对（它挂了 `data-opens-popup`），没改。 |

## 3. 改前改后（实测，单位 CSS px）

### 弹出类：打开着，像素差全是 0

| 键 | 两个宽度打开着的底 | 像素差（整块 + 只拍键） |
|---|---|---|
| 首页「筛选」 | 桌色 `rgb(230,237,240)`，墨字 | 0 / 0 |
| 首页题组行「⋯」（滑块停在这一行） | border 色 `rgb(220,230,235)` | 0 / 0 |
| 草稿卷顶栏「⋯」 | 桌色 | 0 / 0 |
| 草稿卷题组「⋯」 | 桌色 | 0 / 0 |
| 草稿卷「导出」（primary） | 雾薄荷 `rgb(114,191,164)` | 0 / 0 |

每个两个宽度、各两张图，一共 20 张，`pixel-diff.json` 里都是 0。改前改后计算样式也一样。

### 就地展开类：展开后静止不再垫底

改后静止时底都是透明，字回到各自语气的颜色：quiet 是 `rgb(63,82,91)`（`--eqb-color-text-secondary`），strong（「取消」）还是墨 `rgb(27,43,51)`。改前静止都是桌色底、墨字。悬停改前改后都是桌色底、墨字，**像素差 0**；键盘焦点改后是 2px `rgb(41,66,77)` 外框、没有底（改前是外框 + 桌色底）。键的框、字的位置都没动。

| 键（1440） | 框 | 改前 静止底 → 改后 | 静止 / 焦点 像素差（1440） | 悬停 像素差 |
|---|---|---|---|---|
| 收起筛选 | 284,448 81×28 | 桌色 → 透明 | 8865 / 8244 | 0 |
| 文章简介（展开后） | 1319,41 88×28 | 桌色 → 透明 | 9655 / 9311 | 0 |
| 收起（义项） | 631.8,675.7 58×28 | 桌色 → 透明 | 6296 / 6059 | 0 |
| 收起解释 | 609.8,700.7 86×28 | 桌色 → 透明 | 9431 / 8935 | 0 |
| 署名与隐私（展开后） | 834.8,712.7 97×28 | 桌色 → 透明 | 10663 / 10175 | 0 |
| 收起进度 | 1316,219 68×28 | 桌色 → 透明 | 7409 / 6821 | 0 |
| 取消（新建学生展开后） | 1366,138 50×36 | 桌色 → 透明（字仍墨） | 6688 / 6688 | 0 |

390 宽一样：七个键静止和焦点有差，悬停 0。

### 第 19 条：七选五「展开细节 / 收起细节」

| | 改前 | 改后 |
|---|---|---|
| 框（1440） | 1036,530.5 68×29 | 1028,531.5 68×28 |
| 字 | 1046 起，12/400 `rgb(63,53,43)` | 1036 起，13/500 `rgb(63,82,91)` |
| 上一行解析的字左边 | 1036 | 1036（改后字和它对齐，差 0） |
| 边、底 | 1px `rgb(216,208,196)`、奶油底 `rgb(255,250,240)`、圆角 4 | 无边、透明底、圆角 8 |
| 悬停 | 没变化 | 桌色底、墨字 |
| 焦点 | 浏览器默认 1px `rgb(16,16,16)` | 2px `rgb(41,66,77)`、外移 2 |
| 展开后静止 | 带框奶油底 | 透明（就地展开类，第 18 条） |

390 宽：框 135.2 → 127.2，字 145.2 → 135.2，上一行解析字左边 135.2，对齐。按键高 29 → 28，所以展开后整块矮 1px（`seven-details-expanded.png` 944 → 942 设备像素），下面的内容上移 1px，这张图整片有差。

### 第 20 条：相似篇章面板「重试」

| | 首页（在滑动列表 `concierge-group-index` 里） | 详情页（对照） |
|---|---|---|
| 改前 悬停 | 透明（什么都不变） | 桌色 |
| 改后 悬停 | 桌色 `rgb(230,237,240)` | 桌色 |
| 像素差 | 只有悬停两张有差（各 4329），静止、焦点 0 | 全部 0 |

键的框不变（1440 首页：x 36，42×28；字 13/500 墨）。

### 第 21 条：「重播」

| | 改前 | 改后 |
|---|---|---|
| 框（1440） | 752.9,375 110×36 | 750.9,377 114×32 |
| 字「重播」 | 783.9,383.5 w28，14/600 `rgb(90,108,117)` | 784.9,384 w26，13/500 同色 |
| 喇叭图标 | 761.9,385 | 762.9,385 |
| 键帽「空格」 | 817.9,382 36×22，12/600 | 816.9,382 36×22，12/500（字重跟着键走），边 1px/2px、底色不变，上下边没被裁（放大看过对照图） |
| 边、底 | 1px `rgb(230,237,241)`、白底 | 无边、透明底 |
| 悬停 | 没变化 | 桌色底、墨字 |
| 焦点 | 2px `rgb(41,66,77)` 外移 2 | 同左 |

键比原来矮 4px、宽 4px；单词行是居中排的，所以单词「a / an」也跟着左移 2px（对照图里单词那一块也标红）。390 宽：框 140,626.4 110×36 → 138,626.4 114×32；整张背词卡矮 4px（`stage-390.png` 1592 → 1584 设备像素，翻开后 2028 → 2020）；1440 宽卡高不变。

### 第 22 条：音标键对齐

| | 改前 | 改后 |
|---|---|---|
| 键左边（1440） | 681.59 | 669.59 |
| 喇叭 svg 盒子左边 | 693.59 | **681.59** |
| 喇叭图形（path 几何外框，不含描边宽）左边 | 695.18 | 683.18 |
| 下面释义（`art.`）字左边 / 释义块内容区左边 | 681.59 / 681.59 | 681.59 / 681.59 |

svg 盒子左边和释义字左边差 0（390 宽：52 对 52）。图形本身在 16px 盒子里往里 1.59px，这是图标画法自带的，这次没去抵它（要抵得写分数 token 或字面量）。

## 4. 读屏（Chrome 读屏树，改前改后）

两个宽度、全部拍到的键改前改后 name / description / expanded / disabled / hasPopup 一字不差：

- 弹出类：「筛选」expanded=true；「更多操作」hasPopup=menu；「草稿卷更多信息」描述「学生 / 最近草稿卷」；「更多题组操作」「导出」hasPopup=menu。挂了 `data-opens-popup` 的两个键没有多出 hasPopup。
- 就地展开类：「收起筛选」「文章简介」「收起」「收起解释」「署名与隐私」「收起进度」「取消」「收起细节」都是 expanded=true；「展开细节」expanded=false。
- 「重试」：name「重试」。
- 音标键：name「/eɪ, ə; æn, ən/」，描述「播放美音」。
- **「重播」**：改前 name「重播 a / an 的美音」，description 无；改后 name「重播 a / an 的美音」，description 无。唯一的不同是名字的来源从「属性」（aria-label）变成「内容」。

## 5. 要 Owner 看的问题

1. **`data-opens-popup` 这个办法**：开的不是菜单的两个弹出键（草稿卷顶栏「⋯」、首页「筛选」）靠调用处挂这个属性才保持「打开着」的底。以后新加这类键要记得挂，忘了挂就会像就地展开键一样不垫底。要不要改成 `Button` 的一个正式属性（要改构件），还是就这样？
2. **就地展开键展开后的字色**：「收起筛选」等淡墨键展开后静止时，字从墨色回到淡墨 `rgb(63,82,91)`，和收起时一样，只靠字和箭头分辨开合。可以吗？
3. **七选五「收起细节」**：原来带框，展开收起都看得出是个键；现在和「全部显示」一样像一行字。按键高 1px 改变让展开后的整块矮 1px。
4. **「重播」字变轻**：14/600 → 13/500，键帽的字也跟着从 600 变 500；键高 36 → 32，390 宽背词卡矮 4px。
5. **音标键**：喇叭的 svg 盒子已经和释义字左边对齐，但图形本身还往里 1.6px（图标自带的留白）。要不要再抵？

## 6. 哪些是量到的，哪些是推断

- 量到的：第 3、4 节所有数字，来自 `before/measure.json`、`after/measure.json`；像素差来自 `pixel-diff.json`。所有键盘焦点图都确认焦点真在键上且 `:focus-visible` 成立（`focusIsKey: true`）。
- **没拍到**：过生词「下载」（solid，弹出类）——这份临时数据里过生词页没有词表，页面上不出「下载」键，两个宽度都没拍到。它是 solid，本来不归这条规则管，样子不变是从规则推出来的。个人空间文件行「⋯」、详情页「更多操作」也没单拍，它们和首页题组行「⋯」、草稿卷题组「⋯」一样走 `Menu`，没变是推断。
- **没拍到**：「重播」的英音版本（`reviewAccent` 为英音时名字是「重播 X 的英音」），只拍了美音；英音是同一行代码的另一个分支，推断一样。
- **没拍到**：「重试」在草稿卷换篇栏里的样子（不在滑动列表里，不归新规则管，推断不变）。
- 推断：长单词时只给读屏的字是绝对定位、不占宽，键不会变宽；没拍长词。
- 改前试拍时发现：按 Control 再 `focus()` 在一半的键上出不了焦点环（Chrome 不把带 Ctrl 的按键算键盘操作），改成按 Tab；词典卡在 390 宽按 Tab 会把焦点送出浮层，改成卡里 Shift+Tab、Tab 走一个来回。正式的 before / after 都是改好的脚本拍的。
- 页面报错：两个宽度改前改后都是 29 条，全是拦截返回的 4xx/5xx 和本地数据缺的接口，改前改后一样多。

## 7. 受影响的脚本

只用 `node --check` 和把选择器、正则拿出来对改前改后的源码看过，没有跑任何 `verify-*.mjs`、`smoke-*.mjs`。没有需要改的脚本。

- `verify-concierge-desk.mjs:500`（行菜单触发键要有 `aria-haspopup=menu` 和 `aria-expanded`）、`verify-draft-workbench-visual-unify.mjs:137`（`'aria-expanded': open`）：`Menu.tsx` 没动，照旧匹配。
- `verify-draft-switch-mutations.mjs:119` 等、`component-inventory/draft-shots.mjs`、`scenarios.mjs:61` 用 `.draft-more-menu-trigger`：类名没动。
- `verify-a3-imposition.mjs:649` 用 `.similar-rail-error`：没动。
- `component-inventory/home-shots.mjs:58` 用 `.concierge-command-filter-toggle`：没动。
- `component-inventory/vocab-review-shots.mjs:203`、`:211` 用 `#vocabulary-download-options`、`.vocabulary-download-menu > button`：没动。
- `component-inventory/decisions-c-shots.mjs` 的 `REPLAY = '.vocabulary-word-replay'`：类名还在 `Button` 上，仍能找到（D 批脚本就是用它拍的）。
- 搜过 `重播`、`pi-seven-details-toggle`、`vocabulary-pronunciation`、`vocabulary-word-replay`：除了拍图脚本没有别的脚本引用（`verify-paper-browse.mjs:1382` 的「重播」是另一个意思的说明文字）。
- 新加 `scripts/component-inventory/decisions-d-shots.mjs`，`node --check` 通过。

## 8. 检查

| 检查 | 结果 |
|---|---|
| `node scripts/component-inventory/static.mjs --check` | 「基线没有变多」。这一批改前 → 改后：手写按钮 225 → 223，手写圆角 371 → 369，手写颜色 280 → 277，不同颜色 57 → 54，手写字号 650 → 648；手写输入框 67、阴影 25 / 17、不同圆角 15、不同字号 26 不变。没有一项变多。 |
| `cd app && npx tsc -b --noEmit` | 通过，没有输出。 |
| eslint 新旧对比（`git show HEAD:` 放成临时 `__old.tsx`，跑完已删） | `ConciergeDesk.tsx` 0/0 → 0/0；`DraftPaperWorkbench.tsx` 2 错 1 警告 → 一样（`react-hooks/set-state-in-effect` ×2、`exhaustive-deps`）；`SevenChoicesAnalysisPanel.tsx` 0 错 1 警告 → 一样；`VocabularyReviewPage.tsx` 4 错 1 警告 → 一样。都是原来就有的，没有新增。 |
| `git diff --check` | 通过。 |

## 9. 改动和新增的文件

改动：

- `app/src/shared-ui/button.css`（第 18 条，只这一条允许改构件）
- `app/src/concierge/ConciergeDesk.tsx`
- `app/src/features/draft-paper/DraftPaperWorkbench.tsx`
- `app/src/features/vocabulary-review/VocabularyReviewPage.tsx`
- `app/src/features/vocabulary-review/vocabularyReviewPage.css`
- `app/src/features/paper-intelligence/SevenChoicesAnalysisPanel.tsx`
- `app/src/features/paper-intelligence/lectureAnalysisPanels.css`
- `app/src/features/paper-browse/paperBrowsePage.css`
- `DESIGN.md`（§5 Buttons）

新增：

- `scripts/component-inventory/decisions-d-shots.mjs`
- 本目录（`before/`、`after/`、`compare/`、`pixel-diff.json`、本文件）
