# 换整卷预览：按钮换成共用构件（构件厂第 4 步第三页）· 2026-11-13

状态：**提案 · 单一来源**。Owner 说「接着换整卷预览」。换哪些、不换哪些，以及下面的对照和判断，只经过脚本和我两道；同事访谈按 11-08 的决定没做。已在本地提交，没有推送。

## 一、换了什么

全都换成 `Button`（`app/src/shared-ui/Button.tsx`）。这一页没有菜单，所以没用到 `Menu`。

| 位置 | 现在 | 原来 |
|---|---|---|
| 顶栏「讲评」开关（整卷和审阅两个分支） | 关着时淡墨 `quiet`，开着时石板墨填充 `solid`，都是小号 `sm`，图标 14 → 16 | `.ghost-button.paper-browse-lecture-toggle(--pressed)` |
| 顶栏「下载 PDF」 | 淡墨小号。生成中用 `busy`（键保持原样、点了不触发、读屏念「忙」）；只在没有 PDF 版本时禁用 | `.ghost-button`，生成中整键禁用变淡 |
| 顶栏「刷新 PDF 版本」（取 PDF 版本出错时才出现） | 淡墨小号 | `.ghost-button` |
| 出错页「返回找题」 | 墨字 `strong`、大号 `lg`（高 36 不变）；去掉 1px 描边，加一个和顶栏返回键一样的左箭头 | `.ghost-button.paper-browse-error-back` 加 1px 边线 |
| 讲评栏「配相似 / 相似篇章」 | 雾薄荷主键 `primary`、小号 | `.similar-btn.similar-btn--primary` |
| 相似栏「重试」「加入草稿卷」（`SimilarQuestionsRailView`） | 「重试」墨字小号；「加入草稿卷」主键小号 | `.similar-btn` / `--primary` |
| 相似篇章面板「重试」「＋ 加入草稿卷」（`SimilarPassagesPanel`：详情页、首页题组卡） | 同上 | 同上 |
| 草稿卷换篇栏「重试」「⇄ 替换这篇」「＋ 加入」（`DraftPaperRail`） | 「替换这篇」用主键，另外两个用墨字，都是小号 | 同上 |

- **CSS**（`paperBrowsePage.css`）：
  - 删掉 `.similar-btn`、`.similar-btn--primary` 两块，以及讲评开关按下态和它的悬停两条，原处留了注释。
  - `similar-btn`、`paper-browse-lecture-toggle`、`paper-browse-error-back` 三个类名还挂在 `Button` 上，只用作选择器钩子。
  - 出错页返回键只留 `margin-top: 8px`。
  - `.paper-browse-page .paper-browse-lecture-toggle { font-size: 13px }` 没删。它现在和 Button 的 13px 一样，不改变什么；留着是因为 `verify-paper-browse.mjs` 第 81 条把它列在拍板过的字号表里。
- **没换的**：

| 位置 | 为什么没换 |
|---|---|
| 顶栏「PDF 版本」下拉框 | 是字段，属于另一类构件 |
| 顶栏「PDF Screen」链接 | 是 `<a>`，`Button` 目前不出链接 |
| 「← 返回解析」「返回目录」（`.similar-backlink`） | 文字链接的样子，没有底，不是按钮那一类 |
| 卷面边上的「剪入」键、阅读题号小块、讲评栏题组导航、听力播放器、右下角草稿卷小块（`basket-chip`） | 各有自己的形状和状态，不在按钮三档尺寸里，等对应的那批构件 |
| `PaperReviewControls`（复制试卷信息、刷新 PDF 版本、刷新） | 只在导入审阅预览里出现，清点用的本地网站进不去，拍不到前后对照 |

## 二、前后对照

- 对照图：
  - `compare-topbar-error.png`：顶栏讲评和 PDF 几个键（静止、悬停、打开、打开再悬停），以及出错页返回键（静止、悬停、键盘焦点）；
  - `compare-similar.png`：「配相似」（静止、悬停、键盘焦点）、相似栏、草稿卷换篇栏；
  - `compare-390.png`：390 宽。
- 原图在 `before/`、`after/`，实算样式在 `*/measure.json`，逐像素对比在 `pixel-diff.json`。
- `before/` 是改代码之前拍的。

| 地方 | 结果 |
|---|---|
| 讲评开关（关着） | 图标 14 → 16，键宽 62 → 64，多出来的 2px 长在左边；字和右边的键都没动。整条顶栏只有这个图标那一块不同（412 个像素） |
| 讲评开关（开着） | **原来的按下态几乎看不清**：底是石板墨，字却是深灰 `rgb(63,82,91)`。页面 CSS 里写的白字被 App.css `.topbar .ghost-button` 的字色盖掉了，实算出来就是这样。现在是石板墨底配纸白字，字重 600。悬停时底变浅一档，和原来一样 |
| 下载 PDF、刷新 PDF 版本 | 逐像素一样（静止和悬停） |
| 出错页返回键 | 描边没了，加了左箭头，宽 78 → 98，高仍 36。悬停垫桌色底，键盘焦点是 2px 石板墨环，和原来一样 |
| 「配相似」 | 高 34 → 28，宽 86 → 77；字 12/600 → 13/600；左右内边距 14 → 8 |
| 「重试」（相似栏、换篇栏） | 高 30 → 28，宽 52 → 42；字 12/600 → 13/500 |
| 相似栏的「返回解析」 | 没换，逐像素一样 |

宽屏和 390 宽都没有页面报错。

## 三、要 Owner 看的

1. **出错页返回键去掉了描边、加了箭头**：`Button` 没有带描边的语气。只去描边的话，这个键看着像一行字，所以我补了和顶栏返回键一样的左箭头。另一个办法是用雾薄荷主键：出错页只有这一个动作，符合「每页一处」。
2. **相似栏的键变小了**：高 34 / 30 → 28，字 12 → 13。卡片里的「＋ 加入草稿卷」「⇄ 替换这篇」会跟着变矮。这些我只在出错态里看到了，见第五节。
3. **一个列表里有好几个主键**：相似篇章面板和换篇栏的每张卡片上都有一个雾薄荷键，不符合「每页一处」。这是原来就有的，这次照搬没改。
4. **「＋」「⇄」还是写在字里的符号**：没换成图标，因为那等于改文案和图标，不是换构件。
5. **「下载 PDF」生成中不再变淡**：现在用 `busy`，键保持原样、点了不触发，读屏念「忙」，字仍是「生成 PDF 中…」，图标在动。如果要原来那种变淡的样子，就改回 `disabled`。

## 四、改了的脚本（都没跑，未验证）

- `scripts/verify-paper-browse.mjs` 第 22–25 组：源码里讲评图标的写法从 `Presentation size={14}` 改成 `size={16}`。
- 下面这些脚本找的是类名和读屏名字，类名都还留在 `Button` 上，所以没动：
  - `scripts/verify-paper-canonical-continuation-writing-rendered-behavior.mjs`（按 `.paper-browse-lecture-toggle` 点讲评）；
  - `verify-paper-browse.mjs` 第 81 条（字号表）；
  - `verify-c8-draft-paper-render-model.mjs`（「下载 PDF」这几个字）。
- `scripts/component-inventory/paper-shots.mjs`：新写的拍照脚本，见下一节。

## 五、检查和拍照时绕过的问题

- `node scripts/component-inventory/paper-shots.mjs before|after`：在清点用的本地网站上拍，宽屏 1440 和 390 宽两种；拍静止、悬停、键盘焦点、讲评打开。
- **整卷预览在本地网站上本来打不开**。夹具复制过来的 `paper-asset.json` 是 `source-capture-v1` 外壳，页面直接读它拿不到 `content.blocks`，报「reading 'blocks'」（清点第 2 步也记过）。这次没改网站：拍照脚本拦下这个请求，先用服务端同一个投影函数（`server/paper-canonical/sourceAssetRepresentation.mjs` 的 `loadCanonicalSourceAssetRepresentation`，服务端找题组时也用它）把它转成页面要的 `PaperAsset`，再交给页面。改前改后走的是同一条路，所以对照是有效的。线上是不是也有这个问题，我没有查。
- **讲评栏选题用的是深链**（`focusGroupId`、`questionId`、`lecture=1`，加 `similar=1` 打开相似栏）。在本地网站上点卷面的题，讲评栏不跟着选中，原因没有查。
- **相似栏只拍到出错态**：本地网站没有检索标注数据，相似栏和换篇栏只会显示「重试」，所以卡片上的「＋ 加入草稿卷」「⇄ 替换这篇」和相似栏底部的「加入草稿卷」都没拍到。它们和「配相似」是同一个主键，样子可以参考上面那张。
- **详情页的相似篇章面板没拍到**：本地网站里详情页没有「相似篇章」入口，因为题组没有 `paperSurfaceHref`。面板和换篇栏里的「重试」用的是同一套写法。
- **「下载 PDF」的忙碌态和键盘焦点没拍到**：本地网站取不到 PDF 版本，键一直是禁用的。
- `node scripts/component-inventory/static.mjs --check`：没有一项变多。
  - 手写按钮 307 → 294（少了这 13 个）
  - 手写圆角 386 → 385
  - 手写字号 667 → 666
  - 手写颜色 286
- TypeScript 通过。四个改动文件的 eslint 报告跟改之前一条一条对过，完全一样（都是原来就有的），这次没带进新的。`git diff --check` 通过。
- 没跑正式验证套件（AGENTS.md：Owner 说 Ship 之前不跑），改过的 verify 脚本只检查了语法（`node --check`）。只在 Chromium 里看过。
