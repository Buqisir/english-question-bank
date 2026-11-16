# 界面收尾三项 · 2026-11-16

三件事：听写页「选择练字单词」关上后焦点、个人空间删除确认框退场、四处整表报错换成共用 `Notice`。

截图：用 Playwright 拍元素截图（不是整页），宽 1440，`deviceScaleFactor` 2，放在 `shots/`。测试台是 `scripts/component-inventory/rig.mjs`（临时库，端口偏移 83），取证脚本是临时的，放在 scratchpad 里，用完已删，没进库。换前在改代码之前的干净工作区拍（HEAD 同分支），换后在改完的工作区拍，两边用同一个脚本、同一份数据。报错都是用路由拦截造出来的（接口回 500，原话以「rig：」开头）。

| 对比图 | 内容 |
|---|---|
| `01-handwriting-focus-{before,after}.png` | 「打印资料」那一排：在选词框里按 Esc 以后 |
| `01-handwriting-task-focus-{before,after}.png` | 听写记录一行的「下载资料」：在选词框里按 Esc 以后 |
| `02-space-confirm-esc-exit-{before,after}.png` | 个人空间删除确认框，按 Esc 后退场那一帧 |
| `02-space-confirm-delete-exit-{before,after}.png` | 同上，按「删除 PDF」后退场那一帧 |
| `03-entry-error-{before,after}.png` | 录题面板（编辑题组）保存失败 |
| `04-admin-backfill-error-{before,after}.png` | 管理台「给题库打主题标签」失败 |
| `05-agent-token-error-{before,after}.png` | Agent 口令：新建失败（页面上那一行） |
| `06-agent-token-revoke-error-{before,after}.png` | Agent 口令：作废失败（确认框里那一行） |

## 一、听写页「选择练字单词」关上后焦点落空

**问题**：`VocabularyDictationWorkbench.tsx` 里的 `<VocabularyHandwritingSelector>` 没有传 `returnFocus`。选词框是从下拉里的「衡水体练字纸」（或它的「另存为…」）打开的。点了那一项，下拉就收起了，那一项也看不见了。Dialog 默认把焦点还给打开那一刻的焦点，也就是这个看不见的键，`focus()` 没有生效，焦点就掉到了 `<body>`。

打开选词框的入口有三处，都是 `<details>` 下拉：
- 词组页签右栏「打印资料」（`printSelectedSets('handwriting')`）
- 刚生成的听写那一块，每行的「下载资料」（`downloadTaskMaterial(task, 'handwriting')`）
- 听写页签历史列表，每行的「下载资料」（同上）

**改法**（只改了 `VocabularyDictationWorkbench.tsx`）：
- `DownloadOption` 点下去的时候，本来就要先把所在的 `details` 收起来。现在顺手把这个 `details` 的 `summary` 交给 `onDownload` / `onSaveAs`（多了一个参数 `menuTrigger`，其他调用处不用这个参数，写法不变）。
- `printSelectedSets`、`downloadTaskMaterial` 多了一个可选参数 `menuTrigger`，只有「衡水体练字纸」这两项会传进来。`openHandwritingSelector` 把它记在 `handwritingReturnFocusRef` 里。
- 选词框传 `returnFocus`：记下的那个 `summary` 还在页面上，就回到它；不在了（比如列表刷新了），就交回 Dialog 默认。
- 写法参考 `VocabularyReviewPage.tsx`（回到「下载」键），区别是这里有三个入口，所以记下实际是哪一个，不写死一个 ref。

**确认生成以后的落点**：也回到同一个 `summary`。理由：下载在后台进行，结果写在页顶的提示行里（「衡水体练字纸已开始下载。」，`role="status"`、polite，实测）。焦点留在刚用过的那个下拉上，想接着下别的资料最近。附近没有比它更合适、又看得见的落点。

**焦点实测**（键盘：Tab 到 `summary` → Enter 展开 → 焦点移到「衡水体练字纸」→ Enter 打开选词框 → 用下面几种方式关上）

| 入口 | 关法 | 换前 | 换后 |
|---|---|---|---|
| 打印资料 | Esc | `body`（焦点落空） | `summary`「打印资料」，看得见，`:focus-visible` 为真 |
| 打印资料 | 「取消」 | `body` | 同上 |
| 打印资料 | 右上角「关闭练字单词选择」 | `body` | 同上 |
| 打印资料 | 「生成 N 词练字纸」（150ms 后，以及下载完 1.2 秒后各测一次） | `body` | 两次都是 `summary`「打印资料」 |
| 历史列表一行的「下载资料」 | Esc | `body` | `summary`「下载资料」，看得见，`:focus-visible` 为真 |
| 同上 | 「取消」 | `body` | 同上 |
| 同上 | 「生成 N 词练字纸」（150ms 后，以及下载完以后） | `body` | 两次都是 `summary`「下载资料」 |

PDF 接口拦截成一个假的小 PDF，两次都真的触发了下载。

**读屏**（推出来的，没有用真读屏器听）：落到 `summary` 时，念「打印资料」（或「下载资料」），加上「已折叠」，角色是展开 / 折叠按钮（`<details>` 原生 `summary` 的念法）。

## 二、个人空间删除确认框关闭时闪字

**问题（按任务描述）**：`MySpacePage.tsx` 的确认框，`open` 和 `description` 都是从 `confirmTarget` 算出来的。关上时 `confirmTarget` 被清成 `null`，退场那 120ms 里正文就会变成「删除「」？…」。

**换前实测：没有复现闪字。** 共用 `Dialog` 自己在退场时照最后一次打开时的 props 画（`Dialog.tsx` 里的 `lastOpenProps`），所以调用处就算把数据清空了，退场那一帧画的还是旧字。取证办法：
- 页面里挂了一个 `MutationObserver`，记下确认框开着（包括退场）期间正文出现过的每一种字。按 Esc 关和按「删除 PDF」关各试一次，换前换后都只记到一种字：「删除「期中复习卷」？PDF 文件会一并删除，此操作不可恢复。原草稿不受影响。」
- 定格退场那一帧：用 Playwright `clock.pauseAt` 停住 120ms 的卸载计时，用 CDP `Animation.setPlaybackRate(0)` 冻住退场动画，确认框停在退场开头（`data-visible="false"`，还没卸载）。这时拍下的图（`02-*-before.png`）字是完整的。注意：这一帧是冻在退场开头的，不是退场中间某一刻的自然画面。

**改法**（照做了，作用是让调用处不再靠 `Dialog` 内部兜着）：照 `App.tsx` 删除题组（`deleteGroupOpen`）和听写页确认框（`confirmOpen` / `pendingConfirm`）的写法，「开不开」单独放在 `confirmOpen` 里。
- `requestDeleteArtifact`：先 `setConfirmTarget(artifact)`，再 `setConfirmOpen(true)`。
- `onClose`：改成 `setConfirmOpen(false)`。
- `confirmDeleteArtifact`：只把其中一行 `setConfirmTarget(null)` 换成 `setConfirmOpen(false)`，别的逻辑一行没动（焦点安排、删除、重新取数、出错回到原来那一行都照旧）。
- `confirmTarget` 一直留到下次打开时再换。

**换后实测**：正文只出现过一种字，和换前一样。焦点：按 Esc 回到「更多操作：期中复习卷」；确认删除后落到下一份「更多操作：期末冲刺卷」，和换前一样，都看得见，`:focus-visible` 为真。

**读屏**：没有变化（`alertdialog`，名字是标题，描述是正文；推出来的）。

## 三、整表报错换成共用 Notice

这几处报错都不挂在单个字段上，而是整张表或整块的报错，所以用 `shared-ui/Notice`（`kind="error"`，`role="alert"`），不用 Field 的 error 行。字一个都没改。

| 位置 | 换前（实测） | 换后（实测） |
|---|---|---|
| 录题面板保存失败 `EntryModal.tsx` | `<p class="form-error">`，**没有 role**；红字 14px / 700，淡红底，圆角，732×40 | `Notice error danger`；警示图标加危险色字 `rgb(202,33,33)`，14px / 400，没有底，732×28 |
| 管理台打标失败 `AdminWorkbench.tsx` | 常驻的空 `<p role="alert" class="admin-backfill-error">`；红字 13px | 有错才挂 `Notice error`；图标加次要灰字，14px |
| 口令操作失败（页面上）`AgentTokens.tsx` | 常驻的空 `<p role="alert">`；灰字 13px（红色被 `.agent-tokens p` 的灰色压掉了，原来就是灰的），没有图标 | 有错才挂 `Notice error`；图标加次要灰字，14px |
| 口令作废失败（确认框里）`AgentTokens.tsx` | `{error ? <p role="alert">…` ；灰字 13px | `Notice error`；图标加次要灰字，14px |

**危险色**：只给了录题面板。它的两种报错（服务器没收下；一道小题都没有，根本没交）都是「题组没存住」，按 DESIGN.md §5 上 `danger`。其余三处不上危险色：打标没成，题库里的东西不会丢；口令没建成或没作废，名称还在框里。都不算 §5 说的「没保存」「会丢东西」。所以管理台打标失败从红字变成了灰字，这是有意的。

**「可再试一次。」**：字保留了，没有接 Notice 的 `action`。原因是重试就是上面那个「给题库打主题标签」键，在提示行末尾再放一个一样的键就重复了。

**读屏会念什么**（`role` 是实测的，念不念是推出来的，没有用真读屏器听）：
- 原来三处是常驻的空 `role="alert"` 容器，靠「容器里的字变了」触发朗读。现在改成有错才挂 `Notice`，一挂上就是 `role="alert"`。新插进来的 `alert` 元素，主流读屏都会立刻念，这是 WAI-ARIA 给 alert 的标准用法。
- 同一句报错连着出两次的情况：管理台每次点之前，`App.tsx` 都会先 `setBackfillError('')`；口令每次操作前，`mutate` 都会先 `setError('')`。所以第二次的报错会先卸掉再重新挂上，还是会被念。
- 录题面板原来的 `<p>` 没有 role，读屏不会主动念。现在会立刻念（「警告，rig：题组保存失败（测试拦截）」这一类，前面的提示词取决于读屏器）。
- 实测 `ariaSnapshot`（作废确认框）：`alertdialog "作废「组卷 Agent」？"` → `heading` → `paragraph` → `alert: 口令操作失败，检查连接后重试。` → 两个键。
- 换后，没出错时管理台上 `[role=alert]` 一个都没有（换前有两个空的）。

**一行截断**：`Notice` 只占一行，字太长就截断，整句放在 `title` 里，读屏能读到。录题面板的服务器原话如果很长，屏幕上会被截断，换前是折行显示全句。这是 `Notice` 本来的规矩，没有另外处理。

**删掉的样式**（删之前 grep 过 `scripts/`、`app/`、e2e 和 `server/`，除了要换的这几处，没有别的地方用这两个类名认元素；`.scratch/` 里只有清点数据快照，里面出现过这两个类名）：
- `App.css`：`.form-error`、`.form-error.compact` 两条；`.draft-batch-panel .form-error` 从并列选择器里去掉（`.draft-batch-panel` 别的几条没动）。
- `adminWorkbench.css`：`.admin-backfill-error` 两条（`.admin-backfill-fail` 留着，结果行「失败 N」还在用）。新加了一条只管排布的 `.admin-tool > .eqb-notice { flex-basis: 100% }`，让报错和原来一样单独占一行，写了显式层叠注释。

**样子**：报错从「红字（有的还带淡红底）」变成「警示图标加一行字」，高度从 19.5 / 40 变成 28（实测）。口令那一块报错下面的列表往下移了约 8px（目测，对比 05 号图）。

## 改了哪些文件

- `app/src/features/vocabulary-dictation-workbench/VocabularyDictationWorkbench.tsx`
- `app/src/features/my-space/MySpacePage.tsx`
- `app/src/workbench/EntryModal.tsx`
- `app/src/features/admin/AgentTokens.tsx`
- `app/src/features/admin/AdminWorkbench.tsx`
- `app/src/features/admin/adminWorkbench.css`
- `app/src/App.css`

共用构件（`app/src/shared-ui/*`）一个都没改。

## 检查

- `cd app && npx tsc -b`：通过。`npx vite build`：通过。
- 改过的文件跑 eslint，报错数和改前一样：`AgentTokens.tsx` 1 个（第 83 行 `_token` 没用到）、`MySpacePage.tsx` 2 个、`VocabularyDictationWorkbench.tsx` 1 个错加 1 个警告，都是改前就有的。其余文件 0 个。
- 按要求没有跑 verify-* 和 smoke-*。

## 没做的 / 没测到的

- **「另存为…」那条路没测到。** 它会弹系统的选文件框，无头浏览器里走不了。代码上和「下载」走的是同一个 `menuTrigger`。另外，选文件框关上以后，浏览器会把焦点还给弹框前的焦点，按理就是这个 `summary`，但这一点没有实测。
- 刚生成的听写那一块（`dictation-created-links`）里的「下载资料」，没有单独测。它和历史列表的那一行用的是同一个 `renderTaskDownloadOptions`。
- 只测了 1440 宽，没有拍 390 宽。
- 闪字换前没有复现（见第二项），所以这一项的对比图前后是一样的，证明不了「修好了」，只能证明「没变坏」。
- 换前就有、这次没改：个人空间确认框退场那 120ms 里，「删除 PDF」键还画着，而且还能点（`Dialog` 退场时没有挡住点击，画的是最后一次打开时的 `onClick`）。快速连点两下，理论上会对同一份文件发两次删除。这一点改前改后一样，属于共用 `Dialog` 的范围，这次没动。
- 读屏都是按 role 推出来的，没有用真读屏器听。
- `.draft-batch-panel` 那几条规则，在 tsx 里已经没有人用了。这次只去掉了里面的 `.form-error`，其余几条留给以后清理。

## 协调人复核（2026-11-16）

- 看过全部前后对比图。录题面板、管理台打标、口令三处换成 Notice 以后，和全站提示行一个写法，合格。管理台打标失败从红字变灰字，同意（不丢东西）。
- **改了一处：录题面板的校验提示不上危险色。** 子代理把「至少需要录入一道小题。」也上了 `danger`。这条只是校验提示，框里填的东西都还在，不算 §5 说的「没保存」「会丢东西」。现在 `EntryModal` 把它单独记成 `'invalid'`，用灰字加图标；只有服务器没收下（`'error'`）才上危险色。上面第 80 行的说法以这里为准。这一种没补拍。
- 个人空间闪字：改前没复现（共用 Dialog 退场时照最后一次打开的内容画）。改动保留，开关和内容分开，和别处写法一致，不依赖 Dialog 的这一点。
- 顺带发现的「退场那 120ms 里确认键还能点」记下，属于共用 Dialog，这次不动。

## 补拍 390 宽和录题校验提示（2026-11-16，协调人）

上面「只测了 1440 宽」「校验提示这一种没补拍」两条，这次补上。只拍了**换后**（当前 main，含 28187bd44 对话框退场 inert）；换前那份代码已经不在工作区，390 宽的换前**没拍到**。测试台同上（`rig.mjs`，临时库，端口偏移 91 / 92），脚本是把 `scripts/component-inventory/finish-shots.mjs` 拷一份、加了这几步，跑完已删，没进库。元素截图，390 × 844，`deviceScaleFactor` 2。报错照旧用路由拦截造（接口回 500）。

| 图 | 内容 | 实测 |
|---|---|---|
| `shots/03b-entry-invalid-after-390.png`、`shots/03b-entry-invalid-after.png`（1440） | 录题面板：题干全填空格再保存，「至少需要录入一道小题。」 | 灰字 `rgb(90,108,117)`，14px / 400，`role=alert`，没有危险色；390 宽 326 × 28，1440 宽 732 × 28 |
| `shots/03-entry-error-after-390.png` | 录题面板：服务器没收下（PUT 回 500） | 危险色 `rgb(202,33,33)`，14px / 400，`role=alert`，326 × 28 |
| `shots/04-admin-backfill-error-after-390.png` | 管理台打标失败 | 字是「rig：打标服务暂时不可用 可再试一次。」，`role=alert`，灰字 |
| `shots/05-agent-token-error-after-390.png` | 口令新建失败（先真建了一条，再让第二条失败） | 「口令操作失败，检查连接后重试。」，`role=alert` |
| `shots/06-agent-token-revoke-error-after-390.png` | 口令作废失败（确认框里） | 同上一句，`role=alert` |
| `shots/01-handwriting-focus-after-390.png` | 听写页「打印资料 → 衡水体练字纸」打开选词框，按 Esc 关上 | 焦点回到 `summary`「打印资料」，`:focus-visible` 为真 |
| `shots/02-space-confirm-after-390.png` | 个人空间删除确认框 | 按 Esc 后焦点回「更多操作：期中复习卷」；删了以后落到下一行「更多操作：期末冲刺卷」 |

- 口令那两张里，测试台临时生成的口令字打了码。
- 接口回的 `{ error }` 原话没有显示在口令那两处：前端照 `errorFromResponse` 用了兜底的「口令操作失败，检查连接后重试。」。录题、打标两处显示的是原话。这是原来就有的写法，这次没改。
- 看到一处排版（没改，记下）：刚建过一条口令、展示框还开着的时候，再新建失败，报错那一行挂在展示框**下面**，离「名称」框隔了一整块（390 宽这张就是这种情况）。没有展示框时报错紧挨着「名称」框（对照 1440 宽的 `05-agent-token-error-after.png`，那次没先建口令）。所以跟屏宽无关，跟顺序有关。要不要把报错挪到「新建口令」键下面，留给以后的界面任务。
- 退场那一帧（`02-space-confirm-*-exit-*`）这次没有在 390 宽重拍：28187bd44 以后退场那 120ms 面板是 inert，键已经点不动，拍出来和 1440 一样只是画面淡出。

## 顺带清掉的死样式（2026-11-16）

上面「`.draft-batch-panel` 那几条规则留给以后清理」这次清了：`App.css` 里 `.draft-batch-panel` 五条（连同窄屏那一条）、给它加虚线边的 `.auxiliary-batch-panel`、只在它里面用的 `.writeback-result`，共 60 行。删之前在 `app/src`、`server`、`scripts`、`e2e` 里搜过，这三个类名除了 `App.css` 自己，没有任何地方引用（也没有拼字符串拼出来的）。`npx vite build` 通过，`verify-ci --pack ui` 5 项全过。
