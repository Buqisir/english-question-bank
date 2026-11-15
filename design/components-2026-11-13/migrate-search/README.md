# 搜索框换成共用构件（构件厂，2026-11-15）

上一轮（`../migrate-field/README.md`「搜索框」）留下的：首页大搜索框、浏览页紧凑搜索框收进一个构件，分两档。

- `app/src/shared-ui/SearchField.tsx` + `search.css`：`tier="hero"`（首页）| `"compact"`（浏览页）。
- 首页、浏览页（同一个 `ConciergeDesk`，按 `isBrowseScreen` 选档）换上它。App.css 里搜索框的样子删掉，只留摆法。
- 听写页「搜索词组」不换，理由见下。

**结果：首页、浏览页换前换后逐像素一样，实算样式一样。** 42 张截图（1440、390 两个宽度 × 两页 × 7–8 个状态，外加整页图）
全部逐像素一样；搜索框里每个元素的整份 `getComputedStyle`（含 `::placeholder`，连同听写输入框）共 189,864 项逐项比，0 处不同；
读屏信息（Chrome 无障碍树快照）每个状态都一样。DOM 上只多了两个属性：框上 `data-tier`、输入框上 `enterkeyhint="search"`。

## 构件

| 档 | 用在 | 高 | 圆角 | 底 / 边 / 影 | 输入字 | 提交键 |
| --- | --- | --- | --- | --- | --- | --- |
| hero | 首页 | 54 | `--eqb-radius-search` 16 | 白底，1px 透明边，e1（墨圈当边） | 16（`--eqb-font-size-md`） | 32，右 10 |
| compact | 浏览页 | 36 | `--eqb-radius-card` 12 | 白底，1px 透明边，不投影 | 13（`--eqb-font-size-control`） | 28，右 4 |

两档共用：焦点时边深一档（`--eqb-color-border-strong`，不套外圈）；占位符次要灰；提交键是一个回车图标，有字时点睛色、
没字时次要灰、悬停垫桌色、键盘焦点墨环（2px 外扩 2px）、按下缩到 0.97（减少动效时 0.995）；有字时出清除键
（共用 Button 次要灰小号，只有图标），浮在提交键左边。数值都从 App.css 原样搬来。

宽度和摆法不归构件：首页占满命令行、浏览页固定 320、窄屏（≤ 640）独占一行，这几条留在 App.css 的
`.concierge-intent-bar`（SearchField 的 `hooks.form` 挂上的类名）。search.css 不设 `flex` / `width` / `max-width`，两边不打架。

### 选择器钩子

`hooks` 把 `concierge-intent-bar / -input / -clear / -submit` 原样挂在框、输入框、清除键、提交键上。好处是
smoke-*、ux-walkthrough、构件清点脚本里按这几个类名找元素的地方（二十来处）一处都不用改；坏处是构件多一个口子。
新地方用 SearchField 不用给 hooks。

### 颜色换成 tokens.css 的同值变量

`--desk-raised` → `--eqb-color-paper`、`--desk-ink` → `--eqb-color-text`、`--desk-muted` → `--eqb-color-text-muted`、
`var(--focus-ring)` → `2px solid var(--eqb-color-action)`，值都一样，实算样式没变。

### 保留的旧写法

- **首页输入框禁用时的字色 `#9A9A93`**：构件里禁用字色用 `--eqb-color-text-faint`；首页在 App.css 用一条 (0,3,0)
  的 `.concierge-desk .concierge-intent-input:disabled` 盖回 `#9A9A93`，只为实算样式不变。实际上看不到：
  题库没连上时输入框是空的，只显示占位符（次要灰）。已记缺口，见「要 Owner 定的」第 2 条。
- **浏览页有字时清除键压在字上**（上一轮记的小毛病）：compact 的输入框右内边距仍是 40，只给提交键让了位；
  清除键在右 48–76，字长了会钻到 ✕ 底下。原来浏览页那条 (0,3,0) 写在「有清除键时让到 84」那条后面，把它压掉了。
  这次要逐像素一样，照原样没修，见「要 Owner 定的」第 1 条。
- 不在间距阶梯上的内边距和位置（18 / 10 / 6，48 / 84 / 40）照搬成字面量，每条有注释；缺口记在
  `docs/design-gaps.md`「2026-11-15 搜索框构件的几处尺寸」。

## 无障碍

- **名字**：输入框「自然语言搜索」（只给读屏的 `<label for>`，没改字）；提交键「搜索」、清除键「清除搜索」
  （只有图标，`aria-label` + `title`，构件里 `submitLabel` 必填）。
- **`role="search"`，不用 `type="search"`**：
  - 外层 `<form role="search">`（原来就有）：读屏的地标列表里有「搜索」，一跳就到；回车走表单原生提交。
  - 输入框不改成 `type="search"`：Chrome 会在框里自己画一个 ✕（`::-webkit-search-cancel-button`），和我们的清除键
    摆在一起就是两个 ✕；按 Esc 时浏览器还会自己清空输入框，和页面自己的 Esc（只清搜索词、不清筛选）叠在一起。
    要压掉这两样就得加专门的 CSS 和事件处理，而换来的只是读屏把 textbox 念成 searchbox——「这是搜索」
    已经由 search 地标交代了。另外 `smoke-golden-path.mjs` 按 `getByRole('textbox', { name: '自然语言搜索' })` 找它，
    保持 textbox 这个也不用改。
  - 手机键盘上的回车键要写「搜索」，用 `enterKeyHint="search"`（新加的，构件默认），不靠 `type`。桌面上看不出来。
- 原来就有的照旧：题库在连时输入框 `disabled` + `aria-busy`，提交键 `disabled`；正在搜时提交键 `aria-busy`。
- 读屏快照（`after/ax.json`，每个状态一份）和改之前一模一样。

## 听写页「搜索词组」：不换

再看了一遍，仍判断它是列表筛选，不是搜索框，也先不换成 Field：

- 没有提交：打字后 250ms 自动筛下面的词组列表，没有「搜」这个动作。compact 档的骨架就是「输入 + 回车提交键」，
  套上去要么多一个没用的回车键，要么给构件开「不要提交键」的口子，那就不是同一个东西了。
- 它和右边两个日期框（从 / 到）、「清除筛选」键是一排筛选条件，样子是一套（都是那一页 `.dictation-library-tools input`
  的 8px 圆角、上下 8 左右 12 内边距、聚焦墨边加墨环）。单换它一个，这一排就两种输入框；换成 Field 也不是逐像素一样
  （Field 的高度三档 28 / 32 / 36，它现在 35、字 14，而且 Field 没有左边放放大镜图标的口子）。
- 合适的做法是和听写页其余输入（学生下拉、日期、数字框）一起换成 Field（再给 Field 加一个前置图标），单独一轮做。
- 它的读屏名字「搜索词组」已经有了（`aria-label`，外面还包着 label）。这一轮没碰，前后截图一样
  （`after/vocab-dictation-search*.png`）。

## 取证

脚本（端口 `INVENTORY_PORT_OFFSET=63`，默认测试数据；Playwright 从 `app/package.json` 载入）：

- `scripts/component-inventory/search-shots.mjs <标签>`：前几步和上一轮 `field-shots.mjs` 的操作一模一样，所以能和
  `../migrate-field/before/` 直接比；另外多拍上一轮没拍的状态：提交键悬停、Tab 到清除键、Tab 到提交键、
  浏览页出结果后、首页「正在连接本地题库」（拦住 `/api/question-groups`，输入框禁用）。每个状态把搜索框里每个元素的整份
  实算样式和读屏快照记下来。原始输出在 `.scratch/component-inventory/search/<标签>/`（不进仓库）。
- `scripts/component-inventory/search-compare.mjs`：两张 PNG 画到浏览器 canvas 上逐像素比 RGBA；实算样式逐项比；
  写 `diff.json`，拼 `compare-home.png`、`compare-browse.png`。

做法：先在没改的代码上拍 `before` 和 `after` 两遍，比一遍，确认拍照本身稳（42 / 42 一样，样式 0 处不同）；
再改代码、重拍 `after`、比。

| 比什么 | 结果 |
| --- | --- |
| after 对 `../migrate-field/before`（同名 24 张：搜索框裁图 16 张、整页 6 张、听写 2 张） | 22 张一样；2 张整页图不一样，见下 |
| after 对这一轮改之前重拍的 before（全部 42 张） | **42 张逐像素一样** |
| 改之前重拍的 before 对 `../migrate-field/before` | 和第一行同样那 2 张不一样，其余一样 |
| 整份实算样式（搜索框 30 个状态 + 听写输入框 2 个，共 189,864 项） | **0 处不同**（DOM 属性只多 `data-tier`、`enterkeyhint`） |
| 读屏快照（30 个状态） | **0 处不同** |

那 2 张整页图和搜索框无关，改之前的代码重拍也一样不同：`browse-page.png` 右下角草稿丸——上一轮拍时它还在淡入；
`home-page-390.png` 「继续」里的草稿卷名字带日期（上一轮「1114 英语草稿卷」，今天「1115 英语草稿卷」）。

每个页面、每个状态（1440 / 390 都是逐像素一样）：

| 页面 | 状态 | 之前取自 |
| --- | --- | --- |
| 首页 | 静止 `home-search` / 焦点 `-focus` / 有字 `-typed` / 出结果后 `-results` / 整页 `home-page`、`home-results-page` | migrate-field/before |
| 首页 | 提交键悬停 `-submit-hover` / Tab 到清除键 `-tab1` / Tab 到提交键 `-tab2` / 正在连接 `-loading` | before-extra/ |
| 浏览页 | 静止 `browse-search` / 焦点 / 有字 / 整页 `browse-page`（1440 那张见上） | migrate-field/before |
| 浏览页 | 提交键悬停 / Tab 到清除键 / Tab 到提交键 / 出结果后 `-results`、`browse-results-page` | before-extra/ |
| 听写页 | `vocab-dictation-search`、`vocab-dictation-page`（没改） | migrate-field/before |

文件：`after/`（这一轮之后的截图和读屏快照）、`before-extra/`（上一轮没拍的状态，在改之前的代码上拍的）、
`compare-home.png`、`compare-browse.png`（之前 / 之后拼版，每格标了逐像素结果）、`diff.json`（全部数字）。

## 改了的检查脚本（都没运行）

`scripts/verify-concierge-desk.mjs`：

- Test 12「Intent bar resting + focus」三条：原来在 App.css 里找 `.concierge-intent-bar { … }` 和 `:focus-within`，
  改成在 `shared-ui/search.css` 里找——静止：`.eqb-search` 有 `border: 1px solid transparent`，`.eqb-search[data-tier='hero']`
  有 `box-shadow: var(--elev-1)`；焦点：`.eqb-search:focus-within` 边是 `--eqb-color-border-strong`；不套外圈：App.css 和
  search.css 都没有 `:has(:focus-visible)`。另加一条：ConciergeDesk 用 `<SearchField` 并按 `isBrowseScreen` 选 compact / hero。
- Test 15「intent input disabled while dataLoading」：原来认 `<input … className="concierge-intent-input" … disabled={dataLoading}`，
  改成两头认：ConciergeDesk 的 `<SearchField` 上有 `input: 'concierge-intent-input'` 和 `disabled={dataLoading}`，
  SearchField.tsx 的 `<input` 上有 `disabled={disabled}`。

只单独拿这几个正则对着新源码试过能匹配，整个脚本没跑。其余 verify-* / smoke-* 按 `.concierge-intent-*` 类名、
「自然语言搜索」「清除搜索」名字、textbox 角色找的都还在，不用改。

## 要 Owner 定的

1. **浏览页清除键压字的小毛病，要不要修。** 修法是一行：compact 有清除键时输入框右内边距让到 84（和首页一样）。
   浏览页搜索框只有 320 宽，字超过约 220px 才会碰到，改了以后长字会早一点被截。**建议：修**，下一次碰搜索框时顺手改，
   改完拍「有长字」一张对照。
2. **首页禁用字色 `#9A9A93` 那条覆盖，要不要删。** 看不到（禁用时输入框是空的），删了实算样式变、像素不变。
   **建议：删**，统一用构件的 `--eqb-color-text-faint`。
3. **DESIGN.md §5 Inputs 两处和实际不符**（这一轮不改 DESIGN.md，只报告）：写的是「边 `--desk-border`」「提交是墨圆钮」
   「搜索框焦点用 2px `--desk-muted` 外环」，实际是透明边 + e1 墨圈、透明底点睛色回车键、焦点只把边深一档不套外环
   （verify-concierge-desk 还专门守着「不套外圈」）。**建议：DESIGN.md 照现在的样子改**，并把「还没收进构件」里的首页 /
   浏览页搜索框删掉、写上 `shared-ui/SearchField.tsx` 两档。
