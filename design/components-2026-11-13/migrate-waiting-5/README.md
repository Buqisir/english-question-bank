# 等待构件迁移 · 第五轮（2026-11-15，未）

接第四轮（`../migrate-waiting-4/`）。这一轮做六件事：草稿卷重排等很久、过生词下载等很久、扫码启动壳、三处整页等待改灰块、单词复习牌桌标题、纸面阴影收成 token。

- 没 commit，没 push，没用 git stash，没跑 verify-* / smoke-*。
- `tsc -p tsconfig.app.json` 过，`pnpm build` 过，入口 JS 189.7KB（上限 450KB）。
- lint 63 错 / 12 警，HEAD 是 65 错 / 12 警。启动壳挪出 main.tsx 后，main.tsx 少报 1 个 react-refresh；改到的其它文件里报的都是原来就有的。

文件：

| 文件 | 内容 |
|---|---|
| `compare-lines.jpg` | 草稿卷重排、过生词下载的那一行 |
| `compare-boot.jpg` | 扫码启动壳 |
| `compare-pages.jpg` | 三处整页、单词复习、草稿卷打开 |
| `diff.json` | 两边量到的数，加阴影逐像素比 |

共约 350KB。脚本：`scripts/component-inventory/waiting5-shots.mjs`（拍）、`waiting5-compare.mjs`（拼）。端口偏移 81，只拍元素。换前换后各拍一次，没补拍。会真写数据的请求拦住，最后 abort，没放行。

## 一、清点表

| # | 位置 | 原样子 | 换成 | 做没做 |
|---|---|---|---|---|
| 1 | `features/draft-paper/DraftPaperWorkbench.tsx` 草稿卷重排 | 一直是「正在重排卷面，旧卷面先留着」 | `useSlowWait(previewStale)`：10 秒后换成「正在重排卷面，大约要半分钟，旧卷面先留着」。不说「比平时慢」 | 做了。11 秒那格拍到 |
| 2 | `features/vocabulary-review/VocabularyReviewPage.tsx` 过生词「下载」（收满页和重开页两处） | 键上图标自己演，没有字 | `useSlowWait(pdfDownloadBusy)`：10 秒后在键下、错误行的位置出 `Notice kind="waiting"`「正在生成，比平时慢，可以先去做别的」。有错误时错误优先 | 做了，但**会推内容**（见二） |
| 3 | `main.tsx` 加新文件 `publicVocabularyBootShell.tsx`：扫码听写启动壳 | 居中卡片：绿方块「EQ」、「正在准备听写」、一行说明 | 听写页的灰块（和 `DictationOpeningSkeleton` 同一套 class、同样的块），顶栏照常。门槛用 CSS `animation-delay: 300ms`（启动壳不跑 JS 计时）。呼吸用负的 animation-delay 对齐页面时间轴 0 点。页面代码到了，如果启动壳的灰块已经出了，页面就接着出（`bootStartedAt`），不再等一次 300ms | 做了 |
| 3b | 同上：听音词卡启动壳、启动失败页 | 「EQ」方块 | `/brand/mark.svg`（现成文件，只引用），高 42px（目测）。听音词卡页自己的等待就是卡片，启动壳照旧用卡片 | 做了 |
| 4a | `features/vocabulary-notebook/VocabularyNotebookPage.tsx` 生词本「正在打开这张纸」 | 一行 Notice | `SkeletonGate` 画一张纸：标题、篇名、三个词（词头 + 音标、释义、两行例句），用真纸的 class | 做了 |
| 4b | `features/question-detail/QuestionGroupDetailView.tsx` 题组详情「正在读取题组详情」 | 一行 Notice | `DetailOpeningSkeleton`：hero（来源行、标题、两行摘要、三个标签、三个键）+ 纸（`PaperGroupSkeleton`）。详情到了以后纸还在等，两段共用一个 `useDelayedBusy`（`SkeletonGate` 新增可选 `phase`），不重新算 300ms | 做了 |
| 4c | `features/vocabulary-review/VocabularyReviewPage.tsx` 过词进度「正在读取过词进度」 | 一行字 | `RunSetupSkeleton`：开始页的图标、标题、说明、目标数、读音 + 开始键、直接生成词表那块。最近的词表列表不画 | 做了，但**数据到了整块下移 119px**（见二） |
| 5 | `features/vocabulary-practice/VocabularyPracticePage.tsx` 单词复习「单词配对卡片」 | 看得见的 h2 | `className="visually-hidden"`（index.css 现成的类；`.sr-only` 全仓没定义）。灰块里那个占位 h2 删掉 | 做了。下挪从 9px 变 6px，没对齐完（见二） |
| 6 | `shared-ui/tokens.css` 纸面阴影 | 四处字面量 `0 1px 0 rgba(0,0,0,0.06), 0 12px 32px rgba(0,0,0,0.08)` | `--elev-sheet`，写法照 `--elev-*` | 做了。换的四处：生词本 `.notebook-sheet`、题组详情 `.peek-paper`、整卷页 `.paper-browse-zoom` / `.paper-browse-skeleton-sheet`、草稿卷 `.draft-skeleton-sheet`。没换的三处见四 |

三处整页灰块都满足：300ms 门槛（出了至少留 500ms），读屏只读一句（`role=status aria-busy` + 一句 visually-hidden），灰块用真页面的 class，块放在字的位置上（inline-block，行高跟真字走）。

## 二、量到的数（换后，1440 宽；diff.json）

- **纸面阴影逐像素.** 整卷页 912×440、生词本 874×440，换前换后**差 0 像素**。题组详情那张没拍到（见三）。
- **生词本.** 灰纸和真纸比，纸高 655 / 658，三个词顶 399 / 527 对 400 / 529，标题、篇名同位。差 1–3px，没看出跳。
- **题组详情.** 只拍到等待，数据到了没拍到，跳不跳没量。
- **过词进度.** 开始页这块里面对得上：标题、目标数、开始行、直接生成，相对块顶都差 1–2px。但整块灰的在 y=138，真的在 y=257。原因是开始页上面那一栏（课程 / 学生选择、「开始复习」）在读取时不出、读完才出，不在这块里面。**数据到了整块下移 119px，没做到「不跳」。** 要做到，得把那一栏也画成灰块，或者读取时就把那一栏的高度占住。这次没做，是改动范围的问题，不是做不到。另外，读完要是落到「正在过词」（有没收完的轮），出来的是另一张页，灰块画的是开始页，这时一定会换一次样子。
- **过生词下载慢提示.** 「已收满」那块是竖着居中的，多一行，整块往上挪 20px：状态行 500→480，键那行 582→562。新行在 y=674、高 28。**会推内容**。不推的办法是给这一行留固定高度（平时也占着），但那样平时下面多一段空，所以没做，留给 Owner（见六）。
- **草稿卷重排.** 提示宽 222→320，10 秒后长了一截，提示是居中浮着的，不推卷面。
- **单词复习.** 牌桌顶：灰 332 / 真 338，差 6px。换前是 400 / 409，差 9px。拿掉看得见的 h2 以后，h2 那段的 3px（目测来源）没了。剩下 6px 出在上面头部那块：灰 87 高、真 93 高，右边轮次卡里中日韩字的行高（`line-height: normal`）比灰块高。**没对齐。** 要对齐，得给轮次卡里几行写死行高，或者灰块按中文行高给。这些是原页面的规则，这轮没动。
- **扫码听写.**
  - 390 宽：150ms 只有顶栏，灰块没出（门槛内）。1200ms 灰块出了，题板 362×360、控制区 362×362，和数据到了的 362×360 / 362×368 同位。
  - 页面代码到了、数据没到（+100ms）：换前那一刻题板是空的（页面自己又从 0 等 300ms）；换后灰块接着出（20 块都看得见）。
  - 1440 宽一样。
- **听音词卡启动壳.** 卡片同尺寸 360×187.5，只是换成獭石标志。

## 三、没拍到

- **题组详情「数据到了」、`shadow-detail`.** 换前换后都卡在等 `.peek-paper--ready` 超时（60 秒），等待那格拍到了。猜是题组 GET 拦住放行以后，卷面那次请求在 rig 里没回来。没补拍。
- **草稿卷打开 1200ms.** 两边都拍到一张空白：这一步从打开地址就开始计时，不像别的步等登录完再计时，1200ms 时应用还没起来。这次照要求拦了 `/:id`，正则 `/api/draft-papers/[^/?]+` 同时也拦了 `/current`。灰块那格算没拍到。

## 四、没做 / 留着的

- **纸面阴影三处没换成 token.**
  - PaperSurface `.ps-page`（`#00000010` / `#00000014`）：不许碰。
  - `draftPaperPreviewHtml.ts` 的 `.preview-page`：iframe 里，拿不到 tokens.css，值和 `.ps-page` 一样。
  - `writingPaperPage.css` `.pi-writing-page`：0.063，值不同。换了就不是逐像素一样。
  - 已记进 `docs/design-gaps.md`。服务端 `vocabularyPdfRenderer.mjs` 里也有这串，是 PDF 样式，不碰。
- **启动壳的 300ms 是 CSS 里的字面量**（`index.css`）。启动壳拿不到 JS 常量 `WAIT_SHOW_DELAY_MS`，也没有对应的 CSS token。已记进 design-gaps，候选名 `--wait-show-delay`。
- **启动壳「出了至少留 500ms」只做了一半.** 页面接手时按启动时刻判断要不要接着出灰块。但页面代码和数据来得快、灰块刚出就到，留不满 500ms。启动壳这边没有 JS，管不了。
- **启动壳的灰块 1800ms 一圈也是字面量**（`BOOT_SKELETON_CYCLE_MS`，和 waiting.css 的 `--eqb-skeleton-cycle` 同一个数），写在 main.tsx。

## 五、要提的几件事

1. **入口多了听写页的 CSS.** 启动壳要用听写页同一套容器规则（几何值只写一处），`vocabularyDictationPage.css` 和 `waiting.css` 改成入口静态引入。只有 CSS，没有页面 JS。入口 CSS 现在 15.4KB（HEAD 的没量），原来听写 CSS 是跟着页面块按需加载的。代价是普通页面也多下这十几 KB CSS。
2. **下载慢提示的字多了「正在生成，」开头.** 要求是「比平时慢，可以先去做别的」。单这句放在键下，看不出在说什么慢，所以前面加了「正在生成，」。不要就删掉这四个字。
3. **生词本 PaperFontGate 挪进去了.** 原来 PaperFontGate 包着整个 main，字体没好之前连等待也不出。现在只包真纸，灰块不等字体。组件本身没改。另外进页面时先调一次 `ensurePaperFonts('')` 预热，只读用法，不改 `shared-ui/papersurface/`。
4. **听写页 reduced-motion 的 `* { animation: none !important }` 会把启动壳的 300ms 门槛一起关掉.** 所以 index.css 用更高的选择器 + `!important` 单独把门槛那条动画开回来（只是从隐藏到显示，不动）。注释里写了。
5. **启动壳组件从 main.tsx 挪到 `app/src/publicVocabularyBootShell.tsx`.** 为了 lint（react-refresh）。main.tsx 照旧只动态引入页面，verify-launch-deploy Slice 1 的正则不受影响。

## 六、verify 脚本

grep 过 `scripts/` 下所有 verify / smoke，没有断言因这次改动失效，一个没改：

- `verify-paper-browse` #47 只查有没有 box-shadow。
- `verify-classic-retire-2` 找的是反引号里的 `peek-paper`。
- `verify-launch-deploy` Slice 1 只看 main.tsx 有没有静态引入四个页面模块。

`scripts/component-inventory/followup-shots.mjs`（旧的拍照脚本）还在找 `.notebook-status`，是历史脚本，没动。

## 七、给协调人：DESIGN.md §5 可以补的

- 「等很久」的那一行：10 秒后在原地加时长或去向（「大约要半分钟」「可以先去做别的」）。加了以后行变长或多出一行，要写清会不会推内容。
- 两段等待（启动壳 → 页面，详情 → 卷面）共用一个等待阶段，不各自重新算 300ms。
- 启动壳的门槛用 CSS animation-delay。可以记一个 `--wait-show-delay` token。
- 纸面阴影 `--elev-sheet` 写进 §4 Sheet，标明 PaperSurface / iframe 预览 / 写作纸三处不用它的原因。

## 八、要 Owner 定的

1. **过生词下载慢提示推内容 20px，要不要给它常留一行的高度？** 建议不留：只有等 10 秒以上才出，这时人多半在看那一行，挪一下比平时多一截空好。
2. **过词进度数据到了下移 119px，要不要把上面那一栏也画成灰块？** 建议要：119px 的跳最显眼，下一轮把那一栏的灰块补上，或者读取时照常出那一栏的框。
3. **单词复习还差 6px，要不要动轮次卡的行高？** 建议不动：6px 在牌桌整块进来时不显眼（目测），动行高会改看得见的样子。
4. **入口多 15KB CSS，接不接受？** 建议接受：扫码进来第一眼就是灰块，比卡片好。不接受的话，就在启动壳里只复制几条容器规则，值写两处。

## 协调人复核


2026-11-15，看过三张对照图：

- **启动壳.** 方块「EQ」换成现行獭石标志，听写页一打开就是题板的轮廓，不再是米色底一张小卡，和页面代码到了以后同一个样子，不跳，好。
- **三处整页.** 生词本一张纸、题组详情从一行字变成成形的灰块，好；过词进度下移 119px 是真问题，排进下一轮。
- **「正在生成，」开头** 留着：在原地说清在等什么，比只说「比平时慢」清楚。
- **Owner 待定四条** 照未的建议先做（提案）：下载慢提示不留空行；过词进度上面那一栏下一轮画灰块；牌桌 6px 不动；入口多十几 KB CSS 接受。
