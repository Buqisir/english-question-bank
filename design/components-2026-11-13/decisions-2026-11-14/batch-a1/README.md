# Owner 2026-11-14 决定第一批（构件那三条：#4 / #9 / #15）

状态：三条决定本身是**已定**（Owner 2026-11-14）；怎么落地的细节（垫什么色、「看整卷」用哪一档）是**提案 · 单一来源**，只经过脚本和两道检查，同事访谈按 11-08 的决定没做。已在本地提交，没有推送。

这一批只动共用构件和它们的调用处。改前改后用同一份数据拍、同一个脚本量，对照图和像素差都在这个目录里。

- 拍图脚本：`scripts/component-inventory/decisions-a1-shots.mjs before|after` → `before/`、`after/`（`shots/*.png` + `measure.json`）
- 样张：`node scripts/component-inventory/preview.mjs` 重跑，改前改后各拷一份到 `before/sheet/`、`after/sheet/`；`design/components-2026-11-13/batch-1/` 里是改后的
- 对照：`compare/compare-*.png`（左改前、中改后、右红色标出变了的像素），`pixel-diff.json`（每张图变了多少像素、在哪个框里；按通道差 > 3 算变）

## 1. 三条各自怎么做的

### #4 滑块列表里的键

- **做法**：只加 CSS，不动 `FluidHoverList` / `useFluidHover`（提案 · 单一来源：这是改动面最小的一种）。
  滑块量到哪一项，就在那一项上挂 `data-fluid-hover-active`。所以「在被选中那一行里面、自己又不是列表项的键」用选择器就认得出：
  `.fluid-hover-list [data-fluid-hover-active] .eqb-button…:is(:hover, [aria-expanded='true']):not(…, [data-fluid-hover-active])`。
  原来那条「列表里的键悬停透明」不动，顶栏这种键本身就是列表项的照旧不垫底。
- **垫什么颜色**：`--eqb-color-border`（#DCE6EB）（提案 · 单一来源）。滑块本身是桌色 #E6EDF0，键再垫桌色看不出来，所以深一档。字是墨色，对 border 色 11.50。
- **危险键嵌在行里**：垫桌色，不垫 border 色，因为危险字 #CA2121 在 border 色上只有 4.42，不过 AA。眼下站上没有这样的键，只在样张里摆了一个。
- **打开着的触发键**：在被选中的行里也垫 border 色。鼠标不在这一行上时，仍是原来的桌色。
- 覆盖关系在 `button.css` 里写了注释：新条 (0,6,0) 盖过透明那条 (0,5,0)，也盖过打开着的触发键 (0,3,0)。
- 「看整卷」（`ConciergePaperRow.tsx`）换成 `<Button tone="strong" size="sm">`，去掉 `concierge-action` 类。`.concierge-action` 的 CSS 没删，因为题组卡片还在用。
- 个人空间 `MySpacePage.css` 那段「行上按钮自己不垫底」的注释改成新说法。

### #9 危险红字深一档

- `tokens.css` 新增 `--eqb-color-danger-text: #ca2121`（文件里邻居都是小写，跟着小写）。
- `button.css` 危险键、`menu.css` 危险菜单项写字改用它；图标本来就走 currentColor，跟字一起变。`--eqb-color-danger` 不动。
- 样张实测对比度（`after/sheet/checks.json` 的 `dangerText`）：

  | 底 | 新 #CA2121 | 旧 #DC2626 |
  |---|---|---|
  | 白 #FFFFFF | 5.60 | 4.83 |
  | 页底 #F1F5F7 | 5.10 | 4.40 |
  | 桌色悬停底 #E6EDF0 | 4.73 | 4.08 |
  | border 色 #DCE6EB | 4.42（不过，所以嵌在行里的危险键不垫这个色） | 3.81 |

- 样张 axe 的 color-contrast 从 11 处降到 0；对比度不过的从 11 处降到 0。
- `docs/design-gaps.md` 那条「危险色写小字」按文件开头的规矩标了「已收编」，落地提交按提交说明指认（「构件厂：拍板落地 A1」那次），没写 commit 号。
- `DESIGN.md` §2 Semantic 的 Danger 补了一句文字档。

### #15 菜单里的可勾选项

- `Menu` 的项加了 `checked?: boolean`。给了它，读屏角色就从 `menuitem` 换成 `menuitemcheckbox`，并带上 `aria-checked`；勾上时最右边画图标库里的 `Check`（16px，跟字同色）。
- 字不变。键盘和别的项一样，选中照旧关菜单、焦点回触发键。可勾选项总是按钮，不当链接。
- `Menu.tsx` 里 `role: 'menuitem'` 这几个字还在（有几个 verify 脚本按这几个字找），可勾选项在后面盖掉它。
- 组卷台题组「⋯」：`label: '前置分页', checked: Boolean(item.pageBreakBefore)`，点了照旧切换。
- 代码注释、`DraftPaperWorkbench.css` 注释、`DESIGN.md` 原来写「取消分页」的那句都改了。

### DESIGN.md §5

- Buttons 下加了两条：「滑块列表里的键」「危险键和危险菜单项」。
- 新开了一小节 Menus，写「开关项」。
- 三条都写明是 Owner 2026-11-14 定的。

## 2. 要 Owner 单独看的：看得见的文案变化

| 地方 | 改前 | 改后 |
|---|---|---|
| 组卷台题组「⋯」菜单，已分页的那组 | 字是「取消分页」 | 字是「前置分页」，最右边一个勾 |

读屏念的也变了：从「取消分页，菜单项」变成「前置分页，菜单复选项，已勾选」。具体念法看读屏软件，这一点是推断，没用真读屏软件听。

## 3. 回归清单：所有放在会滑的列表里的 `.eqb-button`

逐个搜了全站的 `FluidHoverList`。没列出来的那些列表里都没有 `.eqb-button`。

| 位置 | 是列表项还是嵌在行里 | 结果 | 依据 |
|---|---|---|---|
| 顶栏 `.topbar-actions`（导航键、退出、页面塞进来的键） | 列表项 | **没变** | 首页顶栏：静止、悬停前三个键、键盘焦点；1440 和 390 两个宽度都量了，也比了像素，变化都是 0。草稿卷页的顶栏没单独拍，规则一样，是推断 |
| 首页结果行「看整卷」 | 嵌在行头里 | **变了** | 字从 12px/400 变成 13px/500；高从 25 变成 28；内边距从 4px 10px 变成 0 8px；宽从 56 变成 55。悬停底从桌色（在滑块上看不出来）变成 border 色。390 宽时行头高了 3px（91.67 → 94.67），1440 宽时行头高度不变。焦点环一样 |
| 首页题组行「⋯」（`Menu` 触发键） | 嵌在行里 | **变了** | 悬停时从透明变成 border 色；鼠标还在这一行上、菜单开着时，从桌色变成 border 色。鼠标离开这一行、菜单开着时没变（桌色）。键盘焦点没变 |
| 首页相似篇章面板的「重试」 | 在列表里，但不在任何一行里 | **没变** | 量了静止样子。悬停只量了旁边的「收起」，它不是 `.eqb-button`。「重试」悬停没量，按规则推断不变 |
| 个人空间文件行「下载」「打开原草稿」「⋯」 | 嵌在行里 | **变了** | 鼠标停在键上时，从透明变成 border 色。鼠标在行上、不在键上时没变；键盘焦点没变 |
| 样张里「像顶栏」那一排 | 列表项 | **没变** | 样张检查「列表高亮可见、按钮不垫底、字墨色」仍然通过 |

菜单面板本身也是会滑的列表，但菜单项是 `.eqb-menu-item`，不是 `.eqb-button`，不受这条规则影响。

## 4. 危险红字落到的地方

- **拍到、量到的**：个人空间「⋯」菜单「删除文件」（静止、悬停、键盘焦点）；删除确认框「删除 PDF」（静止、悬停、焦点）；组卷台题组菜单「移除」（静止、悬停、焦点）。字和图标都从 rgb(220,38,38) 变成 rgb(202,33,33)，底色没变。
- **没拍、推断会变的**：题组详情页「⋯」里的「删除」（`QuestionGroupDetailView.tsx`，同一个 `Menu` 危险项）。

### 站上手写的、还在用 `--eqb-color-danger` 写小字的键和链接（照决定只列不改）

- `App.css:785` `.detail-button.danger:hover`。这个类组合在 tsx 里没搜到在用，可能是死规则。
- `DraftPaperWorkbench.css:878` `.draft-paper-rail-acts button.danger:hover`：组卷台左栏缺题行的「移除」类小键。
- `DraftPaperWorkbench.css:224` `.eqb-button[data-tone].draft-more-menu-trigger.has-save-error:is(:hover, :focus-visible, [aria-expanded='true'])`：保存出错时的「⋯」，字和描边都是亮红。
- `vocabularyDictationWorkbench.css:1546` `.meaning-recall-stage button.is-wrong`：过生词「答错」键和结果表的「错」，描边加字。

顺带列出不是键、但也用亮红写小字的提示文字，供以后一起看：
- `.dictation-notice.is-error`、`.meaning-recall-error`、`.meaning-recall-result-summary strong:nth-child(2)`
- `.draft-error`、`.my-space-error`、`.paper-browse-export-error`、`.listening-player-error`、`.admin-backfill-error`
- `vocabularyReviewPage.css` 的 `.vocabulary-student-create p`、`.vocabulary-progress-selection small`、`.vocabulary-request-error`
- 通过别名 `--coral-text` 用到的：`App.css` 的 `.detail-message.error`、`.teacher-difficulty-status.error`、`.difficulty.high`，以及 paper-intelligence、听写、听词几处

## 5. 要 Owner 看的问题

1. **嵌在行里的键用哪个颜色垫底**：现在用 border 色 #DCE6EB（提案 · 单一来源），对照见 `compare/compare-shots-space-key-hover-0.png`、`compare-shots-paper-key-hover.png`、`after/sheet/sheet-nest-paper-hover.png`。比滑块深多少，是目测选的。
2. **首页题组行里两个键不一致**：手写的「+」（加入草稿卷）悬停仍然垫桌色，在滑块上看不出来；旁边的「⋯」现在垫 border 色。这次照规则只认 `.eqb-button`，「+」没动。要不要等它换成构件时一起改？
3. **相似篇章面板里的键悬停时完全没有底**：面板在列表里，但不在任何一行里，滑块也不会停到它下面。原来那条「列表里的键悬停透明」又让它自己不垫底，所以鼠标停上去什么都不变。改前就是这样，这次没碰。
4. **「看整卷」选了 strong / sm**：字色和原来一样是墨色，高 28。390 宽时行头高了 3px。
5. **切换分页后焦点掉到页面上**：改前改后都一样，选完以后焦点落在 body，不在「⋯」上。量到的原因是：切换以后组卷台重排分页预览，所有题组的「⋯」整个卸掉了（`triggers: 0`），等几秒才回来。这不是菜单本身的行为，但键盘用户会丢位置。
6. **清点对照表跟着变了**：`mapping.json` 里有两种手写的红字按钮，以前「最接近」的构件选项是危险键；现在字色差超过容差，最接近的变成了淡墨键（多了一条「字色 #DC2626 → #3F525B」）。不变的总数没变，还是 132/314。

## 6. 哪些是实际拍到、量到的，哪些只是推断

**实际拍到、量到的**（1440×900 和 390×844 两个宽度，2 倍像素，减少动态效果）：
- 顶栏
- 首页结果行和「看整卷」
- 首页题组行的「⋯」和「+」
- 相似篇章面板（静止，以及「收起」的悬停）
- 个人空间文件行三个键、「⋯」菜单、删除确认框
- 组卷台题组菜单：危险项；分页项的角色和 aria-checked；切换前后；读屏树（`measure.json` 的 `draftMenuAria`）

样张另外量了：
- 嵌在行里的键：行悬停、键悬停、危险键悬停、别的行
- 危险字在四种底上的对比度
- 可勾选项：角色、↓ 走得到、回车选中后关菜单和焦点回去、再打开看到勾、字不变

**为了拍到而拦下的接口**（只在拍图脚本里，网站代码没动）：
- `GET /api/question-groups`：本地网站的题组都没有 `canonicalPaperId`，结果行只写「整卷未上线」，不出「看整卷」。这里给每个题组按「年 + 卷名 + 地区」补了一个假的 id，同一卷的题组拿到同一个。脚本不点「看整卷」。
- `GET /api/my-space`：两份假文件，和 `space-shots.mjs` 是同一份。

**没拍到、只推断的**：
- 详情页「删除」菜单项
- 草稿卷页和其他页的顶栏
- 「重试」的悬停
- 触屏
- 真读屏软件的念法
- 真的点「看整卷」以后的跳转

## 7. 页面报错

两个宽度、改前改后完全一样，各 3 条控制台报错，没有页面脚本错误：
- 两条 401：推断是登录以前的请求。
- 一条 400：推断是相似篇章请求，本地网站算不出相似篇章，面板显示「重试」。

两条都是推断，没逐条对上请求地址。样张页没有报错（检查「页面没有报错」通过）。

## 8. 检查

| 检查 | 结果 |
|---|---|
| `node scripts/component-inventory/static.mjs --check` | 基线没有变多。手写按钮 243 → **242**（「看整卷」）；圆角 375 → 375；颜色 282 → 282；字号 657 → 657 |
| `cd app && npx tsc -b --noEmit` | 通过，没有输出 |
| eslint，改前改后对照（`ConciergePaperRow.tsx`、`DraftPaperWorkbench.tsx`、`Menu.tsx`） | 改前改后一样。`DraftPaperWorkbench.tsx` 原来就有 2 个错误、1 个警告（行 331、529、549，react-hooks），这次没有新增；另外两个文件都是 0 |
| `git diff --check` | 通过 |
| 样张 `preview.mjs` | 34 项行为检查全过（原来 25 项，加了 9 项）；对比度不过 0（原来 11）；axe 只剩 region×1（原来是 color-contrast×11 加 region×1） |

### 没跑的 verify 脚本（Ship 以前 Owner 不让跑）

- `verify-my-space-shelf.mjs`、`verify-concierge-desk.mjs:499`、`verify-draft-workbench-visual-unify.mjs` 里针对 `Menu.tsx` 的那几条：取出原文和正则，对着新的 `Menu.tsx` 单独试了一遍，14 条全对得上。
- 搜过 `scripts/verify-*.mjs`：没有哪条用到「取消分页」、`menuitemcheckbox`，也没有哪条对这个菜单查 `aria-pressed`。
- `verify-c8-draft-paper-render-model.mjs:329-330` 查的是「建议前置分页」小签，这次没动，正则单独试过对得上。
- 这些脚本整体都没有跑。

### 过时的 smoke 和拍图脚本（这次没改，记下）

- `scripts/smoke-c8-draft-paper-composer.mjs:242,253` 用 `getByRole('button', { name: /前置分页/ })` 找分页键。现在它是 `menuitemcheckbox`，而且在菜单里，找不到了。不过这个脚本原来就已经过时：233 行等 `.draft-outline-item`，这个类早就没了。
- `scripts/smoke-concierge-stream.mjs:220,229` 用 `.concierge-paper-actions button.concierge-action` 当「展开」键。这个选择器原来对着的就是「看整卷」，不是展开，在本地也找不到。现在「看整卷」没有这个类了，更找不到。
- `menu-shots.mjs`、`draft-shots.mjs` 按 `[role=menuitem]` 找菜单项，是以前几页的存档脚本。重跑的话，分页项不会被算进去。

## 9. 改动和新增的文件

改动：
- `app/src/shared-ui/tokens.css`、`button.css`、`menu.css`、`Menu.tsx`
- `app/src/concierge/ConciergePaperRow.tsx`
- `app/src/features/draft-paper/DraftPaperWorkbench.tsx`、`DraftPaperWorkbench.css`（只改注释）
- `app/src/features/my-space/MySpacePage.css`（只改注释）
- `DESIGN.md`（§2 Semantic 一句、§5 三条、Proposal → Decision 里那句「取消分页」）
- `docs/design-gaps.md`
- `scripts/component-inventory/preview-sheet.js`、`preview.mjs`（样张加了三块和对应检查）
- `design/components-2026-11-13/batch-1/checks.json`、`mapping.json`、`sheet-button.png`、`sheet-menu.png`、`sheet-menu-narrow.png`（重跑的结果）

新增：
- `scripts/component-inventory/decisions-a1-shots.mjs`
- `design/components-2026-11-13/batch-1/sheet-nest*.png`（5 张）、`sheet-menu-check.png`
- 本目录：`README.md`、`before/`、`after/`、`compare/`、`pixel-diff.json`

做对照图的 PIL 脚本放在临时目录，没有进仓库。

## 检查时补的一条

- 1440 宽时，结果行中间「命中 N 个篇章 / 推荐理由」那两行字在逐像素对比里也标红了（`compare/compare-shots-paper-row.png`）。「看整卷」宽了从 56 变成 55，推断是这一栏跟着横移了不到 1px；没有单独量这两行字的位置。
