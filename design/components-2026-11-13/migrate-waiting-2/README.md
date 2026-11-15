# 等待构件迁移 · 第二轮（2026-11-15，卯）

接第一轮（`../migrate-waiting/`）。这一轮把「小字旁的所以点」「整块加载中」「换字的键」「真行淡入」「慢了的提示」收到共享构件上。
没 commit、没 push；没跑 verify-* / smoke-*。`tsc -p tsconfig.app.json` 过，`pnpm build` 过，lint 65 错 / 12 警（HEAD 66 / 12）。

文件：`compare-1.png`、`compare-2.png`（前后对照，元素截图拼的）、`diff.json`（前后实量数），共约 348KB。

## 1. 小字旁的所以点：14px，和字之间不另加间距

- 做法：`WaitDots` / `InlineWaitDots` 加 `size?: 'md' | 'sm'`，`sm` 渲染 `data-size="sm"`，`waiting.css` 里 `.eqb-wait-dots[data-size='sm']` 把 `--eqb-wait-dots-size` 改成 14px。
  调用处显式写 `size="sm"`，不靠父级字号猜：字号是调用处知道的事，构件不去量。
- 接上的四处（字都是 12–13px）：句子分析「分析中」、划词「正在翻译」、草稿卷顶栏「保存中」、认词「正在自动保存」。
  Notice 里的点仍是 16px（Notice 正文 14px，不算小字）。
- 间距怎么算：∴ 最左那颗点圆心在 24 格的 x=7、半径 2.25，左边自带 7 − 2.25 = 4.75 格空。
  16px 下 4.75 × 16/24 ≈ 3.2px，14px 下 ≈ 2.8px；再加汉字字身右边自带约 0.5–1px，肉眼间隙约 3–4px（目测），像字后面打了个省略号。
  所以统一成「字和点之间 flex gap / margin 合起来为 0」：
  - `selectionOverlay.css .paper-selection-card-status` gap 6px → 0；
  - `sentenceAnalysis.css .sa-loading` gap 4px → 0；
  - `notice.css .eqb-notice > .eqb-wait-dots` 原来收回 `--eqb-space-1`，改成收回 `--eqb-space-2`（Notice 自身 gap 是 space-2，合起来 0）。
- 实量（`diff.json`，字墨右缘到点墨左缘）：正在翻译 9.2 → 2.8px；分析中 7.2 → 2.8px；草稿卷保存中 3.2 → 2.8px；Notice 3.2px（不变）。

## 2. 首页找题结果：灰块走 useDelayedBusy

- `ConciergeDesk.tsx`：`useDelayedBusy(state.kind === 'loading')`，300ms 内回来不出灰块；出了就至少留 500ms，期间结果不挂（不叠两层）。
- 「正在找…」那条 Notice 照旧立刻出（文字立刻、灰块延后）。
- 没给 live region 挂 `aria-busy`：挂了读屏会憋着不念结果条数，反而更差。
- 实量：150ms 回来，前 0 个灰块（原来 1 个闪一下）；1200ms 回来，灰块照常出。

## 3. 整块「加载中…」→ 灰块

新增两个共享件（`Skeleton.tsx`）：
- `SkeletonGate`：包住一块内容，pending 时走 `useDelayedBusy`，区域 `role="status"` + `aria-busy`，读屏读一句 visually-hidden 的 label；灰块只在 waiting 段画。
- `PaperGroupSkeleton`：一组卷面的灰块，照整卷页实量（正文 14px / 行高 24 → 块高 12、行距 12；文章 9 行、两道题各题干一行 + 选项两列两行）。宽度是写死的一组百分比，不随机。

| 位置 | 原来 | 现在 | 截到 |
|---|---|---|---|
| 题组详情「卷面」（QuestionGroupDetailView） | 一行「卷面加载中…」，高 122 | `PaperGroupSkeleton`，外边距照 `.peek-paper .ps-page`（32/48/40），高约 300，label「卷面加载中」 | 拍到 |
| 整卷页题组正文（PaperBrowsePage renderGroupBody） | 「加载中…」 | `SkeletonGate` + `PaperGroupSkeleton`，label「题组加载中」 | **没拍到**：rig 里 groupModels 和 loading=false 同一拍设，这条路径到不了（代码照样接上，防以后拆开） |
| 整卷页讲解面板（三种题型分支） | 「解析加载中…」 | `SkeletonGate` + `LectureAnalysisSkeleton`（72×12 标题 + 100/100/58% 三行），只对会去取讲解的题型（cloze / grammarFill / writing） | **没拍到**：rig 卷子只有阅读组 |

没做大结构改动：整卷页首屏（试卷还没来时的整页）、单词复习页「正在准备卡片…」、听写「正在准备听写」这几处是整页标题级的等待，换灰块要重排页面骨架，这轮没动，见第 9 节后续。

## 4. 词典卡 / 句子分析卡：自画的条 → Skeleton

- `DictionaryCard.tsx`：三条 `Skeleton`（100 / 82 / 58%，高 12），外面 `SkeletonGate` label「正在查词典」。
- `SentenceAnalysisCard.tsx`：译文位置两条 `Skeleton`（100 / 64%），不给 label（旁边「分析中」那行字已经说了）。
- 这两处是「只在 loading 时挂上」，数据一到整块卸掉，所以**没有 500ms 的最短停留**——卡片本身就是刚弹出来的，再留 500ms 会让结果晚出。如果要统一成走完 settling，需要把门挂在卡片外层，改动大，这轮没做。
- 删了的旧规则（grep 全仓确认只有这里用）：
  - `selectionOverlay.css`：`.paper-dictionary-skeleton-line` 三条（留了 `.paper-dictionary-skeletons` 当排版容器）；
  - `sentenceAnalysis.css`：`.sa-skeleton`、`.sa-translation:has(.sa-skeleton)`；新加 `.sa-translation.sa-translation-skeleton`（纵排、gap 8px，和原来一样）。

## 5. 换字的键 → `Button busy`

| 键 | 原来 | 现在 | 理由 |
|---|---|---|---|
| 管理台「给题库打主题标签」 | 原生 `.primary-button`，忙时字换成「打标中…」，键宽 148 → 95.4 | `<Button tone="solid" busy>`，字不变，键宽 148 → 148 | 换了 |
| 管理台口令「新建口令」 | 忙时整键禁用、字不变，但没有点 | `<Button tone="strong" size="lg" busy>`，边框和禁用色用 `.eqb-button.agent-token-submit` 补回原样（写了覆盖注释）；键宽 78 → 78 | 换了 |
| 登录「登录中…」 | 52px 高的胶囊，自己的一套样子 | **没换** | Button 没有这一档；硬套要么改样子、要么写一堆覆盖。建议 DESIGN 定是否给 Button 加一档 pill-lg |
| 生词本「加入生词本」（NotebookAddButton） | 12px 文字链样子 | **没换** | Button 最小档 sm 比它大，换了会变样子 |
| 整卷页「复制试卷信息 / 复制中…」 | 换字 + 禁用 | **没换**（第一轮已注释） | 禁用条件里混着「线程信息没回来」，分不开 |
| 单词复习「下载 / 生成中…」（VocabularyReviewPage） | 换字 | **没换** | 不在这轮清单里；它是下载键，该照第 6 条用 `iconShowsBusy`，留后续 |
| 草稿卷菜单项「保存 PDF 到个人空间」 | 菜单项 | **没换** | 菜单项不是 Button，构件里没有菜单项 busy |

## 6. 整卷页「下载 PDF」键

忙时字固定「下载 PDF」（原来换成「生成 PDF 中…」），由 Button 的 busy 出点。
**前后两次都没拍到**：rig 卷子没有 PDF 版本，键是禁用的，点击超时。只改了一行字，靠读代码确认。

## 7. 真行依次淡入：只接首页找题结果

- 新 hook `shared-ui/useRowReveal.ts`：结果真行挂上那一拍，`.concierge-paper-list > li` 从上到下淡入，只动透明度，不动高度。
  每行时长读 `--motion-base`（160ms），曲线读 `--ease-out`，间隔 40ms（`ROW_REVEAL_STAGGER_MS`，DESIGN 给定、token 里没有）；读不到 token 就不演（不写字面兜底）。
- 系统「减少动态效果」：不演（实量 0 个 animation）。
- 之后筛选、展开不再演，只在结果到的那一拍演一次。
- 实量：rig 数据只有 1 张卷，只看到 1 行、1 个 animation（160ms、ease-out）；**多行的错开没亲眼看到**。
- 问题：`--ease-out` 前段很陡，100ms 时透明度已到 0.99，肉眼几乎是「直接出来」（目测）。见第 10 节。

## 8. 「比平时慢，可以先去做别的」

- `useDelayedBusy.ts` 加 `WAIT_SLOW_HINT_MS = 10_000` 和 `useSlowWait(pending)`。
- 只接在草稿卷「正在生成 PDF」：超过 10 秒 Notice 字变成「正在生成 PDF，比平时慢，可以先去做别的」。实量 1s 时原字、11s 时新字，拍到。

## 9. 首页「连接中」灰块（dataConnecting）：死代码，没删

`ConciergeDesk.tsx` 里 `{dataConnecting && (...SkeletonFeed...)}` 那块：`dataConnecting` 现在没有任何路径会变真（数据层早就不经过「连接中」这一态），所以这块永远不渲染。
没删：不是我建的，删了可能挡别人后面接连接态。建议协调人确认数据层不会再有这一态后删掉，或者让它走 `useDelayedBusy`。

## 后续（这轮没做）

- 真行淡入：整卷页题组列表、生词本列表、管理台列表、单词复习卡片列表都可以接 `useRowReveal`。
- 慢了的提示：讲解生成、句子分析、单词复习「生成中」都可以接 `useSlowWait`。
- 整页级等待（整卷页首屏、单词复习「正在准备卡片…」、听写「正在准备听写」）换灰块，需要按页重画骨架。
- 单词复习「下载」键换 `Button busy iconShowsBusy`。
- 词典卡 / 句子分析卡的灰块要不要也留满 500ms（见第 4 节）。

## verify 脚本

没有需要改的断言。逐个看过：verify-concierge-desk、整卷页占位相关、detail-screen-consumption、continuation-writing（找「解析未发布」，三个分支保留了这句）、i16b 打标 backfill，都仍然成立。
verify-icon-motion 里的「生成 PDF 中…」是它自带的 fixture，不读真页面，没动。没有运行任何 verify / smoke。

## 截图怎么拍的

- 脚本：`scripts/component-inventory/waiting2-shots.mjs`（拍）、`waiting2-compare.mjs`（拼对照、出 diff.json）。复用 `rig.mjs`，`INVENTORY_PORT_OFFSET=77`。
- 改前：把这轮补丁反向打掉跑一次，再打回来（没用 git stash）；改后跑一次。各一次，没重跑。
- 只拍元素，不拍整页；动画在中段用 Web Animations 暂停定帧。
- 详情页卷面：rig 的消费数据没有 canonicalPaperId，脚本里把响应补上并挂住，才拍到灰块。
- 首页「加一行」（home-row-add）排最后，请求直接 abort。
- 没拍到：整卷页下载 PDF 忙态（两次）、整卷页题组正文灰块、讲解面板灰块（原因见上）。

## 碰到的问题

1. `--ease-out` 做淡入几乎看不出过程（第 7 节）。
2. DESIGN 写淡入 200ms，全站没有 200ms token，取了 160ms（`--motion-base`），已登记 `docs/design-gaps.md`。
3. 详情页：卷面灰块挂着那 500ms 里，「展开」键可能已经出现在灰块下面（目测，没拍到确认）。
4. 句子分析卡：头 300ms 灰块还没出，译文位置是空的一块框（目测），之后才出灰块。
5. rig 数据太薄：只有 1 张卷、只有阅读组、没有 PDF 版本，几个状态拍不到。

## 建议协调人改 DESIGN.md

- §5「所以点」补一句：小字（12–13px）旁 14px；字和点之间不另加间距，靠 ∴ 自带的左空（约 3–4px，目测）。
- §5「真行淡入」：把 200ms 改成 `--motion-base`（160ms），或者新增 200ms 的 token；并写明曲线（建议 `--ease-hover` 或更缓的一条，不用 `--ease-out`）。
- §5 加「慢了的提示」：10 秒，文案「比平时慢，可以先去做别的」，写明哪些等待该接。
- §5「灰块」写明：只在 loading 时挂上的小卡片内灰块，可以不留 500ms。

## 请 Owner 定

1. 淡入曲线：`--ease-out` 太陡看不出来。建议换 `--ease-hover`，或时长加到 200ms 并加 token。
2. 登录键要不要换成共享 Button（意味着给 Button 加胶囊大档，或者登录键改样子）。建议加一档，不改登录的样子。
3. 生词本「加入生词本」文字链样子的忙态：建议用 `InlineWaitDots size="sm"` 跟在字后，不换成 Button。
4. 首页 dataConnecting 那块死代码：建议删。
5. 词典卡 / 句子分析卡灰块要不要留满 500ms：建议不留（卡片是新弹出的，留了只会让结果晚出）。

## 协调人复核


2026-11-15，看过两张对照图和新构件：

- **改了一处.** 真行淡入的曲线从 `--ease-out` 改成 `--ease-hover`：前者 100ms 已到 0.99，等于直接出现。时长仍是 `--motion-base` 160ms。改后 tsc 过，没重拍。
- **审美.** 小字旁 14px 的点和字距离对了（「正在翻译」从 9.2 收到 2.8）；打标键忙时宽度不再从 148 缩到 95；详情页卷面从一行小字换成成段灰块，像卷面，好。新建口令键太小，忙时只看得到一颗半点（目测），可以接受。
- **DESIGN.md §5 Waiting 已补:** 淡入 160ms + `--ease-hover`、卡片内灰块不留满 500ms（都标提案），第二轮已做 / 还没做。
- **交 Owner:** 登录键加胶囊大号档；「加入生词本」字后跟小号所以点；首页连库灰块死代码要不要删（不是这几轮建的，删前要 Owner 点头）。
