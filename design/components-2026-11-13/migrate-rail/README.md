# 草稿卷左栏目录换成共用行 Row、缺题项删后焦点 · 2026-11-15

两件事：左栏目录的每一项换成 `shared-ui/Row.tsx`；左栏「缺题」那一项删掉以后焦点不再掉到 `<body>`。
只动了 `app/src/features/draft-paper/DraftPaperRail.tsx`、`DraftPaperWorkbench.css` 里左栏那一段、`DraftPaperWorkbench.tsx` 里传给左栏的 `onDeleteItem` 和删后焦点那一段。卷面（PaperSurface）、工具条、打印样式没动。

| 文件 | 内容 |
|---|---|
| `compare-rail.png` | 左栏元素截图前后对照（1440，2 倍图）：静止、悬停、键盘焦点、当前项、缺题项（静止 / 悬停 / 焦点）、删后、撤销后、缺题项删完 |
| `diff.json` | 两边量到的行高、读屏树、Tab 顺序、焦点时间线（`before` / `after` / `afterFocus`） |

脚本：`scripts/component-inventory/rail-shots.mjs`（拍图、量、走键盘）、`rail-compare.mjs`（拼图、写 diff.json）。测试台照 `followup-shots.mjs`，`INVENTORY_PORT_OFFSET=73`。原图在 `.scratch/component-inventory/rail-{before,after-final,after-focus,after-missing}/`，不进库。

## 一、目录项换成 Row

**做了什么**
- 每一项是 `<Row as="li" size="sm" padding="none">`，放在 `<ul>` 里（`FluidHoverList as="ul"`）。原来是 `div` 里一串 `role="button"` 的 `div`。
- **能跳的项**：整行目标是 `<button>`（`action.kind = 'button'`，就地把卷面滚到这一组，不离开这一页，所以不用链接）。读屏名字是行上看得见的字「A篇 原卷 A 篇」。原来整项 `div` 自己接 Enter / 空格，现在是真按钮。
- **缺题的项**：没有可跳的地方，是不可点的行（不给 `action`）。上移 / 下移 / 移除三个键是行里的键，和行是兄弟关系不嵌在目标里。原来整项本身也是一个 Tab 停点（按了什么也不做），现在 Tab 只停在三个键上。
- **当前项**：意思不变（卷面滚到哪一组，哪一项是当前），还是白底板 + 墨字 500。原来只有类名 `active`，没有 `aria-current`；现在 `<li aria-current="location">`。
- **缺题怎么标**：不变，主名「题组已从题库中移除」，警示色斜体。
- **拖动排序**：照旧挂在 `<li draggable>` 上。实测把第一项拖到第三项上，顺序 A B C → B C A，换前换后一样。
- **当前项白底板**：照旧由左栏量位置画。板放在列表外面的一层（`.draft-paper-rail-panel`），`<ul>` 里不再夹 `<span>`。
- 类名 `draft-paper-rail-item` / `active` / `is-missing` 和 `data-draft-group-id` 留着，几个 verify / smoke 脚本靠它们找元素。
- **为什么不用 `RowList`**：左栏本身就是板（Surface board），行之间是 4px 空隙，没有分隔线，和整卷页左栏是同一种目录写法。`RowList` 会画分隔线、再套一层板。
- **悬停滑块**：停在能跳的项的整行目标上，和行一样大。行和行之间 4px 空隙里点一下，`FluidHoverList` 点的是最近那一项的整行目标，照旧能跳。缺题项也放进停靠表（停在 `<li>` 上），滑块停在它上面时藏起来，这样不可点的行没有悬停。换后第一次实拍发现：缺题项不在停靠表里时，滑块总是挑最近的一项，鼠标停在缺题项上会给它上面的「C篇」铺上悬停底。已改，补拍过。
- **拖拽把手**：改成不接鼠标（`pointer-events: none`），点在把手上就是点整行目标。原来把手出现以后接鼠标、手形是 grab，点它不跳。拖动从整行起，不受影响。

**尺寸**

| | 换前 | 换后 | 变化 |
|---|---|---|---|
| 每项高 | 36 | 44（`sm`） | +8 |
| 左栏高（3 项） | 171 | 195 | +24 |
| 左栏高（3 项 + 2 个缺题项） | 251 | 291 | +40 |
| 左栏宽 | 164 | 164 | 不变 |
| 项左右内衬 | 0 10 | 0 `--eqb-space-2`（8） | 字往左 2px |
| 页数小字左右内衬 | 0 10 | 0 `--eqb-space-2` | 跟着项对齐，往左 2px |
| 把手离右边 | 9 | `--eqb-space-2`（8） | 往右 1px（目测看不出） |
| 主名右边给把手留的位置 | 18 | `--eqb-space-4`（16） | — |

`Row` 只有 48 和 44 两档，44 最接近原来的 36。按 DESIGN.md §5 现在的写法，44 只给卷行展开后的题组行用，所以这里用 44 要 Owner 定，见文末。

**写法上换掉的**：`.draft-paper-rail-item` 的 `cursor`、`min-height`、`position`、`z-index`、`:focus-visible`、`[data-fluid-hover-active]`，以及 `.is-missing { cursor }`。焦点（桌色底 + 向里 2px 墨环）、按下（深一档底）、最小高、定位都归 `row.css`。删之前 grep 过 `app/src` 和 `scripts`，没有别处用这些规则。颜色、圆角、字号都换成了 tokens 里的变量，色值和原来一样（本页 `--ink-soft` 指到 `--desk-muted`，就是 `--eqb-color-text-muted` #5A6C75）。缺题项三个小键的 `gap: 2px`、`padding: 1px 4px` 是原来的数，没改，也没有对应的变量。

**样子的变化**（看 `compare-rail.png`）：每行高了 8。键盘焦点从「只有一圈墨环」变成「桌色底 + 墨环」，这是 Row 的统一写法。缺题项鼠标停着时不再铺悬停底，换前铺。其余一样：颜色、白底板、悬停、当前项字重都没变。

## 二、缺题项删掉以后的焦点

**做了什么**（`DraftPaperWorkbench.tsx`）
- 左栏的「移除」把被点的那个键交给 `onDeleteItem(item, trigger)`，接到 `removeFromRail`。这一步在删之前用 `planFocusAfterRemoval` 定好去处：下一项的「移除」→ 上一项的「移除」→ 兜底。认项用 `<li>` 上的 `data-draft-group-id`。只有缺题项有「移除」，所以「下一项」指的是往后数、最近一个还有这个键的项，`focusAfterRemoval.ts` 本来就是这么找的。
- 兜底的写法和「从菜单移出题组」用的是同一段 effect：落到「卷面目录」（`nav`，临时加 `tabindex=-1`）；窄屏左栏藏起来时落到卷标题 `h1`。不过左栏的键不会随卷面重排被卸掉，所以不等卷面排好（`railOnly`），这一项从左栏里消失的那一刻就落。等到那一刻才动，是因为删之前计数会先变一次，那时不能动焦点；删除失败时，原来的 catch 会把这次安排清掉。
- **撤销**：被撤回的那一组如果没有卷面工具条（缺题项就没有），焦点回到它在左栏的「移除」；再找不到，落「卷面目录」。卷里还有缺题项时卷面一直排不出来，等不到「排好」。所以只在撤销时这样做：键一出现就落过去，撤销提示收起时还回去的那个键也算「我们的」。删除时不提前抢，因为用户可能已经 Tab 进了撤销提示。

**实测**（Playwright，`document.activeElement` 和读屏树；键盘操作：焦点放到「移除」上按 Enter，再 Tab 到提示里的「撤销」按 Enter）

| 情况 | 换前 | 换后 |
|---|---|---|
| 两个缺题项，删前一个（*） | `<body>` | 后一个缺题项的「移除」（2ms，服务器回话、左栏重画那一下） |
| 接着撤销（*） | 先在「撤销」上，约 0.8 秒后掉到 `<body>` | 被撤回那一项自己的「移除」（约 0.8 秒） |
| 只剩一个缺题项，真删 | `<body>`，卷面重新排好以后还是 `<body>` | 「卷面目录」（`nav`），删完马上落，卷面重新排好以后还在 |
| 接着真撤销 | 撤不回来，焦点留在「撤销」 | 同左 |
| 从删完到「撤销」要按几次 Tab | 6（*） | 2（*） |
| 390 宽 | 左栏 `display: none`，缺题项点不到 | 同左（没有单独测窄屏的兜底 `h1`，这段代码和「菜单移出」共用，那一轮测过） |

（*）这几行用了测试替身。卷里还有别的缺题项时，服务器拒绝删除（`questionGroupId not found: group-ghost-2`，见下面「发现的问题」第 1 条），所以这一段让删除接口直接回「卷里少了这一项」，撤销接口回删之前的卷。这里只测前端焦点，没测服务器。「只剩一个缺题项」那两行是真接口。

**读屏**：落到「移除」时念「移除，按钮」；落到 `nav` 时念「卷面目录，导航」。这是按属性推出来的，没有用真读屏软件听过。

**换前换后的读屏树**（`ariaSnapshot`，全文在 diff.json）
- 换前：`navigation "卷面目录"` 下面是三个 `button "A篇原卷 A 篇"`…。缺题项是一个 `button "题组已从题库中移除 上移 下移 移除"`，按钮里面还套着三个按钮。
- 换后：`navigation "卷面目录"` > `list` > `listitem "A篇（原卷 A 篇） · 阅读理解 · 3 题"`，里面先是 `button "A篇 原卷 A 篇"`，后面跟着行上的字。缺题项是一个没有名字的 `listitem`，里面是字和三个按钮。
- Tab 顺序：换前换后都是 A → B → C → 卷面 iframe。有缺题项时，换后每个缺题项停三下（上移、下移、移除），换前停四下（多了整项那一下）。
- Enter 跳到那一组：换前换后一样，页面从 0 滚到 2634，焦点留在那一项。

## 三、没做的

- 缺题项三个小键还是原来的写法（约 20 × 14），不到 24 × 24 的点击区，也没有换成 `Button`。换成 28 的图标键，三个就占 84，164 宽的左栏里主名只剩一两个字（现在已经截成「题组…」了）。这件事要和缺题项的整体写法一起看。
- 键盘排序：原来能跳的项就没有键盘上移 / 下移（排序在卷面工具条上），这次没加。
- 读屏的补充说明丢了：原来整项 `div` 带着 `title`，读屏会把「A篇（原卷 A 篇） · 阅读理解 · 3 题」当说明念出来。现在 `title` 在 `<li>` 上，鼠标停着照样出提示，但读屏把它当成列表项的名字，整行目标按钮本身没有说明。`Row` 的 `action` 不收 `title`、`aria-describedby`，也不收 `aria-current`，`aria-current` 只能挂在 `<li>` 上。要改得动 `Row.tsx`，不在这次范围里。
- 换后的读屏树里，行上的字在按钮后面会再念一遍（按钮是空的、盖在字上面）。所有用 Row 的地方都这样，不是左栏才有的。
- 没有整页逐像素比较，按要求只拍了左栏。

## 四、发现的问题（换前就有，没改，都在服务器）

1. **卷里有两个以上缺题项时，哪个都删不掉。** `deleteDraftPaperItem` 先调 `assertCanonicalProspectiveDraft`，它碰到剩下的另一个缺题项就报 `questionGroupId not found`。拖动排序也一样（`保存草稿卷 Error: questionGroupId not found`）。换前实测过。
2. **缺题项删了以后撤不回来。** 撤销走 `restoreDraftPaperItem` → `addGroupToDraftPaper`，题库里没有这一组就报错。可提示里还是给了「撤销」。
3. **卷里有缺题项时卷面排不出来**：「排卷面没成功：选中的题组已缺失，不能生成不完整产品」。所以老师只能先在左栏把缺题项删掉，而第 1 条又让他删不掉。

## 五、脚本断言（都没运行）

- `scripts/verify-c8-draft-paper-render-model.mjs`「rail row carries a title tooltip…」：原来查的是一行写死的 `const rowTitle = isMissing ? undefined : \`${label} · …\``。2026-11-14 加了「（原卷 X 篇）」以后，换前这条就已经不成立了。改成用正则查 `rowTitle` 里还有「· 题型 · N 题」，并且 `title={rowTitle}` 还在。
- 查过、不用改的：`verify-a3-imposition.mjs`（`.draft-paper-rail-item` 计数、`.last().click()`、`.active`）、`verify-reorder-suggest.mjs`（计数）、`docs/cuts/similar-workbench-swap/qa/dp2-similar-workbench-swap.mjs`（计数、`.active`）、`ux-walkthrough/find-compose-export.mjs`（`allInnerTexts`）、`component-inventory/surface-shots.mjs`（悬停第二项）。类名都留着；点 `<li>` 中间点到的是整行目标，照样能跳。

## 六、取证跑了几次（照实记）

要求是换前、换后各跑一次。实际多跑了几次：
- 换前：第 1 次脚本没算到「卷里有缺题项时卷面排不出来」，等待会超时，跑到一半停掉了。第 2 次脚本有 bug（`page.evaluate` 里用了外面的变量），删后焦点那几步都没跑成。第 3 次发现服务器在有两个缺题项时不肯删，脚本改成测试替身。用的是第 3 次的结果。临时 worktree 拍完马上删了。
- 换后：第 1 次（`rail-after`）拍完发现两处问题：缺题项悬停的滑块挑错了项；删最后一个缺题项后，焦点要等卷面重新排好、在 `<body>` 上待几十秒。改了代码以后补跑了焦点几步（`rail-after-focus`）。然后发现字色用错了（用了 `text-secondary`，原来是 `text-muted`），改回来，补拍了图（`rail-after-final`，`RAIL_ONLY` 只跑拍图和量的那几步）。对照图里换后那一栏，前七张来自 `rail-after-final`，后三张（删后、撤销后、删完）来自 `rail-after-focus`；后三张用的是改色以前的代码，左栏字色深一档（#3F525B），其余一样。拖动排序的结果来自 `rail-after`。
