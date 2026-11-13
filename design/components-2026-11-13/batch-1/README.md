# 第一批构件：按钮、菜单（构件厂第 2 步）· 2026-11-13

状态：**提案 · 单一来源**。选项是我从第 1 步清点数据里推的，样张、检查和对照只有脚本和我看过，Owner 还没看；同事访谈按 11-08 的决定没做。这一步**没有改任何页面**，现有页面一处都没换成新构件；也还没做样板间（第 3 步）。

## 一、建了什么

| 文件 | 是什么 |
|---|---|
| `app/src/shared-ui/Button.tsx` + `button.css` | 按钮：语气 × 大小 × 图标，加禁用、忙 |
| `app/src/shared-ui/Menu.tsx` + `menu.css` | 菜单：触发键 + 弹出的菜单面板（菜单项、分隔线、危险项、禁用项、链接项） |
| `scripts/component-inventory/preview-sheet.js` | 样张页：把每个选项、每种状态摆出来（只给下面的脚本用，不进网站） |
| `scripts/component-inventory/preview.mjs` | 拍样张、做客观检查、和清点里的现有变体逐项对 |
| `sheet-button.png` / `sheet-menu.png` / `sheet-menu-narrow.png` | 样张：按钮全部选项和状态；菜单（键盘焦点在危险项上）；390 宽窄屏菜单 |
| `checks.json` | 客观检查结果 |
| `mapping.json` | 现有每种按钮 / 菜单变体换成构件后，哪些维度会变 |

两处顺带改的：
- `scripts/component-inventory/lib.mjs` / `static.mjs`：共用构件本身（`app/src/shared-ui/` 下一层的 `.tsx` / `.css`，`tokens.css` 除外）不算「页面手写」，不进源码统计和基线。不然每建一个构件，基线就涨一点（按钮 324→326、圆角 393→396、字号 672→674），棘轮会拦住。基线数没动。
- `docs/design-gaps.md`：记了一条「危险色写小字」（见第四节第 1 条）。

## 二、选项和来历

全部从清点的「变体 × 选项」表来，门槛是占实拍按钮 ≥10%：

- **大小**：高 28 / 32 / 36 各占 45% / 21% / 24%，做 `sm` / `md`（默认）/ `lg`。
- **语气**：过门槛的是三种透明底——淡墨字 116 处、次要灰字 95 处、墨字 72 处，做 `quiet`（默认）/ `subtle` / `strong`。另加规范里点名的三种：雾薄荷主键 `primary`（DESIGN.md §2 Accent，每页一处）、石板墨填充 `solid`（§2 Ink-Action Rule，短标签）、危险字 `danger`。
- **图标**：图标 + 字 71%、只有字 23%、只有图标 6%（不到 10%，但清点里 axe 报过只有图标的按钮读屏名字对不上，所以单列一种：只有图标时 `label` 必填，类型上不给就编译不过）。
- **圆角**一律 8px（DESIGN.md §5：28–44px 的控件用 8，不做胶囊）。菜单面板 8px、内边距 4px、菜单项 4px（§5 同心）；面板白底 + `--elev-3`、无边线（§4）。
- **状态**：悬停垫桌色（整块响应）；键盘焦点 2px 石板墨环、离 2px，淡墨、次要灰的字提到墨色（换顶栏时补的）；打开着的触发键（`aria-expanded=true`，淡墨 / 次要灰 / 墨三种透明底）保持桌色底、墨字（换草稿卷时补的，样张 `sheet-menu.png` 里「…」键因此变成桌色底）；按下缩到 0.97；禁用变淡（填充的两种改成桌色底、次要灰字，和现有 `.primary-button` 一样）；忙：点不动、读屏念「忙」。减少动态效果时不缩、菜单不做入场动画。
- **菜单的行为**照搬现有 `ConciergeGroupRowMenu`：一次只开一个；Esc / Tab / 选中后关、焦点回触发键；点外面、外面滚动也关，但不抢焦点；方向键在项之间走（跳过禁用项，到头绕回），Home / End；打开时焦点落到第一项；面板挂到 body 下，固定定位，下面放不下就翻到上面，并且不出屏。
- **菜单项的参数**（换首页和个人空间的行菜单时补的，都是那两处原来就有的）：`onSelect` 拿到点击事件和触发键（链接项 `preventDefault` 走站内跳转；打开确认框的项把触发键交给确认框）；`restoreFocus: false` 让选中后焦点不回触发键、交给对话框；`data` 挂 `data-*` 属性。触发键多了 `triggerClassName`（只当选择器钩子）和 `triggerDisabled`。`ConciergeGroupRowMenu.tsx` 已删，见 `../migrate-menus/README.md`。
- **`ButtonLink`**（换详情页时补的）：样子和 `Button` 一样、点了是去别的地址的 `<a>`，用在详情页「阅读解析」（原来就是链接，能中键开新标签、能复制地址）。参数是 `href`、`tone`、`size`、`icon`；链接没有禁用和忙，这两项不提供。见 `../migrate-detail/README.md`。
- **放进会滑的悬停列表**（`FluidHoverList`，比如顶栏）时，底由列表画，按钮自己不再垫一层，只把字提到墨色。

**刻意没做成选项的**（过了 10% 门槛，但和规范或其余选项冲突，留给 Owner）：字 13/400（55 处）、14/500（34 处）。构件统一 13/500；见第四节第 2 条。

## 三、客观结果

重跑：`node scripts/component-inventory/preview.mjs`（自己起本地网站，约 1 分钟）。

| 检查 | 结果 |
|---|---|
| 字和底的对比（89 格，按钮 4.5:1） | 78 过、**11 不过**：全是危险字放在非白底上——页面底 #F1F5F7 上 4.40，悬停 / 按下的桌色 #E6EDF0 上 4.08；白底上 4.83 能过 |
| 点按区 ≥ 24×24（89 格） | 全过 |
| 读屏名字（89 格） | 全过 |
| 键盘焦点环 ≥2px 且和底 ≥3:1（6 种语气 + 菜单项） | 全过 |
| axe | `color-contrast` ×11（就是上面那 11 格）；`region` ×1（菜单面板挂在 body 下，不在页面的地标区里，现有菜单也是这样；这是 axe 的最佳实践项，不是 WCAG 条款） |
| 行为（25 条，见 `checks.json` 的 `behavior`） | 全过：键盘开关、方向键 / Home / End、Esc / Tab / 点外面 / 滚动关、一次只开一个、禁用项、回车选中、忙、贴右下角翻上、390 窄屏、减少动态效果、会滑的列表、字标签框不裁字 |

拍样张时看出一处检查没抓到的毛病：会滑的列表里，按钮的字被列表的滑动高亮盖住了（高亮是 z-index auto 的绝对定位 `::before`，按钮没定位就画在它下面）。已修：`.eqb-button` 加了 `position: relative`。检查也补了一条，截字的那一小块数深色像素；先拿没修的版本跑过，这条确实报失败，修了以后才过。

换顶栏时又对出一处：构件写了 `line-height: 1`，字标签又是 `overflow: hidden`，中文字形顶上、底下各被裁掉约半像素。已改成继承页面行高，并补了第 25 条检查（见 `../migrate-topbar/README.md`）。

## 四、换成构件后现有页面会变什么

对照的容差和清点聚类一样：色 ΔE76 ≤ 3、圆角 ±1、字号 ±0.5 且字重相同、高 ±2、左右内边距 ±2；透明边线算没有边；只有图标的不比字号。「最近的选项」是改动最少的那个。

**按钮**：38 种里 **9 种、314 处里 132 处**换了样子不变（主线 285 处里 128 处）。会变的维度按处数加权：字 136、左右内边距 123、圆角 80、高 24、边线 14、底色 10、图标 7、字色 4、影子 1。

| 变体 | 处数 | 现在的类名 | 最近的选项 | 会变什么 |
|---|---|---|---|---|
| button-01 | 82 | `ghost-button` | quiet·sm·icon-text | **不变** |
| button-02 | 35 | `draft-group-actions-menu-trigger` | strong·md·icon-text | 圆角 4px → 8px/8px/8px/8px；字 16/400 → 13/500；左右内边距 7px/7px → 12px/12px |
| button-03 | 30 | `ghost-button` | quiet·lg·icon-text | 字 14/500 → 13/500；左右内边距 8px/8px → 12px/12px |
| button-04 | 21 | `concierge-group-row-icon` | subtle·sm·icon | **不变** |
| button-05 | 18 | `topbar-back` | subtle·sm·icon-text | 左右内边距 8px/0px → 8px/8px |
| button-06 | 16 | `draft-paper-rail-item` | subtle·lg·icon-text | 圆角 0px → 8px/8px/8px/8px；字 13/400 → 13/500 |
| button-07 | 10 | `concierge-browse-entry` | subtle·md·icon-text | 字 13/400 → 13/500；左右内边距 8px/8px → 12px/12px |
| button-08 | 9 | `topbar-page-title-editable` | strong·sm·icon-text | 圆角 0px → 8px/8px/8px/8px；高 18 → 28；左右内边距 0px/0px → 8px/8px |
| button-09 | 8 | `draft-more-menu-trigger` | subtle·sm·icon | **不变** |
| button-10 | 8（支线） | `my-space-row-menu-trigger` | subtle·lg·icon-text | 字 13/400 → 13/500 |
| button-11 | 7 | `draft-export-menu-trigger` | primary·md·text | **不变** |
| button-12 | 6 | `draft-group-suggestion` | subtle·md·text | 底色 #F1F5F7 → transparent；字 12/400 → 13/500；左右内边距 9px/9px → 12px/12px |
| button-13 | 6 | `ghost-button` | strong·lg·text | **不变** |
| button-14 | 5 | `draft-reorder-suggestion-undo` | subtle·sm·text | 圆角 4px → 8px/8px/8px/8px；字 12/400 → 13/500；高 23 → 28；左右内边距 4px/4px → 8px/8px |
| button-15 | 4 | `concierge-intent-clear` | subtle·sm·text | 圆角 999px → 8px/8px/8px/8px；图标 icon-only → none |
| button-16 | 4 | `concierge-intent-submit` | quiet·md·icon | 字色 #11957A → #3F525B |
| button-17 | 4 | `concierge-command-filter-toggle` | strong·lg·text | 边线 1px solid #D8D8D2 → 无；字 13/400 → 13/500 |
| button-18 | 4（支线） | `paper-browse-error-back` | strong·lg·text | 边线 1px solid #DCE6EB → 无 |
| button-19 | 4（支线） | `ghost-button` | quiet·sm·icon-text | 字 13/400 → 13/500 |
| button-20 | 4（支线） | （没有类名） | subtle·lg·text | 圆角 0px → 8px/8px/8px/8px；字 14/500 → 13/500；高 44 → 36；左右内边距 0px/0px → 12px/12px |
| button-21 | 3 | `concierge-row-expand` | strong·sm·text | 圆角 4px → 8px/8px/8px/8px；高 22 → 28；图标 icon-only → none |
| button-22 | 3 | （没有类名） | strong·lg·text | 底色 #FFFFFF → transparent；边线 1px solid #E6EDF1 → 无；字 16/400 → 13/500 |
| button-23 | 3（支线） | `primary-button` | solid·md·text | **不变** |
| button-24 | 2 | `concierge-group-row-icon` | strong·sm·icon | **不变** |
| button-25 | 2 | `draft-a4-empty-cta` | primary·lg·text | 左右内边距 16px/16px → 12px/12px |
| button-26 | 2 | （没有类名） | strong·lg·icon-text | 字 13/400 → 13/500 |
| button-27 | 2 | `ghost-button` | strong·sm·icon-text | **不变** |
| button-28 | 2（支线） | `my-space-row-menu-item-danger` | danger·lg·icon-text | 字 13/400 → 13/500 |
| button-29 | 1（支线） | `login-submit` | solid·sm·text | 圆角 999px → 8px/8px/8px/8px；影子 custom → none；字 15/500 → 13/600；高 52 → 28 |
| button-30 | 1 | `concierge-group-row-menuitem` | strong·md·icon-text | 字 13/400 → 13/500；左右内边距 8px/8px → 12px/12px |
| button-31 | 1 | `concierge-filter-clear-inline` | strong·sm·text | 圆角 0px → 8px/8px/8px/8px；字 13/400 → 13/500；高 18 → 28；左右内边距 0px/6px → 8px/8px |
| button-32 | 1 | `back-button` | subtle·sm·icon-text | 高 18 → 28；左右内边距 0px/0px → 8px/8px |
| button-33 | 1 | `draft-reorder-suggestion-act` | strong·sm·text | 边线 1px solid #1B2B33 → 无 |
| button-34 | 1 | （没有类名） | strong·lg·icon-text | 圆角 4px → 8px/8px/8px/8px；字 16/400 → 13/500 |
| button-35 | 1 | `danger` | danger·lg·icon-text | 圆角 0px/8px → 8px/8px/8px/8px；边线 1px solid #E6EDF1 → 无；字 16/400 → 13/500 |
| button-36 | 1（支线） | `primary-button` | solid·lg·text | **不变** |
| button-37 | 1（支线） | `vocabulary-practice-back` | strong·lg·icon-text | 底色 #FFFFFF → transparent；边线 1px solid #E6EDF1 → 无；字 14/600 → 13/500 |
| button-38 | 1（支线） | `topbar-back` | strong·sm·icon-text | 字 16/400 → 13/500；左右内边距 8px/0px → 8px/8px |

几条需要看清楚的（我的判断，单一来源）：
- **button-15、21** 实际是只有图标的按钮（清除 ×、展开），对照器把它们对到了「只有字」那一档，是因为那样别的维度改得少。迁移时应该用「只有图标」那一档。
- **button-08**（顶栏里可改名的页面标题）、**button-29**（登录页 52 高的大按钮）、**button-20**（44 高）离三档都远，我倾向于不套按钮构件，留成各自的写法；要不要套，由 Owner 定。
- 最大的一块是 **button-02**（草稿卷分组的「操作」触发键，35 处）：圆角 4→8、字 16/400→13/500、左右内边距 7→12。

**菜单面板**：4 种里 2 种不变（dialog-02 `draft-save-space-dialog`、dialog-03 `concierge-group-row-menu`）；dialog-01 `draft-group-actions-menu-panel`（3 处）和 dialog-04 `my-space-row-menu`（1 处）圆角 12→8。

## 五、要 Owner 拍板的

1. **危险字的颜色**：`--eqb-color-danger` #DC2626 只在白底上过 4.5:1。是加一个写字用的深一档（候选名 `--eqb-color-danger-text`），还是危险按钮只许放白底上？已记进 `docs/design-gaps.md`，没自己编色值。
2. **字 13/400 和 14/500** 要不要留成选项（现有 55 处、34 处）？现在统一 13/500，迁移时这些按钮的字会变重或变小。
3. **菜单圆角**：面板 12→8、菜单项 4（DESIGN.md §5 的同心规则），而现有 `concierge-group-row-menu` 的项是 8。照规范走，还是照现有的？
4. **危险菜单项**：构件里平时就是红字；现有 `concierge-group-row-menu` 只在悬停时变红。选哪种？
5. **axe 的 `region`**：菜单面板挂在 body 下、不在地标区里。我倾向于不管（现有菜单一样，也不是 WCAG 条款），请确认。

## 六、没做的

- 没有把任何页面换成新构件（第 4 步）；上面的「会变什么」是预测，不是改过的结果。
- 没做样板间页面（第 3 步）。
- 只在 Chromium 里拍过、查过；没在 Safari / Firefox、真触屏设备上看。
- 卷面（PaperSurface）、打印、PDF 样式没碰。
