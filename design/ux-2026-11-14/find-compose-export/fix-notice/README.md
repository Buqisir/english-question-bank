# 共用提示行、首页题库没连上、下载成功只说文件名、挪一次只排一次（2026-11-14）

依据：`design/ux-2026-11-14/find-compose-export/README.md` 三、「路上的构件」第 1 名「提示行」；
四、第 7、8 条（Owner 已定照「建议」做）；`fix-waiting/README.md`「为什么要等一两分钟」第 3 条；
DESIGN.md §5「Notices 提示条」、§5 Proposal → Decision、「质感六条」的「安静」「现代」。

没改：PaperSurface、打印样式、PDF 模板样式、`shared-ui/Menu.tsx`、`menu.css`、`design/brand-2026-10-13/`、`scripts/brand/`、BRAND.md。
没有 commit / push，没装包，没跑任何 `verify-*.mjs` / `smoke-*.mjs`。

## 一、共用提示行 `app/src/shared-ui/Notice.tsx` + `notice.css`

一个件，五种：`info`（说明）、`waiting`（等待）、`success`（成功）、`error`（出错）、`undo`（撤销）。

- 一行：16px 图标 + 一行次要灰字（`--eqb-color-text-muted`，`--eqb-font-size-sm`，行高 20，最小高 28 和小号键一样高）。
  不折行，太长截断，整句放在 `title` 里，读屏读整句。
- 出错：`children` 写自己的话（哪里没成功、东西还在不在），`detail` 照登服务器原话，接在「：」后面；
  没有原话就不写，不另编兜底的话（No-Literal-Fallback）。能做什么放在行尾一个键上（`action`，用 `shared-ui/Button` 墨字小号）。
- 撤销：一个文字键「撤销」。
- 等待：不换掉旧内容，调用处把旧内容留着，只加这一行。
- 危险色只给「没保存」「会丢东西」（`danger`），目前只有草稿卷「⋯」面板里的保存出错用。
- 读屏：出错 `role="alert"`；其余 `role="status"` + `aria-live="polite"`。
- 放法 `placement`：`inline`（默认，位置由调用处给，不贴 x=0）、`over`（压在内容上：垫桌色 + e1）、
  `floating`（视口底部正中：白底 + e3，入退场照旧由 `useToastPresence` / `usePresence` 给 `data-visible`）。
- 颜色、间距、影子只用 `tokens.css` 的变量；动效用全站的 `--motion-*` / `--ease-*`。新写的覆盖规则都带 Explicit-Cascade 注释。

### 换掉的地方

| 地方 | 改前 | 改后 |
| --- | --- | --- |
| 找题页 `concierge-notice`（本地兜底说明） | 手写 `<p>` + 图标，字号 13px | `Notice info`，类名留着 |
| 找题页 `concierge-error`（搜索连不上） | 「搜索暂时连不上，你输入的内容还在。」+ 句中下划线「重试」，不带原话 | `Notice error`「搜索没连上，你输入的内容还在：原话」+ 行尾「重试」 |
| 找题页 `concierge-loading`（正在为「…」找题…） | 手写 `<p>` | `Notice waiting`，骨架照留 |
| 找题页 `concierge-data-loading`（正在连接本地题库） | 只在浏览态的列表面里出现；首页上看不到，只有搜索键上挤成两行的「搜索中…」 | 命令行下面固定一处 `.concierge-status-slot`，`Notice waiting`「正在连接本地题库，连上就能搜」 |
| 搜索键上的「搜索中…」 | 键 40px 宽，字挤成两行（`before-1440-03`） | 键上始终是图标，等的时候 `aria-busy`；在等什么由上面那一行说 |
| 草稿卷 `draft-loading`「正在打开草稿卷…」 | 手写 `<p>` | `Notice waiting`，在桌面正中那一栏离顶 24px |
| 草稿卷 `draft-error`（打开出错） | 「打开草稿卷没成功，可以再试一次。」贴 x=0，没键，没原话 | 「打开草稿卷没成功，卷里的题组没动：原话」+「重试」；拿到了但没有这份卷时改成说明「没找到这份草稿卷，可能已被删除」+「回找题页」 |
| 草稿卷 `draft-error`（导出出错） | 「导出 PDF没成功，可以再试一次。」贴 x=0 | 「导出 PDF没成功，草稿卷没动：原话」+「重试」；版式凑不出来、纯答案版不可用这两种再点也一样，不给「重试」 |
| 草稿卷「⋯」面板里的保存出错 | 红字段落「保存草稿卷没成功，可以再试一次。」 | `Notice error danger`「保存草稿卷没成功：原话」（没保存，所以是危险色） |
| 草稿卷 `draft-success`（下载成功） | 「PDF 已开始下载。 本卷采用小四（12pt）。 已满足长卷页数上限和正文版式，仍有 1 个题组跨 A3 正反面，请检查分页。」贴 x=0 | 「已下载：文件名」（另存为时「已保存：文件名」），见第三节 |
| 草稿卷「正在生成 PDF…」 | 没有（只有导出键上的忙碌态） | 同一个位置一行 `Notice waiting` |
| 草稿卷 `draft-empty-export` | 「请先添加题组，再下载 PDF 用于打印。」贴 x=0 | 「先加题组，才能下载 PDF」 |
| 草稿卷 `draft-warning`（迁移说明） | 手写 `<p>`，警告色 | `Notice info`（不会丢东西，不上警告色） |
| 草稿卷提示的位置 | 卷头行下面、贴窗口左边（x=0） | `.draft-notice-slot`：和排序建议卡同一套左右边距（左让出目录栏 212px，宽屏 A4 居中，≤900px 时 10px），宽最多 820px；一次只出一条 |
| 草稿卷 `.draft-a4-empty`「正在生成分页预览…」/ 出错 | 纸中间一句灰字；出错时「分页预览生成失败，请稍后重试。」这类兜底话 | `Notice waiting` / `Notice error`「排卷面没成功：原话」+「重试」 |
| 草稿卷 `.draft-a4-wait-line`（重排时盖在旧卷面上那一行） | 手写的一行（垫桌色、e1、图标、字、`Button`），出错时「生成分页预览没成功，可以再试一次。下面还是改之前的卷面。」 | 合进 `Notice placement="over"`：样子和原来一样（垫桌色、e1、圆角 8、宽度跟着字走），`.draft-a4-wait-line` 只剩位置（sticky、离纸顶 16px）；出错写「排卷面没成功，下面还是改之前的卷面：原话」+「重试」 |
| 草稿卷 `draft-undo-toast`（题组已移出 / 已替换这篇 / 加入 / 已保存到个人空间） | 黑底白字条，键是白底描边的手写按钮 | `Notice placement="floating"`：白底 + e3，键是 `shared-ui/Button`；入退场照旧 |
| 保存到个人空间对话框「正在读取文件夹...」/ 出错 | 手写 `<p>` | `Notice waiting` / `Notice error` |
| 整卷预览「正在打开整卷…」 | 手写 `<div>` | 居中一行 `Notice waiting` |
| 整卷预览打不开 `paper-browse-error` | 大标题「没找到这份卷面」+ 兜底段落「这份卷可能还没上线或已被移除…」+「错误信息：原话」+ 大号「返回找题」 | 居中一行 `Notice error`「整卷预览没打开，题库和草稿卷都没动：原话」+ 行尾「返回找题」 |
| 整卷预览「配相似」批量「加入草稿卷」 | 不等结果就说「已把 N 篇加入草稿卷」；同时失败还弹浏览器警告框「walk-forced 500」——两句互相打架（`before-*-15`，警告框记在 `walk-before-1440-15.json` 的 dialogs 里） | 等结果：成功说「已把 N 篇加入草稿卷，题目一并带上」；失败 `Notice error`「N 篇没加入草稿卷，还勾着：原话」+「重试」，没加入的留着勾选；不弹警告框 |
| `App.addGroupsToBasket` 的两个 `window.alert` | 加入失败、不可组卷时弹浏览器警告框 | 不弹；把结果（加入了哪些、哪些没加入和原话、为什么不可组卷）交回调用处，由提示行说 |

### 没换的地方（原因）

- `shared-ui/DraftAddButton.tsx` 键下那一行「没加入：原话」：是键自己的一部分（贴着键、跟着键走），不是页面上的提示位置；它已经是一行、`role="alert"`、照登原话。没动。
- 删除题组（详情页）的 `window.confirm` / `window.alert`：是「会丢东西」的确认，按 §5 Proposal → Decision 该换成确认对话框，不是提示行，不在这次范围。
- 生词本、过生词、导入审核等页面里的提示：不在这次点名的清单里，没动。
- `.draft-save-status`（顶栏「已保存 / 保存失败」）：是顶栏状态字，不是提示行，没动。

## 二、首页题库没连上（第 7 条）

**替换内容从哪来、什么条件下换：** `app/src/App.tsx` 的 `refreshQuestionGroups`。`GET /api/question-groups`
失败时（任何异常：5xx、断网、解析失败），如果手里还没有题，就 `setQuestionGroups(sampleQuestionGroups)`——
`app/src/data/sampleQuestionGroups.ts` 里随仓库打包的几道样例题——并把 `dataStatus` 记成 `'sample'`。
首页于是照常显示一个默认列表，看着像连上了；草稿丸的组数是从 `questionGroups` 里数 `draftPaperButtonState === 'in_current_draft'`，
样例题都不在草稿卷里，于是变成「草稿卷（0 组）」并且点不了（`before-1440-02`、`before-390-02`）。
已经拿到过真题以后再刷新失败，原来就保留真题，不换。

**改成：**

- `dataStatus` 改为 `'loading' | 'sqlite' | 'error'`，另记 `dataError`（原话）。不再用样例题（`App.tsx` 不再引入 `sampleQuestionGroups`；文件本身还在，脚本还在用）。
- 首页命令行下面一行 `Notice error`「题库没连上，草稿卷里的题还在：原话」+「重试」（`after-*-02`）。重试先回到「正在连接」，再拉一次（`after-*-02b`）。
  这时搜索框关着（占位字「题库没连上，暂时搜不了」），「浏览全部 N 套卷」不出（原来会写「浏览全部 0 套卷」），默认列表不出。
- 草稿丸：题库没拿到时另问一次当前草稿卷（`GET /api/draft-papers/current`，不新建），用它的题组数（`after-*-02`：「草稿卷（3 组）」，和改前同一份数据下的 0 组对比）。
  这个也问不到就不写数（「草稿卷」），不写 0；已经拿到过真题时照旧按真题数。
- `services/questionGroups.ts` 的 `fetchQuestionGroups` 出错时改为先读服务器给的原话（和其它接口同一个 `errorMessageFromResponse`），没给才用原来那句带状态码的。
  （`after-*-02` 里「：」后面的 `walk-forced 500` 就是走查拦接口时回的原话；第一次改后跑时这里还是 `Failed to load question groups: 500`，见 `walk-after-run1.json`。）

## 三、下载成功只说「已下载：文件名」（第 8 条）

- 成功那一行只说「已下载：文件名」（另存为是「已保存：文件名」）。文件名用 `services/draftPapers.ts` 已有的 `normalizeDownloadFileName`，和存下来的文件同名。
  当前浏览器不支持另存为、退成普通下载时原来那句「当前浏览器不支持系统另存为，已改为普通下载。」也不再说（文件照样下了）。
- 原来接在后面的排版检查（字号、跨 A3 正反面的题组数、跨页的选项组数）这次没放到别处。**等 Owner 定：**
  服务器只在下载响应头里给三个数（`x-paper-font-size-pt`、`x-paper-crossing-group-count`、`x-paper-split-option-bank-count`，
  `server/draft-paper/draftPaperRoutes.mjs`），不说是哪几组、在第几页。要「放到纸上对应那一页」，至少要：
  1. 服务器在 PDF 结果里给出跨面的是哪几组、在第几页（现在没有）；
  2. 草稿卷预览里在那一页旁边标出来。预览纸是 iframe 里的分页稿，旁边已有的「建议前置分页」小标签是挂在纸外的工作台贴纸（按分页结果的 `pageBreakSuggestions`），
     可以沿用这一路不进卷面；但 PDF 用的版本（比如大字无听力版、长卷版）和预览不一定是同一套版式，标在预览上的页和 PDF 的页可能对不上。
  如果要在卷面（PaperSurface / 分页稿）里标，就要改 PaperSurface 或打印样式——这次按要求没改。
  **风险：** 在 Owner 定之前，老师下载后看不到「仍有 N 个题组跨 A3 正反面」这句提醒；预览上的「建议前置分页」小标签照旧在。

## 四、挪一次只发一次分页请求

原因（`fix-waiting/README.md` 第 3 条）：下移、拖动是乐观更新，`reorderItems` / `moveItemTo` 只换数组顺序、不改 `orderIndex`；
PATCH 回来的题组表 `orderIndex` 重编成 1..n，`itemsLayoutKey` 又变一次，于是 400ms 防抖后发一次、PATCH 回来后再发一次。

改（`DraftPaperWorkbench.tsx`）：

1. 乐观更新也按新顺序重编 `orderIndex`（`renumberItems`，用在下移/上移、拖动、采用排序建议），和服务器 `updateDraftPaper` + `normalizeDraftItemOrder` 一致。
2. 题组表的保存（`persistItems`）也套上 `withLayoutSave`：保存没回来时不发分页请求（分页那个 effect 多看一个 `layoutSaveInFlight`），
   回来后按服务器的题组表发一次；回来的题组表和已经排好的那份一样（比如保存失败退回原样）就不再排。保存期间旧卷面照旧盖「正在重排」。

只改了这一个原因；「每次都是完整找版式」「排版排一条队」「排序建议也在队里」这几个没动。

量法：`walk.mjs` 的 `counts()`，1440 宽，三篇阅读的草稿卷；分页接口第一次真排，之后用缓存的结果拖 1.5 秒再回（只为不每次等半分钟，次数不受影响）；
保存（PATCH）分「不拖」和「拖 1 秒」（模拟线上慢），每种两次；再加左栏拖动换位一次。时间从点「下移」起算，含点开菜单的时间。

| 动作 | 改前分页请求 | 改后分页请求 |
| --- | --- | --- |
| 下移一次（保存不拖） | 2（531、1674 ms） | 1（2317 ms；保存 1207 ms 回来） |
| 下移一次（保存拖 1 秒） | 2（6575、8407 ms） | 1（8764 ms；保存 8029 ms 回来） |
| 下移一次（保存不拖，第二次） | 2（514、1651 ms） | 1（2323 ms） |
| 下移一次（保存拖 1 秒，第二次） | 2（6546、8326 ms） | 1（8550 ms） |
| 左栏拖动换位一次 | 2（562、1624 ms） | 1（1644 ms） |

数据：改前 `walk-before-390-counts.json`（这次跑的是 390 截图 + 1440 量次数），改后 `walk-after-run1.json`。
改前那几次第一次请求的结果前端会丢掉，但服务器照样排完；本地真排一次约半分钟，线上能省多少没量。
改后第一次请求比改前晚（要等保存回来再加 400ms 防抖），保存快时约晚 0.6–0.7 秒（本地），这段时间旧卷面盖着「正在重排」。

## 五、截图

都在本目录，DPR 2；`before-{宽}-{序号}-{名}.png` 是改代码以前拍的，`after-…` 是改后。浏览器里拦接口造的出错和等待，网站没改。

| 序号 | 场景 | 怎么造的 |
| --- | --- | --- |
| 01 | 首页说明行 | 搜一个搜不到的词，走本地兜底 |
| 02 / 02b | 首页题库没连上 / 点重试后 | `GET /api/question-groups` 回 500；02b 放开后点「重试」（只有改后有） |
| 03 | 首页等题库 | 题库接口拖 6 秒，1.5 秒时拍 |
| 04 | 打开草稿卷时等 | 草稿卷接口拖 6 秒 |
| 05 | 草稿卷打不开 | 草稿卷接口回 500 |
| 06 | 第一次生成分页预览 | 分页拖 8 秒 |
| 07 | 下移后等重排 | 分页拖 8 秒 |
| 08 | 重排失败 | 分页回 500 |
| 09 | 保存失败（打开「⋯」看） | PATCH 回 500 |
| 10 | 导出出错 | `print-pdf` 回 500 |
| 11 | 下载成功 | 假 PDF，响应头带「跨 A3 1 组、小四」 |
| 12 | 移除后的撤销提示 | 题组菜单「移除」 |
| 13 | 空卷导出提示 | 清空草稿卷 |
| 14 | 整卷预览打不开 | 临时库里的卷面文件没拆包，页面自己报错（原话是前端的 `Cannot read properties of undefined (reading 'blocks')`） |
| 15 | 配相似批量加入失败 | 卷面文件在浏览器里拆包、相似题接口塞两条、加入接口回 500 |

### 截图里要说明的

- **04 改前是空白页**：改前那次在跳转后 1.5 秒拍，页面自己还没加载完，拍到的是空桌面，不能拿来和改后比。改后那次改成等顶栏出来再拍。
  改前的「正在打开草稿卷…」是一行手写灰字（`draft-loading`），代码里看得到，图没拍到。
- **1440 宽的改前 15** 是单独补跑的（第一次整跑时相似题接口塞错了，见 `walk-before-1440-15.json`）；390 宽的在整跑里。
- 改前 1440 的 01–14 在 `walk-before-1440.json`，390 的在 `walk-before-390-counts.json`。
- 改后跑了两次：第一次（`walk-after-run1.json`）截图加量次数；之后补了三处（首页没数据时不出「浏览全部 0 套卷」、题库接口照登原话、04 等顶栏再拍），
  第二次只重拍截图（`walk-after-shots.json`），现在目录里的 `after-*.png` 是第二次的。

## 六、跑过的检查

- `cd app && npx tsc -b`：通过。
- `npx eslint` 改过的 8 个 ts/tsx 文件：报出的 11 条（`set-state-in-effect`、`exhaustive-deps`、`only-export-components`、`no-irregular-whitespace`）
  拿 HEAD 版本的同一文件跑也都有，条数一样，只是行号挪了；这次没有新增。`Notice.tsx`、`ConciergeDesk.tsx` 没有报错。CSS 没有 lint 配置，没跑。
- 上面的浏览器走查。

## 七、没验证的

- 线上（慢网络、服务器忙）挪一次的实际等待时间；只在本地量了请求次数。
- 屏幕阅读器实际朗读：只看了 role / aria-live 属性，没用读屏软件听。找题页的 `concierge-results` 外层原来就有 `aria-live="polite"`，里面的提示行又是 status，可能会读两遍，没核实。
- 「⋯」面板很窄（1440 宽约 270px），保存出错那一行原话会被截断（整句在 title 和读屏里）。
- 另存为（`showSaveFilePicker`）那条路的「已保存：文件名」没在浏览器里走过（Playwright 里走的是普通下载）。
- 换篇（替换）、采用排序建议之后的分页请求次数没单独量；代码上走的是同一条（`persistItems` 或本来就有的 `withLayoutSave`）。
- 读到「已经有真题后再刷新失败」的情况没造（状态仍是 sqlite，照旧显示已有的题，没有提示行）。

## 八、按代码读，可能会挂的检查脚本（没跑）

- `scripts/verify-concierge-desk.mjs` Test 15：正则要 `dataStatus?: 'loading' | 'sqlite' | 'sample'`（改成了 `'error'`）、要 `<p className="concierge-data-loading"` 带 `role="status"`（换成了 `Notice`）、要 CSS 里有 `.concierge-data-loading { }` 规则（拿掉了）。会挂三条。`const dataLoading = dataStatus === 'loading'` 那条应该还过。
- `scripts/verify-friendly-export-warning.mjs`：等「仍有 2 个题组跨 A3 正反面」，查 `.draft-success` 里的「已保持指定页数」「五号（10.5pt）」等字。第 8 条把这些从成功提示里拿掉了，会挂。
- `scripts/verify-paper-canonical-import-pilot.mjs`（约 15128 行）：读 `.paper-browse-error p`；现在里面没有 `<p>`，会挂。
- `scripts/verify-paper-canonical-import-pilot-fixes.mjs`、`verify-paper-canonical-application-writing-rendered-behavior.mjs`：读 `.paper-browse-error` 的 innerText 去比对字句；字句变了（不再有「没找到这份卷面」和兜底段落，原话前面没有「错误信息：」），按它们比的内容可能挂。
- `scripts/smoke-golden-path.mjs`、`smoke-concierge-stream.mjs`、`smoke-paper-draft-ui.mjs`：查 `.concierge-loading` / `.concierge-error` / `.concierge-data-loading` 这几个类名，类名都留着；`concierge-data-loading` 现在放在命令行下面、在首页也会出现，等「它消失」的那几处应该照常；`.concierge-loading` 的字仍含查询词。估计能过，没把握。
- `scripts/verify-draft-switch-mutations.mjs`：撤销键 `.draft-undo-toast[data-visible="true"] button` 文字「撤销」还在；`.draft-error` 计数为 0 的断言，打开出错那一屏和「⋯」面板里的保存出错仍用这个类名，和原来一样。估计能过。
- `scripts/ux-walkthrough/find-compose-export.mjs`、`fix-waiting/walk.mjs`：按旧字句（「搜索中…」、旧的出错话、`.draft-a4-wait button`）找东西的地方可能对不上。

## 文件

- 新：`app/src/shared-ui/Notice.tsx`、`app/src/shared-ui/notice.css`、本目录 `walk.mjs`、截图和 json。
- 改：`app/src/App.tsx`、`App.css`、`concierge/ConciergeDesk.tsx`、`features/draft-paper/DraftPaperWorkbench.tsx`、`DraftPaperWorkbench.css`、
  `features/paper-browse/PaperBrowsePage.tsx`、`SimilarQuestionsRailView.tsx`、`paperBrowsePage.css`、`qa/mountCanonicalPaperBrowse.tsx`（跟着加入回调的类型改）、
  `services/draftPapers.ts`（下载结果带上文件名）、`services/questionGroups.ts`（题库出错照登原话）。
