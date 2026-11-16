# 卡片 / 板换成共用构件（构件厂，2026-11-15）

清点（`../inventory.md`「卡片 / 板 / 纸 8 种 23 处」，对照图 `../sheet-surface.png`）里能换的几处，换上新构件
`app/src/shared-ui/Surface.tsx`（配 `surface.css`、`surfaceProps.ts`）。

**结果**：首页、浏览页逐像素不变；草稿卷左栏多了一圈板的边；个人空间文件列表、管理页 Agent 口令那一块的边从
「占位的实边」换成「不占位的一圈」，个人空间那圈边深了一档。换上的 14 处 + 顺带的「接着做 / 今天翻到」列表板，
其余 9 处不换，理由见下。`cd app && pnpm build` 通过。

## 构件

逐处看过清点的 8 种以后，真正是卡片的只有两种样子，照 DESIGN.md §4 四档高度、§5 Cards：

| 样子 | 用在 | 底 | 边 / 影 | 圆角 | 内边距 |
| --- | --- | --- | --- | --- | --- |
| `board` 板（默认） | 装一组东西：卷行列表、文件列表、目录、一块说明加几个键 | `--eqb-color-paper` | 一圈 1px `--eqb-color-border`（`0 0 0 1px`，不占位置），不投影（e0）；裁切里面的行 | `--eqb-radius-card` 12 | `none` 0（默认，里面的行自己有内衬）/ `md` 16（`--eqb-space-4`） |
| `sheet` 纸 | 单独放在桌上的一张 | `--eqb-color-paper` | `--elev-1`（墨圈就是边） | 12 | 同上 |
| `SurfaceButton` 可点的纸 | 整张能点的卡片 | 同纸；悬停、按下垫 `--eqb-color-desk` | e1；键盘焦点 2px `--eqb-color-action` 墨环外扩 2px | 12 | 默认 `md` |

- **不能点的不加悬停**：`Surface` 没有任何 `:hover` 样式。样张里「悬停」那两格是强制出悬停态拍的，和静止一模一样。
- **可点的只有纸**：板装的是一组东西，能点的是里面的行和键，不是板本身，所以不做「可点的板」。
- **按下**：垫桌色、缩到 0.99（Button 是 0.97，放在一张卡上会缩掉十来像素，太晃，目测）；系统设了减少动态效果时不缩，只垫底。
- **语义元素**：`as` 选 `div`（默认）/ `ul` / `section` / `article` / `aside` / `nav`。后四种类型上强制要名字：有看得见的标题用
  `aria-labelledby` 指向它，没有才用 `aria-label`。`SurfaceButton` 是 `<button>`，里面只放行内内容，读屏念卡片上的字。
- **别的构件画的根元素**（比如 `FluidHoverList` 画出来的 `<ul>`）用 `surfaceProps({ variant }, '原类名')` 挂上类名和 `data-surface`、
  `data-padding`。单放在 `surfaceProps.ts`，`Surface.tsx` 只导出构件，快速刷新才认得出（eslint `react-refresh/only-export-components`）。
- **板的边为什么画成一圈、不用实边**：首页和浏览的卷行列表卡原来就是 `box-shadow: 0 0 0 1px var(--desk-border)`，DESIGN.md §4
  说它「本来就是板，不动」。换成实边会占 1px，列表里每一行往里挪一像素，主路上整片都不一样。用一圈，主路逐像素不变；代价是原来用实边的
  两处（个人空间、Agent 口令）高矮差 2px，见下。
- **没有第三种「分区底」**：清点里「底色分区」那三种都不是卡片（见下表 surface-01、03、07），不为它们单开一档。
- **和 EmptyState 不打架**：「没找到」那张卡片还是 EmptyState 自己画（白底、1px 实边、12 圆角、不投影，样子和板一样）。獭獭从卡片上沿露出来，
  定位算的是那 1px 实边（`bottom: calc(100% + 1px)`），这一轮不接管。前后截图逐像素一样（`home-noresult*`）。

样张：`sheet-surface-new.png`（1440）、`sheet-surface-new-390.png`：板（里面是行 / 带内边距 / 强制悬停 / section + aria-labelledby）、
纸（静止 / 强制悬停）、可点的纸（静止、悬停、键盘焦点、按下、禁用）。每格的实算样式在 `keys.json` 的 `styles`。

## 换了哪些

| 编号 | 哪里 | 处 | 换成 | 看起来 |
| --- | --- | --- | --- | --- |
| surface-05 | 首页出结果、最近上新、浏览页每个年份的卷行列表（`ConciergeDesk.tsx` 三处 `.concierge-paper-list`） | 2 | `surfaceProps({ variant: 'board' })` | **逐像素一样**（1440、390） |
| — | 首页「接着做」「今天翻到」的列表（`ConciergeHomeSections.tsx` 两处 `.home-row-list`），清点归在「行」里，和上面是同一种板、同一页，顺带换 | 2 处写法 | 同上 | **逐像素一样** |
| surface-01 | 草稿卷左栏目录（`DraftPaperRail.tsx` 两个 `<nav>`：卷面目录、相似篇章候选） | 9 | `<Surface as="nav" aria-label=…>` 板 | **多了一圈边**：原来白底没有边，照 DESIGN.md §4「板（列表卡、面板）」统一。只有边那一圈的像素变了（`draft-rail*`、`draft-page`、`draft-empty-*`） |
| surface-06 | 个人空间文件列表（`MySpacePage.tsx` `.my-space-file-list`） | 2 | `surfaceProps({ variant: 'board' })` | **边深一档、列表矮 2px**：原来是占位的 1px 实边、颜色 `--eqb-color-border-subtle`（#E6EDF1），照 DESIGN.md §4「板只用 1px --desk-border 一圈边」换成板的 `--eqb-color-border`（#DCE6EB），和首页、浏览的列表板一个样子；边不占位以后，里面的行宽了 2px、整块矮了 2px |
| surface-08 | 管理页新建 Agent 口令后「只显示这一次」那一块（`AgentTokens.tsx` `.agent-token-secret`） | 1 | `<Surface padding="md">` 板 | **矮 2px**：边色本来就是 `--eqb-color-border`，只是实边换成一圈，内容往外挪了 1px |

旧 CSS 删掉的：`App.css` 两条列表规则里的底、圆角、边、影、裁切、去圆点（只留 `display: flex` 这些排法）；`MySpacePage.css`
`.my-space-file-list` 的底、边、圆角、裁切（留 `--fh-radius`）；`adminWorkbench.css` `.agent-token-secret` 的内边距、底、边、圆角
（留 `margin-top`）；`DraftPaperWorkbench.css` `.draft-paper-rail` 的底、圆角，内衬和滚动挪到一条 (0,3,0) 的覆盖里
（14 / 8 / 12 是存量半档，DESIGN.md §8 不追改；目录长了要能滚，构件的板是 `overflow: hidden`），注释写明盖了谁、为什么。

类名都留着当钩子（`concierge-paper-list`、`home-row-list`、`my-space-file-list`、`agent-token-secret`、`draft-paper-rail`），
smoke-*、verify-*、ux-walkthrough、清点脚本里按这些类名找元素的地方一处不用改。

## 没换的和原因

| 编号 | 哪里 | 处 | 为什么不换 |
| --- | --- | --- | --- |
| surface-02、04 | 首页大搜索框（`.concierge-intent-bar`，清点归「放在桌上的一张纸」） | 5 | 已经是 `SearchField` 构件（hero 档，e1、16 圆角）；这是 ConciergeDesk 主面，样子不能变 |
| surface-03 | 首页卷行展开后的行头（`.concierge-paper-row-head` 垫 `--desk-hover`，清点归「底色分区」） | 3 | 这是一行的展开 / 悬停状态，归「行」，不是卡片；它在板里面，板换了它没变（`home-results-expanded*` 逐像素一样） |
| surface-07 | 登录页整页底色 `#F4F8FA`（清点归「底色分区」） | 1 | 是页面底，不是卡片；Owner 定过（BRAND.md §4.7、DESIGN.md §1 登录页一条），色值不在色阶里也是定过的 |

「放在桌上的一张纸」三种里没有一种是卷面（PaperSurface）或和卷面共用样式：两种是搜索框，一种（surface-05）是列表板，
DESIGN.md §5 Cards 明写它是板，所以按板换。卷面、打印、PDF 样式一行没碰。

清点里只在源码看到、页面没拍到的 34 处卡片样写法（讲评栏、词典卡、七选五卡片、听写面板、生词页这些，见 `../data/uncaptured.json`）
不在这一轮，碰到哪页换哪页。

## 取证

脚本（端口 `INVENTORY_PORT_OFFSET=65`，默认测试数据；Playwright 从 `app/package.json` 载入）：

- `scripts/component-inventory/surface-shots.mjs <标签>`：首页（默认、接着做 + 悬停一行、出结果 + 悬停一行、展开第一行、没找到）、浏览页、
  草稿卷（空、三组 + 悬停一项；390 宽时左栏本来就藏起来，只拍整页）、个人空间（和 space-shots.mjs 同一份假数据，+ 悬停一行）、
  管理页 Agent 口令（口令接口拦下给固定值）。1440、390 各一遍，整页 + 那一块的裁图，记每块卡片 / 板的实算样式。
- `scripts/component-inventory/surface-compare.mjs`：逐像素比 RGBA，比实算样式，拼 `compare-*.png`（之前 | 之后 | 差异涂红）。
- `scripts/component-inventory/surface-sheet.mjs`：样张和键盘测试，舞台和 `field-harness.mjs` 同一个做法（真构件打包）。

做法：改之前在原代码上拍 `before` 和 `before2` 两遍（看拍照稳不稳），改完拍 `after`。

| 比什么 | 结果 |
| --- | --- |
| before2 对 before（43 张） | 42 张一样；`admin-tokens.png` 不一样（2145 像素），在名称输入框的占位字「例如：组卷 Agent」里，全角冒号两次排得宽窄不同，是字体回退的抖动，和这一轮无关。实算样式 0 处不同 |
| after 对 before（43 张） | **28 张逐像素一样**，15 张不一样，全部是上表说过的三处，见下 |

逐像素一样的（1440 / 390 都是）：首页 `home-page`、`home-continue`（+ 悬停、整页）、`home-results-list`（+ 悬停、整页）、
`home-results-expanded`（+ 整页）、`home-noresult`（+ 整页）；浏览页 `browse-list`、`browse-page`；草稿卷 390 的 `draft-page-390`、
`draft-empty-page-390`（左栏藏着）。实算样式在这些地方只多了一个类名 `eqb-surface`。

不一样的，逐张说明：

| 截图 | 差异 | 原因 |
| --- | --- | --- |
| `draft-rail`、`draft-rail-hover`、`draft-page`（1440） | 2786 像素，全在左栏外沿那一圈（整页图里范围 x 121–287、y 71–244，就是左栏） | 左栏多了板的边 |
| `draft-empty-rail`、`draft-empty-page`（1440） | 2274 像素，同上 | 同上 |
| `my-space-list`、`-hover`（1440、390） | 截图高矮差 2px（尺寸不同，没法逐像素叠） | 实边换成一圈：整块矮 2px；边色 #E6EDF1 → #DCE6EB |
| `my-space-page`（1440 48415 像素、390 35405 像素） | 范围就是文件列表那一块 | 同上，里面的行往外挪 1px |
| `admin-token-secret`、`admin-tokens`（1440、390） | 高矮差 2px | 实边换成一圈，边色不变 |

对照图：`compare-home.png`、`compare-browse.png`、`compare-draft.png`、`compare-my-space.png`、`compare-admin.png`（橙框 = 有不一样的像素）。
原图在 `before/`、`after/`，数字全在 `diff.json`（`changed`、`stable`、`measureDifferences`）。

### 键盘

`keys.json`、`keys-focus-card-a.png`：舞台上依次放「起点」键、不能点的板、可点的纸 A、不能点的纸、可点的纸 B、「终点」键。
从「起点」按 Tab：焦点落到 A → B → 终点，不能点的板和纸不停；焦点在卡片上时 `:focus-visible` 成立，焦点框 `2px solid rgb(41, 66, 77)`
外扩 2px（石板墨，§4 Focus Ring）。在 A 上按 Enter，点击计数 0 → 1；按空格 1 → 2。

站上这一轮换的地方没有整张能点的卡片（清点的 23 处里没有），可点的纸只在样张和键盘舞台上验过。

## 改了的检查脚本

**没有要改的。** 查过 verify-* / smoke-* / ux-walkthrough 里提到这几个类名的地方：都是按类名找元素（`.concierge-paper-list > li`、
`.draft-paper-rail-item`、`.draft-paper-rail--swap` 等），类名都还在；`verify-my-space-shelf.mjs` 认的是 TSX 里有 `my-space-file-list`
这个字，还在；没有哪条断言钉着被删的那几行 CSS（底、边、圆角、影）。`verify-radius-family.mjs` 只认圆角值，新文件里只有
`var(--eqb-radius-card)`。都没运行。

## 缺的变量

记进 `docs/design-gaps.md`「2026-11-15 卡片 / 板构件的几处值」：

1. 板的那一圈边：e0 没有变量，`surface.css` 直接写 `0 0 0 1px var(--eqb-color-border)`。候选名 `--elev-0-edge`。
2. 可点卡片按下缩多少：`scale(0.99)` 字面量（Button 的 0.97 也是字面量）。候选名 `--eqb-press-scale`、`--eqb-press-scale-large`。
3. 草稿卷左栏内衬 14 / 8 / 12：存量半档，照原值写字面量。

## 要 Owner 定的

1. **草稿卷左栏多出来的那圈边，留不留。** 原来白底没有边（贴在桌上的一块白），照 DESIGN.md §4「板（列表卡、面板）只用 1px 一圈边」
   统一成板。左右对照见 `compare-draft.png`。**建议：留**，和首页、浏览、个人空间的板一个样子；不要的话左栏另开一个「没有边的白底」，
   那就是第三种卡片，规范里没有。
2. **个人空间文件列表的边从浅一档（border-subtle）改成和别的板一样（border），留不留。** 见 `compare-my-space.png`。**建议：留**，
   §4 写的就是 `--desk-border`，原来那档浅色没查到 Owner 决定（清点「有意？」一栏是「没查到」）。
3. **DESIGN.md 要补的两句**（这一轮不改 DESIGN.md，只报告）：§5 Cards 写上 `shared-ui/Surface.tsx` 两种样子和可点卡片的四个状态
   （悬停垫桌色、墨焦点环、按下缩 0.99、不能点的不加悬停）；§4 表里 e0 那一行补一句「板的边画成 `0 0 0 1px` 一圈 `--desk-border`，不算影子」
   （清点把首页列表卡的这一圈报成「影子不是四档之一」，是误报）。**建议：照这样补**，标「提案 · 单一来源」。
