# 换首页和个人空间的行菜单（构件厂第 4 步第四页）· 2026-11-13

状态：**提案 · 单一来源**。Owner 说「接着换首页和个人空间的菜单」。换哪些、不换哪些，以及下面的对照和判断，只经过脚本和我两道；同事访谈按 11-08 的决定没做。已在本地提交，没有推送。

## 一、换了什么

三处「…」菜单都换成共用的 `Menu`（`app/src/shared-ui/Menu.tsx`）。

| 位置 | 现在 | 原来 |
|---|---|---|
| 首页题组行「…」（相似篇章 / 详情 / 阅读解析） | `Menu`，触发键是淡墨小号（28），挂 `concierge-group-row-menu-trigger` 类名 | `ConciergeGroupRowMenu`（`app/src/concierge/`） |
| 详情页 owner「…」（编辑 / 删除） | `Menu`，图标 14 → 16 | 同上，和首页共用一份 |
| 个人空间文件行「…」（另存为… / 删除文件） | `Menu`，触发键是淡墨大号（36，窄屏 34），和同一行「下载」「打开原草稿」一样高 | 页面里自己写的 `ArtifactMenu` |

- **`Menu` 补了四样**，都是这两处原来就有、构件还没有的：
  - `onSelect` 拿到点击事件和触发键。首页「详情」是链接，要 `preventDefault` 走站内跳转；个人空间「删除文件」要把触发键交给确认框，确认框关掉以后焦点回到它。
  - `restoreFocus`：选中后焦点回不回触发键，默认回。「删除文件」设成不回，焦点交给确认框。
  - `data`：项上的 `data-*` 属性。首页的 `data-ra-entry` / `data-ra-group-id` 照旧挂在项上（阅读解析入口统计用）。
  - `triggerClassName`（只当选择器钩子）、`triggerDisabled`（个人空间这份文件下载中时禁用）。
- **删掉的**：
  - `app/src/concierge/ConciergeGroupRowMenu.tsx` 整个文件；
  - `App.css` 里 `.concierge-group-row-menu`、`.concierge-group-row-menuitem(--danger)` 几条；
  - `MySpacePage.css` 里 `.my-space-row-menu`、`-menu-item`、`-menu-item-danger`、`-menu-trigger` 几条；
  - `MySpacePage.tsx` 里的 `activeFileMenuCloser`（切文件夹时先关菜单）。现在点文件夹本身就是「点外面」，菜单会关；行被换掉时菜单跟着卸载。
- **加的 CSS**（都写了覆盖哪条、为什么）：
  - `App.css`：整行悬停时把「…」的字提到墨色，原来那条规则挂在旧类名上，照搬过来。
  - `MySpacePage.css`：`.my-space-row-actions button` 几条加 `:where(:not(.eqb-button))`，不再套到 `Button` 上；窄屏一行的键都是 34 高，加一条让「…」也是 34。
- **个人空间的菜单原来挂在 `.my-space-page` 里面**，为了借页面的颜色别名；现在和别处一样挂在 body 上。实算颜色一样：墨字 `rgb(27,43,51)`，危险红 `rgb(220,38,38)`。
- **没换的**：
  - 个人空间行里的「下载」「打开原草稿」：手写按钮，这次只换菜单。下次换个人空间页时一起换。
  - 首页题组行的「＋」加入键：有自己的按下态（圆底），不在按钮那几种语气里。

## 二、前后对照

- 对照图：
  - `compare-home.png`：首页（静止、整行悬停、「…」悬停、键盘焦点、打开、悬停第二项、键盘打开再按 ↓）；
  - `compare-detail.png`：详情页；
  - `compare-space.png`：个人空间；
  - `compare-390.png`：三处在 390 宽下的静止和打开。
- 原图在 `before/`、`after/`，实算样式和焦点落点在 `*/measure.json`，逐像素对比在 `pixel-diff.json`。
- `before/` 是改代码之前拍的。

| 地方 | 结果 |
|---|---|
| 三处「…」静止、整行悬停、悬停、键盘焦点 | 逐像素一样。唯一的例外是首页「…」悬停，差 24 个像素，色值最多差 1 级，看不出来 |
| 打开时的「…」 | 原来是透明底、淡墨字，看不出菜单是从哪里出来的；现在是桌色底、墨字，和草稿卷的「⋯」一样 |
| 首页、详情页的面板 | 位置、大小不变（148 × 72），项高 32 不变；悬停和焦点那块底的圆角 8 → 4 |
| 键盘焦点落在项上 | 首页、详情页原来只有桌色底，个人空间原来只有一圈焦点环（在项外 2px）。现在三处一样：桌色底，加一圈收在项里面的 2px 石板墨环 |
| 详情页「删除」 | 原来平时是墨字，悬停或焦点时才变红；现在一直是红字。另外图标 14 → 16，和别的菜单一样 |
| 个人空间的面板 | 168 × 88 → 148 × 72；圆角 12 → 8；内边距 6 → 4；项高 36 → 32，左右内边距 10 → 8；项间距 2 → 0；和「…」的距离 6 → 4。右边仍和「…」的右边对齐 |
| 键盘操作 | 前后一样：Enter 打开，焦点落第一项；↓ 到第二项；Tab 关上，焦点回「…」；Esc 关上，焦点回「…」 |
| 个人空间「删除文件」 | 前后一样：确认框打开，焦点在「取消」上；取消以后焦点回「…」 |
| 首页「详情」 | 前后一样：站内跳到详情页 |
| 个人空间整页（`space.png`） | 差 72 个像素：第一行「…」的点深了一些。我推测是取消确认框后焦点回到「…」、再被脚本移走时，`Button` 的字色有过渡动画，截图时还没走完（原来的键没有过渡）。没有重拍验证 |

宽屏和 390 宽都没有页面报错。

## 三、要 Owner 看的

1. **菜单项圆角 4、危险项一直是红字**：这是第一批构件 README 里还没拍板的第 3、4 条。这次照构件现在的样子换了，所以首页和详情页的项圆角 8 → 4，详情页「删除」平时也是红字。如果要照原来的，只改 `menu.css` 一处，各页跟着变。
2. **个人空间的菜单变小了**：168 → 148 宽，项 36 → 32 高，现在和首页、草稿卷的菜单一样大。
3. **打开时「…」垫桌色底**：首页和详情页原来没有这个状态。
4. **详情页菜单图标 14 → 16**：别处的菜单都是 16，这里是原来唯一的 14。
5. **个人空间「…」用大号（36）**：为了和同一行「下载」「打开原草稿」一样高。那两个还是手写按钮，换个人空间页时可以一起改成 `Button`。

## 四、改了的脚本（都没跑，未验证）

- `scripts/verify-concierge-desk.mjs`：
  - 菜单行为那几条改读 `shared-ui/Menu.tsx`，因为 `ConciergeGroupRowMenu.tsx` 已删；
  - `Menu.tsx` 里 `role`、`aria-haspopup`、`aria-expanded` 写成对象的键，正则改成两种写法都认；
  - 题组卡 `data-ra-entry` 两条改认 `'data-ra-entry': '…'` 的写法。
  - 这几条正则只单独拿源码试过能匹配，整个脚本没跑。
- 下面这些对着源码试过仍能匹配，或者找的是读屏名字、类名、按钮位置，所以没动：
  - `verify-classic-retire-2.mjs`（「详情」链接和「删除」危险项两条）；
  - `smoke-golden-path.mjs`（「更多操作」键、「编辑」「删除」菜单项）；
  - `verify-pa-only-add-detail-consistency.mjs`（`.peek-actions-menu button`：面板挂在 body 上，所以 `.peek-actions-menu` 里仍只有触发键这一个按钮）；
  - `scripts/component-inventory/scenarios.mjs`（`[aria-haspopup="menu"]`、`.my-space-row-menu-trigger`）。
- `scripts/component-inventory/menu-shots.mjs`：新写的拍照脚本，见下一节。
- `../batch-1/README.md`：补了一条，记下 `Menu` 新加的参数。
- **更正（2026-11-14，换个人空间页时发现）**：上面说个人空间相关的脚本「没动」不全对。`scripts/verify-my-space-shelf.mjs` 里菜单那 5 条还在 `MySpacePage.tsx` 里找菜单代码，这次换完就会失败，我当时没查到这个文件。另外原来个人空间的菜单关掉了「点面板空隙也算点最近那一项」，换成 `Menu` 时没带过去。两处都在下一页补上了，见 `../migrate-space/README.md` 第三节。

## 五、检查和拍照时绕过的问题

- `node scripts/component-inventory/menu-shots.mjs before|after`：在清点用的本地网站上拍，宽屏 1440 和 390 宽两种。
- **个人空间列表是假数据**：本地网站的个人空间是空的，真去生成 PDF 要等一两分钟。拍照脚本拦下列表接口（只拦 GET），换成两份固定文件。改前改后用的是同一份数据，所以对照有效；下载、删除这些写接口没拦，脚本也没点。
- **首页菜单只有两项**：本地网站的题组没有 `paperSurfaceHref`，所以「阅读解析」那项不出现，带 `data-ra-entry="group-card"` 的那项没拍到。「相似篇章」那项的 `data-ra-*` 拍到了，前后一样。
- **没拍到的状态**：个人空间「…」下载中的禁用态；另存为的保存对话框。
- `node scripts/component-inventory/static.mjs --check`：没有一项变多。
  - 手写按钮 294 → 289
  - 手写圆角 385 → 382
  - 手写颜色 286 → 283
  - 手写字号 666 → 665
- TypeScript 通过。四个改动文件的 eslint 问题从 9 条降到 5 条：少的 4 条是原来个人空间菜单在渲染时读 ref（`react-hooks/refs`），剩下 5 条和改之前一条一条对过，都是原来就有的。`git diff --check` 通过。
- 没跑正式验证套件（AGENTS.md：Owner 说 Ship 之前不跑），改过的 verify 脚本只检查了语法（`node --check`）。只在 Chromium 里看过。
