# 等待构件迁移 · 第四轮（2026-11-15，午）

接第二轮（`../migrate-waiting-2/`）、第三轮（`../migrate-waiting-3/`）。Owner 2026-11-15「把这个都换了」：剩下的等待样子换成构件。
没 commit、没 push、没用 git stash；没跑 verify-* / smoke-*。`tsc -p tsconfig.app.json` 过，`pnpm build` 过，
lint 65 错 / 12 警（和 HEAD 一样；改到的文件里报的全是原来就有的）。

文件：`compare-keys.jpg`（键和慢提示）、`compare-pages-1.jpg`（整卷页、单词复习）、`compare-pages-2.jpg`（草稿卷、听写）、
`compare-rows.jpg`（列表淡入）、`diff.json`（两边 keys.json 里量到的数并排），共约 420KB。
脚本：`scripts/component-inventory/waiting4-shots.mjs`（拍）、`waiting4-compare.mjs`（拼）。

## 一、清点表

「行号」是改完以后的位置。「换没换」：换 / 留。

### 1. 键在等时字不换（Button busy）

| 位置 | 原样子 | 换成 | 换没换 | 理由 |
|---|---|---|---|---|
| `features/paper-browse/PaperReviewControls.tsx:128` 整卷页「复制试卷信息」 | 复制中键上换字「复制中…」、整键 `disabled`（键从 102 缩到 74.8 宽） | `busy={busy}`，字不换，所以点在正中；没准备好（线程信息没回来）仍是 `disabled` | 换 | Owner 点名。两件事分开：`disabled={!detail && !error}`、`busy={busy}` |
| `features/vocabulary-review/VocabularyReviewPage.tsx:1354` 过生词「下载」（弹出菜单的键） | 生成中换字「正在生成…」、整键禁用 | `busy` + `iconShowsBusy`（下载图标自己演），字固定「下载」 | 换 | 同一类：键上换字、变宽 |
| `features/vocabulary-review/VocabularyReviewPage.tsx:1961` 过生词侧栏「下载」 | 生成中换字「生成中…」、`disabled={!vocabularySet \|\| pdfDownloadBusy}` | `disabled={!vocabularySet}`、`busy` + `iconShowsBusy` | 换 | 同上；没有生词组是 disabled，在生成是 busy |

全站再 grep「中…」「中...」：剩下的都是注释里记的旧字，没有别的键还在换字。

### 2. 整页的等待改灰块

| 位置 | 原样子 | 换成 | 换没换 | 理由 |
|---|---|---|---|---|
| `features/paper-browse/PaperBrowsePage.tsx:550`（`PaperBrowseOpeningSkeleton`）、`:4233` 整卷页首屏 | 顶栏下面居中一行「正在打开整卷」 | 顶栏照常；左边目录面板（三段 5/2/2 项）、中间一张纸（同宽、同放大倍数、同页边距）、纸上卷头 + 两组卷面灰块；`main role=status aria-busy`，读屏一句「正在打开整卷」 | 换 | Owner 点名 |
| `features/vocabulary-practice/VocabularyPracticePage.tsx:42`、`:220` 单词复习（翻牌） | 居中卡片图标 +「正在准备卡片…」（560 高的一块） | 标题区、轮次小卡、练习方式、牌桌 20 张卡的灰块，用真页面同一套容器 class；读屏「正在准备卡片」 | 换 | Owner 点名 |
| `features/vocabulary-dictation/VocabularyDictationPage.tsx:56`、`:459` 听写（扫码进来的公开页） | 整页居中图标 +「正在准备听写」+ 一行说明 | 顶栏（獭石 / 自动听写）照常；题板、控制区（三个圆键、重播、两组设置、音量）的灰块；读屏「正在准备听写」 | 换 | Owner 点名 |
| `features/draft-paper/DraftPaperWorkbench.tsx:1645` 草稿卷「正在打开草稿卷」 | 桌面正中一行字 | 左边目录板（页数一行 + 三项）、中间一张 A4 灰块；读屏那一句留着（ux 走查脚本按字找） | 换 | Owner 说「同类也换」 |
| `features/draft-paper/DraftPaperWorkbench.tsx:2024` 草稿卷第一次分页「正在生成分页预览」 | 纸的位置正中一行字 | 同一张 A4 灰块，和打开时**同一段门槛**（`sheetPending` 把读草稿卷、第一次分页接成一段等，`:689`），读完草稿卷换上真目录时纸上灰块不断、不重新数 300ms；读屏那一句留着 | 换 | 不换的话会「灰块 → 一行字 → 卷面」来回跳 |
| `main.tsx:93` `PublicVocabularyBootShell`（扫码页代码块还没到时的「正在准备听写 / 词汇练习」） | 同上一行字 | — | 留 | 页面代码块之前的启动壳，不加载 shared-ui；在手机上一闪（at150 实测就是它）。要换得把灰块样子搬进启动壳，见「要 Owner 定」 |
| `features/vocabulary-notebook/VocabularyNotebookPage.tsx:203`「正在打开这张纸」 | 一行字 | — | 留 | 同类（整页在等一张纸），这轮没点名，纸的几何没量；建议下一轮 |
| `features/question-detail/QuestionGroupDetailView.tsx:502`「正在读取题组详情」 | 一行字 | — | 留 | 同上，下一轮 |
| `features/vocabulary-review/VocabularyReviewPage.tsx:1574`「正在读取过词进度」 | 一行字 | — | 留 | 同上，下一轮 |
| `features/my-space/MySpacePage.tsx:307`「正在读取个人空间」 | 一行字 | — | 留 | 列表区不是整页；只接了下面的淡入 |

门槛：四页都用 `useDelayedBusy`，300ms 内只有读屏一句、看不见东西；出了至少留 500ms，这期间真东西先不挂。
整卷页把「留 500ms」并进了 `loading`（`PaperBrowsePage.tsx:869` 上方：`loading = loadingAsset || openingPhase === 'waiting'`），
跟着 `loading` 的副作用（滚动定位、目录居中、放大倍数）和真卷面一起晚这一点，不会先跑。

样子：外框几何和真页面**同一条规则**（整卷页、草稿卷把灰块的 class 并进真页面的选择器；单词复习、听写直接用真页面的容器 class），
值只写一处。灰块自己的 class 只排灰块怎么坐进去（`paperBrowsePage.css` 末尾、`DraftPaperWorkbench.css` 末尾、
`vocabularyPracticePage.css`、`vocabularyDictationPage.css` 各一段）。整卷页、草稿卷没直接用真 class，是因为脚本和
`:has(.draft-paper-col)` 这类规则按真 class 找卷面。原来的 `.paper-browse-loading` 规则删了（grep 过没人用）。

### 3. 结果一行行淡入（useRowReveal）

`useRowReveal` 加了 `{ once: true }`：组件挂着期间只演第一次（「数据第一次到」），换文件夹、重读、返回列表都不演。减少动态效果不演（原来就有）。

| 位置 | 原样子 | 换成 | 换没换 | 理由 |
|---|---|---|---|---|
| `features/paper-browse/PaperBrowsePage.tsx:958` 整卷页卷面（`.paper-browse-zoom > *`：卷头、各组） | 一下全出 | 首屏灰块走了以后依次淡入，once | 换 | 题组列表就是纸上的块 |
| `features/my-space/MySpacePage.tsx:210` 个人空间（月份行 + 文件行） | 一下全出 | once | 换 | 换文件夹会 loading→loaded，所以 once |
| `features/vocabulary-notebook/VocabularyNotebookPage.tsx:142` 生词本收藏的卷 | 一下全出（之前也没有等待的样子） | once | 换 | |
| `features/paper-browse/SimilarQuestionsRailView.tsx:133` 讲评栏配相似 / 相似篇章 | 一下全出 | 每次请求回来演一次（不 once） | 换 | 换种子是新数据；勾选、加入不改 status，不演 |
| `features/similar-passages/SimilarPassagesPanel.tsx:70` 首页「相似篇章」 | 一下全出 | 同上 | 换 | |
| `features/draft-paper/DraftPaperRail.tsx:47` 草稿卷换篇抽屉 | 一下全出 | 同上 | 换 | |
| `features/admin/AgentTokens.tsx:41` 管理页 Agent 口令 | 一下全出 | once | 换 | 新建、作废、重试不演 |
| `concierge/ConciergeDesk.tsx:609` 首页浏览态冷启动（年份行 + 卷行） | 连库灰块走了一下全出 | 挂上时库还没连上（`?view=browse` 深链、刷新）才演，once | 换 | 从别处切回来时库已在手，不演；筛选、展开不演 |
| `concierge/ConciergeDesk.tsx:604` 首页找题结果 | 第二轮已接 | — | 已有 | |
| 首页备课桌各段（继续上次、最近上新） | 一下全出 | — | 留 | 数据和浏览态同一次连库；冷启动时整段（不是一行行）出来，接了会和「继续上次」卡片的入场叠在一起，没把握，下一轮 |
| 过生词页各列表、听写工作台列表、管理页 AdminWorkbench | — | — | 留 | 不是「等回来再出」的列表（数据跟着页面一起到，或是手动操作后刷新），按规矩不演 |

### 4. 等过 10 秒加一句（useSlowWait）「比平时慢，可以先去做别的」

| 位置 | 原样子 | 换成 | 换没换 | 理由 |
|---|---|---|---|---|
| `features/paper-browse/PaperBrowsePage.tsx:4299` 整卷页「下载 PDF」 | 键上图标自己演，没有字 | 过 10 秒在报错那一行的位置出一行 Notice「正在生成 PDF，比平时慢，可以先去做别的」 | 换 | 服务器出 PDF，常要好几秒到几十秒。代价：这一行出来会把卷面往下推一行（10 秒后才出，见「看到的问题」） |
| `concierge/ConciergeDesk.tsx:611` 首页 AI 找题 | 「正在为「…」找题」 | 过 10 秒接在同一行后面 | 换 | AI 找题常要十几秒 |
| `features/paper-browse/selection/SelectionOverlay.tsx:75` 划词翻译 | 「正在翻译」 | 过 10 秒变「正在翻译，比平时慢，可以先去做别的」 | 换 | 调模型，慢时十几秒 |
| `features/paper-browse/selection/sentence-analysis/SentenceAnalysisCard.tsx:58` 句子分析 | 「分析中」 | 过 10 秒变「分析中，比平时慢，可以先去做别的」（卡头右边，1440 宽放得下，实测 206 宽） | 换 | 同上 |
| `features/draft-paper/DraftPaperWorkbench.tsx:208` 草稿卷「正在生成 PDF」 | 第二轮已接 | — | 已有 | |
| 草稿卷「正在重排卷面」（`:1996`）、第一次分页 | — | — | 留 | 本地重排一次约 37 秒，**每次都**这么久，说「比平时慢」不对。见「要 Owner 定」 |
| 过生词「下载」（PDF） | 键上图标演 | — | 留 | 页面上没有一行可以放字的地方（6 个出错位置各在各处），要加得先定放哪，见「要 Owner 定」 |
| 听写工作台下载、个人空间下载、词典查词 | — | — | 留 | 下载是取现成文件、查词是本地词典，都是短动作 |
| 加入、保存、删除这类 | — | — | 留 | 短动作，规矩说不接 |

## 二、换前换后实量（`diff.json`，1440，目测的注明）

| | 换前 | 换后 |
|---|---|---|
| 复制键：没准备好 | 102 × 44，disabled | 102 × 44，disabled |
| 复制键：在复制 | 74.8 × 44，「复制中…」，disabled | 102 × 44，字隐去，所以点 16px 在正中，`aria-busy`，不是原生 disabled |
| 整卷页灰块的纸 / 真纸 | — | 灰块纸 x304 w832；真纸 x304 w832（同宽同位）。纵向：灰块 y72，真纸 y184——rig 里是 owner 身份，真卷面上面多了一排「检查这份卷」（112 高） |
| 整卷页目录灰块 / 真目录 | — | 灰块 y236 h428；真 y238 h425（差 2–3px） |
| 单词复习：标题区 | 换前是 560 高的一块居中字 | 灰块 87 高，真 93 高（轮次小卡差 6px），牌桌灰块和真牌桌都是 604 高；牌桌上沿灰块 y400、真 y409（390 宽：y493 / y503）。数据到了往下挪约 9px（目测看得出一点） |
| 听写题板 | 换前整页居中字 | 灰块和真题板都是 760 × 410（390 宽 362 × 360），完全重合 |
| 听写控制区 | — | 灰块 235，真 258（1440 宽，真页面「自定义 [输入框]」那一格折成两行）；390 宽 358 / 368。改了音量一行留够 20 以后差得更少（这一处改在拍图之后，scratch 量过，没重拍） |
| 草稿卷第一次分页 | 纸的位置居中一行字 | A4 灰块 794 宽，离纸栏顶 24，和分页出来的第一页同位 |
| 淡入（停在第 100ms） | 各列表 0 个动画、透明度全 1 | 相似篇章 0.90 / 0.65 / 0.14；整卷页 19 块 0.90 / 0.65 / …；个人空间、生词本、口令同样依次；时长 160、间隔 40、曲线 `--ease-hover`。减少动态效果：0 个动画 |
| 慢提示（等 11 秒） | 三处字不变 | 三处都加上了那一句 |

## 三、截图说明

- 换前、换后各跑一次（`INVENTORY_PORT_OFFSET=80`），没反复重跑。会写数据的请求最后 abort（复制剪贴板拦住；相似篇章、翻译、分析、找题的请求拦住）。
  草稿卷三组题是真写进测试库的（和第二轮一样，`addDraftItems`）。
- **没拍到**：
  - 换前：「复制试卷信息」第二次点（键是原生 disabled，点不上，超时）；听写两种宽度的「数据到了」（脚本假数据少包了一层 `vocabularySet`，换前跑完才改）。
  - 换后：「复制试卷信息」第二次点（超时，主要三张都拍到了；原因没追，不重跑）。
  - 换前换后都没拍到「草稿卷打开中」：脚本拦的是 `/api/draft-papers/current`，草稿卷带了编号走 `/api/draft-papers/:id`，没拦住，150 / 1200ms 拍到的已经是读完的页面。
    换后「读完」那张里纸上就是分页灰块（和打开时同一张 A4 灰块）。
- 「150ms」那一帧对登录后的页面其实在 3.7–4.4 秒（等区域出现时把应用启动也算进去了），不是门槛内的样子；草稿卷和听写的 150ms 是真的。
- 草稿卷灰块有一处在拍图之后改的：纸离纸栏顶 24 原来写成纸的外边距，会穿过 `.draft-a4-sheet` 把它整个往下推 24，改成外面一层的内边距（看上去位置一样）。

## 四、verify 脚本里改了的断言（没运行）

整卷页、草稿卷的灰块把 class 并进了真页面的选择器（`.paper-browse-zoom,\n.paper-browse-skeleton-sheet {`），按「选择器后面直接跟 `{`」写的正则会失效，照新写法加了可选的一段 `(?:,\s*\.xxx-skeleton-xxx)?`：

- `scripts/verify-paper-browse.mjs`：`.paper-browse-content` position relative；`.paper-browse-shell` 不设 max-width（两处）；第 47 条 `.paper-browse-content` 桌色、`.paper-browse-zoom` 底 / 影 / 页边（四处）；目录 `.paper-browse-rail` 88 宽、`.paper-browse-rail-panel`；第 73 条 `.paper-browse-zoom` zoom；讲评开关 1440 那条 `.paper-browse-shell` 三栏。共 11 处。
  `computeZoom` 那几条没动：公式抽成了 `paperScreenZoomForShellWidth`，`const raw = …`、`Math.floor(raw / 0.05) * 0.05`、`new ResizeObserver(computeZoom)` 都还在。
- `scripts/verify-c8-draft-paper-render-model.mjs:291`：`.draft-preview-desk` 桌色。
- `scripts/verify-draft-workbench-visual-unify.mjs:227`：`.draft-preview-desk` 没有 margin-top。

改完用 node 把这些正则对新 CSS 各试了一次，都匹配（只试正则，没跑脚本）。
旧轮次的拍图脚本 `scripts/component-inventory/waiting-shots.mjs:337`（按字找「正在生成分页预览」的 Notice）以后会拍不到，没改（是历史记录）。

## 五、看到的问题

1. **`.sr-only` 全站没定义**：`VocabularyPracticePage.tsx` 牌桌上方的 `<h2 className="sr-only">单词配对卡片</h2>` 一直是看得见的大标题（约 24px，换前截图里就有）。
   这轮没改（会改真页面的样子），灰块照现在的样子占了这一行。建议改成 `visually-hidden`（index.css 里有）。
2. 整卷页 owner 身份下，真卷面上面有一排「检查这份卷」（112 高），首屏灰块没留这一排，数据到了纸往下挪 112。没留是因为这一排要等线程信息，不一定出。
3. 整卷页「下载 PDF」过 10 秒的那一行出在卷面上方，会把卷面往下推一行（10 秒后才出）。顶栏放不下这句话。
4. 单词复习灰块的标题区比真的矮约 6px（轮次小卡），数据到了牌桌往下挪约 9px（目测看得出一点）。
5. 草稿卷带编号打开走 `/api/draft-papers/:id`，拍图脚本拦错了接口（见「没拍到」）。

## 六、建议协调人在 DESIGN.md 改的

- §5 Waiting「灰块」加一句：**整页在等**时，顶栏照常、内容区按真页面画（目录、纸、牌桌这些框用真页面同一套几何），读屏一句放在区域里（`role=status aria-busy`）；
  两段接着等的（读草稿卷 → 分页）算一段，走一个门槛，灰块中间不断。
- §5「真行依次淡入」加一句：**只在数据第一次到时演**（换文件夹、重读、返回列表不演；按请求取的候选列表每次请求回来演一次）。
- §5「超过 10 秒」加一句：**每次都很久的事（草稿卷重排约 37 秒）不说「比平时慢」**，等 Owner 定换什么话。
- Shadow Vocabulary · Sheet 纸面：三处字面量（`.paper-browse-zoom`、`.preview-page`、草稿卷 A4 灰块），建议收成 token（已登记 `docs/design-gaps.md`）。

## 七、要 Owner 定的（带建议）

1. 草稿卷重排（约 37 秒、每次都这么久）要不要多一句？建议：不说「比平时慢」，10 秒后改成「正在重排卷面，大约要半分钟，旧卷面先留着」。
2. 过生词「下载」等很久时，字放哪？建议：放在「下载」键下面、和出错同一个位置的一行 Notice。
3. 扫码听写的启动壳（`main.tsx` `PublicVocabularyBootShell`）要不要也画灰块？建议：要，把听写页灰块的样子挪进启动壳（只用 CSS，不加载 shared-ui），手机上就不会「一行字 → 灰块」。
4. 「正在打开这张纸」（生词本）、「正在读取题组详情」、「正在读取过词进度」三处整页等待，建议下一轮一起换灰块。
5. 牌桌上方那个看得见的「单词配对卡片」（`.sr-only` 没定义）：建议藏起来（改 `visually-hidden`）。

## 协调人复核


2026-11-15，看过四张对照图：

- **整页灰块.** 整卷页原来只有一行小字、满屏空白，现在目录 + 纸的轮廓，和真卷面同位同宽，好；单词复习牌桌、听写题板的轮廓也对得上。单词复习数据到了下挪约 9px（目测），听写 390 宽 150ms 那格还是扫码启动壳，两样排进第五轮。
- **键.** 复制键宽不再缩，好。
- **听写启动壳** 上是方块「EQ」字标，不是獭石的标志；它在 main.tsx 页面代码之前。扫码启动壳排进第五轮时一起看能不能换成现行标志（只换图，不画新图）。
- **DESIGN.md §5 Waiting 已补** 第四轮已做和第五轮要做的。
