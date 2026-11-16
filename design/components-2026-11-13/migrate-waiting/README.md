# 等待换成所以点 / 灰块（2026-11-15，寅）

依据：DESIGN.md §5「Waiting 等待」、BRAND.md §4.6 末段「界面等待 · 所以点」、whisker-dots.html 的动作参数。
产物：本目录 `compare-waiting.png`（换前 / 换后元素截图对照）、`diff.json`（两边量到的键宽、读屏属性、所以点种类、没拍到的原因）。

## 一、构件和接口

都在 `app/src/shared-ui/`。

| 名字 | 文件 | 接口 | 说明 |
|---|---|---|---|
| `useDelayedBusy(pending)` | `useDelayedBusy.ts` | 返回 `'idle' \| 'waiting' \| 'settling' \| 'leaving'` | 门槛：300ms 内不出（`WAIT_SHOW_DELAY_MS`），出了至少 500ms（`WAIT_MIN_VISIBLE_MS`）；做完先 `settling`（浮回 ∴，`--motion-base` 160ms）再 `leaving`（隐去，`--motion-fast` 120ms）。收尾中又开始等，直接回 `waiting`。 |
| `WaitDots` 所以点 | `WaitDots.tsx` | `{ active?=true, leaving?=false, className? }` | 16px、currentColor、24 格 SVG 三颗点。甲 flip / 乙 wave / 丙 swap，每次等随机挑、不连着同一种、同一时刻几处共用一种且对齐同一起点（模块里一个「这次等待」）。`active=false` 从当前位置浮回 ∴。减少动态效果：静止「…」（三点一排）。`aria-hidden`。卸载停掉全部动画。一般不直接用。 |
| `InlineWaitDots` | `WaitDots.tsx` | `{ pending, className? }` | 一行字后面的所以点，自带门槛；没在等时不渲染。 |
| `Skeleton` 灰块 | `Skeleton.tsx` | `{ width?, height, shape?='block'\|'pill', className? }` | 桌色 `--eqb-color-desk`、圆角 4 `--eqb-radius-badge`（pill 用 `--eqb-radius-pill`）；1.8s 呼吸，透明度 1↔0.6，所有灰块 `startTime=0` 同相；减少动态效果不动；`aria-hidden`。 |
| `Button` 的 `busy` | `Button.tsx`、`button.css` | `busy`、新加 `iconShowsBusy` | `aria-busy` / 不能再点立即生效；所以点过门槛才出。有图标的键：图标换成所以点、字不动。只有字的键：字隐去（visibility / opacity，占位不变），所以点居中。键宽不变（调用处 busy 时不要换字）。`iconShowsBusy`：图标自己会演（`DownloadFeedbackIcon`）的键，busy 时不换所以点。 |
| `Notice kind="waiting"` | `Notice.tsx`、`notice.css` | 不变 | 去掉转圈图标，字后面跟 `InlineWaitDots`。 |

样式在 `waiting.css`。DESIGN 给定、token 里没有的数写成具名变量并注明出处：`--eqb-wait-dots-size: 16px`、`--eqb-skeleton-cycle: 1800ms`、`--eqb-skeleton-low: 0.6`、`--eqb-skeleton-ease`（正弦，和 `--ease-sine` 同一条）。动作参数（`waitDotsMotion.ts`）都是具名常量，出处 DESIGN §5 Waiting / whisker-dots.html。时长和曲线运行时读 `--motion-slow/base/fast`、`--ease-in-out`，读不到就跳过那一段（不写字面兜底）。

实现取舍：参考稿用 rAF 逐帧算；这里按公式 60fps 预先采样成关键帧，交给 Web Animations。好处是能暂停（截图停中间帧）、同相（`startTime` 对齐）、不占主线程，卸载 `cancel()` 即停。

## 二、清点（app/src 里所有在等的地方）

「换」= 本轮已换；「留」= 没换，见理由。行号是改后的。

| 位置 | 原来的样子 | 换成 | 状态 | 理由 / 备注 |
|---|---|---|---|---|
| `shared-ui/Notice.tsx:78`（所有 `kind="waiting"`） | 转圈 Loader + 字「…」 | 字 + 所以点 | 换 | 下列提示行全部跟着换，字尾的「…」/「...」删掉 |
| `concierge/ConciergeDesk.tsx:721` 正在连接本地题库 | 同上 | 同上 | 换 | |
| `concierge/ConciergeDesk.tsx:916` 正在为「…」找题 | 同上 | 同上 | 换 | |
| `concierge/ConciergeDesk.tsx:925` 找题结果区占位 | 自写灰条 + 扫光 shimmer | `SkeletonFeed`（`Skeleton`） | 换 | 灰块没过门槛，立即出（和提示行同步）；见「问题」 |
| `concierge/ConciergeDesk.tsx:785-794` 连库时的芯片 + 结果占位 | 灰条 + shimmer | `Skeleton`（pill / block） | 换 | 但这段实际到不了：连库时 `.concierge-desk` 只渲染 stage（拍图探针确认），是死代码 |
| `concierge/ConciergeDesk.tsx:581` 输入框占位「正在连接本地题库…」 | placeholder 字 | — | 留 | placeholder 里放不了所以点 |
| `features/question-detail/QuestionGroupDetailView.tsx:501` 正在读取题组详情 | Notice | 所以点 | 换 | |
| `features/question-detail/QuestionGroupDetailView.tsx:512` 卷面加载中… | 整块占位字 | — | 留 | 整块，应改灰块，属结构改动 |
| `features/paper-browse/SimilarQuestionsRailView.tsx:147` | Notice | 所以点 | 换 | |
| `features/paper-browse/PaperBrowsePage.tsx:4141` 正在打开整卷 | Notice | 所以点 | 换 | |
| `features/paper-browse/PaperBrowsePage.tsx:2521` 加载中… | 整块占位字 | — | 留 | 整块，应改灰块（结构） |
| `features/paper-browse/PaperBrowsePage.tsx:3367/3387/3414` 解析加载中… | 字 | — | 留 | 整块讲解区，应改灰块（结构） |
| `features/paper-browse/PaperBrowsePage.tsx:4086-4093` 解析 PDF 下载键 | busy + 「生成 PDF 中…」+ DownloadFeedbackIcon | 加 `iconShowsBusy` | 换（部分） | 图标自己演，不换所以点；字「生成 PDF 中…」没改，宽度仍会变，待 Owner 定 |
| `features/paper-browse/selection/SelectionOverlay.tsx:256` 正在翻译 | 转圈 `.paper-selection-spinner` + 「正在翻译…」 | 字 + 所以点 | 换 | 旧 spinner 规则和 keyframes 已删（grep 确认无人用） |
| `features/paper-browse/selection/sentence-analysis/SentenceAnalysisCard.tsx:158` 分析中 | 转圈 + 「分析中…」 | 字 + 所以点 | 换 | |
| `SentenceAnalysisCard.tsx:207-208` `sa-skeleton` | 自写灰条 | — | 留 | 可以换 `Skeleton`，本轮没碰，下一轮顺手 |
| `features/paper-browse/selection/DictionaryCard.tsx:456-459` `paper-dictionary-skeleton-*` | 自写灰条 | — | 留 | 同上 |
| `features/similar-passages/SimilarPassagesPanel.tsx:77` | Notice | 所以点 | 换 | |
| `features/draft-paper/DraftPaperRail.tsx:54` | Notice | 所以点 | 换 | |
| `features/draft-paper/DraftPaperWorkbench.tsx:1619/1846/1957/1983/2210` | Notice | 所以点 | 换 | 正在打开草稿卷 / 正在生成 PDF / 正在重排卷面 / 正在生成分页预览 / 正在读取文件夹 |
| `features/draft-paper/DraftPaperWorkbench.tsx:1744-1747` 顶栏「保存中」 | 字 | 字 + `InlineWaitDots` | 换 | |
| `features/draft-paper/DraftPaperWorkbench.tsx:2178` 保存到个人空间确认键 | disabled + 换字 | `busy`，字固定「保存」 | 换 | |
| `features/draft-paper/DraftPaperWorkbench.tsx:1725` 菜单项「保存 PDF 到个人空间」 | 保存中 disabled | — | 留 | 菜单项不是 Button，没有 busy |
| `features/vocabulary-dictation-workbench/VocabularyMeaningRecallPanel.tsx:486` 正在自动保存… | 字 | 字 + `InlineWaitDots` | 换 | 不是听写音量提示 |
| `features/vocabulary-notebook/VocabularyNotebookPage.tsx:196` | Notice | 所以点 | 换 | |
| `features/my-space/MySpacePage.tsx:302` | Notice | 所以点 | 换 | |
| `features/vocabulary-review/VocabularyReviewPage.tsx:1571` | Notice | 所以点 | 换 | |
| `features/admin/AgentTokens.tsx:77` 加载中 | Notice | 所以点 | 换 | |
| `features/admin/AgentTokens.tsx:99` 撤销键 | disabled + 换字 | `busy` | 换 | |
| `features/admin/AgentTokens.tsx:63` 保存中… | 手写 ghost-button + 换字 | — | 留 | 不是 Button 构件，换构件属结构改动 |
| `App.tsx:1287/1302` 删除题组 | disabled + 「删除中…」 | `busy`，字固定「删除题组」 | 换 | 只有字的键：字隐去、所以点居中 |
| `workbench/EntryModal.tsx:259` 录入保存 | 换字 | `busy` | 换 | |
| `features/vocabulary-practice/VocabularyHandwritingSelector.tsx:60` | disabled + 换字 | `busy`（另留 `disabled: selectedCount===0`） | 换 | |
| `shared-ui/DraftAddButton.tsx:154/177/188` 加入 / 撤回 | 「加入中…」「撤回中…」；紧凑档加入中展开成带字键 | `busy`，字固定；紧凑档加入中仍只有一个键位，加号换所以点 | 换 | **推翻了之前「加入中…」的决定，需 Owner 确认** |
| `shared-ui/Toast.tsx:215`、`shared-ui/Notice.tsx:80` 动作键 | 透传 busy | 自动跟着 Button | 换 | |
| `features/vocabulary-review/VocabularyReviewPage.tsx:1416` 等下载键 | disabled + 换字 + DownloadFeedbackIcon | — | 留 | 图标自己演；不动图标动作 |
| `VocabularyReviewPage.tsx:1617/1621/1905/1911/1954`、`SelectionOverlay.tsx:229`、`DictionaryCard.tsx:398`、`SentenceAnalysisCard.tsx:191` 复制键 | disabled + aria-busy + CopyFeedbackIcon | — | 留 | 同上，图标自己演 |
| `features/vocabulary-review/VocabularyProgressExplorer.tsx:117` | disabled | — | 留 | 只是禁用，没有「在等」的样子 |
| `features/vocabulary-dictation-workbench/VocabularyDictationWorkbench.tsx:1228` 等 `<details>` 下载项 | disabled | — | 留 | 原生 button，不是构件 |
| `auth/LoginPage.tsx:107` 登录中… | 换字 | — | 留 | 登录页另一套样式，待 Owner 定要不要用 Button |
| `features/admin/AdminWorkbench.tsx:37` 打标中… | 换字 | — | 留 | 管理页原生键 |
| `features/vocabulary-notebook/NotebookAddButton.tsx:63-64` 正在检查… / 正在加入… | 换字 | — | 留 | 有自己的状态机和图标，改了会影响生词本流程，结构改动 |
| `shared-ui/SearchField.tsx:118` `is-loading` | 提交键放宽 | — | 留 | 搜索键自己的样子，换要动 SearchField 结构 |
| `auth/AuthGate.tsx:75` | 空白 div aria-busy | — | 留 | 整页，结构 |
| `main.tsx` / 词汇页整页「正在准备…」 | 整页字 | — | 留 | 整页，结构 |
| PaperFontGate（`shared-ui/papersurface/`） | — | — | 留 | 不许碰 |
| 听写音量提示 `dictation-volume-warning` | — | — | 留 | Owner 说先不管 |
| `App.css` `.concierge-detail-skeleton` | 没人用的规则 | — | 留 | 不是本轮创建，也不是本轮替换的，不删 |

删掉的旧样式（删前 grep 确认无人用）：`selectionOverlay.css` 的 `.paper-selection-spinner`、`@keyframes paper-selection-spin` 和减少动态效果里那一项；`App.css` 的 `.concierge-skeleton-line(.short)`、扫光 `::after`、`@keyframes concierge-skeleton-shimmer`、其减少动态效果规则、`.concierge-skeleton-chip`（含 nth-child 宽度）、`-feed-title` / `-feed-row`。原位置留了注释。

## 三、改过的 verify 断言（没跑）

- `scripts/verify-concierge-desk.mjs` 约 916 行：原来断言 App.css 里有 shimmer 的减少动态效果规则，改成读 `shared-ui/waiting.css`，断言 `@media (prefers-reduced-motion: reduce) { .eqb-skeleton { animation: none`。
- 其他 verify 里如果有断言「删除中…」「加入中…」「撤回中…」字样或 `.paper-selection-spinner`：grep `scripts/*.mjs` 没找到，没改。

## 四、截图

- 脚本：`scripts/component-inventory/waiting-shots.mjs`（`WAITING_ONLY` 过滤步骤）、`waiting-compare.mjs`。`INVENTORY_PORT_OFFSET=76`。只拍元素；请求用 route 拦住不放来保持「在等」；拍前把动画停在中间一帧（所以点 1400ms，无限动画 delay + 半周期）。
- 换前跑了 4 次（第一次 home-connecting / home-row-add 没拍到，脚本改等提示行、加失败时放行，home-search 改用走 AI 的说法才进等待）。四次结果合在 `.scratch/component-inventory/waiting-before-all/`。这超了「换前一次」，如实写。
- 换后跑 1 次，没补拍。没拍到：
  - `draft-pagination`、`draft-saving`（草稿卷那步加题时 400「questionGroupId not found: group-2026-i-reading-a」）；
  - `detail-add-busy-reduced`、`delete-busy-reduced`（减少动态效果那组：D 篇的键显示「暂不可组卷」，点不了）。
  - 推测原因（未核实）：换后这次 home-row-add 成功了，放行后真把 A 篇加进了草稿卷，后面步骤的数据跟着变了；换前那次 home-row-add 是单独补跑的，没串上。下一轮可让 home-row-add 最后 abort 而不是放行。
- 换前的 `draft-saving` 拍到的是「已保存」不是「保存中」（拦 PATCH 没拦住，或保存在拍之前已完成），对照里没有有效的换前「保存中」。
- 量到的键宽（diff.json）：详情页加入键 换前 111→97.4（「加入中…」变窄），换后 111→111；删除确认键 换前 76→74.8，换后 76→76；首页紧凑加入键 换前 28→88.8（展开成带字），换后 28→28。
- 拍到的所以点种类：同一页里不重复；换页（整页重新加载）后模块状态重来，所以 detail-add 和 delete-dialog 都是 wave，属正常。

## 五、问题

1. 提示行的字立即出、所以点过门槛才出；结果区的灰块没走门槛（和提示行同时立即出）。DESIGN 说门槛管所有等待的样子，严格说灰块和提示行都该等 300ms。要做到需在调用处（ConciergeDesk 等）用 `useDelayedBusy` 包一层；本轮没动，因为提示行同时是 live region，延迟会改读屏时机。
2. 所以点 16px 跟在 12–13px 小字后面，看着略大（目测），草稿卷顶栏和自动保存那行尤其明显。
3. Notice 里所以点和字之间用了 `margin-left: calc(-1 * var(--eqb-space-1))` 往回拉一点（目测）。
4. 首页紧凑加入键加入中只有所以点，读屏靠 `aria-busy`；视觉上和旁边「⋯ 更多」键挨着，两组点有点像（目测，见对照图第 5 行）。
5. 只有字的键（删除确认）在等时字整个隐去，只剩居中的点；视觉上键「空了」，不如有图标的键清楚。
6. 「首次随机、不连着同一种」只在一个页面生命周期里成立，整页刷新后可能连着同一种。

## 六、建议协调人改 DESIGN.md §5 的地方

- 写明「等待时键上的字不换」（原「加入中…」「删除中…」这类废掉），并说明只有字的键字隐去、点居中。
- 写明图标自己会演「正在做」的键（下载、复制）不换所以点，例外列名。
- 门槛对提示行的字适不适用：建议写「字立即出（读屏要及时），点和灰块过门槛」。
- 所以点在 12px 字旁边要不要缩成 12–14px，给个档位。
- 灰块门槛：写明灰块也过 300ms 门槛，还是跟提示行同出。
- 「行渐入 200ms / 错开 40ms」「超过 10 秒换一句话」两条本轮没做，建议标为后续。

## 七、要 Owner 定的事（附建议）

1. DraftAddButton 加入中不再写「加入中…」、紧凑档不再展开带字：推翻了之前的决定。建议：同意，宽度不跳更稳。
2. 解析 PDF 下载键「生成 PDF 中…」字还在换：建议改回固定「下载 PDF」，图标自己演就够。
3. 登录键、AgentTokens「保存中…」、管理页「打标中…」、生词本「正在检查… / 正在加入…」：建议下一轮统一换成 Button busy。
4. 整块「加载中…」（整卷页、详情页卷面、讲解区）改灰块：建议做，按真东西形状画，需要各页给出尺寸。
5. 词典卡、句子分析卡的自写灰条换成 `Skeleton`：建议做，改动小。
6. 首页连库时的灰块代码到不了（死代码）：建议要么删掉，要么让连库时也显示结果区占位，Owner 定哪种。
7. 所以点在小字旁的尺寸（见第五节第 2 条）：建议 12px 字旁用 14px（目测）。

## 协调人复核

2026-11-15，看过对照图和构件代码：

- **改了一处毛病.** `WaitDots` 等完时本该从当前位置浮回 ∴（160ms），实际直接跳回。原因：`active` 由真变假时，React 先跑上一轮的清理（把「浮回 ∴」排上），再跑新一轮的设置，而设置开头把刚排上的收尾停了。改成只在又开始等时才停收尾。改后 `tsc`、这几个文件的 lint 都过；没在浏览器里重拍。
- **审美.** 键宽不变比原来好：详情页加入键原来从 111 缩到 97，首页紧凑加入键原来从 28 撑到 89，现在都不跳。删除确认只剩红色的点，看着不空，可以留。翻译那行字和点之间比 Notice 里略宽（容器间距 6px，Notice 是 8 − 4），目测差 2px，先不改。
- **DESIGN.md §5 Waiting 已照第六节补上：** 字不换、`iconShowsBusy` 例外、提示行的字不等门槛、还没做的几条。小字旁所以点的尺寸记为待定。
- **第七节交 Owner：** 第 1 条（加入中不再写字、紧凑档不再展开）随「等待」这一节一起等 Owner 看实景确认；其余几条下一轮照建议做。

