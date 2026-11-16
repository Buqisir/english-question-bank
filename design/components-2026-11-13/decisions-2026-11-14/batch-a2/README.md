# Owner 2026-11-14 决定第二批（#5 / #13 / #14 / #17）

状态：四条决定本身是**已定**（Owner 2026-11-14，原文见上一级 `README.md`）。怎么落地的细节（隐藏的那句话怎么写、图标放字前还是字后、首页面板里的键悬停垫什么）是**提案 · 单一来源**，只经过脚本和四项检查。同事访谈按 11-08 的决定没做。已在本地提交，没有推送。

这一批只动调用处，没动 `Button` 构件。改前改后用同一份数据拍、同一个脚本量，对照图和像素差都在这个目录里。

- 拍图脚本：`scripts/component-inventory/decisions-a2-shots.mjs before|after` → `before/`、`after/`（`shots/*.png` + `measure.json`）。`before` 是在改代码以前用原来的源码拍的。
- 对照：`compare/compare-*.png`（左改前、中改后、右红色标出变了的像素），`pixel-diff.json`（每张图变了多少像素、在哪个框里；任一通道差 > 3 算变）。做对照图的 PIL 脚本放在临时目录，没进仓库，和 A1 一样。
- 读屏名字是 Chrome 自己算出来的读屏树（CDP `Accessibility.getPartialAXTree` 的 name / description），不是从属性猜的。

## 1. 四条各自怎么做的

### #5「换篇」的读屏名字

- **在哪**：`DraftPaperWorkbench.tsx` 草稿卷题组工具条里的「换篇」。它不是 `Button`，是手写的 `<button>`，本来就带 `aria-label`，所以不需要只给读屏看的 span，直接改 `aria-label` 的字。
- **改了什么**：收着时 `换一篇相似篇章` → `换篇：换一篇相似篇章`；展开时 `收起换篇` → `换篇：收起`。`title`（悬停提示）改前就和 `aria-label` 是同一句，改后也跟着同一句。看得见的字仍是「换篇」，`aria-pressed` 不动。
- 没换成 `Button`：不在这条决定里，改动面最小。

### #13「PDF Screen」「查看 PDF」两个外链

- **图标**：图标库里已经有 `ExternalLink`（`app/src/icons/generated/external-link.tsx`），之前全站没用过。这次直接用，没有补画新图标。16px，走 `currentColor`，加了 `aria-hidden="true"`。
- **放在哪**：用 `ButtonLink` 本来就有的 `icon` 位，所以在字**前面**。`Button` / `ButtonLink` 没动。放到字后面要给构件加一个「字后图标」的位，见第 5 节问题 3。
- **读屏名字**：改前两个链接的名字只有看得见的字，没有任何地方说会开新标签。现在在字后面加了一个只给读屏看的 `<span className="visually-hidden">（在新标签页打开）</span>`（`index.css` 里现成的类）。没用 `aria-label`：`Button` 构件对有字的键不收 `aria-label`，免得名字和字对不上，链接这边照同样的做法。
- 不恢复下划线。

### #14「清除搜索」以后焦点回输入框

- `ConciergeDesk.tsx`：输入框加 `ref`，「清除搜索」的 `onClick` 在 `actions.reset()` 后面接 `inputRef.current?.focus()`。没动 `useConciergeDesk`，Esc 清空本来焦点就在输入框里，不受影响。

### #17 相似篇章卡片上的键改成墨字键

**先数的**（按源码）：每张卡片都带一个雾薄荷主键的，一共两种卡片、三个地方：

| 卡片 | 键 | 出现在 | 那一页本来的主键 |
|---|---|---|---|
| `SimilarPassagesPanel`（`similar-passages/SimilarPassagesPanel.tsx`） | 「＋ 加入草稿卷」，一张卡片一个 | 首页题组卡「⋯ → 相似篇章」 | 首页没有别的主键 |
| 同上 | 同上 | 详情页「相似篇章」 | 上方「加入草稿卷」 |
| `DraftPaperSwapDrawer`（`draft-paper/DraftPaperRail.tsx`，草稿卷换篇栏，用同一套 `.similar-rcard` 卡片） | 「⇄ 替换这篇」，一张卡片一个（旁边「＋ 加入」本来就是 strong） | 草稿卷 | 「导出」 |

- **改了什么**：这两处 `tone="primary"` 换成 `tone="strong"`，大小 `sm` 不变。
- **整卷预览讲评栏的相似栏**（`SimilarQuestionsRailView.tsx`）不是一张卡片一个键：卡片是勾选框，底下只有一个「加入草稿卷」主键，不在这条决定里，没动。

**加了一条 CSS**（`paperBrowsePage.css`，`.similar-rcard-actions` 后面）：首页的面板挂在题组卡里，整个在 `FluidHoverList` 里面，但不在任何一行里。`button.css` 那条「`.fluid-hover-list .eqb-button…:hover` 透明」(0,5,0) 会让 strong 键悬停时什么都不变（改后第一次拍出来就是这样，悬停底 `rgba(0,0,0,0)`）。改前 primary 不归那条管，悬停会变深一档，所以这是这次改动带出来的退步。新条让卡片上的键悬停垫桌色，和详情页、换篇栏里同一个键一个样子：

- 选择器 `.fluid-hover-list .similar-passages-panel .similar-rcard-actions > .eqb-button[data-tone='strong']:hover:not(:disabled, [aria-disabled='true'])`，特指度 (0,7,0)。
- 盖过那条透明 (0,5,0)，也盖过 A1 的「嵌在被选中行里的键垫 border 色」(0,6,0)（面板眼下不在行里，碰不上）。文件里写了注释。
- 颜色用 `--eqb-color-desk`，没有新值，`docs/design-gaps.md` 不用补。
- 面板头上的「重试」不在 `.similar-rcard-actions` 里，不归这条管，悬停仍然没有底（A1 第 5 节问题 3，还在等 Owner）。

### DESIGN.md §5

Buttons 下面加了四条，都写明是 Owner 2026-11-14 定的：「读屏名字包含看得见的字」「每张卡片都有的键不用雾薄荷」「会开新标签的链接键」「清除输入的键」。`BRAND.md` 没动。

## 2. 看得见的差别（实际拍到、量到的）

1440×900 和 390×844 两个宽度，2 倍像素，减少动态效果。

| 地方 | 改前 | 改后 | 依据 |
|---|---|---|---|
| 「换篇」键（收着、展开） | — | 看起来**没变** | `swap-key*`、`swap-key-expanded*` 四张像素差都是 0 |
| 「换篇」悬停提示 | 「换一篇相似篇章」/「收起换篇」 | 「换篇：换一篇相似篇章」/「换篇：收起」 | 按源码；浏览器自己画的提示条没拍到 |
| 整卷预览顶栏「PDF Screen」 | 只有字，宽 88.6 | 字前面多一个 16px 外链图标，宽 110.6（+22 = 图标 16 + 间距 6）；颜色和字一样淡墨 rgb(63,82,91) | `pdf-screen*`、`topbar*` |
| 1440 宽时顶栏 | 「讲评」x=614.1、版本下拉 x=688.1 | 两个都往左挪 22（592.1 / 666.1），右边的键不动 | `topbar.png` 对照 |
| 390 宽时顶栏 | 「PDF Screen」在第二排，x=216 | 还在第二排、同一个位置，没挤到下一排（216 + 110.6 = 326.6 < 390） | `topbar-390.png` 对照，变化只在这个键上 |
| 审阅预览「查看 PDF」 | 只有字，宽 78.9 | 字前面多一个外链图标，宽 100.9；墨色 rgb(27,43,51) | `view-pdf*`、`review-preview*` |
| 审阅预览这一排 | 「复制试卷信息」x=240.9 | 跟着往右挪 22（262.9） | 同上 |
| 首页搜索框，点「清除搜索」以后 | 输入框没有焦点环 | 输入框亮起搜索框的焦点外环 | `clear-after-*` 六张，变化框是整个搜索框的外沿 |
| 相似篇章卡片「＋ 加入草稿卷」（首页、详情页） | 雾薄荷底 rgb(114,191,164)、字 rgb(25,29,24)、13/600、宽 97.3 | 透明底、墨字 rgb(27,43,51)、13/500、宽 97.5；高 28 不变 | `home-similar*`、`detail-similar*`、`detail-page*` |
| 同上，悬停 | 深一档薄荷 rgb(99,180,151) | 桌色 rgb(230,237,240) | `home-similar-key-hover*` |
| 同上，键盘焦点 | 薄荷底 + 2px 石板墨焦点环 @2px | 透明底 + 同一个焦点环 | `home-similar-key-focus*` |
| 草稿卷换篇栏「⇄ 替换这篇」 | 同首页的改前样子；禁用时桌色底、次要灰字、不透明 | 和旁边「＋ 加入」一模一样：透明底墨字 13/500；禁用时整个变淡到 0.55 | `swap-drawer*` |
| 同上，悬停 | rgb(99,180,151) | 桌色 rgb(230,237,240) | `swap-drawer-key-hover*` |
| 1440 宽时换篇栏 | 卡片出处一行折成「2026 · 2026年 / 新课标Ⅰ卷 · / E2E」 | 折成「2026 · 2026 / 年新课标Ⅰ卷 · / E2E」；整栏矮了 2px（截图 920 → 916 设备像素） | `compare-shots-swap-drawer.png`。键宽 77.8 → 78，左边那栏跟着窄了一点，**原因是推断** |

### 整页有几处雾薄荷主键（量的是看得见的 `.eqb-button[data-tone="primary"]`）

| 页面 | 改前 | 改后 |
|---|---|---|
| 首页，打开相似篇章面板（两张卡片） | 2 处：「＋ 加入草稿卷」×2 | 0 处 |
| 详情页，打开相似篇章面板 | 3 处：上方「加入草稿卷」+ 卡片「＋ 加入草稿卷」×2 | 1 处：上方「加入草稿卷」 |
| 草稿卷，打开换篇栏 | 3 处：「导出」+「⇄ 替换这篇」×2 | 1 处：「导出」 |
| 草稿卷，换篇栏收着 | 1 处：「导出」 | 1 处：「导出」 |

390 宽时详情页上方那个键是「已在草稿卷」，不是「加入草稿卷」：1440 那一轮已经把题组加进了草稿卷，两个宽度共用一个本地数据库。改前改后顺序一样，对照不受影响。

## 3. 读屏名字和焦点：改前改后

### 读屏名字（Chrome 读屏树）

| 键 | 改前 name / description | 改后 name / description |
|---|---|---|
| 「换篇」收着（`aria-pressed=false`） | `换一篇相似篇章` / `换一篇相似篇章` | `换篇：换一篇相似篇章` / `换篇：换一篇相似篇章` |
| 「换篇」展开（`aria-pressed=true`） | `收起换篇` / `收起换篇` | `换篇：收起` / `换篇：收起` |
| 「PDF Screen」（link） | `PDF Screen` / 无 | `PDF Screen （在新标签页打开）` / 无 |
| 「查看 PDF」（link） | `查看 PDF` / 无 | `查看 PDF （在新标签页打开）` / 无 |
| 「清除搜索」 | `清除搜索` / `清除搜索` | 没变 |

- 「换篇」的 description 是 `title` 来的，改前改后都和名字一样。读屏软件会不会把同一句念两遍，要看软件，这一点没听过，是推断。
- 两个链接名字里字和括号之间多了一个空格：隐藏的 span 是绝对定位的，Chrome 算名字时把它当成单独一块，自己加了空格。看得见的样子不受影响。
- 外链图标在读屏树里是隐藏的（`aria-hidden="true"`，量到了）。

### 点「清除搜索」以后焦点在哪

| 情形 | 改前 | 改后 |
|---|---|---|
| 只打了字没搜，鼠标点 ✕ | `body` | 输入框（`:focus-visible` 为真） |
| 搜过、出了结果，鼠标点 ✕ | `body`（结果清空，0 行） | 输入框（结果清空，0 行） |
| 键盘：输入框里 Tab 到 ✕，按回车 | `body` | 输入框 |
| 按完回车马上打「ab」 | 字没进输入框（值为空） | 输入框里是「ab」 |

两个宽度结果一样。Tab 从输入框走到的确实是「清除搜索」，改前改后一样。

## 4. 哪些是实际拍到、量到的，哪些只是推断

**实际拍到、量到的**：

- 「清除搜索」：打字后、点完后（没搜 / 搜过两种）、键盘焦点、回车后，焦点位置和接着打字。
- 首页相似篇章面板：静止、卡片键悬停、卡片键键盘焦点；整页主键个数。
- 详情页相似篇章面板：静止、整屏、整页主键个数（打开面板前、后）。
- 草稿卷「换篇」：收着、展开的样子和读屏树；换篇栏静止、卡片键悬停、键盘焦点；可用和禁用两种卡片；整页主键个数。
- 「PDF Screen」：静止、悬停、键盘焦点，读屏树，顶栏其余键的位置。
- 「查看 PDF」：静止、悬停、键盘焦点，读屏树，这一排其余键的位置。
- verify 脚本里的选择器，改前改后在真页面上各数了一次（第 6 节）。

**为了拍到而拦下的接口**（只在拍图脚本里，网站代码没为拍图改）：

- `POST /api/similar-passages`：本地网站算不出相似篇章（报 400，面板只出「重试」）。这里回两到三张卡，题组 id 从同一个网站的题组列表里取，所以不是「未入库存」的禁用卡；其中一组已在草稿卷里，换篇栏里它是禁用的。
- `GET /api/question-groups/group-2026-i-reading-a`：本地数据没有 `paperSurfaceHref`，详情页不出「相似篇章」入口，这里补上。
- 整卷预览和审阅预览：和 `paper-rest-shots.mjs` 同一套（卷子资产投影、consumption 补 `sourceAssetVersion`、PDF 版本清单回两款、审阅线程回 404、审阅预览换成同一份卷）。

**没拍到、只推断的**：

- 详情页卡片键的悬停和键盘焦点：详情页不在 `FluidHoverList` 里，按 `button.css` 应该垫桌色，和换篇栏量到的一样。
- 浏览器自己画的悬停提示条（「换篇」的 `title`）。
- 真读屏软件的念法（VoiceOver、NVDA 等）。
- 触屏：手机上点「清除搜索」以后输入框拿到焦点，推断会弹出键盘。
- 真的点「替换这篇」「加入」「加入草稿卷」以后的流程，和真的打开 PDF 新标签。
- 首页面板头上的「重试」（这次拦了接口，面板不出错）。
- 首页浏览态（「浏览全部 N 套卷」以后）里点「清除搜索」：是同一个输入框和同一个键，推断一样。

### 页面报错

两个宽度、改前改后完全一样，各 22 条控制台报错，只有两种，没有页面脚本错误：

- 401：推断是登录以前的请求。
- 404：脚本自己让审阅线程接口回 404（照 `paper-rest-shots.mjs`）。

## 5. 要 Owner 看的问题

1. **换篇栏里两个键一样重**：「⇄ 替换这篇」和「＋ 加入」现在都是墨字 strong，上下叠着，看不出哪个是主要动作（`compare-shots-swap-drawer.png`）。要不要让「＋ 加入」降成淡墨 quiet，或者就这样？
2. **首页面板卡片键悬停垫桌色**：为了不让悬停完全没反应，加了第 1 节那条 CSS（提案 · 单一来源）。同一个面板里的「重试」仍然没有悬停底（A1 问题 3）。要不要把这条放宽到整个面板，一起解决「重试」？
3. **外链图标放在字前面**：用的是构件现有的图标位，没动构件。网上常见的写法是放在字后面，像「PDF Screen ↗」。放后面要给 `Button` / `ButtonLink` 加一个「字后图标」的位。
4. **隐藏的那句话**：现在写「（在新标签页打开）」。另外站上还有 5 个手写的、会开新标签的普通链接，这次没动：`PaperReviewControls.tsx`「打开对应 Amp 线程」、`DictionaryCard.tsx`「原文件」「许可」、`VocabularyDictationWorkbench.tsx`「打开听写」两处。要不要以后照同一条规矩补？
5. **「换篇」既换名字又换按下状态**：展开时读屏会念「换篇：收起」再加「已按下」，两种信号说的是同一件事。决定里定了要换名字，这次照做；要不要以后改成名字固定「换篇：换一篇相似篇章」、只靠按下状态表示展开？
6. **「换篇」还是手写键**：静态清点里还算一个手写按钮。换成 `Button` 不在这条决定里。
7. **点完「清除搜索」搜索框会亮焦点环**：鼠标点也会亮，因为 Chrome 对文字输入框总是显示焦点环。手机上推断会弹键盘。
8. **换篇栏 1440 宽时出处一行折行位置变了**，整栏矮了 2px（第 2 节最后一行）。

## 6. 受影响的脚本

**改了的（只换了一处选择器）**：两条都是 `getByRole('button', { name: '换一篇相似篇章', exact: true })`，名字精确匹配，改后找不到了。改前在真页面上数过，这条选择器找到 3 个（草稿卷每个阅读题组一个），说明它本来是能用的；换成新名字以后改后同样找到 3 个。两个脚本都只改了这一处，`node --check` 通过，整体没有跑。

- `scripts/verify-a3-imposition.mjs:644` → `name: '换篇：换一篇相似篇章', exact: true`
- `scripts/verify-draft-switch-mutations.mjs:112` → 同上

**没改、不受影响的**（单条拿出来试过）：

- `verify-concierge-desk.mjs:818` 输入框那条正则（`<input … className="concierge-intent-input" … disabled={dataLoading}`）：输入框前面加了 `ref`，对新源码试过，对得上。
- `verify-similar-workbench-swap.mjs:67`、`:119`：对新的 `DraftPaperWorkbench.tsx` 试过，对得上。
- `verify-classic-retire-2.mjs:175`（详情页上方「加入草稿卷」还是 `tone="primary"`）：对得上，详情页这个键没动。
- `verify-draft-switch-mutations.mjs:113` 的「⇄ 替换这篇」：字没变，改后在真页面上数到 2 个。
- `paper-rest-shots.mjs` 用 `getByRole('link', { name: 'PDF Screen' })`、`{ name: '查看 PDF' }`：不是精确匹配，名字多了后半句也找得到（这次的拍图脚本就是用这两条找到的）。
- `smoke-golden-path.mjs` 用 `getByRole('button', { name: '清除搜索' })`：名字没变。
- `docs/cuts/similar-workbench-swap/qa/dp2-similar-workbench-swap.mjs` 用 `{ name: '换一篇相似篇章' }`，不是精确匹配，新名字里包含这几个字，推断仍找得到（没跑）。

**没改、会对不上的**（以前几页的存档拍图脚本）：

- `scripts/component-inventory/paper-shots.mjs:181-182` 用 `[aria-label="换一篇相似篇章"]` 找「换篇」，改后找不到了（改后数到 0）。重跑那一页的话要换成新名字。

## 7. 检查

| 检查 | 结果 |
|---|---|
| `node scripts/component-inventory/static.mjs --check` | 基线没有变多，改前改后数字一样：手写按钮 242 → 242；手写圆角 375 → 375；手写颜色 282 → 282；手写字号 657 → 657；手写影子 25 → 25；不同颜色 57、不同圆角 15、不同字号 26 都没变 |
| `cd app && npx tsc -b --noEmit` | 通过，没有输出 |
| eslint，改前改后逐条对照（6 个 tsx：用 `git show HEAD:` 临时拷成 `__old.tsx` 放在原文件旁边比，比完删了） | 每个文件规则、级别、行号都一样，没有新增。原来就有的：`DraftPaperWorkbench.tsx` 2 错 1 警告（331、529、549，react-hooks）；`PaperBrowsePage.tsx` 4 错 2 警告（407、978、1447、1593、1641、2260）；`SimilarPassagesPanel.tsx` 1 错（45，react-refresh）；`ConciergeDesk.tsx`、`DraftPaperRail.tsx`、`PaperReviewControls.tsx` 都是 0 |
| `git diff --check` | 通过 |

没有跑任何 `verify-*.mjs`（Owner 说 Ship 以前不跑）。

## 8. 改动和新增的文件

改动：

- `app/src/features/draft-paper/DraftPaperWorkbench.tsx`（#5）
- `app/src/features/paper-browse/PaperBrowsePage.tsx`、`PaperReviewControls.tsx`（#13）
- `app/src/concierge/ConciergeDesk.tsx`（#14）
- `app/src/features/similar-passages/SimilarPassagesPanel.tsx`、`app/src/features/draft-paper/DraftPaperRail.tsx`、`app/src/features/paper-browse/paperBrowsePage.css`（#17）
- `DESIGN.md`（§5 Buttons 四条）
- `scripts/verify-a3-imposition.mjs`、`scripts/verify-draft-switch-mutations.mjs`（各一处选择器）

新增：

- `scripts/component-inventory/decisions-a2-shots.mjs`
- 本目录：`README.md`、`before/`、`after/`、`compare/`、`pixel-diff.json`

没动：`Button.tsx`、`button.css`、`tokens.css`、`BRAND.md`、PaperSurface、打印和 PDF 的样式。
