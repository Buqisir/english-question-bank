# 修「改一下卷面就空白」（走查卡点 2 / 第四节第 2 条）

Owner 2026-11-14 已定：点完 0.1 秒内要有看得见的变化；卷面重排期间保留旧卷面，不白屏。这次只做这一条，没改后端。

## 根因

卷面空白不是因为分页结果被删了，而是 `app/src/features/draft-paper/DraftPaperWorkbench.tsx` 里 `previewHtml` 的一道门：

```ts
if (renderedPaginationKey !== paginationKey || !paginatedHtml) return ''
```

`paginationKey` 里有题组表（id、顺序、分页）和标题。老师一挪、一删、一加，`draftPaper` 一变，`paginationKey` 马上变，和「上一次排好的那份」的 `renderedPaginationKey` 不再相等，`previewHtml` 就变成空字符串，iframe 被拆掉，只剩一行「正在生成分页预览…」，一直到新分页回来。旧的分页 HTML（`paginatedHtml`）其实一直在内存里。

这道门是 #499（四款 PDF 产品）加的，用意是「换了 PDF 版本时，不能拿上一版的题卷顶着纯答案版」。它把「换版本」和「改排版」用同一个条件挡住了。代码里原本还有一颗「重新排版中…」的墨色小胶囊，只在卷面还在时出现，所以自从加了这道门就几乎看不到。

出错时还有一处：分页请求失败会 `setPaginatedHtml('')`，旧卷面也跟着没了。

## 改了什么

改在前端这一层，只动了草稿卷工作台：

- `app/src/features/draft-paper/DraftPaperWorkbench.tsx`
  - 新增 `surfaceKey`（草稿、草稿这一轮、PDF 版本）。只要是同一份草稿、同一个版本，排版没跟上时也照样显示旧卷面；换了草稿或版本仍然不显示旧卷面（纯答案版的规矩不变）。
  - `previewStale`：排版还没跟上，或删、撤销删、换篇、撤销换篇、加入、分页这几种操作还在等服务器回话（新加一个计数 `layoutSavesPending`，这六个函数各套一层 `withLayoutSave`）。为真时卷面上盖遮罩，写「正在重排卷面，旧卷面先留着…」。
  - 分页失败时不再清掉 `paginatedHtml`。遮罩去掉，旧卷面留着，顶上写失败原因（`describeError` 给的原话，错误照旧打到 console）加「下面还是改之前的卷面。」和一个「重试」键（共用 `Button`）。「重试」让 `paginationKey` 里的计数加 1，重新发一次分页请求。
  - 等的时候和失败时，「建议前置分页」小签不出：这些建议是按旧分页算的。以前这时卷面是空的，建议本来也看不到。
  - 退役原来的「重新排版中…」墨色胶囊和红色出错胶囊（以及出错胶囊那句字面量兜底文字）。
- `app/src/features/draft-paper/DraftPaperWorkbench.css`
  - 新的 `.draft-a4-wait`：挂在 `.draft-a4-sheet` 上、iframe 外面，`position: absolute; inset: 0`。等的时候底色是 `color-mix(in srgb, var(--eqb-color-desk) 60%, transparent)`，不加模糊；说明行用 `--eqb-color-desk` 底、`--eqb-color-text-muted` 字、16px 图标、`--elev-1`，`position: sticky`，卷子很长时滚到哪儿都在视口上方。
  - 默认 `display: none`，只在 `@media screen` 里显示，所以浏览器打印这一页时不出现；没写 `@media print`。几条覆盖规则都写了 Explicit-Cascade 注释。
- `docs/design-gaps.md`：遮罩色没有现成 token，按 No-Literal-Fallback 登记了缺口（候选名 `--eqb-color-scrim`，60% 是目测）。

没改：PaperSurface、任何 `@media print`、PDF 模板样式、`server/`。服务器出的打印稿和 PDF 是服务器拼的 HTML，遮罩在网页 DOM 里，进不去。

## 量到的数（本地，1440 宽，DPR 2）

走查脚本 `walk.mjs`（`scripts/component-inventory/rig.mjs`，端口偏移 49，临时数据库，草稿卷依次放 A、C、D 三篇）。「看得见的变化」在页面里逐帧量：从点击事件那一刻起，到左栏文字变了、遮罩出现的那一帧。

| 动作 | 遮罩出现 | 左栏变 | 新卷面换上 | 记录 |
| --- | --- | --- | --- | --- |
| 「⋯」→ 下移（第一次跑） | 64 ms | 64 ms | 约 108 秒 | 第一次跑，日志 |
| 「⋯」→ 下移（第二次跑） | 37 ms | 37 ms | 约 100 秒 | `walk.json` |
| 「⋯」→ 移除 | 21 ms（第一次 17 ms） | 712 ms（第一次 738 ms） | 约 36 秒 | `walk.json` |
| 下移，分页接口拦成 500 | 48 ms | 48 ms | 约 0.5 秒后变成失败行，旧卷面一直在 | `walk-fail.json` |
| 失败后点「重试」 | 17 ms | — | 约 120 秒 | `walk-fail.json` |

- 等待期间 iframe 一直没被拆（`iframeGoneMs: null`），也就是旧卷面全程都在。
- 打印媒体下（`emulateMedia print`）遮罩的 `display` 是 `none`。
- 移除时左栏要等服务器删完（本地 DELETE 约 0.66 秒）才变，0.1 秒内的变化是遮罩。左栏没有改成乐观删除：那样会多发一次分页请求，见下一节。
- 打开草稿卷到卷面出来仍是约 36 秒，这次没动。

## 截图

| | |
| --- | --- |
| `01-打开草稿卷.png` | 改动前的卷面 |
| `02-下移后1秒-旧卷面加遮罩.png` | 下移后 1 秒：左栏已是新顺序，旧卷面盖着遮罩，顶上一行「正在重排卷面…」 |
| `03-下移后新卷面换上.png` | 新卷面换上，遮罩没了 |
| `04-移除后1秒-旧卷面加遮罩.png` | 移除后 1 秒，撤销提示和遮罩同时在 |
| `05-重排失败-旧卷面加一行字.png` | 分页失败：没有遮罩，旧卷面留着，一行原因 + 「重试」 |
| `06-重试后新卷面.png` | 点「重试」后新卷面换上 |

## 为什么要等一两分钟（只查了原因，没改）

从代码和这次的网络记录看，是几件事叠在一起：

1. **每次预览都是一次完整的「找版式」**。分页接口走 `renderPaperProduct` → `planStudentProductPdf`（`server/draft-paper/studentProductPdf.mjs`），为了凑页数上限和答题框高度，要试多个候选版式，每个候选都是一次完整的 Chromium + paged.js 排版加出 PDF（`renderPaginatedPaper`）。本地打开草稿卷时这一步约 31–32 秒。
2. **所有排版排一条队**。`server/draft-paper/chromiumPool.mjs` 是串行队列，同一时间只排一份。
3. **一次挪动会发两次分页请求**。下移是乐观更新，但 `reorderItems` 只换了数组顺序，没改 `orderIndex`；PATCH 回来的题组表 `orderIndex` 重新编过号，`itemsLayoutKey` 又变一次，于是 400ms 防抖后的第一次请求和 PATCH 回来后的第二次请求都会发出去。第一次的结果前端会丢掉，但服务器照样排完。第二次跑的网络记录里，下移后两次分页请求分别是约 76 秒和约 98 秒。
4. **排序建议也在同一条队里排版**。每次分页回来有断篇时会请求 `reorder-suggestion`，它要对候选顺序做真排版试算。记录里这类请求单次约 41–215 秒，和分页请求挤在同一条队里。

所以老师看到的等待 ≈ 队里排在前面的排序建议试算 + 可能多出来的一次分页 + 自己这次的找版式。线上会不会快，拿不准。

## 跑过的检查

- `cd app && npx tsc -b`：通过。
- `npx eslint src/features/draft-paper/DraftPaperWorkbench.tsx`：2 个 error、1 个 warning，都是改之前就有的（拿 HEAD 版本的同一文件跑，结果一样：两处 set-state-in-effect、一处 exhaustive-deps），这次没有新增。CSS 没有 lint 配置，没跑。
- 上面的浏览器走查（跑了三次：第一次、第二次是整条路线，第三次只重拍失败和重试）。

## 没验证的和风险

- 按要求没跑任何 `verify-*.mjs` 或 `smoke-*.mjs`。可能受影响的：`verify-draft-workbench-visual-unify.mjs`、`verify-c8-draft-paper-render-model.mjs`（读这份 CSS）。`scripts/` 下没找到断言 `draft-a4-repaginating` 类名或「重新排版中」文字的脚本；上一轮走查脚本 `scripts/ux-walkthrough/find-compose-export.mjs` 靠「正在生成分页预览」判断在等，重跑它时下移这类步骤会以为没在等（它还会等工具条出现，不会出错，只是记的说明不对）。
- 第二次整条路线跑到「失败→重试」时，本地接口进程崩了（`ECONNREFUSED`），重试也失败，页面按失败画面显示，旧卷面还在（`walk.json` 最后两步）。第三次单独重跑，重试成功（`walk-fail.json`）。上一轮走查也记过本地接口在这一段崩，原因没查。
- 撤销移除、换篇的「替换 / 加入」、前置分页、A3 对折、改标题时的遮罩只看了代码，没在浏览器里走。撤销提示 8 秒就收，而这次移除后等了约 36 秒，脚本没赶上点撤销。
- 390 宽没走。遮罩说明行用 `width: fit-content` 加 `max-width`，窄屏会不会折成两行，目测应该会折，没拍。
- 换 PDF 版本（比如换成纯答案版）时仍是空白加「正在生成分页预览…」，这是有意保留的，不拿另一版的卷面顶着。
- 等待期间各题组的工具条（换篇、「⋯」）还在，位置是按旧卷面算的，还能点；挪动以后，工具条暂时还停在旧位置。目测不碍事，没让老师看过。
- 遮罩深浅（桌色 60%）和说明行的样子都是目测，等 Owner 看。
