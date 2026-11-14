# Owner 2026-11-14 决定 #2：描边键换成无边的 Button

状态：决定 #2 本身是**已定**（Owner 2026-11-14，原文见上一级 `README.md`）。怎么落地的细节（每个键挑哪一档颜色和大小、哪几个键算进来、「重播」先不换、学生表单里「保存」和输入框底边对齐）是**提案 · 单一来源**，只经过脚本和四项检查。同事访谈按 11-08 的决定没做。已在本地提交，没有推送。

这一批只动调用处和调用处的 CSS，没动 `Button.tsx`、`button.css`、`tokens.css`、`BRAND.md`，没碰卷面、打印、PDF 的样式。改前改后用同一份数据拍、同一个脚本量（`scripts/component-inventory/decisions-c-shots.mjs before|after`），对照图和像素差都在这个目录里。

决定原文：「不加描边那一种。已经去掉描边的三处（「筛选」开关、存 PDF 对话框的「关闭 / 新建 / 取消」、出错页「返回」）保持现状；选词浮条和词典卡的「重试」之后也去掉描边」。这三处已去掉描边的键这次没动。

目录：

- `before/shots/`、`after/shots/`：各 60 张，1440 宽和 390 宽，DPR 2，减少动效；每个键拍静止、悬停、键盘聚焦，「保存」另拍禁用。`stage*.png` 是整块背词卡。
- `before/measure.json`、`after/measure.json`：每个键每个状态的计算样式（框、字、内边距、圆角、边框、描边环、底色、不透明度）和读屏树节点。
- `compare/compare-shots-*.png`：左改前、中改后、右差异（红点是任一通道差大于 3 的像素）。
- `pixel-diff.json`：每张图的差异像素数和占比。

出错状态全部靠脚本拦请求造出来：翻译接口回 502，句子分析回 500，词典义项回 500。没有改任何接口代码。

## 1. 换了的键

一共换了 5 个调用处（「新建学生 / 取消」是同一个键的两种文字，算一个）。

| 键 | 位置 | 换成 | 原来 |
|---|---|---|---|
| 选词浮条翻译卡「重试」/「重试失败段落」 | `app/src/features/paper-browse/selection/SelectionOverlay.tsx:291` | `tone="strong" size="sm"`，图标走 `icon`，类名 `paper-selection-retry` 留着 | 手写 `<button>`，1px 描边 `--desk-border`，圆角 4，14/500 墨字，28 高 |
| 过生词「新建学生」/「取消」 | `app/src/features/vocabulary-review/VocabularyReviewPage.tsx:1468` | `tone="strong" size="lg"`，`aria-expanded` 原样传 | 手写，1px `--line-strong` 描边，白底，14/600 墨字，38 高 |
| 过生词新建学生表单「保存」 | `VocabularyReviewPage.tsx:1495` | `tone="strong" size="lg" type="submit"`，新挂类名 `vocabulary-student-save`（只当挂钩，没有样式） | 同上一行那条规则（`.vocabulary-student-create button`） |
| 背词卡「暂停并返回」 | `VocabularyReviewPage.tsx:1748` | `tone="subtle" size="md"`，箭头走 `icon`，新挂类名 `vocabulary-stage-pause`（只当挂钩） | 手写，1px `--line` 描边，透明底，12/600 淡墨，32 高 |
| 背词卡翻开后的音标发音键 | `VocabularyReviewPage.tsx:1767` | `tone="subtle" size="md"`，喇叭图标走 `icon`，`title` 原样传 | 手写，1px `--line` 描边，白底，14/400 淡墨，33 高；悬停边线变深、字变墨 |

挑档的理由：原来是墨字的（「重试」「新建学生」「保存」）用 `strong`；原来是淡墨字的（「暂停并返回」、音标键）用 `subtle`。大小取最近的一档：28 → `sm`，32/33 → `md`，38 → `lg`（36）。

顺手加的（任务清单外）：「保存」。任务里写的是「新建学生和它的保存」，所以算在清单里；除此以外没有加别的同类键。

删掉的手写 CSS（`app/src/features/vocabulary-review/vocabularyReviewPage.css`）：

- `.vocabulary-student-add-button, .vocabulary-student-create button {...}` 整条；
- `.vocabulary-stage-meta button {...}` 整条；
- `.vocabulary-pronunciation` 只留 `align-self: flex-start`，`:hover` 那条删掉；
- 聚焦选择器列表里去掉 `.vocabulary-student-add-button:focus-visible`、`.vocabulary-student-create button:focus-visible`、`.vocabulary-stage-meta button:focus-visible`（聚焦环改由 `button.css` 给）。

新加的 CSS：

- `.vocabulary-student-create > div` 加 `align-items: end;`。「保存」从 38 高变成 36 高，输入框还是 38 高；不加的话「保存」会被网格拉伸或顶齐，加了以后底边对齐，跟上面「当前学生」那一排的做法一样。没有新字面量。
- `app/src/features/paper-browse/selection/selectionOverlay.css`：`.paper-selection-retry` 只留原来的 `margin: 10px 0 0; align-self: flex-start;`（都是原有值）。描边那几条改挂在 `.paper-selection-retry:not(.eqb-button)` 上，只给句子分析卡的「重试」用。覆盖注释写在 CSS 里：特指度从 (0,1,0)/(0,2,0) 变成 (0,2,0)/(0,3,0)，管的只有句子分析卡那一个键，它不挂 `.eqb-button`，所以只是让开，不盖谁。

`docs/design-gaps.md` 没有新增条目：这批新写的 CSS 没有用到缺的 token。

## 2. 没换的

| 键 | 位置 | 原因 |
|---|---|---|
| 背词卡「重播 空格」 | `VocabularyReviewPage.tsx:1756`（`.vocabulary-word-replay`） | 它的读屏名字是 `aria-label`「重播 X 的美音 / 英音」，而 `Button` 的文字键不收 `aria-label`（类型里去掉了）。换了读屏名字就会变成「重播 空格」，违反「读屏名字不能变」。按规矩「不改构件就对不上，不换」。曾试过手写 `eqb-button` 类名来模仿，已撤回。见第 5 节问题 1。 |
| 句子分析卡出错时的「重试」 | `app/src/features/paper-browse/selection/sentence-analysis/SentenceAnalysisCard.tsx:216` | 和选词浮条的「重试」共用 `paper-selection-retry` 类名，样子一样，但句子分析卡（`--sa-*`）在这次不动的清单里。保留原描边样子。见第 5 节问题 2。 |
| 词典卡义项出错的「重试」 | `app/src/features/paper-browse/selection/DictionaryCard.tsx:448`（`.paper-dictionary-sense-retry`） | 实测本来就没有描边：12/400 带下划线的行内键（Owner 11-13 定的句中下划线键）。所以决定里说的「词典卡的『重试』」在现在的代码里找不到带描边的版本，什么都没改。见第 5 节问题 3。 |
| 词典卡的发音键 | `DictionaryCard.tsx:119`（`.paper-dictionary-play`） | 实测 `border: 0`，不是描边键。 |
| 找题主面「加入」类行内加键（`concierge-action-add`） | — | DESIGN.md「Row add」明写了带边的样子，属于行，不是独立按钮；不确定，不动。 |
| 背词卡底部四个大键（上一个 / 认识 / 不认识，收下 / 看提示，`vocabulary-control`） | — | 48 高、带快捷键框，是卡片式控件，`Button` 最高 36，对不上。 |
| 「看答案」那张提示卡（`vocabulary-reveal-prompt`） | — | 是卡，不是键。 |
| 美音 / 英音切换（`vocabulary-review-accent-control`）、周进度胶囊、最近套卷行 | — | 分段控件、胶囊、列表行，在不动清单里。 |
| `pi-seven-details-toggle`、草稿「采用 / 撤回」、两个翻页标签、浏览筛选 chips、`pi-*` 证据行和 chips、`sa-*`、听力播放器、句中下划线键、已去掉描边的三处 | — | 任务明写不动。 |
| 还没迁的页面里的描边键：`vocabulary-practice-back`、`AgentTokens` 的 `agent-token-submit`、默写 / 默写工作台 / 听力 / 手写页（几十个） | — | 这些页面整页还没迁到 `Button`，零星换一两个会和同页其它键不一致；等各自那一批。 |
| 草稿撤销提示条里的键 | — | 等提示条那一批。 |

找键的办法：扫所有 `.css` 里带 `border: 1px ...` 且主语落到 `<button>` 的规则，再对每个 `<button>` 的类名配对（草稿脚本在 scratchpad，没有入库）。这是静态扫，可能漏掉靠继承或运行时类名拿到描边的键。

## 3. 改前改后（实测，单位 CSS px）

1440 宽：

| 键 | 改前 框 / 字 / 圆角 / 边 | 改后 框 / 字 / 圆角 / 边 |
|---|---|---|
| 选词「重试」 | 72×28，14/500 墨，圆角 4，1px `rgb(220,230,235)` | 64×28，13/500 墨，圆角 8，无边；左上角不动（615.8, 558.5） |
| 新建学生 | 80×38，14/600 墨，白底，1px `rgb(197,211,218)` | 76×36，13/500 墨，透明底，无边；右边不动（1416），上移 2 变成下边对齐（底 174 不变） |
| 取消（展开时） | 52×38，白底 | 50×36，**桌色底 `rgb(230,237,240)`**（`aria-expanded=true` 时 `strong` 保持按下的底色） |
| 保存 | 52×38，白底 | 50×36，透明底；底边 256 不变，右边 1405 不变 |
| 保存（禁用） | 不透明度 0.55 | 不透明度 0.55，不变 |
| 暂停并返回 | 97×32，12/600 淡墨，1px `rgb(230,237,241)` | 109×32，13/500 淡墨，无边；右边 1095 不变，左边从 998 移到 986（宽了 12） |
| 音标发音键 | 139.1×33，14/400 淡墨，白底，1px `rgb(230,237,241)` | 132.8×32，13/500 淡墨，透明底，无边；左边 681.6 不变，喇叭图标从 692.6 移到 693.6 |
| 重播（没换） | 110×36 | 不变（像素差 0） |
| 句子分析「重试」（没换） | 50×32 | 不变（像素差 0） |
| 词典义项「重试」（没换） | 行内下划线 | 不变（像素差 0） |

390 宽的变化和 1440 一样（选词「重试」72→64；新建学生 80×38→76×36；暂停并返回 97→109；音标键 139.1×33→132.8×32），位置关系同上。

状态：

- 悬停：五个换了的键改后都垫桌色底 `rgb(230,237,240)`、字变墨。改前「新建学生」「保存」悬停没有任何变化；「暂停并返回」悬停没变化；音标键悬停是边线变深、字变墨；选词「重试」悬停本来就垫桌色底（还带边）。
- 键盘聚焦：改后都是 2px `rgb(41,66,77)`（`--eqb-color-action`）、外移 2。改前选词「重试」的环是 2px 墨 `rgb(27,43,51)`，其余是 `--action`，所以选词「重试」的环颜色略浅。
- 「取消」「保存」的聚焦：改前改后脚本都量到没有聚焦环（`outline` 为空）。推断是打开表单后输入框自动拿焦点，脚本按 Tab 后 `:focus-visible` 没被触发；这两张聚焦图实际上拍的是静止样子，没拍到真的聚焦环。
- 背词卡变矮：音标键 33→32，翻开后的整张卡在 390 宽矮了 1 px（截图 2030→2028 物理像素）。

像素差（`pixel-diff.json`）：没换的三个键 0 像素差；`stage.png`（1440，没翻开）只有「暂停并返回」那一块有差（4907 物理像素，和单拍「暂停并返回」一致）。

## 4. 读屏名字和状态（Chrome 读屏树，改前改后各量一次）

两个宽度、十个键（含没换的三个）改前改后完全一致：

- 选词「重试」：button「重试」（来自内容）；
- 新建学生：button「新建学生」，expanded=false；展开后 button「取消」，expanded=true；
- 保存：空输入时 button「保存」，disabled=true；填了以后可聚焦；
- 暂停并返回：button「暂停并返回」（来自内容）；
- 音标键：button「/eɪ, ə; æn, ən/」（来自内容），描述「播放美音」（来自 `title`）；
- 重播（没换）：button「重播 a / an 的美音」（来自属性）。

`暂停并返回` 改后可点、可禁用的语义不变（`disabled={requestBusy}` 原样传进 `Button`）。

## 5. 要 Owner 看的问题

1. **「重播」要不要换？** 它是现在过生词页上唯一还带描边的独立小键，但它靠 `aria-label` 给读屏读「重播 X 的美音」。`Button` 文字键不收 `aria-label`，换了读屏会读成「重播 空格」。要换的话有两条路：让 `Button` 文字键允许 `aria-label`（要改构件，这批不许），或者把「X 的美音」放进看不见的文字里（要改文案结构）。请定一条，或者就让它留着描边。
2. **句子分析卡出错的「重试」**：和选词浮条的「重试」是同一个类名、同一个样子，这次按「句子分析卡不动」留着描边，所以现在同一个浮条里，翻译出错和句子分析出错的「重试」长得不一样。要不要跟着句子分析卡那一批一起换？
3. **决定里说的「词典卡的『重试』」**：现在代码里词典卡的「重试」（义项出错）是句中下划线的行内键，本来就没描边，是 11-13 定的。这次没动。如果您说的是别的键，请指一下。
4. **音标键的左边**：改前描边的左边贴着释义那一列；改后没了描边，喇叭图标离那一列左边 12 px（`md` 的内边距），看上去比下面的「art.」往里缩了一点（目测明显）。要不要照 B 批的做法加 `calc(-1 * var(--eqb-space-3))` 的左负边距让图标贴齐？这批没加。
5. **「取消」展开时一直垫桌色底**：`strong` 在 `aria-expanded=true` 时保持按下的底色，所以表单开着时「取消」一直是灰底。改前是白底带边。可以接受吗？
6. **字号**：五个键都从 14（「暂停并返回」是 12）变成 `Button` 统一的 13/500；「新建学生」「保存」从 600 变 500，变轻了。

## 6. 哪些是实际拍到、量到的，哪些只是推断

实际拍到、量到的：第 3、4 节所有数字和读屏结果，都来自 `before/measure.json`、`after/measure.json`；像素差来自 `pixel-diff.json`。

推断或目测的：

- 「取消」「保存」聚焦图里没有聚焦环的原因（第 3 节）是推断，没有单独验证。真的键盘聚焦环在这两个键上**没拍到**。
- 音标键左边「看上去往里缩」是目测（第 5 节问题 4）；12 px 是内边距的实测值。
- 长音标会不会被 `.eqb-button-label` 的 `overflow: hidden; text-overflow: ellipsis` 截掉：这次的样本词是 a / an，没截；更长的音标在 390 宽**没拍到**，是推断可能会截。
- 选词「重试失败段落」（部分失败）那个文字**没拍到**，只拍了「重试」；部分失败的状态脚本没造出来。
- 「暂停并返回」禁用（`requestBusy`）的样子**没拍到**。
- 每个宽度都有 38 条控制台报错（401/404/409/500/502，来自拦请求和本地数据），改前改后一样多。

## 7. 受影响的脚本

按规矩没跑任何 `scripts/verify-*.mjs`、`scripts/smoke-*.mjs`。把它们里面用到这些键的选择器拿出来对改前改后的源码看过：

- `scripts/paper-selection-controller-checks.mjs:179`、`:187` 用 `.paper-selection-retry`：类名留着，`Button` 会把 `className` 加到按钮上，仍然能找到，数量仍是 1。
- `scripts/verify-vocabulary-rendered-behavior.mjs:599` 用 `getByRole('button', { name: '暂停并返回' })`、`:720` 用 `name: '新建学生'`、`:722` 用 `name: '保存'`：读屏名字改前改后一样（第 4 节），不受影响。
- `scripts/verify-a3-imposition.mjs:666` 的「保存」是存 PDF 对话框里的，不是这批的键。

没有需要改的脚本。新加了 `scripts/component-inventory/decisions-c-shots.mjs`（拍图和量样式用），`node --check` 通过。

## 8. 检查

- `node scripts/component-inventory/static.mjs --check`：通过，「基线没有变多」。对基线的数（含前几批）：手写 `<button>` 324 → 225，手写圆角 393 → 371，手写颜色 288 → 280，手写字号 672 → 650，其余持平。这一批本身：两个 tsx 的 `<button>` 从 6+18 变成 5+14；`vocabularyReviewPage.css` 的圆角 35 → 32、字号 105 → 103；颜色字面量没变。
- `cd app && npx tsc -b --noEmit`：通过，无输出。
- eslint 新旧对比（`git show HEAD:<文件>` 放成临时 `__old.tsx`，跑完已删）：`SelectionOverlay.tsx` 新旧都是 0 错 0 警告；`VocabularyReviewPage.tsx` 新旧都是 4 错 1 警告，规则和行号完全一样（`react-hooks/set-state-in-effect` 629/648/701/795，`react-hooks/exhaustive-deps` 796），都是原来就有的，这批没有新增。
- `git diff --check`：通过，无输出。

## 9. 改动和新增的文件

改动：

- `app/src/features/paper-browse/selection/SelectionOverlay.tsx`
- `app/src/features/paper-browse/selection/selectionOverlay.css`
- `app/src/features/vocabulary-review/VocabularyReviewPage.tsx`
- `app/src/features/vocabulary-review/vocabularyReviewPage.css`
- `DESIGN.md`（§5 Buttons 加「描边键（Owner 2026-11-14 定）」一条）

新增：

- `scripts/component-inventory/decisions-c-shots.mjs`
- `design/components-2026-11-13/decisions-2026-11-14/batch-c/`（`before/`、`after/`、`compare/`、`pixel-diff.json`、本文件）
