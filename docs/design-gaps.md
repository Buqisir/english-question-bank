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

## 2026-11-14 字段构件的几处尺寸（`app/src/shared-ui/field.css`）

- **想要的值**：一是带原因的下拉菜单的行宽上限：菜单里每项下面有一行「为什么用不了」，菜单宽跟着最长一行走，要有个可读行长的上限，长原因折成两行。tokens.css 里没有行宽一类（上面空状态那条的 26em 也是）。若收编，候选名 `--eqb-measure-menu`。二是图标的尺寸：下拉右边的向下箭头、出错行的图标都是 16px（DESIGN.md §5 Icons 写了 16，但没有 token），下拉右内边距要算进去（12 + 16 + 4）。若收编，候选名 `--eqb-icon-size`。三是分段选择两项之间的缝 2px，比 `--eqb-space-1`（4）小一档，原来草稿卷 A4 / A3 那一排就是 2px（`.draft-version-toggle` gap 2px）。若收编，候选名 `--eqb-space-hairline`。四是触屏输入字号下限 16：和上面登录页那条「手机输入框的字号下限」是同一件事，这次字段构件也要（`@media (pointer: coarse)` 时控件字号提到 16），值正好等于 `--eqb-font-size-md`，所以先借用它，没写字面量；登录页那条的候选名 `--eqb-font-size-input-mobile` 收编后两处一起换。
- **临时方案**：一，局部变量 `--eqb-option-menu-measure: 320px`（`.eqb-menu.eqb-option-menu` 上，320 是原来 `.eqb-menu.draft-product-menu` 的值），外面再套 `min(…, 100vw − 16)` 防出屏。二，`calc(var(--eqb-space-3) + 16px + var(--eqb-space-1))`，16 写在注释里说明是图标宽。三，`gap: 2px` 字面量，注释注明出处。四，借 `--eqb-font-size-md`。记录在 `design/components-2026-11-13/migrate-field/README.md`「缺的变量」。

## 2026-11-15 搜索框构件的几处尺寸（`app/src/shared-ui/search.css`；首页一条字色在 `app/src/App.css` `.concierge-desk .concierge-intent-input:disabled`）

- **想要的值**：一是搜索框的几处内边距不在间距阶梯（4 / 8 / 12 / 16 / 24）上：首页框左 18、右 10，提交键「正在搜」时左右 6。二是框里几个位置跟着提交键和清除键算出来：提交键右边 10（首页）/ 4（浏览页），清除键右边 48，输入框右内边距 48（首页）/ 40（浏览页）、有清除键时 84（浏览页 2026-11-15 起也让到 84，修掉压字）。三是首页题库没连上、输入框禁用时的字色 `#9A9A93`（暖灰，雾海色阶以前留下的），tokens.css 里没有同值的颜色，最近的是 `--eqb-color-text-faint`（`#94a4ac`）。
- **临时方案**：一、二是原值，照搬成字面量写在 `search.css`，每条注释写明原值和出处（这一轮要换前换后逐像素一样，不能挪）；若收编，内边距可以对到阶梯上（18 → 16、10 → 8、6 → 8），位置跟着重算，届时首页会动一两个像素，要 Owner 点头。三，`search.css` 的禁用字色用 `--eqb-color-text-faint`，首页原来在 App.css 里以 (0,3,0) 盖回 `#9A9A93`，2026-11-15 已删（看不到差别：题库没连上时输入框是空的，只显示次要灰的占位符），三这一项已了结。记录在 `design/components-2026-11-13/migrate-search/README.md`。

## 2026-11-15 卡片 / 板构件的几处值（`app/src/shared-ui/surface.css`；草稿卷左栏一条在 `app/src/features/draft-paper/DraftPaperWorkbench.css` `.draft-paper-rail.eqb-surface[data-surface='board']`）

- **想要的值**：一是板的那一圈边。DESIGN.md §4 的 e0 没有变量（表里写「—」），板的边是 `0 0 0 1px` 一圈 `--eqb-color-border`（首页、浏览卷行列表卡原来的画法，不占位置）。若收编，候选名 `--elev-0-edge`，和 `--elev-1/2/3` 放在一起。二是整张能点的卡片按下时缩多少：Button 用 0.97（也是字面量，没有 token），卡片比按钮大得多，0.97 会缩掉十来像素，取 0.99（目测）。若收编，候选名 `--eqb-press-scale`（键）、`--eqb-press-scale-large`（卡片）。三是草稿卷左栏目录的内衬 14 / 8 / 12，14 不在间距阶梯上（DESIGN.md §8 存量半档，不追改）。
- **临时方案**：一，surface.css 里直接写 `box-shadow: 0 0 0 1px var(--eqb-color-border)`，颜色用 token，注释写明它是边不是影子。二，`transform: scale(0.99)` 字面量，注释写明理由。三，左栏照原值写字面量，换上板构件以后用一条 (0,3,0) 覆盖构件的 `padding: 0`，注释写明。记录在 `design/components-2026-11-13/migrate-surface/README.md`「缺的变量」。

## 2026-11-15 行构件和底部提示构件的几处值（`app/src/shared-ui/row.css`、`app/src/shared-ui/toast.css`）

- **想要的值**：一是行的最小高 48（DESIGN.md §5 Rows）和卷行展开后题组行的 44，tokens.css 里没有行高一类。若收编，候选名 `--eqb-row-min-height`、`--eqb-row-min-height-sm`（44 要不要改 48 是另一件事，见 `design/components-2026-11-13/migrate-row-toast/README.md`「要 Owner 定的」）。二是卷行内衬 10 / 14：DESIGN.md §5 Rows 写的就是 10 / 14，但不在间距阶梯（4 / 8 / 12 / 16 / 24）上，§8 说存量半档不追改。若收编，候选名 `--eqb-row-padding-y`、`--eqb-row-padding-x`；首页行 12 / 16 已经在阶梯上，用的是 `--eqb-space-3` / `--eqb-space-4`。三是行的「按下」底色：DESIGN.md 只写了悬停垫 `--desk-hover`，没写按下；悬停已经是桌色，按下取深一档的 `--eqb-color-border`（`#dce6eb`，目测看得出、不跳）。若收编，候选名 `--eqb-color-row-pressed`。四是底部提示的层级 32：tokens.css 没有层级一类（菜单 70、对话框各自写）。原来草稿卷的提示在 30，整卷页相似题栏的提示抬到 32（整卷预览里有 30、31 层），收成一个件取 32。若收编，候选名 `--eqb-z-toast`。五是提示的最小高 28（等于小号键的高，原 notice.css 就是字面量）。若收编，候选名 `--eqb-control-height-sm`。
- **临时方案**：一、二、五照原值写字面量（`min-height: 48px` / `44px`、`padding: 10px 14px`、`min-height: 28px`），注释写明出处；三用 `var(--eqb-color-border)`；四 `z-index: 32` 字面量，注释写明为什么是 32。记录在 `design/components-2026-11-13/migrate-row-toast/README.md`「缺的变量」。

## 2026-11-15 最小点击区域 24 × 24（`app/src/App.css` `.concierge-row-expand::after`、`.concierge-thinking-toggle input[type='checkbox']::after`、`.topbar-page-title-editable`；`app/src/features/draft-paper/DraftPaperWorkbench.css` `.draft-reorder-suggestion-undo::after`）

- **想要的值**：能点的东西至少 24 × 24（WCAG 2.2 目标尺寸最低档；构件清单 `design/components-2026-11-13/inventory.md` 的客观检查里有 5 处不到）。tokens.css 没有点击区域一类。若收编，候选名 `--eqb-target-min`（24px），外扩写成 `inset: min(0px, calc(50% - var(--eqb-target-min) / 2))`。
- **临时方案**：看得见的样子不动，只把能点的范围透明外扩到 24：有定位的元素加 `::after { inset: min(0px, calc(50% - 12px)) }`（本来够大的那一边算出 0，不外扩）；顶栏可改名的卷名外面裹着 `overflow: hidden`，伪元素会被裁掉，改用上下各 3px 内边距加等量负外边距（字的位置不动，键盘焦点框高 6px）。12 写在注释里说明是 24 的一半。记录在 `design/components-2026-11-13/migrate-finish/README.md`「缺的变量」。

## 2026-11-15 Button「建议」样子的字重和两处层级（`app/src/shared-ui/button.css` `.eqb-button[data-tone='suggest']`；`app/src/features/draft-paper/DraftPaperWorkbench.css` `.eqb-button.draft-seam-suggestion`；`app/src/App.css` `.concierge-thinking-toggle input[type='checkbox']::after`）

- **想要的值**：一是「建议」键的字重 400（常规）：tokens.css 没有字重一类，button.css 里别的语气也是字面量 500 / 600。若收编，候选名 `--eqb-font-weight-regular` / `-medium` / `-semibold`（400 / 500 / 600）。二是层级：A3 接缝上的建议键压在卷面上用 5（原值照搬，和题组工具条同层）；思考模式开关的透明外扩提到 1，才能盖过排在后面、带定位的「筛选」键。tokens.css 没有层级一类（上面行和底部提示那条的 `--eqb-z-toast` 也是）。若收编，候选名 `--eqb-z-paper-tools`（5）、`--eqb-z-hit-area`（1）。
- **临时方案**：一，`font-weight: 400` 字面量，注释写明出处。二，`z-index: 5`、`z-index: 1` 字面量，注释写明谁盖谁。记录在 `design/components-2026-11-13/migrate-followup/README.md`「缺的变量」。

## 2026-11-15 字段构件第二轮的几处尺寸（`app/src/shared-ui/field.css` `.eqb-field-control[data-has-icon]`；各页字段宽度在 `vocabularyDictationWorkbench.css`、`vocabularyReviewPage.css`、`adminWorkbench.css`）

- **想要的值**：一是 TextField 新加的框内左图标 16px：左内边距写成 `calc(var(--eqb-space-3) + 16px + var(--eqb-space-2))`，16 是图标宽，和上面「字段构件的几处尺寸」那条的二是同一件事（候选名 `--eqb-icon-size`）。二是各页给字段定的宽：听写「从 / 到」日期 142、「推荐下一轮」「抽」数字框 64、错词听写「文件名」240、Agent 口令「名称」228、过生词完成页「单词纸名称」`min(440px, 100%)`。都是换前的原值（228 是换前实测），tokens.css 没有控件宽度一类。若收编，数字框可以用 `--eqb-field-width-number`（64），其余是各页的放法，建议留在页面里不收。
- **临时方案**：一，16 写在 calc 里，注释写明是图标宽。二，照原值写字面量，每条有 Explicit-Cascade 注释（`.x .eqb-field-control` (0,2,0) 盖 field.css 的 `width: 100%` (0,1,0)）。记录在 `design/components-2026-11-13/migrate-fields2/README.md`「缺的变量」。

## 2026-11-15 切换组换分段选择的两处（`app/src/shared-ui/field.css` `.eqb-segmented-icon`；`App.css` `.fluid-hover-list` 在公开页没加载）

- **想要的值**：一是分段选择项里的图标 16px（`ChoiceOption.icon`），和上面两条的 `--eqb-icon-size` 是同一件事。二是分段选择的悬停滑块：SegmentedField 靠 FluidHoverList，滑块的样子（`.fluid-hover-list::before`）写在 `App.css` 里。扫码听音页 / 扫码听写页是另一个入口（`main.tsx` 不加载 `App.tsx`），这两页上的分段选择没有悬停滑块，只剩悬停那一项字变墨色。若收编，把 `.fluid-hover-list` 那几条从 `App.css` 挪进 `shared-ui/` 下一个随 FluidHoverList 一起加载的样式文件。
- **临时方案**：一，构件不写图标尺寸，调用处给 `size={16}`，构件文件头写明。二，公开页先不补（学生在手机上用，触屏本来就不画滑块，`@media (hover: none) and (pointer: coarse)`）。记录在 `design/components-2026-11-13/migrate-segment/README.md`「缺的变量」。

## 2026-11-15 等待第二轮的几个数（`app/src/shared-ui/waiting.css` `.eqb-wait-dots[data-size='sm']`；`app/src/shared-ui/useRowReveal.ts`；`app/src/shared-ui/useDelayedBusy.ts` `WAIT_SLOW_HINT_MS`；`app/src/features/question-detail/QuestionGroupDetailView.css` `.peek-paper-skeleton`）

- **想要的值**：一是小字旁所以点 14px（Owner 2026-11-15 定），和第一轮的 16px（`--eqb-wait-dots-size`）一样只在 waiting.css 里。二是真行依次淡入：DESIGN §5 写每行 200ms、间隔 40ms；全站动效 token 没有 200（只有 160 `--motion-base`、220 `--motion-slow`），也没有「错开」一类。三是「超过 10 秒加一句」的 10 秒。四是详情页卷面灰块的内边距 32 / 48 / 40，照抄同文件 `.peek-paper .ps-page`（那条本身就是字面量）。若收编，候选名 `--eqb-wait-dots-size-sm`（14）、`--motion-stagger`（40ms）、`--eqb-wait-slow-hint`（10s）；200ms 建议 DESIGN 改成 160（用 `--motion-base`）或新加一档。
- **临时方案**：一，`--eqb-wait-dots-size: 14px` 写在 `[data-size='sm']` 里，注释写出处。二，时长读 `--motion-base`（160ms，「显形、小入场」），间隔是 `useRowReveal.ts` 的具名常量 `ROW_REVEAL_STAGGER_MS = 40`。三，`useDelayedBusy.ts` 的具名常量 `WAIT_SLOW_HINT_MS = 10_000`。四，字面量，注释写明照抄哪一条。记录在 `design/components-2026-11-13/migrate-waiting-2/README.md`。

## 2026-11-15 Button 胶囊大号的三个数（`app/src/shared-ui/button.css` `.eqb-button[data-size='pill']`）

- **想要的值**：Owner 2026-11-15 定 Button 加一档 52px 胶囊大号，照登录键原来手写的样子（原 `auth/LoginPage.css` `.login-submit`）。一是高 52（和登录页输入框同高），全站控件高度没有 token。二是字号 15，不在字号阶梯上（control 13 / sm 14 / md 16）。三是填充时那层影子 `0 8px 24px rgb(27 43 51 / 0.18)`，比 `--elev-3` 沉得多、浓得多，DESIGN §4 四档高度里没有。若收编，候选名 `--eqb-control-height-pill`（52）、`--eqb-font-size-cta`（15，或改用 sm 14 / md 16，会改登录键的样子）、`--elev-cta`（或改用 `--elev-3`，会改样子）。
- **临时方案**：三个都写成 `[data-size='pill']` 规则里的具名变量（`--eqb-button-pill-height`、`--eqb-button-pill-font-size`、`--eqb-button-pill-shadow`），注释写出处是原 `.login-submit`。记录在 `design/components-2026-11-13/migrate-waiting-3/README.md`。

## 2026-11-15 纸面阴影和整页灰块的几处尺寸（`app/src/features/draft-paper/DraftPaperWorkbench.css` `.draft-skeleton-sheet`；`app/src/features/paper-browse/paperBrowsePage.css` `.paper-browse-skeleton-*`；`vocabularyPracticePage.css`、`vocabularyDictationPage.css` 的灰块几条）

- **想要的值**：一是纸面阴影（DESIGN.md Shadow Vocabulary · Sheet 纸面）`0 1px 0 rgba(0, 0, 0, 0.06), 0 12px 32px rgba(0, 0, 0, 0.08)`：整卷页 `.paper-browse-zoom`、草稿卷预览 `.preview-page` 各写了一份字面量，草稿卷打开时的 A4 灰块是第三份。二是 A4 纸的宽高和页边（794 × 1123，上 79、左右 91）：PaperSurface 有 JS token（`paperSurfaceTokens`），CSS 里没有，灰块只能照抄。三是整页灰块里放在「一行字」位置的灰块宽高（目录 24 × 10、28 × 12，卷头 72 × 28 等），照真页面字的大小目测。若收编，候选名 `--elev-sheet`、`--ps-page-width` / `--ps-page-height`（挂到 :root），三建议不收（是各页的放法）。
- **临时方案**：一、二照原值写字面量，注释写明照抄哪一条；整卷页灰块和真卷面同一条规则（选择器并列），不另写一份。三写在 TSX 的 Skeleton 宽高上。记录在 `design/components-2026-11-13/migrate-waiting-4/README.md`。
