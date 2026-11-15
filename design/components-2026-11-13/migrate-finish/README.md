# 构件收尾：确认框、焦点、提示行、胶囊、无障碍（2026-11-15）

规矩出处：`AGENTS.md`（No-Literal-Fallback、Explicit-Cascade 注释、一次只写一个工作区面）；`DESIGN.md` §4 影子、§5 Single-Radius-Family、
Buttons / Chips / Notices / Dialogs / Inputs / Cards·Rows、§9 文案、Deletion-Cost Rule；清单 `design/components-2026-11-13/inventory.md`；
前几轮 `migrate-*/README.md` 的「没换的」「要 Owner 定的」。

基线：HEAD `69b6c32ac`（开工时工作区干净）。换前图在这个提交的 `git worktree` 里拍，换后图在当前工作区拍，两边同一个脚本、同一份数据。

## 一览

| 项 | 做到哪儿 |
| --- | --- |
| 1. 三处 `window.confirm` | 全做。详情页删题组 → `Dialog tone="alert"`；听写两处不是删除 → `Dialog tone="dialog"`。判断见第一节 |
| 2. 练字选词框点遮罩 | 做了，点遮罩不再关（实测） |
| 3. 焦点落空 | 写成共用规则 `shared-ui/focusAfterRemoval.ts`，接到个人空间删文件、作废 Agent 口令、详情页删题组、听写打印确认四处。草稿卷「移除」（不经确认框）没做，见第三节末 |
| 4. Notice | 换了 7 处（个人空间 3、详情页 2、相似题 / 相似篇章出错行 3 处共用写法、整卷页导出出错 2、Agent 口令 2）；没换的逐条列了理由 |
| 5. 胶囊动作键 | 草稿丸、详情页「展开卷面」、A3「建议前置分页」、学生扫码听写「重播本题」改 8px；登录键属品牌页例外不动；App.css 没人用的 999px 规则删了 16 条 |
| 6. 无障碍 | 「保存中」5.09:1、「保存失败」5.10:1；点击区域 4 处放大（1 处到 22.5，见表）；「换篇」原来就一致（axe 0 处）；已选筛选补悬停 |
| 7. 截图脚本选择器 | `space-shots.mjs`、`decisions-a1-shots.mjs` 改了，没运行；另顺手改了 `decisions-d-shots.mjs` 的「重试」选择器（第四节） |

## 一、三处 `window.confirm`

| 位置 | 能不能恢复 | 有没有现成撤销 | 结论 |
| --- | --- | --- | --- |
| 详情页「更多操作 → 删除」题组（`App.tsx`，原来 `window.confirm` + 失败时 `window.alert`；不在草稿卷上，任务单写的「草稿卷删除题组」实际在详情页） | 不能：服务器上直接删，没有回收站，也没有恢复接口 | 没有 | 不可逆 → 具名确认框 `Dialog tone="alert"`（读屏 alertdialog、确认键危险字）。标题「删除「题组名」？」，说明照原句「题组会从题库和草稿卷里移除，不可恢复。」，确认键「删除题组」。删除中框不关、Esc 不关；删不掉时框不关，出错写在框里（Notice，字照原来「删除失败：…」） |
| 听写「生成扫码听写」超过 60 个去重词要拆份（`VocabularyDictationWorkbench.tsx`） | 不是删除 | — | Deletion-Cost Rule 管不到。照原意问一句再做 → `Dialog tone="dialog"`，标题「拆成 N 份听写」，说明照原句，确认键「生成 N 份听写」 |
| 听写「打印资料」超过 120 个原始词（同上） | 不是删除 | — | 同上，标题「打印 N 个原始词」，确认键「继续打印」。「另存为」走同一个框，确认键这一下算用户操作，选文件夹框照样能弹 |

三个框都把「开着」和「内容」分开存：关上时内容留着，退场 120ms 里标题不会闪成「删除「」？」「拆成 0 份」。

## 二、练字选词框点遮罩不关

`VocabularyHandwritingSelector.tsx` 去掉 `closeOnBackdrop`（Dialog 默认不因点遮罩关）。实测（`keys.json` `handwriting.afterBackdropClick`）：换前点左上角遮罩框关掉，换后框还在、焦点还在框里。
关框照旧用「取消」、右上角关闭键、Esc。

## 三、焦点落空：规则和落地

规则（`app/src/shared-ui/focusAfterRemoval.ts` 文件头，提案 · 单一来源）：确认以后，打开确认框的那个键跟着那一项一起没了，焦点按顺序落到第一个还在、能用的：

1. 列表里**下一项的同一个键**；
2. 没有下一项，**上一项的同一个键**；
3. 列表空了、或者前后都没有这个键，落到**列表的标题**（临时加 `tabindex="-1"`，焦点一离开就拿掉，Tab 不停在标题上）。

「哪一项」靠稳定 id（`data-*` 属性）认，不记 DOM 节点，列表重新取数、整块卸了再挂也找得回来。取消、Esc 一律回到打开它的键（Dialog 默认）。
没把它做进 Dialog 本身：Dialog 不知道「列表」「项」是什么，做进去要多三四个参数；现在是 Dialog 的 `returnFocus` 接这个函数，一行接上。

| 地方 | 怎么接 |
| --- | --- |
| 个人空间删文件 | 删之前记下计划；删完重新取数时不卸列表（`load(…, { keepList: true })`），取回来以后把焦点放到计划给的键。实测：删中间一项 → 下一项「更多操作」；删最后一项 → 上一项「更多操作」；删到空 → 标题「全部文件」。换前三种都落到 body |
| 作废 Agent 口令 | 作废后那一行还在，只是没了「作废口令」键：落到下一行 / 上一行的「作废口令」，都没有落到「Agent 口令」标题。（管理页没拍删后焦点，见「没测的」） |
| 详情页删题组 | 整页换了：落到回到的找题台的搜索框（换前 `window.confirm` 时实测也落在这里），搜索框不在或禁用时落到「题库取题流」那一块 |
| 听写「打印资料」确认 | 不是删除，但打开它的菜单项随菜单收起看不见了：确认或取消都回到「打印资料」那个 summary。换前（原生框）、换后第一版都落到 body，已修 |

没做的：

- **草稿卷「更多题组操作 → 移除」**：不经确认框（可恢复，即删 + 底部提示撤销，本来就合 Deletion-Cost Rule），但移除后焦点同样落到 body（换前换后都是，实测）。题组工具条是卷面重排以后才重新挂上的，要等卷面排好再放焦点，牵涉 `withLayoutSave` 那套等待，这一轮不动。建议下一轮：Menu 的 `onSelect(event, trigger)` 拿到 trigger 后用同一个 `planFocusAfterRemoval`（项 `.draft-group-actions`、键 `data-draft-tools-group-id`），在重排完成的回调里放焦点；放不了时落到左栏目录标题。
- 从听写页打开的「选择练字单词」没有 `returnFocus`（过生词页那边有），关上后焦点回到被收起的菜单项。原来就这样。
- 个人空间删除确认框的说明句用的是 `confirmTarget`，关上时置空，退场 120ms 里说明会变成「删除「」？…」。上一轮留下的，和本轮详情页、听写框同一个办法就能修（开关和内容分开），这一轮没碰那一处的结构。

## 四、提示行换 Notice

换了的（字一个没改；出错的读屏从没有角色变成 `role="alert"`，等待的变成 `role="status"`）：

| 位置 | 原来 | 现在 |
| --- | --- | --- |
| 个人空间顶上那一行（删除成功、下载失败等） | `<p class="my-space-message">` 一种样子 | Notice，分三种：出错 error、「原草稿卷已删除，PDF 仍可下载」info、「文件已删除。」success |
| 个人空间「正在读取个人空间…」 | 灰字 p | Notice waiting |
| 个人空间读取失败 | 红字 p | Notice error（灰字 + 图标，照 §5「只有没保存、会丢东西才上危险色」）；「重新加载」键不动 |
| 详情页「正在读取题组详情...」/ 读不到题组 | 虚线框（出错时珊瑚底红字） | Notice waiting / error |
| 相似题栏、相似篇章面板、草稿卷换篇栏的出错行（3 个文件，同一种写法）和「加载中…」 | 字一行、「重试」另起一行 | Notice error，「重试」用 Notice 行尾的键；加载中 Notice waiting |
| 整卷页导出 PDF / 读字体失败两行 | 红框红底 | Notice error，左右边距照旧 24 |
| Agent 口令「加载中…」/「口令列表没有加载出来。」+ 重试 | 手写 p + 键 | Notice waiting / error（action「重试」） |

没换的（各附理由和建议）：

- 卷面上的：`listening-player-error`（播放器在卷面上）、划词卡 `paper-selection-card-error` 6 处、句子分析卡。任务单说卷面上的不碰。
- 登录页 `login-error`：品牌页（DESIGN.md §1 登录页那一条），和登录键一起留在品牌时刻。
- 表单字段的出错：`EntryModal` 的 `form-error`、管理页 `admin-backfill-error` 3 处。这些是表单提交出错，归 Field 构件的出错行（§5 Inputs / Fields），不是页面提示行。建议下一轮随 Field 一起换。
- 整页状态：整卷页 `paper-browse-error`（整页 `<main>`）、听写工作区「正在读取学生与听写记录…」/「没有加载成功」（带 h1 和重新加载）、学生扫码听写 / 听音页的整页提示。这是页面级的空态 / 出错态，归 EmptyState，不是一行提示。
- 词汇页的几行：「这次合集超过 120 词，打印会自动分页；二维码听写仍按 60 词拆分。」（`dictation-volume-warning`）放进 Notice 会被截成一行，窄屏后半句看不见，等于改了意思，要么改短文案（要 Owner 点头）要么留着；认词页 `meaning-recall-error` ×2、过生词 `vocabulary-request-error`、练习页 `vocabulary-practice-audio-error`：这一轮没造出能拍的出错条件（每处变化都要前后对照图），留下一轮，写法和个人空间那几行一样。

## 五、胶囊动作键归 Button（8px）

DESIGN.md §5：胶囊只给标签类，动作键用 `--eqb-radius-control`（8）。

| 键 | 处理 |
| --- | --- |
| 草稿丸（浮在右下，`.eqb-button.basket-chip`） | 去掉 999，随 Button 8px。整页逐像素：首页、浏览页、详情页只有右下这一块变了 |
| 详情页「展开卷面 / 收起卷面」 | 原来手写按钮 + 999，换成 `Button tone="strong"` + 白底 e2（浮在卷面上），8px；悬停、焦点、按下归 button.css。居中改用 `translate`（Button 按下的缩放用 transform，原来的 `transform: translateX(-50%)` 会被盖掉） |
| A3「建议前置分页」 | 只改圆角到 8px，和 A4 那一枚 `.draft-group-suggestion`（已经是 8）一样。没换成 Button：它是「提议」的样子（桌色底、带下划线的次要灰字、11.5 号），Button 没有这一种语气；硬套会变成普通键。见要 Owner 定的第 2 条 |
| 学生扫码听写「重播本题」 | 圆角 8px（底透明，只在悬停底色和键盘焦点环上看得出） |
| 登录键 `.login-submit` | **不动**。登录页是品牌页，DESIGN.md §1 登录那条写了品牌例外（15px 字、品牌底色）；前一轮 README 也写了「品牌时刻，不并进构件」。但例外里没逐字写到胶囊和它自己的影子，见要 Owner 定的第 1 条 |

全站其他还剩的 999px（逐条看过，都不是动作键或不该动）：

- 标签 / 开关 / 进度条：`shared-ui/chip.css`、`field.css` 的胶囊（标签类，本来就该是胶囊）；首页思考模式开关（开关）；首页骨架占位胶囊；学生听写 / 听音页进度条、过生词页 `progress`；划词卡滚动条。
- 卷面和讲解区里的：听力播放器（触发圆键、播放、行、倍速）、讲解面板 `pi-*` 的徽标、写作卡片的小圆点、七选五「跳到选项」小签（`pi-seven-option-jump-chip`，点了跳转，是动作，但在讲解卷面里，按「卷面上的不碰」留着，下一轮讲解区收尾时一起看）。

`App.css` 里确认没人用的 999px 规则删了 16 条（全仓 `.tsx/.ts/.mjs` 里搜不到这些类名，只剩 CSS 和注释提到）：
`.version-toggle`（独立那条；和别的选择器写在一起的那条还在，`verify-classic-retire-3` 的哨兵仍过）、`.source-line span`、`.detail-facts span`、`.question-topline span`、
`.difficulty-profile-score em`、`.synonym-difficulty-flags span / strong`、`.analysis-disclosure-toggle`、`.paper-meta span`、`.saved-paper-heading strong`、`.bundle-status`、
`.draft-answer-badge / .draft-option-count`、`.calibration-reasons span`、`.difficulty-review-stats span`、`.review-q-flag`、`.calibration-report-chips span`、`.calibration-report-watch-item em`。
App.css 里剩 3 处 999 / pill：两张滑动列表的 `--fh-radius`（胶囊列表）、思考模式开关。

另外被这次替换掉的旧 CSS：`App.css .detail-message`（三条）、`paperBrowsePage.css .similar-rail-error`（竖排那条）和 `.paper-browse-export-error` 的红框样子、
`adminWorkbench.css .agent-token-load-failed`、`MySpacePage.css .my-space-empty / .my-space-error` 的字色字号、`QuestionGroupDetailView.css .peek-expand` 的手写样子。

## 六、无障碍

| 项 | 换前 | 换后 |
| --- | --- | --- |
| 草稿卷「保存中」字色 | `--eqb-color-warning` #E8901A，对桌面底 2.27:1 | `--eqb-color-warning-text` #965A08，5.09:1（现有 token，没加颜色） |
| 草稿卷「保存失败」字色（顺手） | `--eqb-color-danger` #DC2626，4.40:1 | `--eqb-color-danger-text` #CA2121，5.10:1 |
| 「换篇」读屏名 | 原来就是「换篇：换一篇相似篇章」/「换篇：收起」（Owner 2026-11-14 决定 #5 已改），axe `label-content-name-mismatch` 0 处 | 不用改；清单里那 18 处是那次之前数的 |
| 首页已选筛选悬停（`.concierge-active-filter-chip`） | 静止和悬停都是桌色 #E6EDF0，悬停看不出 | 悬停深一档 `--eqb-color-border` #DCE6EB（Button「垫在桌色上的键悬停深一档」那一级），墨字对它 11.5:1 |

点击区域（实测：从中心往四边走，`elementFromPoint` 还落在这个键上就算；横向量到 80 为止）：

| 键（清单号） | 看得见的大小 | 换前能点 | 换后能点 | 做法 |
| --- | --- | --- | --- | --- |
| 顶栏卷名（可改名，button-08） | 宽 × 18 | 宽 × 18 | 宽 × 24 | 上下各 3px 内边距 + 等量负外边距，字不动；外面裹着 `overflow: hidden`，伪元素会被裁，所以不用 `::after`。键盘焦点框跟着高 6px（见对照图） |
| 重排建议「撤销」（button-14） | 32 × 22.6 | 32 × 23 | 32 × 24 | 透明 `::after` 外扩（`inset: min(0px, calc(50% - 12px))`，够大的那一边算出 0） |
| 首页搜索结果行首小箭头（button-21） | 22 × 22 | 22 × 22 | 24 × 24 | 同上 |
| 思考模式开关（field-04） | 32 × 18 | 32 × 18 | 32 × 22.5 | 同上；上面贴着搜索框、下面贴着「筛选」键，外扩被它们盖住各 0.75px，差 1.5px 到 24。要到 24 得把那一行拉开，会动首页大搜索框那一块，按规矩不动。点开关旁边的「思考模式」字照样切换（`<label>` 包着） |
| 详情页「返回找题」（button-32） | 90 × 28 | 已经是 Button 小号 28 | 不变 | 不用改；清单里 18 高是换成 Button 之前量的 |

24px 没有 token，记进 `docs/design-gaps.md`（候选 `--eqb-target-min`）。

## 七、截图脚本里的旧选择器

- `scripts/component-inventory/space-shots.mjs`、`decisions-a1-shots.mjs`：`.my-space-confirm-actions` → `.my-space-confirm-dialog .eqb-dialog-actions > button`（没运行）。
- `scripts/component-inventory/decisions-d-shots.mjs`：相似篇章「重试」从 `.similar-rail-error .similar-btn` → `.similar-rail-error .eqb-notice-action`（第四节换 Notice 带出来的，没运行）。

## 改了的 verify / smoke 断言（都没运行）

- `scripts/verify-error-copy-mainline.mjs`：个人空间顶上那一行的源码正则从 `<p className="my-space-message"` 改成 `<Notice kind={message.kind} className="my-space-message"`，仍查「只有一处、出错态不画」。（这个脚本只读源码，用 node 单独核过正则能匹配。）
- `scripts/verify-pa-only-add-detail-consistency.mjs`：删题组原来等浏览器原生框（`page.once('dialog')`），改成等 `getByRole('alertdialog', { name: /^删除「.*」？$/ })`、看得见「删除题组」键，再点「取消」等框关上。
- 查过不用改的：`verify-a3-imposition`（`.similar-rail-error` 和名为「重试」的键都还在；`.draft-seam-suggestion` 还在）、`verify-draft-workbench-visual-unify`（保存状态那条正则不受影响）、`verify-concierge-desk`（行首小箭头仍有 `aria-expanded`）、`verify-classic-retire-3`（`.version-toggle` 哨兵还在）、`detail-shots.mjs`（`.peek-expand` 还在）、`verify-paper-canonical-continuation-writing-rendered-behavior`（`.paper-browse-lecture-empty` 那几行没动）。
- 早就过时、这次没改的：`smoke-c8-my-space.mjs` 还在等原生 `dialog` 事件、找 `.my-space-artifact-actions`，是个人空间上一轮换 Dialog / 菜单时就过时了，不是这次带出来的。

## 取证

脚本：`scripts/component-inventory/finish-shots.mjs`（拍图、量、走键盘）、`finish-compare.mjs`（逐像素、拼对照图）。
测试站 `INVENTORY_PORT_OFFSET=68`，默认种子（paper-2026-i 四篇阅读；够用：详情、卷面、草稿卷、相似篇章都在这四篇上），词汇听写页的词表、三个词组、一份分享听写由脚本自己种。
详情页卷面、相似篇章要的 `canonicalPaperId` / `paperSurfaceHref` 和卷子资产投影，照 `detail-shots.mjs` 的办法在接口上补。个人空间列表、删除接口拦截（不真出 PDF）。
换前在 HEAD 的 worktree 里跑同一个脚本。A3「建议前置分页」要等卷面排好、位置稳住才拍得到，第一遍两边都没拍到，用 `FINISH_ONLY=draft,draft-a3` 补拍并入。

对照拼版（左换前、右换后，1440 和 390 各一行）：

- `1-confirm-dialogs.png`：三处确认框（换前是浏览器原生框，截不到图，写的是原生框的原话）；删题组以后回到的页面。
- `2-handwriting-backdrop.png`：点遮罩以后。
- `3-space-focus-notice.png`：个人空间删除确认、删后（成功提示）、读取失败。
- `4-notices.png`：详情页读不到题组、相似篇章出错行。
- `5-pill-to-button.png`：草稿丸三页、「展开卷面」静止 / 悬停 / 焦点 / 收起、A3「建议前置分页」、「重播本题」。
- `6-a11y.png`：保存中、保存失败、顶栏卷名静止 / 焦点、撤销重排、行首小箭头、思考模式开关、已选筛选静止 / 悬停。
- `7-pages-changed.png`：整页逐像素有差别的几页。
- `diff.json`：整页逐像素结果、两边 `keys.json` 全文。

### 没换的页面逐像素

整页（视口，鼠标停在角落），1440 和 390 各一张，共 26 对：

- **一样（0 像素）**：登录、个人空间、整卷页、词汇本、过生词、练习、听写工作区、学生扫码听写 —— 各两个宽度。
- **只有草稿丸那一块不同**（预期，圆角 999 → 8）：首页、浏览页、详情页，两个宽度。差别范围都在右下草稿丸的框里（1440：x 1255–1420，y 837–882；390：x 205–370）。**首页大搜索框那一块 0 像素差。**
- **管理页**：6 个像素，色差 1（「名称」输入框左上圆角的抗锯齿，两个宽度、两次整跑都是这 6 个），框和字的位置、颜色都没动。这一页的改动（Agent 口令「加载中…」换 Notice）截图时已经过去了；原因没查到，记在这里。

### 键盘和读屏实测

| 场景 | 换前 | 换后 |
| --- | --- | --- |
| 删题组：打开 | 浏览器原生框（读屏念「删除「Reading D」？题组会…」，焦点在浏览器框里） | alertdialog，名「删除「Reading D」？」，说明「题组会从题库和草稿卷里移除，不可恢复。」，模态，焦点在「取消」，Tab 1 下到「删除题组」 |
| 删题组：Esc / 取消 | 回到「更多操作」 | 回到「更多操作」 |
| 删题组：删掉以后 | 回到找题台，焦点在搜索框 | 同左 |
| 拆份确认 | 原生框 | dialog「拆成 3 份听写」，说明照原句，焦点在「取消」；Esc 回到「生成扫码听写」 |
| 打印确认 | 原生框；关上后焦点在 body | dialog「打印 150 个原始词」，焦点在「取消」；Esc 回到「打印资料」 |
| 练字选词框点遮罩 | 框关了 | 框还在，焦点还在框里 |
| 个人空间删中间一项 | 框：alertdialog「删除草稿卷 PDF」，焦点「取消」，Tab 1 下到「删除 PDF」；删后 body | 框同左；删后「更多操作：期末冲刺卷」（下一项）；提示「文件已删除。」`role="status"` |
| 个人空间删最后一项 | body | 「更多操作：一卷阅读 A 篇练习」（上一项） |
| 个人空间删到空 | body | 标题「全部文件」 |
| 个人空间 Esc | 回到「更多操作：期中复习卷」 | 同左 |
| 草稿卷移除题组 → 底部提示撤销 | 提示「题组已移出 撤销」`role="status"` polite；移除后焦点 body；Tab 5 下到「撤销」；撤销后焦点回「更多题组操作」 | 同左（这一轮没动，见第三节「没做的」） |
| 详情页读不到题组 | 无角色的 p | `role="alert"` |
| 相似篇章出错 | 无角色 | `role="alert"`，「重试」在同一行 |
| 「换篇」 | 名「换篇：换一篇相似篇章」，axe 0 处 | 同左 |
| 放大后的点击区域 | 见第六节表 | 见第六节表 |

没测的：Agent 口令作废后的焦点（管理页没造口令数据），Toast 构件本身上一轮已测（`migrate-row-toast/`）。草稿卷移除那一行的换后数据来自 390 宽和前一遍整跑的 1440 宽（最后一遍 1440 这一步等提示超时，`diff.json` 的 `keysAfter.missing` 里有记）。读屏是按无障碍树（role、名字、说明、live 区）实测，没开真读屏软件。

## 缺的变量

- 最小点击区域 24（`docs/design-gaps.md` 2026-11-15 那条，候选 `--eqb-target-min`）。

## 要 Owner 定的

1. **登录键的胶囊和自带影子算不算品牌例外。** DESIGN.md §1 登录那条写了 15px 字、品牌底色，没写圆角和影子。建议：写明「登录键整只是品牌例外（胶囊、影子都算）」，现状不动；要是不算，改成 8px、影子去掉，只动这一个键。
2. **A3「建议前置分页」（和 A4 那只）要不要一个「提议」语气的 Button。** 现在 A3 只把圆角改成 8，样子还是手写的（桌色底、下划线次要灰字、11.5 号字，不在字号阶梯上）。建议：Button 加一种 `proposal` 语气（桌色底、下划线次要灰字、12 号），A3、A4 两只一起换；不加的话现状就是终点。

## 协调人复核（2026-11-15）

- 看过 1–7 号对比图。确认框、提示行、胶囊改 8 圆角、无障碍几项都合格。
- 退回改了一处：听写页两个确认框（拆份、打印）的键是 16px，比别处对话框的 13px 键大一号。原因是听写页的 `.dictation-workbench button { font: inherit }`（权重 (0,1,1)）盖过了共用键的 `.eqb-button`（(0,1,0)），而确认框挂在这个页面里面。
  - 改法：`vocabularyDictationWorkbench.css` 里把这两条重置包进 `:where(.dictation-workbench)`，权重降到 (0,0,1)。页面自己的键照样继承页面字体，共用构件不再被盖。
  - 已重拍（`FINISH_ONLY=dictation,detail-delete`，端口偏移 69，图在 `.scratch/component-inventory/finish-recheck/`，不入库）：拆份、打印两个框的键和删题组框的键一样大。
- 留着的缺口照上面「没做完」：草稿卷移出题组后的焦点、听写打开的手写选择器没有回焦点的目标、个人空间删除框关闭时说明字闪一下、生词页的提示行、思考模式开关只到 22.5px 高。
