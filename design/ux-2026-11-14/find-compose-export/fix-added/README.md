# 加入草稿卷之后的反馈：全站一个写法，可撤回

走查第四节第 6 条（Owner 2026-11-14 拍板）。只做这一条。

## 1. 现状盘点（改之前，照代码和走查）

| # | 位置 | 加入前 | 加入中 | 加入后 | 能撤回吗 | 这次 |
|---|---|---|---|---|---|---|
| 1 | 首页结果行「+」（ConciergeGroupCard） | 手写的加号圆钮 | 无（先翻状态，乐观） | 墨色圆钮加勾；读屏名「从草稿卷移出」，实际再点是打开草稿卷工作台 | 不能 | 改 |
| 2 | 题组详情页主键（QuestionGroupDetailView `.peek-add`） | primary「加入草稿卷」 | 无（乐观） | 薄荷绿「已在草稿卷」；再点打开工作台 | 不能 | 改 |
| 3 | 相似篇章面板（首页行「⋯」和详情页都会打开） | 「＋ 加入草稿卷」 | 无 | 键不变；另弹 toast「已把「…」加入草稿卷」，**不管成没成功都弹** | 不能 | 改 |
| 4 | 整卷预览页边「剪入」（PaperBrowsePage gutter，剪刀图标） | 「剪入」 | 无（乐观） | 「已剪入」；再点打开工作台 | 不能 | 改 |
| 5 | 整卷预览讲评·相似题栏，多选后「加入草稿卷」（SimilarQuestionsRailView → addGroupsToBasket） | 批量键 | 无 | toast「已把 N 篇加入草稿卷，题目一并带上」 | 不能 | 未改，待办 |
| 6 | 草稿卷换篇栏「＋ 加入」（DraftPaperRail → DraftPaperWorkbench） | 「＋ 加入」 | 无 | toast「已加入草稿卷」，人就在草稿卷里 | 草稿卷里能删 | 未改，待办 |
| — | 整卷预览左栏剪刀小标（aria-label「已在草稿卷」） | — | — | 只是状态记号，不是加入键 | — | 未改 |

个人空间没有加入点。加入点共 6 处，没超过 6；不用改服务器（已有 `POST /api/draft-papers/current/items` 和 `DELETE /api/draft-papers/:id/items/:itemId`）。按任务的线，做 1–4 四处；5、6 形状不同（批量 / 已在草稿卷里），列待办。

失败时：1、4 用 `window.alert` 弹服务器原话；3 失败也照样弹「已加入」的 toast（这是假话）。

## 2. 定下的写法和依据

一个共用组件 `DraftAddButton`（加入键），建在 shared-ui `Button` 上，加入、撤回两件事从 `DraftAddContext` 拿（App 提供）。

| 阶段 | 样子 | 依据 |
|---|---|---|
| 加入前 | Button「＋ 加入草稿卷」。首页行用紧凑档，只有加号，读屏名「加入草稿卷」 | 沿用原来各处的位置和语气；详情页是那页唯一主键用 primary，别处 strong / subtle |
| 加入中 | 同一个键上写「加入中…」，busy（aria-busy，点了不再触发） | DESIGN §9「进行中写『…中…』」 |
| 加入后 | 键换成一块纸：白底、e1 影子、墨字「已加入」，右边一个淡墨文字键「撤回」。高度同那一档 Button，位置不动 | BRAND §5.5「提议是轻的，决定是实的」：底、边、字一起变，位置不动，可撤回，不用薄荷绿、不加侧边线；DESIGN §5 Proposal→Decision：左标签右「撤回」，不打勾动画 |
| 撤回 | 点「撤回」→「撤回中…」→ 删掉刚加的那一条，回到加入前 | Deletion-Cost：可恢复的移除＝立即做＋可撤回；这里反过来，加入也给一步撤回 |
| 出错 | 键后面一行次要灰字加 16px 图标：「没加入：」「没撤回：」后接服务器原话（error.message），role=alert | DESIGN Notices（一行灰字＋16px 图标）；§9 错误说清发生了什么；No-Literal-Fallback：不另写兜底话，不吞错 |
| 键盘 | 回车加入后焦点落到「撤回」；撤回后焦点回到加入键；读屏另播「已加入草稿卷」「已从草稿卷移出」 | 原地一步撤回，键盘也一步 |

以下几处 §5.5 没说，按最省、最平常的做，**agent 的做法，待 Owner 看**：

1. 用「撤回」不用「撤销」（照 §5.5 和 DESIGN §5 原词）。
2. 「已加入」只是状态，不能点。原来 1、2、4 加入后再点会打开草稿卷工作台，现在不会。
3. 首页行加入前保留只有加号的紧凑档。
4. 整卷预览的「剪入 / 已剪入」和剪刀换成「加入草稿卷 / 已加入」，全站一个说法。这推翻了早先 D7 的「剪入」用词，**要 Owner 定**。
5. 不再乐观翻状态：等服务器回话才变「已加入」（约 0.6–0.9 秒，见下），所以顶上草稿卷计数也晚一点变。好处是失败时不会先说成功再翻回去。
6. 「撤回」只给这一页刚加的那一条；进页面时就在草稿卷里的组只显示「已加入」，没有撤回（要撤去草稿卷里删）。离开页面撤回就没了（DESIGN §5「撤回在离开页面时失效」）。
7. 撤回失败用次要灰字，不用 danger 红（Notices 写法）。
8. 出错那行最宽 24em，太长截断，整句在 title 和读屏里（目测宽度）。
9. 整卷预览的加入键仍只在悬停 / 聚焦那一段时出现（原样）。
10. 这几处的 `window.alert` 去掉了，错误都落在键旁那一行。
11. 出错那行出现时，加入键所在一组会被往左挤（首页行右对齐）——§5.5「位置不动」说的是变成已加入那一下，出错时这一挤 agent 没另处理（目测可接受，见 after-6b）。

## 3. 改了哪些文件

新加：
- `app/src/shared-ui/DraftAddButton.tsx` 加入键
- `app/src/shared-ui/draftAddContext.ts` 加入、撤回的 context 和回执类型
- `app/src/shared-ui/draftAddButton.css` 纸的样子；只用 `--eqb-*` / `--elev-1`，每条覆盖都写了 Explicit-Cascade 注释

改：
- `app/src/App.tsx`：新 `addGroupToDraft`（加入，回执带 itemId）、`undoAddGroupToDraft`（删这一条；删失败先按服务器对一遍再把错抛给键；成功后状态改回 add，并把 `canAddToDraftPaper` 改回 true，否则刷新前会闪「暂不可组卷」）；Provider 包首页和整卷预览；删掉旧 `addToBasket` 和 onAdd / onAddToBasket / onAddSimilarToBasket 这几条线。`addGroupsToBasket` 留着给第 5 处批量用。
- `app/src/concierge/ConciergeGroupCard.tsx`、`ConciergeDesk.tsx`、`ConciergePaperRow.tsx`：行上换成 `DraftAddButton`，去掉 onAdd 传递。
- `app/src/features/question-detail/QuestionGroupDetailView.tsx`：主键换成 `DraftAddButton`。
- `app/src/features/similar-passages/SimilarPassagesPanel.tsx`：去掉那个不管成败都弹的 toast；能加的卡用 `DraftAddButton`，没入库的卡是停用键（title「该卷未入库存，暂不能加入」）。
- `app/src/features/paper-browse/PaperBrowsePage.tsx`、`paperBrowsePage.css`：页边「剪入」换成 `DraftAddButton`；删掉用不着的 `.paper-browse-gutter-add*`；相似卡悬停规则补两个选择器（带注释）。
- `app/src/App.css`：删掉用不着的 `.concierge-action-add`、`.concierge-group-row-icon*`；补一条行悬停时加入键字色（带注释）。
- `app/src/qa/mountCanonicalQuestionGroupDetail.tsx`：卷面检查预览页给一个照实报错的 Provider（「这一页是卷面检查用的预览，不接草稿卷」）。

没碰：PaperSurface、任何 `@media print`、PDF 模板样式、BRAND.md、scripts/brand/、design/brand-2026-10-13/。

## 4. 走查

脚本 `walk.mjs`（本目录），用 `scripts/component-inventory/rig.mjs`，`INVENTORY_PORT_OFFSET=51`，1440×900，DPR 2。
- `WALK_MODE=before`：在改之前的代码上跑（git stash 后），出 `walk-before.json` 和 before-*.png。
- `WALK_MODE=after`：出 `walk-after.json` 和 after-*.png。
- 走查专用：整卷预览在 rig 里起不来（source-capture 素材要先解码），脚本加了一条只给走查用的路由；相似篇章在 rig 里没数据，脚本拦下 `/api/similar-passages` 回两条假结果，指向真题组 group-2026-i-reading-c / d（截图里写着「走查塞的数据」）。

### 点下到出结果（毫秒，本机 rig，一次）

| 位置 | 改前：点→变 | 改后：点→「加入中…」 | 改后：点→「已加入」 |
|---|---|---|---|
| 首页结果行 | 25（乐观） | 13 | 774 |
| 详情页 | 9（乐观） | 2 | 615 |
| 相似篇章 | 24（只是 toast） | 4 | 775 |
| 整卷预览 | 154（乐观） | 6 | 903 |
| 键盘回车（首页行） | — | 3 | 663 |

改后一点就有「加入中…」，真正「已加入」要等服务器（本机 0.6–0.9 秒；线上要看网络，没测）。

### 键盘

首页 D 篇那一行：焦点放在加入键前一个可聚焦元素（上一行的「更多操作」）→ Tab 到「加入草稿卷」→ 回车 → 焦点在「撤回」→ 回车 → 焦点回「加入草稿卷」，草稿卷为空。（第一次跑撤回后焦点掉到 body：撤回后状态改回 add 但 `canAddToDraftPaper` 还是 false，键先变成停用的「暂不可组卷」接不住焦点。已修：撤回时一并改回 true，键也不往停用键上挪焦点。）

### 出错（走查里把接口改成 500「boom」）

- 加入失败：键旁「没加入：boom」，草稿卷仍空。
- 撤回失败：「已加入 撤回 没撤回：boom」，草稿卷里仍有 reading-c，和画面一致。
- 走查中没有 `window.alert` 弹出（dialogs 为空）。控制台的 401 / 404 / 409 改前改后一样多，500 是走查故意造的。

### 390 宽

首页行加入后「已加入 撤回」放得下，页面没有横向滚动（overflowX=false）。

### 截图

| 位置 | 改前 | 改后：加入前 / 加入后 / 撤回后 |
|---|---|---|
| 首页结果行 | before-1a 加入前，before-1b 加入后，before-1c 再点一下（跳去工作台） | after-1a / after-1b / after-1c |
| 详情页 | before-2a，before-2b | after-2a / after-2b / after-2c |
| 相似篇章 | before-3a，before-3b | after-3a / after-3b / after-3c |
| 整卷预览 | before-4a，before-4b | after-4a / after-4b / after-4c |
| 键盘 | — | after-5a Tab 到键，after-5b 回车后焦点在撤回，after-5c 撤回后焦点回加入键 |
| 出错 | — | after-6a 加入失败，after-6b 撤回失败 |
| 390 宽 | — | after-7 |

## 5. 检查

- `cd app && npx tsc -b`：通过。
- eslint（改过的文件，和 HEAD 同一文件比）：没有新问题。旧问题照旧：App set-state-in-effect ×1；PaperBrowsePage exhaustive-deps ×2、set-state-in-effect ×3、only-export-components ×1；QuestionGroupDetailView no-useless-assignment ×1、exhaustive-deps ×1、set-state-in-effect ×2；SimilarPassagesPanel only-export-components ×1。DraftAddButton.tsx、draftAddContext.ts 干净。
- 按要求没跑任何 verify-*.mjs、smoke-*.mjs。

## 6. 没验证的和风险

- 下面这些脚本卡着旧字样 / 旧类名，多半会挂，没跑：verify-concierge-desk（已在草稿卷中 / 从草稿卷移出 / concierge-action-add）、verify-c8-draft-paper-contracts（「已在草稿卷中」）、verify-classic-retire-2（onAddToBasket、peek-add）、verify-icon-motion（DraftAddIcon「剪入」）、smoke-golden-path、smoke-c8-draft-paper-composer、scripts/ux-walkthrough/find-compose-export.mjs、component-inventory 的截图脚本。verify-paper-browse、verify-add-to-draft-feel 因为 addGroupsToBasket 还在，可能能过。
- 线上网络下的等待时长没测；不乐观翻状态后，慢网下「加入中…」会停得久一点。
- 只在 Chromium 走过；读屏只看了 DOM（role=status / alert），没用真读屏软件听。
- `DraftAddIcon` / `iconMotionInput` 和 motionIcons.css 里加入键那几条动效规则这几处不再用，留着没删。
- 撤回回执只存在键自己身上：同一组在页面上出现两次（比如首页行和它展开的相似面板里），只有点的那一个有「撤回」，另一个只显示「已加入」。

## 7. 待办（这次没做）

1. 第 5 处：整卷预览讲评·相似题栏批量加入，还是 toast，没有撤回。批量要不要一键撤回整批，要先定。
2. 第 6 处：草稿卷换篇栏「＋ 加入」，人在草稿卷里，加进去的那一条就在眼前，要不要换成这个键要先定。
3. 整卷预览左栏剪刀小标是否改成「已加入」的说法（跟着第 2 节第 4 条走）。
4. 上一节那些 verify / smoke 脚本的锚点要跟着改。
5. 不再用的 DraftAddIcon 加入动效和对应 CSS 要不要删。

## 8. 要 Owner 定的

1. 「剪入 / 已剪入」和剪刀换成「加入草稿卷 / 已加入」（推翻 D7 用词），行不行。
2. 「已加入」不能再点去草稿卷工作台，行不行（要去草稿卷走顶上的草稿卷入口）。
3. 不乐观翻状态、等服务器再说「已加入」，行不行。
4. 撤回只给本页刚加的那一条，行不行。
5. 第 5、6 处要不要也换成这个键，怎么换。

## Owner 2026-11-14 定的

「都照你的，『已加入』恢复能点」。子代理自己拿主意的四处：1「剪入 / 已剪入」换成「加入草稿卷 / 已加入」，可以；2「已加入」要恢复成能点、点了打开草稿卷（待改）；3 等服务器回话再显示「已加入」，可以；4 撤回只给本页刚加的那一条，可以。

## 第二轮：已加入恢复能点

Owner 2026-11-14：「已加入」恢复成能点，点了打开草稿卷工作台；「撤回」照旧在旁边，照旧一步撤掉。

### 改了什么

- `app/src/shared-ui/DraftAddButton.tsx`：纸里的「已加入」从一个 `<span>` 换成 `<a class="eqb-draft-add-open">`，读屏名「已加入，打开草稿卷」，title「打开草稿卷」。
  - 用链接不用按钮：改之前各处「再点一下」走的是 App 的 `openDraftPaperWorkbench(草稿卷 id, 题组 id)`，它往历史里压一个新地址 `?view=draft-paper&draftPaperId=…&focusGroupId=…`，换整页内容，后退能回来、地址直接打开也能到——是去另一个地址，按语义是链接。
  - href 就是那个地址：中键、Ctrl/⌘ 点、复制地址都交给浏览器；普通左键 preventDefault，在本页里切过去（和改之前一样，不整页刷新）。
  - 去哪一份：这一次加的用回执上的草稿卷 id，本来就在的用题组的 `currentDraftPaperId`；并带上 `focusGroupId`，工作台定位到这一组（改之前也带）。
- `app/src/shared-ui/draftAddContext.ts`：`DraftAddActions` 加 `openDraft`、`draftHref` 两项。
- `app/src/App.tsx`：把 `openDraftPaperWorkbench` 里拼地址的几行抽成模块里的 `draftPaperWorkbenchHref()`（拼法一字不改），`openDraftPaperWorkbench` 和加入键的 href 共用；Provider 补上两项。
- `app/src/shared-ui/draftAddButton.css`：纸两边改成 2px、中间不留缝；「已加入」成了和「撤回」一样矮一档的小块（中号、大号纸里 28px，小号纸里 24px，左右 8px，圆角 8px）。平时墨字、透明底、无下划线；悬停垫桌色（`--eqb-color-desk`）；焦点照 button.css：2px `--eqb-color-action` 焦点环，外扩 2px；按下缩 0.97，减少动态效果时不缩。删掉第一轮那条 `:has(.eqb-draft-add-undo)` 右内边距覆盖和小号纸的 padding 覆盖（纸两边统一 2px，用不着了）。链接不是 `.eqb-button`，button.css 里「.fluid-hover-list 里悬停透明」那几条够不着它，不用另盖；纸是白底，在被滑块选中的行里垫桌色照样看得出（after2-1b）。
- `app/src/qa/mountCanonicalQuestionGroupDetail.tsx`：卷面检查预览页的 Provider 补两项，照实报错（那一页的组永远是加入前那一档，加入必失败，走不到「已加入」）。
- `walk.mjs`：加 `WALK_MODE=after2`（端口偏移 52），出 `walk-after2.json` 和 after2-*.png。

加入中、撤回中、出错：代码没动，走查里再看了一遍，和第一轮一样（见下）。四处共用这个构件，四处的调用处都没改。

### 键盘：回车加入后焦点落在「撤回」，不落在「已加入」

Owner 建议落在「已加入」，但以不误触跳走为准。agent 定落在「撤回」（第一轮原样），理由：

1. 回车加入后最常见的误触是再按一下回车（以为没按上、或者按两下确认）。落在「撤回」上，多按的那一下是撤回：人还在这一页，键回到「加入草稿卷」、焦点也在它上面，再按一下就加回来，一步来回。落在「已加入」上，多按的那一下是跳去草稿卷：离开了这一页，这一页的「撤回」也跟着没了（DESIGN §5 撤回离开页面就失效），要找回原来的位置得后退。
2. 走查实测：回车加入，「已加入」一出来马上再按回车 → 地址还是 `/`，键上是「加入草稿卷」，焦点在它上面，草稿卷为空（walk-after2.json keyboard.doubleEnter）。
3. 「已加入」离得很近：Shift+Tab 一下就到（读屏念「已加入，打开草稿卷，链接」），Tab 一下回撤回。往后接着找题时，从「撤回」按 Tab 直接到下一个控件，不用多过一个。
4. 拿不到刚加的那一条（回执 itemId 为空，没有撤回）时，焦点落到「已加入」，不掉到页面开头。这时纸里只剩它一个控件。

读屏另播「已加入草稿卷」，照旧。

### 量到的数（rig，1440×900，DPR 2，一次）

| 位置 | 纸（宽×高） | 已加入（宽×高） | 撤回（宽×高） | 字离纸左边 | 已加入字尾到撤回字头 | 悬停底色 |
|---|---|---|---|---|---|---|
| 首页结果行（小号） | 101×28 | 55×24 | 42×24 | 10 | 16 | rgb(230,237,240) 桌色 |
| 详情页（中号） | 101×32 | 55×28 | 42×28 | 10 | 16 | 同上 |
| 相似篇章（小号） | 101×28 | 55×24 | 42×24 | 10 | 16 | 同上 |
| 整卷预览（中号，卷面整体放大约 1.1） | 111×35.2 | 60.5×30.8 | 46.2×30.8 | 11 | 17.6 | 同上 |

第一轮（按当时 CSS 算的，没量）：小号纸带撤回宽 95，字离纸左边 8，字尾到撤回字头 12；中号纸宽 99，字离左边 12，字尾到撤回 12。也就是这一轮纸宽 +2～+6px，「已加入」三个字左移或右移 2px，和「撤回」之间多出 4px（为了让「已加入」悬停的那块底左右对称）。平时样子：白底、e1、墨字 rgb(27,43,51)、淡墨「撤回」，没变。

四处每处都走了：加入 → 撤回（草稿卷回到空）→ 再加入 → 点「已加入」：

| 位置 | 点前地址 | 点后地址 | 工作台里有这一组（`[data-draft-tools-group-id]`） | 后退回来 |
|---|---|---|---|---|
| 首页结果行 | `/` | `?view=draft-paper&draftPaperId=…&focusGroupId=group-2026-i-reading-a` | 有 | `/`，结果列表还在，A 篇「已加入」，没有撤回 |
| 详情页 | `?view=detail&groupId=…-c` | `…&focusGroupId=group-2026-i-reading-c` | 有 | 回到详情页，「已加入」，没有撤回 |
| 相似篇章 | `/` | `…&focusGroupId=group-2026-i-reading-c` | 有 | `/`，相似面板收起了（面板开没开不进地址，原样） |
| 整卷预览 | `?view=paper-browse&paperId=paper-2026-i` | `?view=draft-paper&paperId=paper-2026-i&draftPaperId=…&focusGroupId=group-2026-i-reading-b` | 有 | 回到整卷预览，「已加入」，没有撤回 |

- 点下到工作台里那一组的工具出来约 14 秒（rig 里卷面排版慢，这是工作台自己的事，地址和页面是一点就换）。
- 「回来撤回仍可用」：后退回来以后，刚才那一组只剩「已加入」、没有撤回——这是第一轮 Owner 认了的第 4 条（撤回只给本页刚加的那一条，离开页面就失效，DESIGN §5），这一轮没改。回来以后同一页上另加一组（首页 B 篇）再撤回，照常撤掉（草稿卷里只剩 A 篇）。
- 「已加入」的 href 拿到新标签里直接打开，也到同一份草稿卷、同一组（walk-after2.json 首页结果行.hrefInNewTab）。
- 整卷预览的地址里多带了一个 `paperId=paper-2026-i`：`openDraftPaperWorkbench` 本来就留着别的参数，改之前也这样，没动。

键盘（首页 D 篇）：Tab 到「加入草稿卷」→ 回车 → 焦点在「撤回」→ Shift+Tab 到「已加入，打开草稿卷」（焦点环 2px solid rgb(41,66,77)，外扩 2px）→ Tab 回「撤回」→ 回车撤回，焦点回「加入草稿卷」→ 回车加入 → Shift+Tab → 回车，打开草稿卷，里面有 D 篇。

出错（接口改成 500「boom」）：加入失败「没加入：boom」、草稿卷为空；撤回失败「已加入 撤回 没撤回：boom」、草稿卷里仍有那一组，「已加入」链接还在。没有浏览器弹框。控制台的 401 / 404 / 409 和第一轮一样，500 是故意造的。

390 宽：首页行加入后「已加入 撤回」放得下，纸 101×28，没有横向滚动。

### 截图

| 位置 | 加入后 | 悬停「已加入」 | 点了以后（草稿卷工作台） |
|---|---|---|---|
| 首页结果行 | after2-1a | after2-1b | after2-1c |
| 详情页 | after2-2a | after2-2b | after2-2c |
| 相似篇章 | after2-3a | after2-3b | after2-3c |
| 整卷预览 | after2-4a | after2-4b | after2-4c |

键盘：after2-5a 回车加入后焦点在撤回，after2-5b Shift+Tab 到「已加入」（焦点环）。出错：after2-6a、after2-6b。390 宽：after2-7。

### 检查

- `cd app && npx tsc -b`：通过。
- eslint（DraftAddButton.tsx、draftAddContext.ts、App.tsx、mountCanonicalQuestionGroupDetail.tsx）：只有 App.tsx 旧有的 set-state-in-effect ×1，没有新问题。
- 按要求没跑任何 verify-*.mjs、smoke-*.mjs。

### 没验证的和风险

- 只在 Chromium 走；读屏只看了 DOM 上的名字和角色，没用真读屏软件听。
- 没真点中键 / Ctrl 点，只把 href 拿到新标签里打开过。
- 线上网络下没走。
- 第一轮列的那些卡旧字样的 verify / smoke 脚本照旧多半会挂。另：verify-paper-browse.mjs 用正则抠 `openDraftPaperWorkbench` 的函数体，这一轮把拼地址抽了出去，函数体里还剩 pushState 和那几条 set 路由，它查的「清掉 paperBrowseRoute」还在，按读代码看应该能过，没跑。
- 「撤回中…」时「已加入」仍能点：点了照样去草稿卷，撤回请求照常收尾（状态在 App 上改），去了以后看到的草稿卷可能还没撤掉那一组。没有另加处理，概率小。
