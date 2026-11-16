# 换详情页：按钮换成共用构件（构件厂第 4 步第五页）· 2026-11-13

状态：**提案 · 单一来源**。Owner 说「接着换详情页」。换哪些、不换哪些，以及下面的对照和判断，只经过脚本和我两道；同事访谈按 11-08 的决定没做。已在本地提交，没有推送。

## 一、换了什么

| 位置 | 现在 | 原来 |
|---|---|---|
| 「返回找题」（正常页和出错页两处） | `Button` 次要灰小号（`subtle` `sm`，高 28），图标 14 → 16；类名钩子 `detail-back` | `.back-button`：纯文字，没有内边距，高 18 |
| 「加入草稿卷 / 已在草稿卷 / 暂不可组卷」 | `Button` 雾薄荷主键（`primary` `md`）；类名钩子 `peek-add`，只用来留主键后面那一格 | `.peek-btn.peek-btn--primary` |
| 「看整卷」「相似篇章」 | `Button` 墨字（`strong` `md`） | `.peek-btn` |
| 「阅读解析」 | 新加的 `ButtonLink`（墨字 `md`），仍是 `<a href>`，中键开新标签、复制地址都照旧；左键仍走站内跳转 | `a.peek-btn` |

- **`Button.tsx` 补了 `ButtonLink`**：样子和 `Button` 一样、但出的是 `<a>`。参数是 `href`、`tone`、`size`、`icon`；链接没有禁用和忙，这两项不提供。整卷预览顶栏的「PDF Screen」链接上次因为 `Button` 不出链接没换，以后可以用它。
- **删掉的**：
  - `QuestionGroupDetailView.css` 里 `.peek-btn`、`.peek-btn--primary` 几块，以及窄屏里给它们的两条；
  - `App.css` 里 `.back-button` 在几条共用规则里的名字，和 `.detail-view > .back-button` 两条。`.back-button` 只有详情页用。
- **加的 CSS**（`QuestionGroupDetailView.css`，都只用 token）：
  - `.peek-actions > .peek-add { margin-right: var(--eqb-space-2) }`：原来主键后面多空 8px，照搬；窄屏两列网格里归零，注释写了覆盖哪条、为什么。
  - `.detail-view > .detail-back`：往左挪 8px（`--eqb-space-2`），抵掉按钮的左内边距，箭头还和标题左边对齐；往上挪 4px（`--eqb-space-1`）、下边距 12 → 8（`--eqb-space-2`），抵掉一部分按钮比纯文字高出来的 10px。
- **没换的**：

| 位置 | 为什么没换 |
|---|---|
| 「展开卷面」「收起卷面」 | 浮在卷面上的胶囊键：白底、影子、圆角 999，不在按钮那几种语气和圆角 8 里。和整卷预览右下角的草稿卷小块一样，等「浮动键」那批构件 |
| 「…」菜单 | 上一页已经换成 `Menu` |

## 二、前后对照

- 对照图：
  - `compare-head.png`：题组头部（静止）、「返回找题」悬停和键盘焦点、出错页；
  - `compare-actions.png`：一行四个动作的悬停和键盘焦点；
  - `compare-states.png`：已在草稿卷、暂不可组卷（禁用）、展开 / 收起卷面；
  - `compare-390.png`：390 宽。
- 原图在 `before/`、`after/`，实算样式在 `*/measure.json`，逐像素对比在 `pixel-diff.json`。
- `before/` 是改代码之前拍的。

| 地方 | 结果 |
|---|---|
| 「返回找题」 | 箭头的左边位置不变（左挪 8 抵掉内边距 8）；箭头 14 → 16；键高 18 → 28。悬停原来只把字变墨色，现在还垫一块桌色底；键盘焦点环一样（2px 石板墨），字从次要灰提到墨色 |
| 下面整页 | 往下挪 2px：键高多了 10，往上挪 4、下边距少 4，还剩 2。用 token 凑不出正好 0（要 6px 下边距，没有这一档） |
| 加入草稿卷 | 大小、颜色、悬停都一样；字重 400 → 600（`Button` 的主键都是 600） |
| 看整卷、阅读解析、相似篇章 | 左右内边距 10 → 12，各宽 4px，后面的键依次往右挪；字重 400 → 500。悬停颜色一样 |
| 键盘焦点（四个动作） | 原来是浏览器默认的 1px 黑框，现在是全站统一的 2px 石板墨环、隔 2px |
| 暂不可组卷（禁用） | 原来是桌色底、次要灰字、整键 55% 透明；现在不透明（`Button` 填充键禁用都是这样，见 button.css 那条注释）。键因此比原来清楚一些 |
| 展开 / 收起卷面 | 没换。键本身逐像素一样；截图里差的那些像素是卷面跟着下挪 2px，透出来的字不同 |

宽屏和 390 宽都没有页面报错。

## 三、要 Owner 看的

1. **「返回找题」变成有底的小键**：悬停时垫桌色底，下面整页往下挪 2px。另一个办法是给 `Button` 加一种「纯文字」的样子（没有内边距和底），但现在只有这一处用得上。
2. **加入草稿卷字重 400 → 600、次级键 400 → 500**：照构件现在的字重。
3. **禁用的主键不再变淡**：灰底灰字，但不透明。如果要原来那样，只改 `button.css` 一处，各页的主键跟着变。
4. **展开 / 收起卷面没换**：胶囊、白底带影子，构件里没有这一类。它的键盘焦点仍是浏览器默认的 1px 黑框，换的时候一起改。
5. **390 宽下「收起卷面」和右下角草稿卷小块挨得很近**（`collapse-390.png`），改之前就这样，这次没动。

## 四、改了的脚本（都没跑，未验证）

- `scripts/verify-classic-retire-2.mjs`：「加入草稿卷」那条正则从 `<button className="peek-btn peek-btn--primary" type="button"` 改成 `<Button className="peek-add" tone="primary"`，`{...iconMotionInput}` 照旧可有可无。
- `scripts/verify-paper-browse.mjs`：
  - 「只有一个看整卷键」那条：图标现在走 `icon={<Eye …/>}`，正则两种写法都认；
  - 「看整卷只在有 canonicalPaperId 时出」那条：`<button` 改成 `<[bB]utton`。
- 这几条正则只单独拿源码试过能匹配（计数是 1），整个脚本没跑。
- 下面这些对着源码试过仍能匹配，或者找的是读屏名字、类名，所以没动：
  - `verify-paper-browse.mjs` 的「阅读解析」那条（`href={buildPaperBrowseLectureHref(…)}`、修饰键放行、`onOpenPaperBrowseLecture`）；
  - `verify-classic-retire-2.mjs` 的 `.peek-paper` 那条；
  - `smoke-golden-path.mjs`（`.detail-view .peek-actions-menu`）、`verify-pa-only-add-detail-consistency.mjs`（`.peek-hero`）。
- `scripts/component-inventory/detail-shots.mjs`：新写的拍照脚本，见下一节。
- `../batch-1/README.md`：补了一条，记下 `ButtonLink`。

## 五、检查和拍照时绕过的问题

- `node scripts/component-inventory/detail-shots.mjs before|after`：在清点用的本地网站上拍，宽屏 1440 和 390 宽两种。
- **本地网站的题组缺几个字段**：没有 `canonicalPaperId`，卷面不出（「这份卷还没上线」），「看整卷」「阅读解析」「相似篇章」也都不出。拍照脚本拦下题组详情接口（只拦 GET），给 A、B 两篇补上本地网站自己的 `paper-2026-i`，给 A 篇补上阅读解析的三个字段。
- **「暂不可组卷」要在列表接口上改**：详情页的组卷状态取自列表卡片（`App.tsx` 的 `selectedDetailForView` 用列表那份盖掉详情那份），所以 B 篇的禁用态是在 `/api/question-groups` 列表接口上改的。第一次拍只改了详情接口，禁用态没出来，改了以后重拍了 `before/`，然后才动代码。
- **卷面资产**：和整卷预览那次一样，用服务端同一个投影函数把 `source-capture-v1` 外壳转成页面要的 `PaperAsset`。
- 改前改后用的是同一份数据，所以对照有效。「已在草稿卷」是真点了「加入草稿卷」拍的，脚本开头先清空草稿卷。
- **没拍到的状态**：「相似篇章」打开以后的面板（本地网站没有检索标注数据，上次整卷预览也只拍到出错态）。
- `node scripts/component-inventory/static.mjs --check`：没有一项变多。和上一次提交比：
  - 手写按钮 289 → 284
  - 手写圆角 382 → 381
  - 手写颜色 283 → 283
  - 手写字号 665 → 663
- TypeScript 通过。两个改动的 tsx 文件 eslint 报告跟改之前一条一条对过，完全一样（4 条，都是原来就有的）。`git diff --check` 通过。
- 没跑正式验证套件（AGENTS.md：Owner 说 Ship 之前不跑），改过的 verify 脚本只检查了语法（`node --check`）。只在 Chromium 里看过。
