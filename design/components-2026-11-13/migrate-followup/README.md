# 构件收尾后的四件事 · 2026-11-15

Owner 2026-11-15 定了四件事，这一轮照着做完。截图：`scripts/component-inventory/followup-shots.mjs`（取证架，`INVENTORY_PORT_OFFSET=70`）。换前从 HEAD `f39600e98` 的临时 worktree 拍，换后从工作区拍，宽度 1440 和 390。原图放在 `.scratch/component-inventory/followup-{before,after}/`，不进库。对照拼版由 `scripts/component-inventory/followup-compare.mjs` 生成，就是本目录的四张 png。`diff.json` 里有首页整页的逐像素比较，以及两次运行记下的全部数值。

| 拼版 | 内容 |
|---|---|
| `1-suggest-button.png` | 一、建议键（A4 / A3 · 静止 / 悬停 / 键盘焦点） |
| `2-remove-focus.png` | 二、移出题组以后的卷面（焦点结果看下面的表） |
| `3-vocab-notices.png` | 三、生词各页的提示行 |
| `4-thinking-toggle.png` | 四、思考模式开关（样子没变） |

首页 `home-results.png` / `home-results-390.png` 换前换后逐像素比较，0 个像素不同。

## 一、`Button` 加「建议」样式（`tone="suggest"`）

**做了什么**
- `app/src/shared-ui/Button.tsx` 加了 `'suggest'`。`app/src/shared-ui/button.css` 加了 `.eqb-button[data-tone='suggest']`：底色用页面底 `--eqb-color-bg`，字是次要灰 `--eqb-color-text-muted`、`--eqb-font-size-xs`、字重 400，字下面加下划线（偏 2px）。悬停时垫桌色底 `--eqb-color-desk`，字换成墨色 `--eqb-color-text`。键盘焦点和别的样式一样，照抬色规则走。
- 草稿卷的两处建议键都换成了 `<Button tone="suggest" size="sm">`：A4 题组工具条上方的「建议前置分页」，和 A3 接缝上的「跨页断篇（第1/2页）· 建议前置分页」。原来手写的颜色、字号、内边距、悬停规则都删了（删之前用 grep 确认过没有别处在用）。`DraftPaperWorkbench.css` 里只留摆放位置，每条都写了显式层叠注释：
  - `.draft-group-actions .draft-group-suggestion`（0,2,0）：绝对定位，贴在工具条右上角的上面，隔 `--eqb-space-2`。
  - `.draft-group-actions .eqb-button.draft-group-suggestion`（0,3,0）：压过工具条里那条「键一律 4px 圆角」（0,2,0），把圆角还原成 `--eqb-radius-control`（8px），因为小签贴在工具条外面，不在工具条的内边距里。
  - `.eqb-button.draft-seam-suggestion`（0,2,0）：绝对定位，用 `translate` 水平居中（`Button` 按下时的缩放写的是 `transform`，所以居中不能也用 `transform`），`z-index: 5`。
- PaperSurface 的排版和打印 / PDF 样式都没动。两个键都在 `DraftPaperWorkbench.tsx` 里。

**换前 → 换后**（实测，1440 和 390 相同）

| | 换前 A4 | 换后 A4 | 换前 A3 | 换后 A3 |
|---|---|---|---|---|
| 尺寸 | 90 × 32 | 88 × 28 | 212.6 × 25 | 210.7 × 28 |
| 字 | 12px / 400 | 12px / 400 | 11.5px / 400 | 12px / 400 |
| 内边距 | 4px 9px | 0 8px | 4px 12px | 0 8px |
| 圆角 | 8 | 8 | 8 | 8 |
| 和工具条的间距 | 6px | 8px | — | — |

颜色（静止 `#5A6C75` 字 + 页面底，悬停换墨字 + 桌色底）和下划线都没变。A3 的键高从 25 变成 28，跟上了 `sm` 那一档。

**键盘和读屏**：Tab 能停在两个键上，焦点框可见（`:focus-visible` 为真）。读屏念的名字和换前一字不差：A4 是「建议前置分页」，A3 是「跨页断篇（第1/2页） · 建议前置分页」。`title` 照旧是「跨页断篇（第1/2页）」。点下去还是调用 `togglePageBreak(item, true)`。

**没做的**：「排序建议」卡片上的「采用 / 撤回」是另一种卡片，这次没碰。

## 二、草稿卷移出题组以后焦点去哪

**做了什么**（`app/src/features/draft-paper/DraftPaperWorkbench.tsx`）
- 题组「⋯」菜单里的「移出草稿卷」：在删之前就用 `shared-ui/focusAfterRemoval.ts` 的 `planFocusAfterRemoval` 定好去处，顺序是下一组的「更多题组操作」→ 上一组的 → 兜底。用来认组的是工具条上的 `data-draft-tools-group-id`，所以卷面重排、工具条整块卸掉再挂上以后也能找回同一个键。`Menu` 加了 `triggerClassName="draft-group-menu-trigger"`。
- 移出以后卷面要重排：新的分页结果回来以后 iframe 会重新载入，所有工具条先卸掉，再按新位置挂上。所以焦点要等卷面排好才落下，「排好」指没有在途的保存、预览不是旧的、工具条位置都算出来了。没排好之前，如果焦点掉到了 `<body>`，先把它放到目标键上；那个键被卸掉以后，再放回重新挂上的同一个键。用户如果自己把焦点挪到别处，就不再抢。
- 兜底：左栏「卷面目录」（`nav`，用 `programmaticFocusTarget` 临时加 `tabindex=-1`）。窄屏（390）左栏是藏起来的，这时落到这张卷的标题 `h1`（视觉上是隐藏的），读屏会念出卷名。
- **撤销以后焦点去哪（这次定的）**：落回被撤回那一组自己的「更多题组操作」，也就是移出之前用户所在的位置。那一组没有工具条时，走上面的兜底。
- 移出失败（服务器报错）时取消这次焦点安排，焦点留在原处。

**实测**（键盘操作：Tab 到「更多题组操作」→ Enter → 选「移出草稿卷」；三组 a / b / c）

| 情况 | 换前（1440 / 390 相同） | 换后 1440 | 换后 390 |
|---|---|---|---|
| 移出中间一组 b | `<body>`（焦点落空） | c 组「更多题组操作」 | 同左 |
| 撤销（Tab 到提示里的「撤销」，按 Enter） | 约 1 秒后到 c 组「更多题组操作」（碰巧：撤销提示收起时把焦点还给了进提示之前的那个键） | 截图那一次：约 0.9 秒后也到 c 组，**没有回到被撤回的 b 组**，是错的；已改，没重测（见下面） | 同左 |
| 移出最后一组 c | `<body>` | b 组「更多题组操作」 | 同左 |
| 剩两组时移出 a | 先到 a 组的键，约 0.8 秒后卷面重排，掉到 `<body>` | 重排后落到 b 组「更多题组操作」 | 同左 |
| 移出最后剩下的一组 | `<body>` | 「卷面目录」 | `h1`「（卷名）」 |
| 从移出到撤销要按几次 Tab | 5 | 1 | 1 |

撤销那一步的问题和修改：服务器刚回话时，旧的工具条位置还在，代码就当成卷面已经排好了。这时 b 组的工具条还没挂上，焦点提前兜底；随后撤销提示收起，又把焦点还给了 c 组。拍完图以后已经改了：被撤回的那一组只要还在卷上（没缺题），就一直等到它的「更多题组操作」出现再落焦点（`PendingDraftFocus.waitForGroupId`）。`tsc` 和 `build` 都通过了。但按协调人的要求没有补拍，所以**撤销后落到 b 组这一点没有实测**，下一轮跑 `FOLLOWUP_ONLY=draft-remove` 看 `undoMiddle` 的最后一项。

**读屏**：落到「更多题组操作」时念「更多题组操作，按钮，弹出菜单」（按 `Menu` 触发键的属性推出来的，没有用真读屏器听过）。落到 `nav` 时念「卷面目录，导航」。落到 `h1` 时念卷名和「标题 1」。

**没做的**：左栏里「缺题」那一项的删除键，删完以后焦点也会落空，不在这次的范围里。

## 三、生词各页的提示行换成 `shared-ui/Notice`

**做了什么**：文字一个字都没改。出错的用 `kind="error"`（`role="alert"`），完成的用 `success`，等待的用 `waiting`（这两种都是 `role="status"`、`aria-live="polite"`），都是一行。换下来的旧规则在 grep 确认没人再用以后删掉了。

| 页面 · 位置 | 换前 | 换后 |
|---|---|---|
| 听写工作区顶上（出错 / 完成） | 手写的 `div.dictation-notice`，出错是红字红底，完成是灰底 | `.dictation-notice-row` 里放 `Notice` 和「关闭提示」（`Button` subtle sm，图标键），关闭键和提示在同一行 |
| 看词说义 · 出错（2 处） | `p.meaning-recall-error`，红字红底带 | `Notice error`，`.eqb-notice.meaning-recall-error` 只留内边距 |
| 趣味练习 · 读音放不出来 | `p`，`role="status"` | `Notice error`，`role` 改成 `alert` |
| 生词本 · 列表出错 | `p.notebook-empty`，没有 `role` | `Notice error`，类名改成 `.notebook-error`，`.notebook-empty` 删掉 |
| 生词本 · 打开一张纸（等待 / 出错） | `p.notebook-status`，没有 `role` | `Notice waiting / error`，打印时隐藏的规则没动 |
| 进度浏览（完成 / 出错） | 手写的段落 | `Notice success / error` |
| 过生词（6 处 `requestError`，加上读取中） | `p.vocabulary-request-error`，红字，带 `!important` | `Notice error`。类名 `.vocabulary-request-error` 保留，因为 `server/vocabulary/vocabularyPdfRenderer.mjs` 要读它的 `textContent`。读取中改成 `Notice waiting` |

**样子的变化**：出错的提示从「红字（或红字加淡红底）」变成了「警示图标加次要灰字、没有底色」，这是 `Notice` 本来的样子。

**读屏**：实测 `role` 如上。出错的提示现在都会被立刻念出来（`alert`），等待和完成的提示等读屏念完手头的再念（`polite`）。

**这次没拍到的**：「生词本打开一张纸 · 出错」换前换后都只拍到了等待状态（详情接口故意拖了 6 秒，截图时还没返回 500）。代码是照列表出错那样改的，但这一格没有图作证。按协调人的要求没有补拍。

**没换的**（都不是「提示行」，或者换了会出问题）
- `dictation-volume-warning`：音量提示的文字比较长，换成 `Notice` 以后在 390 宽会被截断藏掉一部分。这是上一轮就留给 Owner 的问题。
- `vocabulary-share-ready`：分享链接这一块状态信息比较长，不是一行能放下的。
- 表单字段下面的报错（`studentFormError`、`directInputOverLimit` 的小字）：这些归字段构件管。
- 整页状态（练习页的读取中和出错页、听写和听力的公开页、`dictation-workbench-message`）、`dictation-empty-line` 这种空状态、`vocabulary-practice-live`、分享下载的确认。
- 换前就有的问题，这次没改：过生词的词库接口出错时，出错页下面那行服务器原话，会被随后「换学生」时的 `setRequestError('')` 清掉，所以永远显示不出来。脚本改成用学生档案接口出错的情况来拍这一行。

## 四、思考模式开关的点击区

**做了什么**：`app/src/App.css` 里 `.concierge-thinking-toggle input[type='checkbox']::after` 加了 `z-index: 1`。原来已经有一层透明的 `::after` 往上下扩展点击区，但它下沿的 1px 多被后面那个定位了的「筛选」键盖住了。现在 `::after` 压在上面，样子和布局一点没变（首页逐像素比较，0 差异）。

| | 换前 1440 | 换前 390 | 换后（两种宽度相同） |
|---|---|---|---|
| 实测点击区 | 32.5 × 22.75 | 32.5 × 23 | 32.5 × 24.5 |
| 开关上沿往上 2.5px 处点一下 | 能切换 | 能切换 | 能切换 |
| 开关下沿往下 2.5px 处点一下 | 点到「筛选」键 | 点到「筛选」键 | 能切换 |

达到 24 高，没有改布局。代价：搜索框的下沿和「筛选」键的上沿，各让出了 1px 的可点区域（搜索框 54 → 53，「筛选」键 36 → 35，开关那一段都是 32px 宽）。这两处本身都远大于 24，仍然达标。

**读屏**：没有变化，`input` 的名字和状态都和原来一样。

## 记号缺口

已写进 `docs/design-gaps.md`（2026-11-15 那一条）：「建议」样式的字重 400 没有对应的记号（候选 `--eqb-font-weight-*`）；A3 接缝键的 `z-index: 5` 和开关点击区的 `z-index: 1` 没有层级记号（候选 `--eqb-z-paper-tools`、`--eqb-z-hit-area`）。

## 协调人复核（2026-11-15）

- 看过 1–4 号对比图。建议键换前换后几乎一样（字下划线、悬停桌色底、焦点框都在），合格。生词各页提示行合格。
- **撤销以后的焦点：已实测，做到了。** 上面说「没实测」那一条，我补了一次测量（`FOLLOWUP_ONLY=draft-remove`，端口偏移 71）。`focusTimeline` 在卷面重排完之前就停了：测试台里撤销以后重排一次要三十几秒，那段时间焦点在下一组（提示收起时还回去的），所以原来的记录看着像没做到。脚本里加了 `undoMiddleSettled`（重排完再等 1.5 秒取焦点），1440 和 390 都落在被撤回那一组 B 的「更多题组操作」上。中途我试过逐帧查找来提前落焦点，等不到三十几秒的重排，没用，已撤掉，代码是子代理的版本。
- **我改了一处：没存住的报错上危险色。** DESIGN.md §5 Notices 早就定了「只有『没保存』『会丢东西』才上危险色」，子代理换成 Notice 以后这几条成了灰字（它在报告里问要不要改）。这条已定，不用再问，直接改了：
  - 听写工作区：「认词结果尚未保存，请重试后再离开。」（离开前存不住）
  - 看词说义：自动保存失败时（`saveState === 'error'`）
  - 过生词：「判断未保存」「撤销未保存」「生词组名称保存失败」
  - 写法：记下这句没存住的报错原文，页面上的报错还是这句时才给 `danger`；被别的报错换掉或清空就自然不标。别的报错照旧是灰字加警示图标。
  - `tsc`、`build` 过；这三个文件的 lint 报错数和改前一样（原来就有，不是这次加的）。
- 没做的照上面「没做的」。
