# Owner 2026-11-14 决定 #1：纯文字键换成淡墨小号

状态：决定 #1 本身是**已定**（Owner 2026-11-14，原文见上一级 `README.md`）。怎么落地的细节（每个键用多少负边距、哪几个键算进来、首页面板里的「收起」悬停垫什么、草稿卷「返回目录」不要右负边距）是**提案 · 单一来源**，只经过脚本和四项检查。同事访谈按 11-08 的决定没做。已在本地提交，没有推送。

这一批只动调用处，没动 `Button.tsx`、`button.css`、`tokens.css`。改前改后用同一份数据拍、同一个脚本量，对照图和像素差都在这个目录里。

- 拍图脚本：`scripts/component-inventory/decisions-b-shots.mjs before|after` → `before/`、`after/`（`shots/*.png` + `measure.json`）。`before` 是在改代码以前用原来的源码拍的。Chromium，1440 和 390 两个宽度，DPR 2，减少动效；每个键拍静止、悬停、键盘焦点，能展开的再拍展开后。
- 对照：`compare/compare-*.png`（左改前、中改后、右红色标出变了的像素），`pixel-diff.json`（每张图变了多少像素、在哪个框里；任一通道差 > 3 算变）。做对照图的 PIL 脚本放在临时目录，没进仓库，和 A1、A2 一样。
- 读屏名字是 Chrome 自己算出来的读屏树（CDP `Accessibility.getPartialAXTree` 的 name / expanded / disabled），不是从属性猜的。
- 脚本自己起一套 Vite + API（端口偏移 40，数据在 `.scratch/component-inventory/rigdata-40`），没用也没停别人起的本地网站。讲评、七选五的解析从 `test-fixtures/retired-paper-assets/paper-2026-i/latest/analyses/` 里拦截返回；词典查词用拦截返回的假词条「destination」（四个义项，两个常用、两个折叠）；过生词的词库照 `vocab-review-shots.mjs` 的办法导进这份数据。

## 1. 换了的键

都换成 `<Button tone="quiet" size="sm">`（这一批没有链接，所以没用到 `ButtonLink`）。原来的类名都留着当选择器的挂钩，手写的样子删了。

| # | 键 | 文件:行（改后） | 对齐哪一边 | 负边距 |
|---|---|---|---|---|
| 1 | 首页「更多筛选 / 收起筛选」 | `app/src/concierge/ConciergeDesk.tsx:817` | 左（这一排第一个） | `margin-left: calc(-1 * var(--eqb-space-2))`（`App.css .concierge-filter-actions > .eqb-button:first-child`） |
| 2 | 首页同一排「清除筛选」 | `app/src/concierge/ConciergeDesk.tsx:828` | 跟在 1 后面 | 无；两个键之间 `gap` 从 14px 收到 `--eqb-space-1` |
| 3 | 相似篇章面板「收起」（首页题组卡、详情页） | `app/src/features/similar-passages/SimilarPassagesPanel.tsx:85` | 右 | 右 `-space-2`，上下 `-space-1`（`paperBrowsePage.css .eqb-button.similar-backlink`） |
| 4 | 草稿卷换篇栏「返回目录」 | `app/src/features/draft-paper/DraftPaperRail.tsx:44` | 跟在标题后面 | 上下 `-space-1`；右边不要负边距（见第 2 节） |
| 5 | 相似栏「← 返回解析」 | `app/src/features/paper-browse/SimilarQuestionsRailView.tsx:128` | 右 | 同 3 |
| 6 | 讲评栏「文章简介」 | `app/src/features/paper-browse/PaperBrowsePage.tsx:3501` | 右 | 右 `-space-2`（`paperBrowsePage.css .paper-browse-reading-overview-toggle`） |
| 7 | 七选五「全部显示」 | `app/src/features/paper-intelligence/SevenChoicesAnalysisPanel.tsx:109` | 左 | 左 `-space-2`（`lectureAnalysisPanels.css .pi-seven-panel-actions > .eqb-button:first-child`） |
| 8 | 七选五「全部隐藏」 | `app/src/features/paper-intelligence/SevenChoicesAnalysisPanel.tsx:112` | 跟在 7 后面 | 无 |
| 9 | 词典卡「更多义项 N / 收起」 | `app/src/features/paper-browse/selection/DictionaryCard.tsx:277` | 左（释义左缘） | 左 `calc(22px - var(--eqb-space-2))`，上 0 |
| 10 | 词典卡「详细解释 / 收起解释」 | `app/src/features/paper-browse/selection/DictionaryCard.tsx:495` | 左（箭头在字前，用 `icon` 位） | 左 `-space-2`，上 `+space-1`，下 `-space-1` |
| 11 | 词典卡「署名与隐私」 | `app/src/features/paper-browse/selection/DictionaryCard.tsx:511` | 右（页脚右栏） | 右 `-space-2`，上下 `-space-1` |
| 12 | 过生词「查看 / 调整进度 / 收起进度」 | `app/src/features/vocabulary-review/VocabularyReviewPage.tsx:1510` | 宽屏右、窄屏左 | 宽屏右 `-space-2`，窄屏左 `-space-2`，上下 `-space-1` |

- 用户点名的「全部展开 / 全部收起」在源码里叫「全部显示 / 全部隐藏」（七选五讲评面板），就是 7、8。
- 用户没点名、这次按同一类找到并换了的：3（和 4、5 共用 `.similar-backlink` 这个类）。
- 「更多义项」「署名与隐私」后面的箭头在字后面，放在 Button 的标签里（标签加了 `display: inline-flex`，间距用 token）；「详细解释」的箭头本来就在字前面，改用 Button 的 `icon` 位。
- 所有 `aria-expanded`、`aria-controls`、`disabled`、`{...iconMotionInput}` 都留着。
- 22px 是原来就有的「号列 16 + 列距 6」，不是新数，这次只是减掉了 sm 的左内边距。

顺手改的选择器（不改会盖掉构件的样子）：

- `vocabularyReviewPage.css` 里的 `.vocabulary-overall-progress span`（后代，(0,1,1)）会把 12 号键里的 `.eqb-button-label` 染成淡色 12px/600。改成 `.vocabulary-overall-progress > span`（只管进度那行字，特指度不变），三处都改了。
- `lectureAnalysisPanels.css` 里 `.pi-seven-panel-actions button`（(0,1,1)）会盖掉 Button 的内边距、边框和底色。从选择器里拿掉了，只剩「展开细节」用这条；`.pi-seven-panel-actions button:disabled` 删了。
- 词典卡三个键不再挂 `.paper-dictionary-more`（那个类留给「加入生词本」），换成新挂钩 `.paper-dictionary-text-toggle`。

删掉的手写样子：`App.css` 的 `.concierge-filter-clear`（第二块，12.5px、下划线）和 `.concierge-filter-more` 及两者的 `:hover`；`paperBrowsePage.css` 的 `.similar-backlink` 和 `.paper-browse-reading-overview-toggle` 的颜色、字号、内边距、悬停；`selectionOverlay.css` 的 `.paper-dictionary-credits-toggle` 颜色和字号；`vocabularyReviewPage.css` 的 `.vocabulary-progress-toggle` 字号、字重、颜色、内边距和它的 `:focus-visible`；七选五两键的奶油底、边框、圆角。

## 2. 没换的

| 键 | 在哪 | 为什么没换 |
|---|---|---|
| 「文章简介」（完形、语法填空、七选五讲评面板里的） | `ClozeAnalysisPanel.tsx:51`、`GrammarFillAnalysisPanel.tsx:53`、`SevenChoicesAnalysisPanel.tsx:118` | 是 `<details>` 的 `<summary>`，换成 Button 要改掉 details 的开合语义；不换构件也做不到同样样子。 |
| 七选五「展开细节」 | `SevenChoicesAnalysisPanel.tsx:189` | 带框、奶油底的键，和改前的「全部显示」一个样子，但不在决定 #1 点名的范围里，像是决定 #2（带框小键）的地盘。见第 5 节问题 2。 |
| 词典卡「＋ 加入生词本」 | `vocabulary-notebook/NotebookAddButton.tsx:74` | 是动作键，不是展开收起；加入以后变成禁用的「已加入生词本」，换成 Button 会淡到 0.55，看起来像不能用而不是已完成。 |
| 草稿卷「采用」「撤回」 | `DraftPaperWorkbench.tsx` | 决定 #3 说先不动、保持手写。 |
| 首页结果行「展开题组 / 收起」 | `concierge/ConciergePaperRow.tsx:382` | 是读屏隐藏的 span，整行才是键，不是按钮。 |
| 句子分析卡里的键 | `--sa-*` 那一套 | 不在这次范围里。 |
| 过生词建议条「收起」 | `VocabularyMeaningRecallPanel.tsx:609`、`VocabularyDictationWorkbench.tsx:1259` | 和「开始这一轮」等主键排在一组，样子由那一组的 CSS 管，没细看算不算纯文字键；没换。 |
| 句子里带下划线的「清除筛选」「返回浏览全部 N 套卷」「重试」 | `concierge-filter-clear-inline` 等 | Owner 11-13 定的，不动。 |

没有哪个点名的键因为「不改构件就对不齐」而放弃。

## 3. 改前改后（实测，1440 宽，单位 CSS px）

字的位置量的是文字节点的外框；「字」列写左上角 x,y 和宽。颜色是字的颜色。改后所有键都是 13px/500，悬停垫 `rgb(230,237,240)`（`--eqb-color-desk`）、字变 `rgb(27,43,51)`，键盘焦点是 2px `rgb(41,66,77)` 外框、间隔 2px。

| 键 | 改前 盒子 | 改后 盒子 | 改前 字 | 改后 字 | 改前 字号/颜色 | 改前 悬停 | 改前 焦点 |
|---|---|---|---|---|---|---|---|
| 更多筛选 | 292,380 67×25 | 284,380 81×28 | 294,385 w50 | 292,386 w52 | 12.5/400 `rgb(90,108,117)` | 只变墨字 | 浏览器默认 1px |
| 清除筛选 | 373,314 54×25 | 369,314 68×28 | 375,319 w50 | 377,320 w52 | 12.5/400 同上、带下划线 | 只变墨字 | 浏览器默认 1px |
| 收起（首页） | 1098,436.8 38×17 | 1088,430.8 56×28 | 1098,436.8 w24；箭头右沿 1136 | 1096,436.8 w26；箭头右沿 1136 | 12/400 墨 `rgb(27,43,51)` | 无 | 浏览器默认 1px |
| 收起（详情） | 1086,302.8 38×17 | 1076,296.8 56×28 | 1086,302.8；箭头右沿 1124 | 1084,302.8；箭头右沿 1124 | 同上 | 无 | 同上 |
| 返回目录 | 235.3,90 42.8×34（字被挤成两行） | 210,84 68×28（一行） | 238.6,90 36×32 | 218,90 w52 | 12/400 墨 | 无 | 2px 外框 |
| ← 返回解析 | 1336.2,43.5 62.8×17 | 1323.1,38 83.9×28 | 右沿 1399 | 右沿 1399 | 12/400 墨 | 无 | 浏览器默认 1px |
| 文章简介 | 1319,41 80×26 | 1319,41 88×28 | 1327,46；箭头 1383 | 1327,47；箭头 1383 | 13/400 `rgb(111,106,96)` | 只变墨字 | 浏览器默认 1px |
| 全部显示 | 993,57.9 68×29（框、奶油底） | 985,58.9 68×28 | 1003,63.9 w48 | 993,64.9 w52 | 12/400 `rgb(63,53,43)` | 无 | 浏览器默认 1px |
| 全部隐藏 | 1069,57.9 68×29 | 1061,58.9 68×28 | 1079,63.9 | 1069,64.9 | 同上 | 无 | 同上 |
| 更多义项 2 | 639.8,631.7 73.7×17 | 631.8,627.7 95.5×28 | 639.8,631.7 | 639.8,633.7 | 12/400 `rgb(90,108,117)` | 只变墨字 | 2px 墨框 |
| 详细解释 | 617.8,660.7 306×17（被拉满一行） | 609.8,655.7 86×28 | 字 632.8,660.7；箭头 617.8 | 字 635.8,661.7；箭头 617.8 | 同上 | 只变墨字 | 2px 墨框 |
| 署名与隐私 | 848.8,714.7 75×17.4 | 834.8,712.7 97×28 | 848.8,715.7；箭头 911.8 | 842.8,718.2；箭头 911.8 | 同上 | 只变墨字 | 2px 墨框 |
| 查看 / 调整进度 | 1293.4,223 82.6×20.8 | 1278.3,219 105.8×28 | 右沿 1376 | 右沿 1376.1 | 12/600 墨 `rgb(27,43,51)` | 无 | 2px 外框 |
| 收起进度 | 1328,223 48×20.8 | 1316,219 68×28 | 1328,225 | 1324,225 | 同上 | 无 | 2px 外框 |

改后的字一律是 `rgb(63,82,91)`（`--eqb-color-text-secondary`），比改前「更多筛选」等的次要灰深、比「收起」「返回解析」等的墨色浅。

390 宽量到的同一套数（`after/measure.json` 的 `w390`）：要贴齐的那一边差都在 2px 以内（字号从 12 变 13，字变宽，所以另一边会动），只有「返回目录」字左移不了：窄屏时它跟在短标题后面，左边多了 8px 内边距，字比改前右移 8px（184.3 → 192.3）。「查看 / 调整进度」窄屏靠左，字左沿 14 → 14。

整块高度（实测）：

- 词典卡比改前高 4px（截图 622 → 630 设备像素）。「详细解释」字的上沿 +1、「更多义项」+2、「署名与隐私」+2.5。
- 首页筛选区高 3px（键从 25 变 28）。
- 讲评栏标题行高 2px（键从 26 变 28）。
- 七选五按键那一排矮 1px（29 → 28）。

改后第一次拍到、已经改掉的两处：

1. 首页「收起」悬停什么都不垫：面板整个在首页的滑块列表里，归 `button.css`「`.fluid-hover-list .eqb-button…:hover` 透明」(0,5,0) 管。照 A2 的办法在 `paperBrowsePage.css` 加了一条 (0,7,0) 让它垫桌色（注释写了盖过谁）。改后量到首页悬停底是 `rgb(230,237,240)`。
2. 草稿卷「返回目录」被标题挤窄、右负边距让字和悬停底被左栏裁掉一截。在 `DraftPaperWorkbench.css` 加了一条 (0,4,0)：不收缩、不要右负边距，让标题去折行。改后键的右沿 278，和改前一样。

## 4. 读屏名字和状态（Chrome 读屏树，改前改后）

12 个键改前改后的读屏名字一字不差（「更多筛选/收起筛选」「清除筛选」「收起」「返回目录」「← 返回解析」「文章简介」「全部显示」「全部隐藏」「更多义项 2」「详细解释」「署名与隐私」「查看 / 调整进度/收起进度」），名字都来自字本身。`expanded` 改前改后一致（更多筛选 false→展开后 true，文章简介、词典三键、进度键同样）。「全部显示」在全部打开以后改前改后都是 `disabled: true`。没有加 `aria-label`，也没有拿掉任何状态属性。

## 5. 要 Owner 看的问题

1. **展开以后的键一直垫着桌色。** `button.css` 规定打开着的触发键（`aria-expanded="true"`）保持悬停的样子。所以「收起筛选」「文章简介（展开后）」「收起进度」「收起（义项）」「收起解释」「署名与隐私（展开后）」静止时也垫一块桌色底，不再「像一行字」（截图 `*-expanded.png`）。这是构件本来的规则，这次没改。要不要让展开收起这一类（不是菜单）不垫？要改得动 `button.css` 或在调用处覆盖。
2. 七选五「全部显示 / 全部隐藏」原来是带框奶油底的小键，按决定 #1 换成淡墨小号以后框和底都没了，禁用时也变成淡到 0.55。同一个面板里的「展开细节」还带框，两种样子挨着。「展开细节」要不要一起换，还是等决定 #2？
3. 草稿卷「返回目录」：改前在窄栏里被挤成两行字，改后不折行，标题去折行；窄屏时字比改前右移 8px（左边没抵内边距，因为它跟在标题后面，不贴边）。可以接受吗？
4. 词典卡高了 4px，首页筛选区高了 3px（按钮 28 比原来的字高）。负边距只用了整格 token（4 / 8），再往下抵要用 token 的分数。
5. 讲评、完形、语法填空面板里 `<summary>` 做的「文章简介」和讲评栏上方换好的「文章简介」样子现在不一样。要不要另起一条给 summary 用同样的样子？
6. 首页「收起」悬停垫桌色是这次加的（提案），和 A1 README 第 5 节第 3 问「面板头上的『重试』」是同一类情况，一起定？

## 6. 哪些是实际拍到、量到的，哪些只是推断

- 实际拍到、量到：第 3、4 节所有数字，两个宽度，静止、悬停、焦点、展开后；`missing` 两个宽度都是空的（每个键都找到了）。
- 推断：「七选五 → 展开细节属于决定 #2」「过生词建议条的『收起』不算纯文字键」只看了源码，没拍。
- `pixel-diff.json`：114 张图全有变化（键本身变了）；42 张尺寸不变，词典卡、筛选区、讲评标题行、七选五这几组截图高度变了（见第 3 节）。

### 页面报错

两个宽度改前改后都是 37 条，全是拦截返回的 401 / 404 / 409 / 400 资源请求（审阅、生词本、其他词典接口），改前改后一样。

## 7. 受影响的脚本

只用 `node --check` 和单条选择器、正则对改后源码试过，没有跑任何 `verify-*.mjs`、`smoke-*.mjs`。

- 把所有 `verify-*` / `smoke-*` / `component-inventory/*` 脚本里的正则字面量和 `.includes('…')` 拿出来，对改动的 15 个文件改前改后各试一遍：没有一条从「匹配」变成「不匹配」。从「不匹配」变「匹配」的都是很宽的词（`/shared/`、`--eqb-space-1`、`/收起/` 等），对着的是别的文件，和这些改动无关。
- `verify-icon-motion.mjs:308` `#dictionary .paper-dictionary-credits-toggle`：类名还在，键里还有 `.eqb-motion-disclosure`，`aria-expanded` 还在。
- `verify-icon-motion.mjs:82` 自己搭了一个带 `.paper-browse-reading-overview-toggle` 的手写 `<button>`，只断言箭头的翻转和 `aria-expanded`，不量键的样子；箭头的规则和 `[data-icon-motion='instant'] ~ .paper-browse-reading-overview` 都没动。
- 按名字找键的：`verify-a3-imposition` 的「返回目录」、`verify-vocabulary-rendered-behavior` 和 `vocab-review-shots` 的「查看 / 调整进度」「收起进度」——读屏名字没变（第 4 节）。
- `verify-vocabulary-rendered-behavior.mjs:1635` `.vocabulary-overall-progress` 只数个数，类没动。

## 8. 检查

| 检查 | 结果 |
|---|---|
| `node scripts/component-inventory/static.mjs --check` | 「基线没有变多」。改前 → 改后：手写按钮 242 → 230，手写圆角 375 → 374，手写颜色 282 → 280，手写字号 657 → 652；阴影 25、不同颜色 57、不同圆角 15、不同字号 26、手写输入框 67 不变。 |
| `cd app && npx tsc -b --noEmit` | 通过，没有输出。 |
| eslint（每个改过的 tsx 对 `git show HEAD:` 临时 `__old.tsx`） | 8 个文件新旧报的规则和条数一样，没有新问题；临时文件已删。 |
| `git diff --check` | 通过。 |

## 9. 改动和新增的文件

改动：`DESIGN.md`（§5 Buttons 加「纯文字键（Owner 2026-11-14 定）」一条）、`app/src/App.css`、`app/src/concierge/ConciergeDesk.tsx`、`app/src/features/draft-paper/DraftPaperRail.tsx`、`app/src/features/draft-paper/DraftPaperWorkbench.css`、`app/src/features/paper-browse/PaperBrowsePage.tsx`、`app/src/features/paper-browse/SimilarQuestionsRailView.tsx`、`app/src/features/paper-browse/paperBrowsePage.css`、`app/src/features/paper-browse/selection/DictionaryCard.tsx`、`app/src/features/paper-browse/selection/selectionOverlay.css`、`app/src/features/paper-intelligence/SevenChoicesAnalysisPanel.tsx`、`app/src/features/paper-intelligence/lectureAnalysisPanels.css`、`app/src/features/similar-passages/SimilarPassagesPanel.tsx`、`app/src/features/vocabulary-review/VocabularyReviewPage.tsx`、`app/src/features/vocabulary-review/vocabularyReviewPage.css`。

新增：`scripts/component-inventory/decisions-b-shots.mjs`，本目录（`before/`、`after/`、`compare/`、`pixel-diff.json`、本文件）。
