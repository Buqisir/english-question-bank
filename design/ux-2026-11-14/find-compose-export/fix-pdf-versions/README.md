# 用不了的 PDF 版本照样列出、写一行原因（走查卡点 4 / 第四节第 4 条）

Owner 2026-11-14 已定：「PDF 版本」里当前草稿用不了的版本照样列出，置灰不能选，写一行原因；不要选了再报错。这次只做这一条。没改判定规则。

## 查到的现状

- **四个版本**：`shared/paperPdfProducts.mjs` 里的大字完整版（largeComplete）、大字无听力版（largeNoListening）、省纸版（economy8）、纯答案版（answerOnly）。
- **改之前**：顶栏是原生下拉框，四个版本都能选（`before-02-四个版本看起来都能选.png`）。前端没有任何「能不能用」的信息，选了以后由预览请求报错：
  - 纯答案版：卷面写「纯答案版不可用：选中的题组没有同版本已审源参考答案；不能以教师卷替代」（`before-03-选了纯答案版才报错.png`）。
  - 大字完整版：卷面写「生成分页预览没成功，可以再试一次。」，真正原因（「大字完整版需要完整的两个听力题组」）只在控制台里（`before-04-选了大字完整版才报错.png`）。
- **判定都在服务器**，在真正排版以前、`server/draft-paper/draftPaperStore.mjs` 的 `renderPaperProduct` 一开头，抛错就是「用不了」：

| 判定（原话） | 哪些版本 | 查的是什么 |
| --- | --- | --- |
| 请先添加题组 | 全部 | 草稿里没有题组 |
| 选中的题组已缺失，不能生成不完整产品 | 全部 | 有题组在题库里找不到了（`groupMissing`） |
| 选中的题组没有完整 Canonical 来源 | 全部 | 题组解析不出 Canonical 来源 |
| 此产品没有可导出的题组 | 大字无听力版、省纸版 | 去掉听力以后一个题组也不剩 |
| 大字完整版需要完整的两个听力题组 | 大字完整版 | 听力题组不是正好 2 个（`studentProductPolicy`） |
| 大字完整版需要同一源卷完整的两个听力题组 | 大字完整版 | 两个听力题组不出自同一套卷 |
| 选中的题组没有同版本已审源参考答案；不能以教师卷替代 | 纯答案版 | 题组所在卷的这一版没有已发布的审过的参考答案（`answer-renderer.mjs`） |
| 纯答案版不可用：……（多种） | 纯答案版 | 参考答案的发布记录、字节对不上（`sourceReferencePublication.mjs`） |

- 「要整张原卷才有定页版」那条（「定页版需要按原顺序排列的同源完整试卷」）只在旧的 `pageLayout` 导出路径里，四个现行版本不走它，所以不列。
- **拿不到的原因**：大字无听力版、省纸版排版时找不到合格版式（「未在有界搜索内找到合格的……」）、带作图区的应用文放不下，这类只有真排一遍（每次 30 秒以上）才知道，事先判不了。这些仍然是选了以后由预览和下载报，和改之前一样。

## 改了什么

- **服务器**
  - `server/draft-paper/draftPaperStore.mjs`：把 `renderPaperProduct` 开头那段判定原样挪进 `preparePaperProduct`，纯答案版拼 HTML 的那段挪进 `buildAnswerOnlyProductHtml`（只拼字，不排版）；`renderPaperProduct` 改为调用这两个，判定和报错原话一个字没改。大字完整版的听力判定原来在缓存检查之后，现在挪到了之前（有缓存就说明当时判定已通过，结果不变）。新增只读的 `getDraftPaperProductAvailability`：四个版本各跑一次这些判定（纯答案版多拼一次 HTML，因为「没有审过的答案」是在拼的时候查的），返回 `{ edition, available, code, reason }`，`reason` 是抛出的原话。
  - 各判定的报错加了 `code`（`PRODUCT_EMPTY`、`PRODUCT_GROUP_MISSING`、`PRODUCT_NO_CANONICAL`、`PRODUCT_ONLY_LISTENING`、`LISTENING_PAIR_SAME_SOURCE`；`studentProductPdf.mjs` 里 `LISTENING_PAIR_REQUIRED`；`answer-renderer.mjs` 里 `ANSWER_SOURCE_MISSING`）。只加属性，原话不变。
  - `server/draft-paper/draftPaperRoutes.mjs`：新增 `GET /api/draft-papers/:id/pdf-editions`，出错和别的草稿接口一样走 `sendDraftMutationError`。
- **前端**
  - `app/src/services/draftPapers.ts`：`fetchDraftPaperEditionAvailability`。
  - `app/src/features/draft-paper/DraftPaperWorkbench.tsx`：原生下拉框换成共用 `Menu`。每个版本是可勾选项（读屏是 menuitemcheckbox，当前版本打勾）；用不了的置灰、不能选，下面一行小字写原因。题组表一变（加、删、挪、分页）就重新问一次，问的时候菜单里留着同一份草稿上一次的结果；换了草稿就不用旧结果。问不到时不标（不猜），和改之前一样。窄屏「⋯」面板里也是同一个控件；在菜单上点、按 Esc 不会把「⋯」面板一起关掉（和原来的下拉框一样）。
  - 原因文字：认得的 code 换成老师的话，每句只说那条判定真正查的东西：

| code | 菜单里写 |
| --- | --- |
| LISTENING_PAIR_REQUIRED | 要有完整的两个听力题组 |
| LISTENING_PAIR_SAME_SOURCE | 两个听力题组要出自同一套卷 |
| ANSWER_SOURCE_MISSING | 选中的题组还没有审过的参考答案 |
| PRODUCT_ONLY_LISTENING | 这一版不印听力，草稿卷里只有听力题组 |
| PRODUCT_EMPTY | 草稿卷里还没有题组 |
| PRODUCT_GROUP_MISSING | 有题组在题库里已经找不到了 |

  认不得的 code（`PRODUCT_NO_CANONICAL`、`SOURCE_REFERENCE_PUBLICATION_INVALID`、没有 code 的报错）照登服务器原话，不写字面量兜底。这几条原话是后台的说法（「Canonical 来源」「发布记录」），本地测试数据里碰不到，没有改写。
  - `app/src/shared-ui/Menu.tsx` / `menu.css`：菜单项加一个可选的 `description`（项下面一行小字，`aria-describedby` 挂在项上）。带小字的禁用项不整项变淡（原来是 opacity 0.55），只把名字变成 `--eqb-color-text-faint`，小字用 `--eqb-color-text-muted` 保持看得清。两条覆盖规则写了 Explicit-Cascade 注释。别的菜单没有给 `description`，样子不变。
  - `DraftPaperWorkbench.css`：触发键里字和向下箭头横排；版本菜单宽度上限 320px（目测），长原因折行。删掉了不再用的 `.draft-product-control select`。

没改：PaperSurface、任何 `@media print`、PDF 模板样式、判定规则本身。

## 为什么用 Menu

- 原生 `<option>` 只能放一行字，置灰后放不下原因，也不能单独给原因上色。
- 仓库里已有共用 `Menu`（导出菜单、题组「⋯」都在用），已经有可勾选项（Owner 2026-11-14 决定 #15）、禁用项、键盘、Esc 还焦点、贴着触发键放和翻面。只需补一个 `description`，比另写一个下拉件小。
- 键盘沿用 `Menu` 现有规矩：方向键跳过禁用项。所以读屏用户方向键走不到置灰项、听不到原因（见风险）。

## 走查（本地，`scripts/component-inventory/rig.mjs`，端口偏移 50，1440 宽，DPR 2）

脚本 `walk.mjs`（`WALK_MODE=before` / `after`），记录 `walk-before.json`、`walk-after.json`。草稿卷放 2026 新课标Ⅰ卷阅读 A、C、D（测试库没有听力，没有审过的答案）。

- 接口：大字完整版 `LISTENING_PAIR_REQUIRED`，纯答案版 `ANSWER_SOURCE_MISSING`，另两个可用。本地两次请求 287 ms、320 ms（同时卷面分页约 34 秒）。
- 点置灰项：没选上，菜单不关。
- Esc：菜单关，焦点回到版本键。
- 键盘：回车打开，焦点落在第一个可用项「大字无听力版」；↓ 依次是 省纸版 → 大字无听力版 → 省纸版（两个置灰项跳过，循环）；回车选中省纸版，菜单关，焦点回版本键，键上字变「省纸版」；再回车打开，勾在省纸版；Esc 关上，焦点回版本键。
- 390 宽：版本在「⋯」面板里，菜单开在面板旁边；Esc 只关菜单，「⋯」面板还开着。

| 截图 | |
| --- | --- |
| `before-01-顶栏原生下拉框.png` | 改之前的顶栏 |
| `before-02-四个版本看起来都能选.png` | 改之前下拉框里的四项（无头浏览器画不出展开的原生下拉，临时把它撑成列表框拍的） |
| `before-03-选了纯答案版才报错.png` | 改之前：选了才报 |
| `before-04-选了大字完整版才报错.png` | 改之前：选了才报，还写「可以再试一次」 |
| `after-01-顶栏版本键.png` | 改之后的顶栏 |
| `after-02-打开版本菜单.png` | 鼠标打开：大字完整版、纯答案版置灰，各带一行原因 |
| `after-03-键盘走到省纸版.png` | 键盘走到省纸版（焦点环） |
| `after-04-再打开-勾在省纸版.png` | 回车选中后再打开，勾在省纸版 |
| `after-05-Esc关上-焦点回版本键.png` | Esc 关上，焦点环在版本键上 |
| `after-06-390宽-面板里打开版本菜单.png` | 390 宽，「⋯」面板里打开 |

## 跑过的检查

- `cd app && npx tsc -b`：通过。
- `npx eslint src/features/draft-paper/DraftPaperWorkbench.tsx src/shared-ui/Menu.tsx src/services/draftPapers.ts`：2 个 error、1 个 warning，都在 `DraftPaperWorkbench.tsx`，都是改之前就有的（拿 HEAD 版同一文件跑，同样是两处 set-state-in-effect、一处 exhaustive-deps，只是行号移了）。新增 0 个。`Menu.tsx`、`draftPapers.ts` 无问题。CSS 没有 lint 配置。
- 改过的 4 个 server 文件 `node --check`：通过。
- 上面的浏览器走查。走查时控制台有两条 401，是登录前的请求，和这次改动无关（改之前那次也有）。

## 没验证的和风险

- 按要求没跑任何 `verify-*.mjs` 或 `smoke-*.mjs`。在 `scripts/`、`app/src` 里搜「PDF 版本」「draft-product-control」，用到这个下拉框的只有上一轮走查脚本 `scripts/ux-walkthrough/find-compose-export.mjs`（第 15 步换版本），重跑要改成点菜单。读这两个源文件做字符串断言的 verify 脚本（如 `verify-draft-workbench-visual-unify.mjs`、`verify-c8-draft-paper-render-model.mjs`）没逐条核对。动了 `renderPaperProduct` 的代码位置，四款 PDF 的产品验证脚本应在 Ship 时跑。
- 只有「大字完整版没听力」「纯答案版没审过的答案」两种原因在浏览器里看到了；别的原因（只有听力、两个听力不同卷、题组缺失、Canonical 来源、答案发布记录不对）只看了代码。
- 排版才知道的失败（找不到合格版式等）事先判不了，菜单里仍显示可选，选了以后照旧报。
- 读屏：`Menu` 的方向键跳过禁用项，所以读屏用户走菜单时听不到置灰项和原因（小字挂了 `aria-describedby`，但焦点到不了）。要让读屏读出，得改 `Menu` 让禁用项也能停焦点，会影响所有菜单，这次没动，等定。
- 版本键宽度跟着版本名变（「省纸版」比「大字无听力版」短），换版本时顶栏右侧会挪一下，目测幅度小。
- 当前选中的版本如果用不了（比如默认大字无听力版而草稿只有听力），它会是打勾又置灰的样子，卷面照旧报原因。没在浏览器里看。
- 每次题组表变化多一次 `pdf-editions` 请求（本地约 0.3 秒，读库、读答案文件、校验哈希）；不进排版队。线上多快没量。
- 窄屏把版本放进「导出」菜单是第四节第 5 条，这次没做。
