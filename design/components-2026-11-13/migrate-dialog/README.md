# 对话框 / 抽屉换成共用构件 Dialog（构件厂，2026-11-14）

站上原来有 5 处模态对话框，3 种写法：原生 `<dialog>` + `components/useModalDialog`（草稿卷保存、作废口令、录题面板），
`<div role="alertdialog">` + 自己写的 keydown 循环（个人空间删除），`<section role="dialog" aria-modal>` + 自己写的
keydown 循环（选择练字单词）。这次收成一个件 `app/src/shared-ui/Dialog.tsx`（样子在 `dialog.css`）。

- 行为全站一样：原生 `showModal`（沿用 `useModalDialog`，加了一个 `returnFocus` 选项）；Tab / Shift+Tab 在里面绕圈；
  Esc 关；关上后焦点回到打开它的键；开着时背后页面不能滚；点遮罩默认不关（`closeOnBackdrop` 打开才关）；
  `busy` 时 Esc、遮罩、关闭键、「取消」都不关。
- 打开时焦点：调用处给 `initialFocus` 就用它；否则正文里第一个能 Tab 到的控件；没有正文（确认框）就是底部第一个键，
  也就是「取消」，按回车不会误删。
- 两种语气：`tone="dialog"`（读屏 dialog，名字 = 标题）；`tone="alert"`（读屏 alertdialog，名字 = 标题，
  描述 = description，确认键危险字）。
- 结构：标题（14 / 600）+ 可选说明（13 次要灰）+ 可选右上角关闭键（`closeLabel`）→ 正文（长了在这里滚）→
  底部：左边一行 footnote，右边「取消」「确认」。
- 尺寸：sm 360 / md 440 / lg 620；放法：center（默认）/ side（贴右边满高的抽屉）。
- 外观全部来自 tokens：白底 `--eqb-color-paper`、影子 `--elev-3`（DESIGN.md §4 弹窗 e3）、圆角 `--eqb-radius-card`
  12（§5 Single-Radius-Family）、内边距 24 / 组间 16 / 键间 8（`--eqb-space-*`）。宽度和遮罩色 tokens 里没有，见「缺的变量」。
- 动效：遮罩淡入，面板淡入 + 从 0.97 放大（抽屉从右边 24px 滑进来）；入场 `--motion-base`（抽屉 `--motion-slow`），
  退场 `--motion-fast`，曲线 `--ease-out`。系统「减少动态效果」时不做过渡（before 时站上没有一处照顾到，见键盘表下面）。

样张：`../sheet-dialog-new.png`（五种变体，各 1440 / 390）。

## 主次顺序（DESIGN.md 没写，照站上多数）

DESIGN.md §5 只规定了按钮的语气，没写对话框里键的顺序和对齐。站上 5 处里 4 处是「取消在左、确认在右、整组靠右」
（草稿卷保存、个人空间删除、选择练字单词、录题面板），只有作废口令是靠左。照多数：**取消在左、确认在右、靠右排**。

- 都是 `Button` 大号（36）。「取消」墨字透明底（`strong`）。
- 普通确认用石板墨填充（`solid`）：雾薄荷主键（`primary`）留给页面上那唯一一处（DESIGN.md §2 Accent），对话框里的「保存」不跟它抢。
  原来草稿卷「保存」就是 solid；选择练字单词原来是 `.primary-button`（也是石板墨填充），样子不变。
- alert 的确认用危险字（`danger`）。个人空间「删除 PDF」原来就是；作废口令原来是两个一样的 `.ghost-button`，现在「作废「…」」变成危险字。

## 换了哪些处

| 处 | 文件 | 换成 | 变化 |
| --- | --- | --- | --- |
| 草稿卷「保存 PDF 到个人空间」 | `features/draft-paper/DraftPaperWorkbench.tsx` | `Dialog` md，`onSubmit`（面板是 form），`closeLabel="关闭"` | 打开时焦点从右上角「关闭」改到「文件名」输入框（第一个合理的控件）；背后不再能滚 |
| 个人空间「删除草稿卷 PDF」 | `features/my-space/MySpacePage.tsx` | `Dialog tone="alert"` sm，`returnFocus` 指回「更多操作」键 | `<div>` 换成原生 `<dialog>`（背后整页 inert）；读屏多了描述（「删除「…」？PDF 文件会一并删除…」）；自己写的 keydown 循环删了 |
| 后台「作废 Agent 口令」 | `features/admin/AgentTokens.tsx` | `Dialog tone="alert"` md | 读屏角色 dialog → **alertdialog**，多了描述；键从靠左改为靠右；确认键变危险字；错误提示只在出错时出现 |
| 题组「录入 / 编辑题组」（录题面板） | `workbench/EntryModal.tsx` | `Dialog placement="side"`，`onSubmit` | 去掉标题上方的英文小字「Manual Entry」（见 Owner 问题 2）；打开时焦点从「关闭录题面板」改到第一个字段 |
| 过生词「选择练字单词」 | `features/vocabulary-practice/VocabularyHandwritingSelector.tsx`（+ `vocabulary-review/VocabularyReviewPage.tsx` 传 `returnFocus`） | `Dialog` lg，`closeOnBackdrop`（原来就是点遮罩关），`footnote` | 标题 20 → 14；窄屏从底部抽屉改为居中（见 Owner 问题 3）；**关上后焦点从丢到 body 修成回到「下载」键**；打开时焦点从关闭键改到「全选」 |

每处 before / after 对照：`compare-<处>.png`（1440 一行、390 一行）；原图在 `before/`、`after/`（`<处>-<宽>.png` 整屏，`-crop.png` 框住面板）。

## 没换的处和原因

| 处 | 为什么没换 |
| --- | --- |
| 读卷划词浮层 `features/paper-browse/selection/SelectionOverlay.tsx` | 不是模态：贴着选中的文字浮出来（`aria-modal=false`），开着时还得保留页面上的选区、页面照常能点能滚。换成 showModal 会把选区和页面一起锁死。 |
| 读卷讲解抽屉（`.paper-browse-lecture-backdrop`） | 非模态侧栏：遮罩 `pointer-events: none`，≥1440 时停靠在页面旁边，边读卷边看讲解。不该锁背后。 |
| 草稿卷左栏「换题」抽屉（`DraftPaperRail`） | 是左栏里原地换掉的内容，不是浮层。 |
| 过生词「分享下载」确认（`pendingShareDownload`） | 是下载菜单下面展开的一块行内面板，不盖页面。 |
| 浏览器原生 `window.confirm` / `alert`：`App.tsx` 删除题组（约 520、528 行）、`VocabularyDictationWorkbench.tsx`（约 487、796 行） | 换成 Dialog 要把「同步等返回值」改成「开框 → 等点 → 再做」，调用流程会变，算行为改动，不在这次「不加功能」的范围里。见 Owner 问题 1。 |
| 听写工作台调用「选择练字单词」（`VocabularyDictationWorkbench.tsx`） | 外壳已经跟着选择框一起换了；只是没传 `returnFocus`：那里打开它的键一直在，默认回到原来的焦点就对。 |

## 键盘和读屏（Playwright 实测，`before/keyboard.json`、`after/keyboard.json`）

做法：每处用键盘打开（打开键聚焦后按 Enter），记打开时焦点、读屏（CDP `Accessibility.getPartialAXTree`）的角色 / 名字 / 描述，
1440 宽下连按 Tab 和 Shift+Tab 各比可聚焦数多 2 下看焦点出没出去，在遮罩上滚轮看背后动不动，按 Esc 看关没关、焦点回哪，
再点遮罩看关不关。390 宽同样做一遍（不再按 Tab 圈）。两种宽度结果一样（只有 before 录题面板 390 下滚轮落在满宽面板上，没滚到背后）。

| 处 | | 读屏角色 · 名字 | 描述 | 打开时焦点 | Tab / Shift+Tab 不出去 | 背后滚不滚 | Esc 关 | 关后焦点 | 点遮罩 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 草稿卷保存 | before | dialog「保存 PDF 到个人空间」 | 无 | 关闭 | ✓ | 滚 ✗ | ✓ | 导出 ✓ | 不关 |
| | after | dialog「保存 PDF 到个人空间」 | 无 | 文件名输入框 | ✓ | 不滚 ✓ | ✓ | 导出 ✓ | 不关 |
| 个人空间删除 | before | alertdialog「删除草稿卷 PDF」 | 无 ✗ | 取消 | ✓ | 滚 ✗ | ✓ | 更多操作 ✓ | 不关 |
| | after | alertdialog「删除草稿卷 PDF」 | 「删除「…」？PDF 文件会一并删除…」 ✓ | 取消 | ✓ | 不滚 ✓ | ✓ | 更多操作 ✓ | 不关 |
| 作废口令 | before | dialog ✗「作废「清点用口令」？」 | 无 ✗ | 保留口令 | ✓ | 滚 ✗ | ✓ | 作废口令 ✓ | 不关 |
| | after | alertdialog ✓「作废「清点用口令」？」 | 「使用这条口令的 Agent 将立即失去…」 ✓ | 保留口令 | ✓ | 不滚 ✓ | ✓ | 作废口令 ✓ | 不关 |
| 录题面板 | before | dialog「编辑题组」 | 无 | 关闭录题面板 | ✓ | 滚 ✗（1440） | ✓ | 更多操作 ✓ | 不关 |
| | after | dialog「编辑题组」 | 无 | 来源类型（第一个字段） | ✓ | 不滚 ✓ | ✓ | 更多操作 ✓ | 不关 |
| 选择练字单词 | before | dialog「选择练字单词」 | 无 | 关闭练字单词选择 | ✓ | 滚 ✗ | ✓ | **body ✗** | 关 |
| | after | dialog「选择练字单词」 | 「〈词组名〉 · 保持原词序」 ✓ | 全选 | ✓ | 不滚 ✓ | ✓ | 下载 ✓ | 关（照原来） |

减少动态效果（草稿卷保存那一处测面板的 computed style）：before 两种设置下都是 `transition: opacity, transform 0.16s`（没照顾到）；
after「不减少」时 0.16s 过渡，「减少」时 `transition-property: none` ✓。

已知的小问题（原来就有，这次没改）：个人空间删除、作废口令、选择练字单词按了**确认**以后，打开它的键已经消失或变成禁用
（删掉的行、作废后的行没有「作废口令」键、生成时「下载」禁用），焦点回不去，落到 body。Esc / 取消没问题。

## 删掉的旧 CSS

- `App.css`：`.entry-backdrop, .draft-modal-backdrop` 的原生模态规则（含 `::backdrop`、`:not([open])`），`.entry-backdrop`、`.entry-panel`、
  `.entry-header`、`.entry-header-hint`、`.entry-header-actions`、`.entry-header h2`、`.entry-form` 基础块（overflow / padding）、`.entry-footer`。
  `.entry-form fieldset / legend / .wide` 和窄屏 fieldset 规则还在（表单本身没动）。
- `DraftPaperWorkbench.css`：`.draft-modal-backdrop`（含 visible）、`.draft-save-space-dialog` 面板（含 visible）、`.draft-dialog-head`、`.draft-dialog-actions`。
  加了一条 `.eqb-dialog-body.draft-save-space-body`（正文里的表单排成 grid）。
- `MySpacePage.css`：`.my-space-modal-backdrop`（含 visible）、`.my-space-confirm-dialog`（含 visible、h3、p）、`.my-space-confirm-actions`、减少动态效果那一段。
- `adminWorkbench.css`：`.agent-token-dialog` 和它的 `::backdrop`；`.agent-token-dialog h2 / p / > div` 从和 `.agent-tokens` 共用的选择器里拿掉。
- `vocabularyHandwriting.css`（只动屏幕样式，`@media print` 一个字没改）：`.vocabulary-handwriting-selector-backdrop`、面板 `.vocabulary-handwriting-selector`、
  `> header` / `> footer` 及其中的 h2、p、关闭键、`> footer > div`、≤640 底部抽屉那一段。工具条、练习方式、单词列表的规则留着（内边距改用 `--eqb-space-*`），
  加了两条覆盖（正文只让列表滚；列表和底部之间一条发丝线）。`<dialog>` 上还挂着 `vocabulary-handwriting-selector-backdrop`，打印样式靠它藏掉这一层。

留作选择器钩子、不再带样式的类名：`.draft-save-space-dialog`、`.my-space-confirm-dialog`、`.my-space-delete-confirm`、`.agent-token-dialog`、
`.vocabulary-handwriting-selector`（现在挂在正文上）、`.vocabulary-handwriting-selector-list`（verify 脚本认它）。

验证脚本（只改了断言，没跑）：`verify-c8-my-space-contracts.mjs`（删除确认改查 `<Dialog` + `tone="alert"`）、`verify-my-space-shelf.mjs`
（`role="alertdialog"` → `tone="alert"`）、`verify-draft-workbench-visual-unify.mjs`（「保存」solid / 「取消」strong 改查调用处传给 Dialog 的 cancel / confirm
和 Dialog.tsx 里的两种语气）。`verify-a3-imposition.mjs`、`verify-vocabulary-rendered-behavior.mjs`、`verify-pa-only-add-detail-consistency.mjs`
用的是角色 + 名字（dialog「保存 PDF 到个人空间」、「选择练字单词」、键「关闭录题面板」），名字没变，不用改。
旧的清点脚本 `component-inventory/space-shots.mjs`、`decisions-a1-shots.mjs` 里还认 `.my-space-confirm-actions`，那是已交的取证脚本，没动。

## 缺的变量

tokens.css 里没有，先写成 `dialog.css` 文件头 `:root` 里的局部变量，每个注明出处；已记到 `docs/design-gaps.md`（2026-11-14 对话框构件那条）。

| 局部变量 | 值 | 出处 | 候选名 |
| --- | --- | --- | --- |
| `--eqb-dialog-width-sm` | 360px | 个人空间删除确认原来的宽 | `--eqb-dialog-width-sm` |
| `--eqb-dialog-width-md` | 440px | 草稿卷保存、作废口令原来的宽 | `--eqb-dialog-width-md` |
| `--eqb-dialog-width-lg` | 620px | 选择练字单词原来的宽 | `--eqb-dialog-width-lg` |
| `--eqb-dialog-width-side` | 780px | 录题面板原来的宽 | `--eqb-dialog-width-side` |
| `--eqb-dialog-scrim` | 墨 28%（`color-mix(in srgb, var(--eqb-color-text) 28%, transparent)`） | 原来五处 28% ×2、30%、32%、42%，取最多的 | `--eqb-color-scrim-modal` |

关于已有的 `--eqb-color-scrim` 候选（design-gaps「草稿卷重排遮罩」那条）：那是桌色 60% 的浅遮罩，意思是「旧内容还在、正在换新」；
这里是压暗整页、把弹窗托出来，深浅和用途都不同，不宜共用一个名字，所以另记一条。

另外借用的：说明和正文字号用 `--eqb-font-size-control`（13），名字说的是控件（同空状态那条）。

## 要 Owner 定的

1. **`window.confirm` 要不要也换成 Dialog？**（App.tsx 删除题组、听写工作台两处）建议：换，用 `tone="alert"`，但算一张单独的票，因为调用流程要从同步改成异步。
2. **录题面板去掉了标题上方的英文小字「Manual Entry」。** Dialog 的标题区只有标题 + 说明，没有眉题；DESIGN.md 工具界面也不用英文眉题。建议：就这样去掉；要留的话改成中文 description，比如「手动录入题组」。
3. **选择练字单词在窄屏从「底部抽屉」改成居中弹窗。** 全站对话框窄屏都是居中、四周留 16。建议：保持居中；如果想要底部抽屉，加成 Dialog 的一种 `placement="sheet"`，所有对话框窄屏一起用，不单给这一处。
4. **点遮罩默认不关。** 只有选择练字单词保留了原来的「点遮罩关」。建议：维持默认不关（确认、填表防误关），选择练字单词也改成不关，全站一致。
5. **作废口令改成 alertdialog、键靠右、作废键危险字。** 这是照「确认危险操作」统一的结果，样子和原来不一样（原来两个一样的键靠左）。建议：照现在。

## 怎么拍的

```
INVENTORY_PORT_OFFSET=61 node scripts/component-inventory/dialog-shots.mjs before   # 改代码前拍
INVENTORY_PORT_OFFSET=61 node scripts/component-inventory/dialog-shots.mjs after    # 改完拍
node scripts/component-inventory/dialog-sheet.mjs                                   # 拼 compare-*.png 和 ../sheet-dialog-new.png
```

`dialog-shots.mjs` 起本地测试站（数据在 `RAW/rigdata-61/`，导入校准词表、新建一组题组），每处用键盘打开，拍 1440 和 390 两种宽度（2 倍图），
键盘和读屏结果写进 `<before|after>/keyboard.json`。Playwright 从 `app/package.json` 用 `createRequire` 载入，Chromium 用 `INVENTORY_CHROMIUM` 或 `/opt/pw-browsers/chromium`。
