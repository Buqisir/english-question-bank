# 等待构件迁移 · 第六轮（2026-11-15，未 commit）

接第五轮（`../migrate-waiting-5/`）。这一轮清 DESIGN.md §5 Waiting「还没做」剩下的五件：过词进度上面一栏、扫码启动壳最短停留、等待的三个数收成 token、一行「加载中」的列表换灰行、补拍第五轮没拍到的两格。

- 没 commit，没 push，没用 git stash，没派子代理，没跑 verify-* / smoke-*。
- `npx tsc -p tsconfig.app.json --noEmit` 通过。`pnpm build` 通过，入口 JS 189.79KB。
- lint：63 错 / 12 警，和改之前 HEAD 一样。

文件：

| 文件 | 内容 |
|---|---|
| `compare-review.jpg` | 过词进度 150ms / 1200ms / 读完 |
| `compare-lists.jpg` | 个人空间、Agent 口令、讲评栏配相似、首页相似篇章、换篇抽屉：1200ms 和数据到了 |
| `compare-extra.jpg` | 补拍：题组详情（1200ms、数据到了），草稿卷打开（150ms、1200ms），扫码听写 390 宽交接后 |
| `diff.json` | `summary` 是两边量到的主要数字，`steps` 是全部原始数据 |

总共约 350KB。脚本：`scripts/component-inventory/waiting6-shots.mjs`（截图）、`waiting6-compare.mjs`（拼图）。端口偏移 82，只截元素。换前、换后各截一次，没有补截，两边 `missing` 都是空的。会真写数据的请求最后都 abort，没有放行。只有一处写数据：草稿卷那步往临时库加了三篇（`addDraftItems`，写在临时 DB 里）。

## 一、清点表

| # | 位置 | 原来的样子 | 换成 | 做没做 |
|---|---|---|---|---|
| 1 | `features/vocabulary-review/VocabularyReviewPage.tsx` 右上「课程 / 学生」一栏 | 等的时候不画；数据到了才挂上，下面的开始页被往下推 119px | `HeadingActionsSkeleton`：用真栏的 class（`vocabulary-heading-actions`），画这些灰块：单词复习键、学生下拉（36 高）、新建学生、只有多于一门课时才画的课程切换、总进度（字、6 高胶囊条、查看/调整）。和下面开始页灰块共用 `progressOpeningPhase`。门槛内这一栏仍然占位置，但用 `visibility:hidden` 藏起来，300ms 时和下面一起出现，读完一起换掉。读出错时不画 | 做了。下移从 119px 降到 2px（见二） |
| 2 | 扫码启动壳「出了至少留 500ms」 | 第五轮只做了前半：页面代码到了，接着出灰块。数据一到就把灰块撤了，最短一次只留了 282ms | `useDelayedBusy(pending, { pendingSince })`：听写页把 `bootStartedAt`（main.tsx 一开始记下的时间）传进去。hook 从这个时间算 300ms 门槛。如果已经过了门槛，开头就是 waiting，并且把 `shownAt` 记成 `since + 300`，也就是启动壳灰块真正出现的时刻。500ms 最短停留从那一刻起算，包括启动壳在屏上的那一段。页面代码到了以后不重新计时，所以不会让灰块再多停一次 | 做了。282ms 变成 486ms（rAF 逐帧采样，误差一帧以内，目测就是 500ms） |
| 3 | 等待的三个数 | `index.css` 启动壳门槛 `300ms`、`main.tsx` `BOOT_SKELETON_CYCLE_MS = 1800`、`waiting.css` `--eqb-skeleton-cycle: 1800ms`、`useDelayedBusy.ts` 里的 300 / 500 | `tokens.css :root` 加了 `--wait-show-delay: 300ms`、`--wait-min-visible: 500ms`、`--wait-breathe-cycle: 1800ms`。CSS 直接用 `var()`。JS（`useDelayedBusy`、`main.tsx`）用 `readMotionMs` 读这几个变量，读不到时门槛按 0 算、相位不对齐，不写数字兜底。`WAIT_SHOW_DELAY_MS` / `WAIT_MIN_VISIBLE_MS` 两个导出删了（全仓 grep 过，除了本文件没有别人用） | 做了。行为不变：截图时 CSS 读出 300 / 500 / 1800，启动壳门槛动画 delay 0.3s、灰块 1.8s，和换前一样。`docs/design-gaps.md` 那条已标「已收编」 |
| 4a | `features/my-space/MySpacePage.tsx` 个人空间 | 一行 Notice「正在读取…」 | `MySpaceListSkeleton`：一个月份头加 3 行 `my-space-file-row`（图标、标题、一行小字、三个动作的位置）；上面标题旁的「N 份」也换成灰块 | 做了 |
| 4b | `features/admin/AgentTokens.tsx` Agent 口令 | 一行 Notice | `AgentTokenListSkeleton`：3 行 li（名称、前缀、时间、右边撤销键） | 做了 |
| 4c | `features/paper-browse/SimilarQuestionsRailView.tsx` 讲评栏「配相似 / 相似篇章」 | 一行「配相似加载中」 | 种子行两行灰块，加上 3 张灰卡（新文件 `features/similar-passages/SimilarCardSkeletons.tsx`，`variant="rail"`，有勾选框） | 做了 |
| 4d | `features/similar-passages/SimilarPassagesPanel.tsx` 首页、详情页的相似篇章 | 一行 Notice | 3 张灰卡（`variant="panel"`，右边有一个键位） | 做了 |
| 4e | `features/draft-paper/DraftPaperRail.tsx` 换篇抽屉 | 一行 Notice | 3 张灰卡（`variant="drawer"`，出处折两行，两个键位，理由小签在卡底） | 做了 |
| 5 | 补拍：题组详情「数据到了」、草稿卷打开 1200ms | 第五轮没拍到 | 题组详情数据到了：换前换后都拍到。草稿卷：等待区（`main.draft-workbench-shell[aria-busy]`）一挂上就开始计时，150ms 和 1200ms 两边都拍到，44 个灰块全部可见 | 做了 |

4a–4e 都按同一个做法：

- `pending || phase === 'waiting'` 时只画灰块，真内容（包括出错和空状态）都等灰块走了才挂上。
- 门槛 300ms，出现后至少留 500ms。
- 读屏只读一句（`SkeletonGate` 的 `role=status` 加一句 visually-hidden）。
- 现有的 `useRowReveal` 加了 `!listWaiting` 条件，灰块撤掉、真行挂上的那一拍才开始依次淡入。

`Skeleton` 新增 `inline` 属性，对应 `waiting.css` 里的 `.eqb-skeleton[data-inline]`，用来把灰块放在一行字的位置。

## 二、量到的数（1440 宽，diff.json `summary`）

| 位置 | 换前 | 换后 |
|---|---|---|
| 过词进度：开始页 | 等待 y138，读完 y257，**下移 119** | 等待 y248，读完 y250，**下移 2** |
| 过词进度：开始键 | 401 → 521（+120） | 511 → 514（+3） |
| 过词进度：右上一栏 | 等待时没有，读完 y68，高 171 | 等待 y61 高 169，读完 y61 高 171（0） |
| 个人空间：第一行 | 只有 Notice，真行 y260 高 70 | 灰行 y257 高 70，真行 y260（+3）。月份头 234 → 235 |
| Agent 口令：第一行 | 只有 Notice，真行 y360 高 64 | 灰行 y360 高 60，真行 y360（0，行高少 4） |
| 讲评栏配相似：第一张卡 | 只有 Notice，真卡 y117 高 87 | 灰卡 y113 高 84，真卡 y117（+4） |
| 首页相似篇章：第一张卡 | 只有 Notice，真卡 y461 高 87 | 灰卡 y461 高 84（0，卡高少 3） |
| 换篇抽屉：第一张卡 | 只有 Notice，真卡 y206 高 116 | 灰卡 y206 高 116（0） |
| 扫码听写：灰块在屏上 | 282ms | 486ms（逐帧采样） |
| 草稿卷打开 150ms | 44 块可见 | 44 块可见 |

- 过词进度 150ms 那格：换前 13 个灰块已经可见；换后上下都还藏着（右上一栏 `visibility:hidden` 占位，开始页灰块还没画）。换前那次截图的计时起点晚于读取开始，所以 150ms 时已经过了门槛。这是截图计时的差别，代码里的门槛没变（目测）。
- 过词进度 1200ms：左边标题、说明从占位字（一行）换成真字（两行），h1 往上挪了约 14px（目测）。下面的开始页不动。
- 讲评栏 +4、灰卡比真卡矮 3：真卡标题 14px 字的行高比 12 高的 inline 灰块多出约 1px，三行加起来少约 3px。目测看不出跳。

## 三、没拍到

没有，两边 `missing` 都是空的。

## 四、没做 / 留着

- **草稿卷「正在读取文件夹」（存 PDF 对话框里）、听写工作台「正在读取学生与听写记录…」**：这两处还是一行字等待，不在这次的范围里。
- **题组详情 hero 灰块比真的高 43px**：灰块 206.6，真的 163.8，纸往上挪 43px（311 → 268），换前换后一样。原因是灰块画了两行摘要和三个标签，而截图用的数据没有摘要。这和数据有关，这一轮没动。
- **灰块里的字面尺寸**：过词进度右上灰键位的高 36 / 28，是照 `.eqb-field` select 和小号键的高度抄的字面量，没有对应的 token。
- **旧的行内灰块规则**：各页之前各写了一条 `:is(h2, p, …) > .eqb-skeleton`，这次只新加了 `inline` 属性，旧规则没动。
- **启动壳门槛的 1ms 空动画**：`public-vocabulary-boot-reveal` 的 `0.001s` 还是字面量。它只是为了让 `animation-delay` 起作用，不是等待时长。
- **讲评栏种子行**：默认按折两行画。种子行短的时候，一行就放下了，灰块那一块会比真的高约 20px（目测）。
- **启动壳出现时刻和 hook 算的 `since + 300`**：CSS 动画从首帧绘制开始算，hook 从 `bootStartedAt` 算，两者相差不到一帧。

## 五、看到的问题

- `docs/cuts/similar-passages-entry/qa/dp2-similar-passages-entry.mjs:241` 等的是 `.paper-browse-lecture-empty` 里不再有「加载中」。第五轮换成 Notice 后，这个条件就已经是一开始就成立的，这次换成灰块也一样。它不是 verify 脚本，这次没改。
- 个人空间删了一条没人用的旧规则 `.eqb-notice.my-space-empty`（grep 确认整个仓库没有人用这个类）。

## 六、verify 脚本

逐个查了读到这次改动文件的断言，没有因为这次改动失效的，所以一处没改，也没有运行：

- `verify-architecture-housekeeping`：index.css 仍以 tokens import 开头，tokens.css 的核心变量都在。
- `verify-launch-deploy`：main.tsx 新加的静态 import 是 `react-dom`、`./shared-ui/waitDotsMotion.ts`，不在禁止静态导入的名单里。
- `verify-error-copy-mainline`：个人空间出错块（`loadState === 'error' && (`）和 `my-space-message` 那行都还在。
- `verify-my-space-shelf`：`my-space-file-row`、`my-space-month-group`、`gapClick={false}` 计数（≥3，只多不少）都满足；没有新加 hex。
- `verify-vocabulary-rendered-behavior:730` 的 `.vocabulary-heading-actions`：那时数据早就到了，灰栏已经撤掉，只会匹配到一个。
- `verify-a3-imposition:649` 等 `.similar-rail-error`：灰块撤掉后错误照常出现，最多晚 500ms，等待时间够。
- `verify-paper-browse` 的 `.similar-rcard-title` 字号断言没受影响。
- `verify-concierge-desk:918` 的正则仍能匹配。

## 七、DESIGN.md 建议改（协调人改）

- §5 Waiting「还没做」：过词进度上面一栏、启动壳最短停留、三个数收 token、相似 / 个人空间 / 口令列表灰行这几条可以划掉。
- §5 Waiting 写明三个数的出处：`--wait-show-delay` 300ms、`--wait-min-visible` 500ms、`--wait-breathe-cycle` 1800ms（tokens.css）。
- §5 Waiting 加一句：「列表在等时画 3 行灰行，行高和真行一样；灰块走了、真行挂上时再演依次淡入。」
- §5 Waiting 加一句：「换页前就开始等的（扫码启动壳），最短停留从灰块第一次出现时算，换页不重新计时。」

## 八、要 Owner 定的

1. **token 名字**：用了 `--wait-*`，和 `--motion-*` 分开，因为这三个数是「等多久」，不是「动多快」。建议就用这个名字。
2. **灰行数**：现在固定画 3 行。如果用户上次看到的只有 1–2 行，数据到了会往上缩。建议先保持 3 行，以后有需要再记住上次的行数。
3. **题组详情 hero 的 43px**：建议灰块只画一行摘要、不画标签，让没摘要的题组跳得少一点；有摘要的会往下推约 20px（目测）。要不要改，请 Owner 定。

## 协调人复核

2026-11-15，看过三张对照图：

- **过词进度.** 上面一栏灰块和真页面对得上，数据到了不跳，好。
- **列表灰行.** 五处从一行「加载中」变成三行轮廓，和真行同位，灰行撤掉后真行淡入，好。讲评栏、个人空间差 3–4px，看不出。
- **token.** `--wait-*` 三个名字照申的建议先用，标提案。灰行固定 3 行先保持。
- **题组详情灰块高 43px** 交 Owner：只画一行摘要、不画标签，没摘要的题组跳得少，有摘要的会往下推约 20px（目测）。
- DESIGN.md §5 Waiting 已补第六轮已做、token、还没做。
