# Design Gaps Log

来源规则：`docs/agents/ui-collaboration.md`「写 CSS 与 token 的纪律」里的
The No-Literal-Fallback Rule（design-canon 立项 2026-07-14；2026-10-13 以前写在
DESIGN.md §7）。agent 写 CSS/token 时遇到既有 token 体系覆盖不到的取值
（颜色/间距/圆角/时长/曲线等），**禁止**现场拼字面量兜底——在这里显式
记一条缺口，标注临时方案，攒批等 owner 拍板收编成正式 token 或既有
token 的扩展用法。

条目收编后从本文件删除（或标记「已收编 → 落地 commit」），不留死缺口。

## 格式

每条一个二级标题，四个字段：

```
## YYYY-MM-DD 位置（文件:行 或 组件名）

- **想要的值**：描述这次实际需要、但现有 token 不覆盖的取值
- **临时方案**：这次先怎么权宜处理的（字面量/复用哪个不完全贴切的 token）
```

## 条目

## 2026-07-15 paperBrowsePage.css `.paper-browse-rail-panel`（整卷预览目录 rail 面板底）

- **想要的值**：暖纸系的「纸面 surface」档——一张浮在暖纸桌（--paper-bg
  #f4f1ea）上的浅纸面板底色，与卷面 A4 白同族但略低一级；--paper-* 家族现
  只有 bg/ink/ink-strong/border 四档，没有 surface 档。
- **临时方案**：字面量 `rgba(255, 255, 255, 0.6)`（半透明白叠暖纸底），落在
  `.paper-browse-rail-panel` 的 background。若日后收编，候选名 `--paper-surface`。

## 2026-08-28 全站按钮基档字号 13px（App.css `.primary-button/.ghost-button/...` 共享块）

- **想要的值**：按钮标签字号收进 The Four-Step UI Type Ramp（28/16/14/12 四档，
  禁 13px 半档）——需 owner 拍板走 12px（Label，更秀气）还是 14px（Compact
  Body，更舒展），再一刀切。
- **临时方案**：维持既有 13px 不动（quiet-chrome 刀只摘盒子、不动字号，避免
  全站布局位移）。本刀已顺手把 `.concierge-action` 的 12.5px 收进 12px，
  其余 13px 实例留待本缺口闭环。
- **2026-10-13 注**：2026-09-04 起工具界面四级字号改为 12 / 13 / 14 / 20
  （DESIGN.md §3），13px 已在族内。这条缺口等 Owner 确认后删除。

## 2026-09-15 语义色写小号正文（成功 `#1FA062`、提醒 `#E8901A`，跨文件）

- **想要的值**：能写小号正文、对浅底达到 WCAG AA（≥ 4.5:1）的语义色文字档，
  并在各文件之间统一。实测成功色对白 3.35:1，提醒色对白 2.49:1；提醒色的明度
  是 Owner 为讲评线色所定，线和图形不改。
- **临时方案**：语义色只作 chip 底、边、图标和大字。提醒色写小字时用
  `--eqb-color-warning-text`（`#965a08`，对白 5.58:1）；成功色还没有对应的
  文字档。2026-10-13 从 DESIGN.md §2 移入，留待独立刀。

## 2026-09-30 句子分析卡片（`.paper-sentence-analysis`）

- **想要的值**：成功绿的深色文字档，和 `--eqb-color-warning-text` 对称。成分标签、引导词和气泡标题都是 11–14px 的绿字，直接用 `--eqb-color-success #1FA062` 过不了 4.5:1。
- **临时方案**：在 `.paper-sentence-analysis` 里用 `color-mix(in srgb, var(--eqb-color-success) 68%, var(--desk-ink))` 派生出 `--sa-green`，不进全局 token。若日后收编，候选名 `--eqb-color-success-text`。
- **2026-10-13 更新**：卡片已改成「奶青 + 奶黄」两色方案，上面的绿字派生不再使用。想要的值：一组可点击成分的浅青底/边/字，一组「正在读」的浅黄底/边。临时方案：`sentenceAnalysis.css` 顶部的 `--sa-label-bg #dcede3`、`--sa-label-rest #e5f1e9`、`--sa-label-edge #bcd6c7`、`--sa-action-hover #cde5d7`、`--sa-action-selected #b4d8c4`、`--sa-label-active #5a8a72`、`--sa-label-ink #2f5a45`、`--sa-green-wash #ffe8ad`、`--sa-related-bg #fff4d7`、`--sa-text-edge #b89c56`，只在卡片作用域内生效。若收编，候选名 `--eqb-color-annotation-*`。
- **想要的值**：比 12px Label 再小一级的"行间标注"字号。原句上方的成分标签、下方的难点标签、弱墨小字和气泡按钮要夹在 3.9 倍行距的两行正文之间，12px 会让相邻标签更常互相让位。
- **临时方案**：这几处用 11px 字面量（`sentenceAnalysis.css` 的 `.sa-label`、`.sa-flag`、`.sa-quiet`、`.sa-bubble-unsure`、`.sa-bubble-action`）。若收编成 Type Ramp 的注释档，候选名 `--eqb-font-size-annotation`。
- **想要的值**：贴在正文里的轻浮层阴影。`--eqb-shadow-floating`（0 8px 24px 12%）对一行高的气泡太重，会压住下一行字。
- **临时方案**：`.sa-bubble` 用 `0 2px 8px rgba(25, 29, 24, 0.08)`。候选名 `--eqb-shadow-inline`。

## 2026-10-15 登录页 08 雾海（`app/src/auth/LoginPage.css`）

- **想要的值**：比 14px 大一档、比 20px 小的品牌页正文字号。登录页是品牌时刻，品牌名、副题和登录按钮在 64px 标语旁边用 14px 显得太弱，用 20px 又和标语抢。
- **临时方案**：`.login-brand`、`.login-subtitle`、`.login-submit` 用 15px 字面量。若收编，候选名 `--eqb-font-size-brand-body`。
- **想要的值**：手机输入框的字号下限。iOS Safari 在输入框字号小于 16px 时聚焦会放大页面。
- **临时方案**：≤760px 时 `.login-field input` 用 16px 字面量。若日后全站表单都需要，候选名 `--eqb-font-size-input-mobile`。

## 2026-11-13 危险色写小字（`app/src/shared-ui/button.css` `[data-tone='danger']`、`menu.css` 危险菜单项）〔已收编 → 落地 commit：「构件厂：拍板落地 A1」那次提交〕

- **想要的值**：危险色的文字档，和 `--eqb-color-warning-text` 对称，在桌面底 `#F1F5F7` 和悬停底 `#E6EDF0` 上也达到 WCAG AA（≥ 4.5:1）。构件厂第一批实测（`design/components-2026-11-13/batch-1/checks.json`）：`--eqb-color-danger #DC2626` 对白 4.83，对桌面底 4.40，对悬停底 4.08，axe 报 color-contrast。若收编，候选名 `--eqb-color-danger-text`。
- **临时方案**：构件里危险字仍用 `--eqb-color-danger`，不现场编深一档的红；放在白底（菜单、纸）上静止时达标，放在桌面底或悬停 / 键盘焦点时不达标。等 Owner 定色。
- **已收编（Owner 2026-11-14 决定 #9）**：`tokens.css` 新增 `--eqb-color-danger-text: #ca2121`，对白 5.60、对桌面底 5.10、对悬停底 4.73，都过 AA；`button.css` 危险键和 `menu.css` 危险项写字改用它，图标跟字走。`--eqb-color-danger` 本身不动。样张重跑后 axe 的 color-contrast 从 11 处降到 0（`design/components-2026-11-13/decisions-2026-11-14/batch-a1/`）。站上手写的危险小字（`App.css .detail-button.danger:hover` 等）没跟着改，清单见那份 README。

## 2026-11-14 草稿卷重排遮罩（`app/src/features/draft-paper/DraftPaperWorkbench.css` `.draft-a4-wait.is-waiting`）

- **想要的值**：一层「旧内容还在、正在换新」的遮罩色，盖在纸上能看出底下的字，又一眼看出这一页不是最新的。tokens.css 里没有遮罩一类的 token。若收编，候选名 `--eqb-color-scrim`。
- **临时方案**：`color-mix(in srgb, var(--eqb-color-desk) 60%, transparent)`，比例目测，只用在草稿卷卷面重排等待时（走查卡点 2，`design/ux-2026-11-14/find-compose-export/fix-waiting/`）。不加模糊。

## 2026-11-14 空状态构件的尺寸（`app/src/shared-ui/emptyState.css` 文件头 `:root` 三个局部变量）

- **想要的值**：空状态里图的尺寸档和说明的行宽，tokens.css 里没有这一类。一是坐石獭獭的图框 150 × 150（BRAND.md §4.7 空态 150px 高）；二是「没找到」摊手獭獭的宽 128（另外三张半身 110 宽 × 第 119 条的 1.17）；三是说明一行最多 26em（原来草稿卷空态的值）。另外平涂插图 88 × 88 还写在 `components/emptyIllustration.css` 里，没动。若收编，候选名 `--eqb-empty-art-otter-sit`、`--eqb-empty-art-otter-half`、`--eqb-measure-empty-text`。
- **临时方案**：先写成 emptyState.css 里的局部变量 `--eqb-empty-otter-sit-size`、`--eqb-empty-otter-not-found-width`、`--eqb-empty-text-measure`，每个注明出处。说明文字用的是 `--eqb-font-size-control`（13px，DESIGN.md §3 的 UI Compact 档），名字说的是控件，空态借用；若要分开，候选名 `--eqb-font-size-compact`。记录在 `design/components-2026-11-13/migrate-empty/README.md`「缺的变量」。

## 2026-11-14 对话框构件的宽度和模态遮罩（`app/src/shared-ui/dialog.css` 文件头 `:root` 五个局部变量）

- **想要的值**：一是对话框宽度三档加抽屉一档，tokens.css 里没有这一类：sm 360（个人空间删除确认原来的宽）、md 440（「保存 PDF 到个人空间」和作废口令原来的宽）、lg 620（选择练字单词原来的宽）、side 780（录题面板原来的宽）。若收编，候选名 `--eqb-dialog-width-sm/-md/-lg/-side`。二是盖住整页的模态遮罩色：站上原来五处各写各的（墨 28% 两处、30%、32%、42%），取最多的墨 28%。上面「草稿卷重排遮罩」那条已有 `--eqb-color-scrim` 候选，但那是桌色 60% 的浅遮罩（旧内容还在、正在换新），和这里压暗整页、突出弹窗的用途和深浅都不同，不该共用一个名字。若收编，候选名 `--eqb-color-scrim-modal`（那条改叫 `--eqb-color-scrim-wait` 或保持原名，Owner 定）。
- **临时方案**：先写成 dialog.css 里的局部变量 `--eqb-dialog-width-sm`、`--eqb-dialog-width-md`、`--eqb-dialog-width-lg`、`--eqb-dialog-width-side`、`--eqb-dialog-scrim`（`color-mix(in srgb, var(--eqb-color-text) 28%, transparent)`），每个注明出处。标题用 `--eqb-font-size-sm`（14）、说明和正文用 `--eqb-font-size-control`（13，名字说的是控件，对话框借用，同上一条空状态）。记录在 `design/components-2026-11-13/migrate-dialog/README.md`「缺的变量」。
