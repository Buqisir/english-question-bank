# 换过生词：按钮换成共用构件（构件厂第 4 步第十页）· 2026-11-14

状态：**提案 · 单一来源**。接着前九页换过生词。换哪些、不换哪些，以及下面的对照和判断，只经过脚本和我两道；同事访谈按 11-08 的决定没做。还没有提交，等 Owner 看过再提交。

## 一、先说范围：46 个手写按钮，这次换了 25 个

过生词这一片（`VocabularyReviewPage.tsx` 42 个、`VocabularyProgressExplorer.tsx` 4 个）一个个看过，连同管它们的 `vocabularyReviewPage.css` 和全站 `App.css` 的规则。能直接对上 `Button` 现有样子的是用全站 `.ghost-button`、`.primary-button` 的那些键（25 个），换了。用 `.ghost-button` 的「保存名称」被布局拉成高 38，对不上，没换。其余 20 个是这页自己画的，有描边、胶囊、分段开关、列表行、大块判断键，都没换。原因见第三节。

对应关系不是照类名套的，是先拍了改之前的实算样式（`before/measure.json`）再定：

- 全站 `.ghost-button`：透明底、墨字、高 36、左右内边距 12、圆角 8、悬停垫桌色底。这页没有改它的规则。所以是 `tone="strong" size="lg"`。
- 全站 `.primary-button`：石板墨填充、白字、字重 600、**最小高** 32。单独放时高 32，是 `tone="solid"`（md）。
  但「生成固定生词组」和确认条里的「生成链接并下载」放在一排高 36 的键中间，被这一排拉成 36，所以这两个用 `solid` `lg`，保持 36。

## 二、换了什么

| 位置 | 现在 | 原来 |
|---|---|---|
| 页头右侧「单词复习」 | `Button` 墨字大号（`strong` `lg`），带图标 | `.ghost-button` |
| 词库没加载出来、学生档案没加载出来时的「重新加载」（2 个） | `Button` 石板墨填充（`solid` `md`） | `.primary-button` |
| 开始设置「开始过词 / 继续过词」 | `solid` `md`；390 宽时仍撑满一行 | `.primary-button` |
| 直接生成词表「生成固定词组」 | `strong` `lg` | `.ghost-button` |
| 选择下一词「返回开始设置 / 返回过词」 | `strong` `lg`，带图标；390 宽时仍撑满 | `.ghost-button` |
| 选择下一词「确认从这里开始」（及「放弃当前轮并从这里开始」「这里已是下一词」） | `solid` `md`；390 宽时仍撑满 | `.primary-button` |
| 已收满「生成固定生词组」 | `solid` **`lg`**（见上） | `.primary-button` |
| 已收满那排：生成公开二维码、复制公开链接、趣味练习、复制清单、开始下一轮（5 个） | `strong` `lg`，有图标的放在 `icon` | `.ghost-button` |
| 生词组的「下载」菜单开关 | `solid` `md`，`aria-expanded`、`aria-controls` 照旧 | `.primary-button` |
| 下载要二维码的文件时的确认条：「取消」「生成链接并下载 / 生成链接并另存为…」 | `strong` `lg` 和 `solid` **`lg`** | `.ghost-button`、`.primary-button` |
| 重新打开生词组那排：生成公开二维码 / 撤销公开分享（二选一，2 个）、复制公开链接、复制清单、趣味练习、看词说义、返回（7 个） | `strong` `lg` | `.ghost-button` |
| 右栏「复制」「下载」 | `strong` `lg` | `.ghost-button` |

- 读屏名字都没变：这些键都有可见的字，没给 `aria-label`；图标原来就不进名字（`aria-hidden` 或纯装饰）。
- 「复制清单」「复制公开链接」「复制」原来是整键禁用加 `aria-busy={…}`，照原样传给 `Button`，没改成构件的 `busy`。`aria-busy="false"` 这个属性也还在，和原来一样。
- 「下载」「生成中…」仍是整键禁用，没改成 `busy`：禁用条件里还有别的情况（右栏的「还没有生词组」），分不开。
- 原类名 `ghost-button`、`primary-button` 都去掉了：只有这页自己的三条 CSS 用它们当选择器，没有验证脚本用（第六节）。
- **CSS**（`vocabularyReviewPage.css`）：
  - 窄屏撑满的三条（选择下一词的两个键、「开始过词」）选择器从 `.ghost-button` / `.primary-button` 改成 `.eqb-button`。`button.css` 不给有字的按钮定宽，所以不冲突，旁边写了注释。
  - 删掉 `.vocabulary-collection-actions .ghost-button { min-width: 0 }`。右栏两个键在网格里，构件的 `min-width: 36px` 比格子窄得多，改前改后宽度一样（宽屏 119、390 宽 160，见 `measure.json`）。
  - **收窄了两条原有规则**：`.vocabulary-progress-selection span` 和 `.vocabulary-share-download-confirmation span`（特指度 0,1,1）会压过 `button.css` 的 `.eqb-button-label`（0,1,0），把「确认从这里开始」和确认条两个键的字改成 12px 次要灰。改成只管左边说明那块（`> div span`、`> div:first-child span`），说明文字的样子不变。旁边写了谁压谁。
  - 没加任何手写颜色、间距、时长。

## 三、没换的 21 个

| 位置 | 几个 | 为什么没换 |
|---|---|---|
| 生词组「保存名称」 | 1 | 用的是 `.ghost-button`，但和高 38 的输入框在一个网格行里，被拉成 38（`before/measure.json`）。`Button` 定高 36，换了会矮 2px、和输入框底不齐。代码里留了注释 |
| 「新建学生」、新建学生表单里的「保存」 | 2 | 白底、带一圈描边、高 38、字 14；`Button` 没有描边那一种 |
| 「查看 / 调整进度」「收起进度」 | 1 | 12px 的纯文字键，没有内边距；`Button` 没有纯文字的样子 |
| 选择下一词的周次（「第 N 周」） | 1（循环） | 带按下状态（`aria-pressed`）的胶囊，带描边，等「胶囊」那批 |
| 选择下一词的单词格 | 1（循环） | 列表里的格子，有序号、状态小签，等「列表项」那批 |
| 下载菜单里的四个选项和各自的「另存为…」、「下载全套」和它的「另存为…」 | 4（两个是循环） | 会滑的悬停列表里的列表行（`.fluid-hover-list`），圆角 4、两行字；悬停底由列表滑块垫 |
| 过词读音「美音 / 英音」 | 2 | 分段开关（`aria-pressed`），圆角 4，外面一圈描边 |
| 最近生词组的行 | 1（循环） | 会滑的悬停列表里的列表行，带描边 |
| 过词时「暂停并返回」 | 1 | 带描边、次要灰、左右内边距 8 |
| 「重播」、展开后的音标发音键 | 2 | 白底带描边，「重播」里还有一个按键提示 |
| 「先让孩子认词」大卡 | 1 | 整块卡片是一个键 |
| 四个判断键（上一个、认识、不认识收下、看提示） | 4 | 高 48 的大块，三栏排版加按键提示，带描边 |

## 四、前后对照

- 对照图：
  - `compare-setup.png`：页头「单词复习」、「开始过词」、「生成固定词组」（禁用和可点）、两种出错的「重新加载」；
  - `compare-explorer.png`：选择下一词的「返回开始设置」「确认从这里开始」；
  - `compare-done.png`：已收满那排和右栏；
  - `compare-set.png`：生成生词组以后那排（含「下载」菜单打开着）、确认条、公开以后的「复制公开链接」；
  - `compare-reopen.png`：重新打开生词组那排，撤销前后；
  - `compare-390.png`：以上各处的 390 宽。
- 每个换了的键都拍了静止、悬停、键盘焦点（宽屏）；禁用拍了「生成固定词组」「右栏下载」「保存名称」（没换，作对照）。
- 原图在 `before/`、`after/`，实算样式在 `*/measure.json`，逐像素对比在 `pixel-diff.json`。`before/` 是改代码之前拍的。

| 地方 | 结果 |
|---|---|
| 量出来的样子 | `measure.json` 里 158 条量值（每个键的位置、宽高、底色、字色、字号字重、内边距、圆角、透明度、焦点环，静止 / 悬停 / 焦点）改前改后**一项不差**（只比了类名以外的字段） |
| 整图 | 92 张图里 69 张**逐像素一样** |
| 有差别的 23 张 | 每张 1–12 个像素。位置都在键里字的左右边上：原来字形边缘有一列半透明的像素，现在被构件里标签的 `overflow: hidden` 裁掉了（构件为了放省略号这样写的）。2 倍图上才数得出来，正常看看不出（目测） |
| 「确认从这里开始」 | 1 个像素差 3 个色阶，同上原因 |

宽屏和 390 宽都没有页面报错。

## 五、要 Owner 看的

1. **「保存名称」没换**：要换的话，或者让它变成 36（比输入框矮 2px，底对不齐），或者让输入框也改成 36。都是看得见的变化，这次没做。
2. **同一排里有两种高的石板墨键**：已收满那排里，还没生成生词组时「生成固定生词组」是 36（被拉高的），生成以后换成「下载」是 32（它包在一个 `div` 里，没被拉高）。这是原来就有的，这次照样保留。要不要统一，得 Owner 定。
3. **原 `.ghost-button` 的 18 个键现在按下时会缩到 0.97**：这是构件统一的按下反馈；原 `.ghost-button` 没有。原 `.primary-button` 本来就缩 0.97，但在减少动态效果时原来缩 0.995，现在不缩。这一条是看 CSS 推出来的，没有拍按下的瞬间。
4. **没换的键大多带描边**：新建学生、保存、暂停并返回、重播、音标发音键、四个判断键、周次胶囊、最近生词组的行，分段开关外面也有一圈。如果要换其中的普通键，得先给 `Button` 定描边那一种；首页「筛选」那页也碰到过。

## 六、改了的脚本

- 没有要改的验证脚本。搜过 `scripts/`：
  - `verify-vocabulary-rendered-behavior.mjs` 按读屏名字找这些键（「开始过词」「确认从这里开始」「生成固定词组」「下载」「取消」「趣味练习」「返回」等），名字没变；它查 `.vocabulary-progress-selection`、`.vocabulary-share-download-confirmation` 的 `innerText`，字没变。
  - `verify-vocabulary-dictation-review.mjs` 对这页源码的几条正则（二维码、「扫码听音频」、订正纸）和按钮无关，拿其中四条正则分别对改前、改后的源码试过，结果一样（前三条都匹配，订正纸那条都不匹配）。
  - `verify-file-save-as.mjs` 查的 `downloadVocabularySheet(option.kind, 'save-as')` 还在。
  - `verify-radius-family.mjs` 只数圆角字面值，这次没加圆角。
- 整个验证套件都没跑（AGENTS.md：Owner 说 Ship 之前不跑）。
- `scripts/component-inventory/vocab-review-shots.mjs`：新写的拍照脚本，见下一节。只跑过 `node --check` 和它本身。

## 七、检查和拍照时绕过的问题

- `node scripts/component-inventory/vocab-review-shots.mjs before|after`：在清点用的本地网站上拍，宽屏 1440 和 390 宽两种。
- **本地网站没有词汇课程**，页面停在「词库没有加载出来」。脚本起网站以后，用仓库自带的 `scripts/vocabulary/import-calibration-program.mjs --publish` 把 30 词的校准课程导进这次的临时数据库（`.scratch/component-inventory/rigdata/qb.sqlite`），不碰仓库里的数据库。之后过两个词、生成生词组、公开分享、撤销分享，都是在页面上点、走正常接口。
- **只拦了一处接口**：两种出错状态，各让 `/api/vocabulary/programs`、`/api/vocabulary/students`（只拦读取）回一次 500，拍完就撤掉。
- 改前改后用的是同一份数据、同一串操作。改代码之前把 `before` 连拍了两遍，两遍逐像素一样（第一遍有一张整页图因为滚动位置不同对不上，加了拍整页前先滚回顶上，之后稳定）。
- **没拍到的状态**：
  - 「复制中…」「已复制」「复制失败」「链接已复制」：要真的写剪贴板，没点；
  - 「下载」「正在生成…」「生成中…」：要真的生成 PDF，没点；
  - 「生成链接并另存为…」（另存为那条路）、「继续过词」（要有没过完的轮次）、「放弃当前轮并从这里开始」「这里已是下一词」：字不同、样子一样，没单拍；
  - 按下的瞬间（见第五节第 3 条）。
- `node scripts/component-inventory/static.mjs --check`：没有一项变多。和上一次提交比：
  - 手写按钮 268 → 243；
  - 手写圆角 375、颜色 282、字号 657 不变（`.ghost-button`、`.primary-button` 是全站共用的，还有别处在用）。
- TypeScript 通过。两个 tsx 文件的 eslint 报告和改之前一条一条对过：`VocabularyProgressExplorer` 0 条；`VocabularyReviewPage` 5 条，原来就有，规则和内容一样，只是行号下移 1 行（多了一行 import）。`git diff --check` 通过。
- 只在 Chromium 里看过。
