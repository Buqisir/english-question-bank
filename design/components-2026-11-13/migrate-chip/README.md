# 胶囊构件 + 圆角变量（2026-11-14）

做了三件事：tokens.css 加圆角变量、shared-ui 四份 css 换上变量；新建胶囊构件 Chip / ChipToggle；把清单里的 P1 胶囊和 chip-02 换上去。没有提交。

## 一、圆角变量

`app/src/shared-ui/tokens.css:62-74`，名字照 DESIGN.md 文件头 `rounded:` 那一组，只收家族里的值，0（卷面直角）不设变量：

| 变量 | 值 | 给谁 |
| --- | --- | --- |
| `--eqb-radius-badge` | 4px | 高 24 以下的小件、菜单项 |
| `--eqb-radius-control` | 8px | 28–44 的控件、下拉菜单面板 |
| `--eqb-radius-card` | 12px | 卡片、板、弹窗、浏览页紧凑搜索框 |
| `--eqb-radius-search` | 16px | 首页搜索框 |
| `--eqb-radius-pill` | 999px | 胶囊：筛选芯片、分段切换、开关、计数小牌 |
| `--eqb-radius-circle` | 50% | 头像、圆点、纯图标圆钮 |

shared-ui 里换掉的写死值（像素不变）：button.css:19；menu.css:15、:23（`--fh-radius`）、:54；notice.css:48、:64；draftAddButton.css:24、:48。

核对：换前换后同一批截图逐像素比，只有草稿丸那一块不同（那是第三件事改的），其余 0 差异；实算圆角除草稿丸外全部一致。见 `compare-radius.png`、`pixel-diff.json`。

## 二、胶囊构件

`app/src/shared-ui/Chip.tsx`、`app/src/shared-ui/chip.css`。颜色、圆角只用变量；13px 字号 tokens 里没有，照 button.css 写字面值并注明。

- **Chip**（状态标记，不可点）：`<span data-kind="mark">`，不进 Tab 顺序。桌色底、次要灰字（4.62 : 1）、12px、行高 16 + 上下 4 = 24，无边无影，指针不变；窄栏里照旧折行。
- **ChipToggle**（筛选 / 切换，可点）：`<button aria-pressed>`。高 28、字 13、白底细边次要灰字（5.47 : 1）；悬停桌色底墨字（12.32 : 1）；选中桌色底墨字 600、边透明；键盘焦点 2px 石板墨环离 2px（同 Button）；禁用 0.55、不可点指针；触屏高 36；放进 FluidHoverList 时让底给滑块。
- **「去草稿卷（带数量）」归 Button，不归 Chip**：点了是去草稿卷，是一个动作，不是标记也不是开关（没有按下 / 未按下）。用 Button 直接拿到键盘焦点、禁用、按压、读屏这一套；浮件的样子（右下固定、白底、e2、胶囊圆角）在 App.css 用类名补。圆角保留胶囊，依据是 DESIGN.md「胶囊只给……计数小牌（草稿丸）」那一条。

样张：`sheet-chip-new.png`（两种变体各状态 + 实算对比度，下面附原 `../sheet-chip.png` 对照）。悬停、焦点是浏览器强制出来的真样式。

## 三、换上去的位置

| 清单 | 现在 | 位置 |
| --- | --- | --- |
| chip-02 浏览页筛选（全部 · 真题 · 模拟 · 年份 · 更早）、月份一排 | ChipToggle | `app/src/concierge/ConciergeDesk.tsx:644-695`；旧样式从 `App.css` 删掉，留 `App.css:3209-3216` 列表滑块的胶囊圆角和桌色 |
| chip-03 / chip-04 草稿丸（首页、其他页） | Button tone="strong"（首页 lg 36，别处 sm 28） | `app/src/App.tsx:1232`；样子 `App.css:4087`、禁用 `App.css:4102` |
| 草稿丸（整卷页） | Button tone="strong" size="sm" | `app/src/features/paper-browse/PaperBrowsePage.tsx:4326` |
| 相似篇章理由小签 | Chip | `app/src/features/similar-passages/SimilarPassagesPanel.tsx:105` |
| 相似题「含 N 题」和理由小签 | Chip | `app/src/features/paper-browse/SimilarQuestionsRailView.tsx:112`、`:115` |
| 草稿卷换篇栏理由小签 | Chip | `app/src/features/draft-paper/DraftPaperRail.tsx:86`；旧 `.similar-chip` 样式从 `paperBrowsePage.css:1665` 一带删掉 |

chip-01 是顶栏头像，现在已是獭獭图，不是胶囊，没动。

对照图（左 before 右 after）：

- `compare-browse.png`：浏览页筛选胶囊 默认 / 悬停 / 键盘焦点 / 选中 / 选中悬停 / 选中焦点 / 390 宽。测试数据没有月份，月份一排没出现。
- `compare-basket.png`：草稿丸 首页（空、有题、悬停、按下、焦点、390）、详情页、整卷页。
- `compare-similar.png`：首页相似篇章卡、草稿卷换篇栏。
- `compare-radius.png`：首页、首页行菜单、详情页加题后、草稿卷 toast（核圆角变量没改像素）。
- 单张原图在 `before/`、`after/`，实测数据在各自的 `measure.json`，逐像素差在 `pixel-diff.json`。

## 四、样子变了的地方和理由

1. **筛选胶囊的键盘焦点**：原来是浏览器默认 1px 黑环，现在 2px 石板墨环离 2px。理由：和 Button、全站焦点一致。其余状态逐像素 0 差异，读屏（按钮、名字、按下）不变。
2. **草稿丸字和宽度**：首页原来 14px/500、左右留白 14，现在 13px/500、留白 12，宽 166.5 → 155.6（空的 150.8 → 139.9）；详情页、整卷页原来 13px/400，现在 13px/500，宽基本不变。理由：Button 的字号字重是统一的（13/500），草稿丸三处原来就不一致。
3. **草稿丸焦点环**：浏览器默认 → 2px 石板墨（同上）。
4. **草稿丸减少动效时的按压**：原来减少动效下仍缩 0.995，现在不缩（Button 在减少动效下关掉按压缩放）。
5. **相似篇章 / 相似题 / 换篇栏的理由小签**：原来深绿字（#1e4a3a）+ 淡绿边，现在次要灰字、桌色底、无边；高 23 → 24、上下留白 2 → 4；指针从手形变回默认。理由：它不可点，2026-11-07 起全站灰阶、强调色只给最该点的那一下；BRAND §5.5 标记要轻。对比度 4.62 : 1 过 AA。卡片因此高 1px 左右（目测几乎看不出）。

草稿丸禁用时的首页样子（细边、次要灰、0.8、无影）保留原样。

## 五、别处还剩的写死圆角

shared-ui 之外的 css（不算 `var()`）还有 **383 处**，卷面 papersurface 另有 4 处没动。TSX 里没有行内圆角。

按值：8px 177、4px 77、999px 49、12px 28、50% 16、0 9、16px 1、0px 1；分方向的家族内值 14 处（如 `8px 0 0 8px`）。

**家族外 11 处**：

- 6px：`App.css:124`（顶栏头像）、`vocabularyReviewPage.css:1846`（打印）
- 10px：`paperIntelligence.css:91`、`:330`
- 3px：`paperSurfaceLectureHighlights.css:47`、`paperIntelligence.css:370`、`:581`、`:618`、`:1406`、`:1415`
- 2px：`paperIntelligence.css:186`

按文件多的：App.css 110、vocabularyDictationWorkbench.css 40、paperIntelligence.css 33、vocabularyReviewPage.css 33、paperBrowsePage.css 28、sentenceAnalysis.css 28、lectureAnalysisPanels.css 23、DraftPaperWorkbench.css 20，其余 13 个文件 68 处。

另外：`vocabularyDictationPage.css:163`、`:212` 用了 `var(--radius-pill)`，这个变量从没定义过，实际是 0。没改（不在范围），建议换成 `--eqb-radius-pill`，换前要看那页的样子。

## 六、想让 Owner 定的

1. 状态标记高 24，按「按高度选档」该是 4px，可「胶囊只给标签类」又说标签用胶囊。我用了胶囊。要不要改 4？
2. 状态标记字用次要灰（轻）还是墨（更清楚）？
3. 草稿丸的读屏名还是「打开草稿卷，已选 N 个题组」，不以看得见的字开头，不合 11-14 那条。没改（verify-concierge-desk 也断言这个开头）。建议「草稿卷（N 组）：打开草稿卷」，请定。
4. 还有几处像胶囊的没换：找题台起步一排 `concierge-starter-chip`（12.5px、写死边色 #D8D8D2）、已选筛选 `concierge-active-filter-chip`（可移除，可能要第三种变体）、详情页题型分布 `peek-chip`（测试数据里拍不出来）、讲评栏 `pi-*` 小签。要不要下一轮换？
5. 顶栏头像 `App.css:124` 的 6px 在家族外，也不在 verify-radius-family 的白名单里，那条检查会报。是别的线程刚改的，我没碰。
6. tokens 缺 13px 字号变量（芯片、按钮都在用），要不要补？

## 七、DESIGN.md 建议跟着改的（我没改）

- §5 圆角规则：写上变量名（`--eqb-radius-badge` 等），说明新写的圆角一律用变量。
- §5 Buttons「有字按钮一律 8px」和「胶囊给计数小牌（草稿丸）」打架：草稿丸是有字的按钮，却是胶囊。建议写明草稿丸是例外。
- §5 Chips：写上两种变体（状态标记不可点、筛选 / 切换 aria-pressed）和 Chip.tsx；状态标记的样子（桌色底、次要灰、12px、无边）。
- §5 理由小签原来的绿字绿边描述（如有）要删掉。

## 八、脚本

- `scripts/component-inventory/chip-shots.mjs`：拍 before / after（`node scripts/component-inventory/chip-shots.mjs before|after`，自己起停本地站，偏移 57、种子 full）。
- `scripts/component-inventory/chip-sheet.mjs`：出样张。
- 对照图和像素差是临时 python 脚本拼的，没放进仓库。
- 改了但**没跑**：`scripts/verify-paper-browse.mjs`（草稿丸改成 `<Button`；删掉 `.similar-chip` 12px 那条断言，标题里的「twelve declarations」现在是十一条）、`scripts/verify-concierge-desk.mjs`（筛选胶囊的断言改读 chip.css，并断言用了 ChipToggle）。
- `pnpm build`（类型检查 + 构建）通过。
