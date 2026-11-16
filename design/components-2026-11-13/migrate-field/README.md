# 输入框 / 下拉 / 选项字段换成共用构件（构件厂，2026-11-14）

这一轮做了三样件，第一处用在草稿卷导出：

- `app/src/shared-ui/Field.tsx`（样子在 `field.css`）：字段框架（标签、控件、说明 / 出错一行）和三种原生控件
  `TextField`、`TextAreaField`、`SelectField`。
- `app/src/shared-ui/OptionField.tsx`：两种选项字段——`SegmentedField` 分段选择、`OptionSelectField` 带原因的下拉。
- `app/src/shared-ui/Menu.tsx` 加了两个口子（`renderTrigger`、`focusChecked`），给带原因的下拉用，别处行为不变。

搜索框（4 种收成 2 档）这一轮没做，留到下一轮，原因和方案见「搜索框」。

样张：`sheet-field-new.png`（1440）、`sheet-field-new-390.png`（390）、`sheet-field-menu-open*.png`（菜单打开）。
都是把构件本身渲染出来拍的（`scripts/component-inventory/field-sheet.mjs`，舞台见 `field-harness.mjs`），
悬停、键盘焦点用浏览器强制状态出来；分段选择的悬停滑块是 JS 画的，样张里没出来，真页面上的样子见 `after/draft-form-hover.png`。

前后对照：`before/`、`after/`（`field-shots.mjs before|after`，1440 和 390，带 `measure.json` 实算样式），
拼版对照 `compare-*.png`（`field-compare.mjs`）。

## 字段的样子（DESIGN.md §5 Inputs / Fields、Single-Radius-Family、§3、§4）

| 项 | 取值 |
| --- | --- |
| 高度三档 | sm 28 / md 32（默认）/ lg 36，和 Button 三档同高，并排时上下齐 |
| 圆角 | `--eqb-radius-control`（8，高 28–44 的控件）；分段选择是标签类，用 `--eqb-radius-pill` |
| 边 / 底 | 1px `--eqb-color-border`，白底 `--eqb-color-paper`，不投影（§4 输入框贴桌 e0） |
| 字 | sm、md 13（`--eqb-font-size-control`）；lg 14（`--eqb-font-size-sm`）；触屏一律 16（`--eqb-font-size-md`，防 iOS 放大） |
| 标签 | 12 / 500 次要灰（§3 UI Label） |
| 悬停 | 边深一档 `--eqb-color-border-strong` |
| 焦点 | §4 墨焦点环：2px `--eqb-color-action`，外扩 2px，不挪布局 |
| 出错 | 边换 `--eqb-color-danger`；下面一行 16px 警示图标 + 12 次要灰字（§5 Notices：字不上红，红只在边上）；控件 `aria-invalid` |
| 禁用 | 桌色底、次要灰字、不可点 |
| 说明 | 下面一行 12 次要灰字 |

无障碍：`<label for>` 连控件（`Field` 生成 id）；只给读屏的标签用 `hideLabel`；说明、出错用 `aria-describedby`
挂到控件上（调用处自己的 describedby 接在后面）；出错时 `aria-invalid`。出错行不用 `role=alert`，
要「一出错就播报」的地方由调用处另放提示行。

## 选项字段

### 分段选择用 radiogroup，不用一排按钮

原来 A4 / A3 是 `role=group` 里两个带 `aria-pressed` 的按钮。改成 `radiogroup` + `radio`：

- 意思对：一次只能选一个，选了 A3 就不是 A4，正是单选。一排 `aria-pressed` 读出来是「两个各自按下 / 没按下的开关」，
  读屏用户得自己推出它们互斥。
- 键盘对：照 WAI-ARIA APG 单选组，整组只占一个 Tab 位（停在选中项），← → ↑ ↓ 在可用项之间走、走到就选上、到头绕回。
  原来要 Tab 两次。
- 用不了的项照样列出、`aria-disabled`、不停（照原生单选的习惯），原因写在组下面一行「A3 对折用不了：…」，
  挂在整组和那一项的 `aria-describedby` 上，读屏一进组就念。
- 代价：选择跟着焦点走，方向键一按草稿卷就重新排一遍版。只有两项，来回一次就到，可以接受；
  以后要是四五项、每项都很贵，再换成「方向键只走、空格才选」。

样子：DESIGN.md Single-Radius-Family 说分段切换是标签类、用胶囊，所以圆角从 8 改成胶囊（这是这一轮唯一看得出的外形变化）；
没有底槽，没选的透明底次要灰字；选中的是一张纸（白底 + e1 + 墨字 500）；悬停由 FluidHoverList 滑块垫桌色。

### 带原因的下拉用共用 Menu，触发键换成字段样子

原生 `<option>` 只放得下一行名字，写不了「为什么用不了」，也不能让禁用项被方向键停住、读出原因。所以菜单仍是共用 Menu
（可勾选项 + 每项下面一行原因，fix-pdf-versions 那一轮定的、Owner 2026-11-14 收过），只把触发键从桌色底的 Button
换成字段的样子（白底、细边、8px、右边向下箭头），和 `SelectField` 长得一样——看上去就是「从几个里挑一个」，不是一个动作键。

- 触发键读屏名字 =「PDF 版本 大字无听力版」（`aria-labelledby` 标签 + 当前值两段），`aria-haspopup=menu`。
- 打开后焦点落在勾着的那一项（Menu 新加的 `focusChecked`），不是第一项。
- 当前选中的版本自己用不了时（比如草稿卷只剩听力题组），字段标出错：红边 + `aria-invalid` + 下面一行「用不了：原因」。
- 菜单行宽上限 320（原来草稿卷版本菜单的值），长原因折行；窄屏不超出屏幕。

`renderTrigger`、`focusChecked` 是 Menu 的新可选口子，不给时 Menu 跟原来一模一样（顶栏「⋯」、导出菜单等都没动）。

### 放在哪里：宽屏顶栏，窄屏顶栏下面一行

- 宽屏（> 980）：和原来一样在顶栏「导出」左边：「PDF 版本 [大字无听力版 ⌄]」｜「(A4 散页) A3 对折」。
  顶栏一行放得下，标签在左（inline）。说明 / 出错那一行在顶栏上只给读屏（`hideMessages`）：卷面上那条预览提示已经写着为什么用不了，
  顶栏再挂一行会把顶栏撑高。
- 窄屏（≤ 980）：原来这两样收进「⋯」面板，不点开看不见现在选的是哪个版本、哪种纸。现在放在顶栏下面、卷面上面单独一行
  `.draft-option-row`，右对齐，跟「导出」同一侧。390 宽时折成两行（版本一行、A4 / A3 一行，共约 75px 高），见 `after/draft-page-390.png`。
  标签照样看得见，出错行也看得见。
- 取舍：窄屏多占约 75px 竖向空间，卷面往下挪；换来的是不点开就知道导出的是什么、改版本少点一下、
  宽窄屏同一套控件同一个位置关系（都在导出旁边）。「⋯」面板里现在只剩学生和最近草稿卷。
- 和 Owner 决定 5（走查里「版本放进导出菜单」）不一样，见「要 Owner 定的」第 1 条。

## 换掉了哪些

| 地方 | 原来 | 现在 |
| --- | --- | --- |
| 草稿卷顶栏「PDF 版本」 | 桌色底 Button（小号）+ Menu | `OptionSelectField`（md 32，inline，标签看得见） |
| 草稿卷顶栏「A4 散页 / A3 对折」 | FluidHoverList 里两个 `aria-pressed` 按钮，8px | `SegmentedField`（radiogroup，胶囊，md 32） |
| 窄屏的同上两样 | 收在「⋯」面板里（`.draft-more-menu-narrow-controls`） | 顶栏下面一行 `.draft-option-row`，同一个构件 |
| 「⋯」面板「学生（可选）」 | 手写 label + input（36 高、16 字） | `TextField` lg |
| 「⋯」面板「最近草稿卷」 | 手写 label + 原生 select（系统箭头） | `SelectField` lg（图标库箭头） |
| 「保存 PDF 到个人空间」文件名 / 文件夹 / 新建文件夹 | 手写 label + input / select | `TextField` / `SelectField` lg；新建文件夹标签只给读屏 |

删掉的旧 CSS（都在 `DraftPaperWorkbench.css`，换成一行中文注释说明去了哪）：`.draft-student-field*`、`.draft-recent-select*`、
`.draft-product-control`、`.draft-product-trigger .eqb-button-label`、`.eqb-menu.draft-product-menu`、`.draft-version-toggle*`（四条）、
`.draft-form-toggle button`、`.draft-more-menu-panel select`、`.draft-more-menu-narrow-controls`、`.draft-save-space-dialog label / label span / input / select`。
「⋯」点外面收起的判断里原来为「面板里的版本菜单是 portal 出去的」开的例外也删了（版本不在面板里了）。

脚本：`scripts/verify-a3-imposition.mjs` 两处 `getByRole('button', { name: 'A3 对折' / 'A4 散页' })` 改成 `'radio'`（没跑）。
`verify-draft-switch-mutations.mjs` 用的 `.draft-recent-select` 类名留在新 select 上，不用改。

首页、浏览页、听写、管理页前后截图逐像素一样、实算样式一样（这一轮没碰）。

## 没换的，和为什么

| 地方 | 为什么没换 |
| --- | --- |
| 首页大搜索框、浏览页紧凑搜索框 | 下一轮，见「搜索框」 |
| 听写工作台「搜索词组」 | 不是搜索框：没有提交、打字即筛下面列表，算列表筛选的文字输入；和听写页其余输入一起换，那几页要词汇数据，这一轮的测试台不带 |
| 录题面板 `EntryModal`（22 个：textarea、select、number） | 量大，用的是全站旧的 `.field` 表单样式，单独一轮；要先定多行 / 数字框的样子 |
| 词汇复习、听写、意思回想、练字选择（select、textarea、number、range、checkbox、radio） | 同上，要词汇数据；range / checkbox / radio 不在这一轮「输入框 / 下拉」的范围 |
| 整卷浏览 PDF 版本下拉、讲评控件的 select / textarea（`PaperBrowsePage`、`PaperReviewControls`） | 浏览页另一套「PDF 版本」，应该也用带原因的下拉；要先确认那里的用不了原因从哪来，下一轮 |
| 管理页口令名称（`AgentTokens`） | 管理页，不在主线；下一轮顺手换 |
| 顶栏卷名就地编辑（`AppTopbar` `.topbar-page-title-input`） | 不是表单字段，是标题本身变成可改的，样子跟标题走 |
| 登录页 | 品牌时刻，DESIGN.md 记过的例外（15px 字、手机 16px），不并进构件 |

## 搜索框（留到下一轮）

清点里 4 种（inventory field-05 / 08 / 09 / 11）收成 DESIGN.md §5 已写的两档：

- hero（首页）：高 54、圆角 `--eqb-radius-search` 16、白底、e1、字 16。field-05（首页有字、右内边距 84）和 field-08（首页空着）
  是同一个框的两个状态（多了清除键），不是两种。
- compact（浏览页）：高 36、圆角 `--eqb-radius-card` 12、不投影、字 13。（field-09）
- field-11 听写「搜索词组」不是搜索框，见上表。

方案：`shared-ui/SearchField.tsx` + `search.css`，`tier="hero" | "compact"`，结构 `<form role=search>` + 只给读屏的标签 +
输入框 + 可选清除键（Button 次要灰小号）+ 可选回车提交键；`concierge-intent-*` 类名留着当钩子。首页数值从 App.css 原样搬，
一像素不动，前后截图要逐像素一样（`field-shots.mjs` 已经拍好了 before）。

为什么没在这一轮做：首页搜索框的样子分散在 App.css 十几条规则里（还有两条在别的媒体查询和减少动效块里、一条 `#9A9A93` 字面量），
`scripts/verify-concierge-desk.mjs` 按源码正则认 `<input … className="concierge-intent-input" … disabled={dataLoading}` 和
`.concierge-intent-bar` 那条 CSS 的写法，搬了就要一起改这个检查脚本；门面一像素都不能动，单独一轮做、单独对照更稳。
浏览页紧凑搜索框有个小毛病一起修：有字时清除键压在字上（右内边距 40 只让了回车键）。

## 键盘 / 读屏测试

`scripts/component-inventory/field-keys.mjs`（`INVENTORY_PORT_OFFSET=62`），结果 `keys.json`。读屏信息从 Chrome 无障碍树取。
39 / 39 过。

| 在哪 | 测什么 | 结果 |
| --- | --- | --- |
| 小舞台 | 分段：Tab 进组停在选中项 | 过 |
| 小舞台 | 分段：焦点环可见（2px 实线，外扩 2px） | 过 |
| 小舞台 | 分段：→ 跳过用不了的项，落到下一个可用项并选上 | 过 |
| 小舞台 | 分段：→ 到头绕回；← / ↑ 反向同样跳过 | 过 |
| 小舞台 | 分段：整组只占一个 Tab 位 | 过 |
| 小舞台 | 分段：点用不了的项不换 | 过 |
| 小舞台 | 分段：radiogroup 名字 =「打印形态」，描述带原因 | 过 |
| 小舞台 | 分段：用不了的 radio 读得到「不可用」和原因 | 过 |
| 小舞台 | 下拉：触发键焦点环可见；读屏名字 =「PDF 版本 大字无听力版」，有弹出菜单 | 过 |
| 小舞台 | 下拉：Enter 打开，焦点落在勾着的那一项 | 过 |
| 小舞台 | 下拉：方向键停在用不了的项上，读得到「不可用」和一行原因 | 过 |
| 小舞台 | 下拉：在用不了的项上按 Enter 不选、菜单不收 | 过 |
| 小舞台 | 下拉：方向键 + Enter 选上，菜单收起，焦点回触发键，值跟着变 | 过 |
| 小舞台 | 下拉：空格打开、Esc 收起，焦点回触发键 | 过 |
| 小舞台 | 文字输入：焦点环可见；名字 = 标签；描述 = 出错 + 说明；invalid；getByLabel 找得到 | 过 |
| 草稿卷 1440 | A4 / A3 在顶栏看得见；→ 选上 A3，← 回 A4 | 过 |
| 草稿卷 1440 | PDF 版本：Enter 打开落在勾着的项；菜单不出屏；用不了的版本读得到原因；键盘换版本，焦点回触发键、值跟着变 | 过 |
| 草稿卷 390 | 同上两行，控件在顶栏下面那一行 | 过 |

## 缺的变量（已记进 `docs/design-gaps.md`「2026-11-14 字段构件的几处尺寸」）

- 带原因下拉菜单的行宽上限 320：局部变量 `--eqb-option-menu-measure`（候选 `--eqb-measure-menu`）。
- 图标尺寸 16（下拉箭头、出错图标，下拉右内边距 12 + 16 + 4 要算它）：没有 token（候选 `--eqb-icon-size`）。
- 分段选择两项之间 2px：比 `--eqb-space-1` 小一档，原来就是 2（候选 `--eqb-space-hairline`）。
- 触屏输入字号下限 16：借 `--eqb-font-size-md`，和登录页那条是同一件事（候选 `--eqb-font-size-input-mobile`）。

## 要 Owner 定的

1. **PDF 版本放在导出旁边，不放进导出菜单**（和走查决定 5 不一样）。理由：版本也决定卷面预览排成什么样，
   放进导出菜单就要先点开导出才看得到、改了也要回头看卷面；菜单（role=menu）里也放不了字段。
   决定 5 想要的「窄屏能完整导出、宽窄屏一样、不藏在 ⋯ 里」都做到了。**建议：照现在这样。**
   不同意的话，把 `renderVersionField` 挪进导出菜单即可，构件不用改。
2. **A4 / A3 圆角从 8 改成胶囊**（DESIGN.md 写的分段切换用胶囊）。**建议：照 DESIGN.md。**
3. **窄屏那一行在 390 宽时折成两行**（约 75px）。另一种是窄屏把「PDF 版本」这几个字只给读屏，挤成一行（约 40px），
   但看不到标签时只剩「大字无听力版 ⌄」，新老师未必知道这是 PDF 版本。**建议：保留标签，两行。**
4. **搜索框下一轮按上面的方案做**，届时要一起改 `verify-concierge-desk.mjs` 的源码断言。**建议：同意。**
5. **缺的四个变量**：**建议**收编 `--eqb-icon-size`（16）和 `--eqb-font-size-input-mobile`（16，登录页一起换）；
   菜单行宽和 2px 缝先留局部变量 / 字面量，等第二处用到再说。
