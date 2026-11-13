# 独立复核分组：说明

范围：`render.json` 中 `wide.records` 共 885 条，逐条都有归类（369 条记为 null，即布局容器、行内文字、按钮里的图标、遮罩、分隔线、头像、卷面纸等）。外观（look）的判定口径见 `reviewer-grouping.json` 的 `method`。简单说：填充、边框、圆角类型、文字颜色角色和下划线都相同，才算同一外观；字号相差 2px 以内、高度相差 10px 以内、内边距差几个 px、灰色差在每通道约 30 以内的，算同一外观里的偏差，下面单独列出。

各类数量：button 23 个外观（其中 2 个是注入的 `__seed__`），row 5，field 5，empty 7，notice 4，dialog 5，surface 3，chip 1，toast 1。

---

## button（按钮）：23 个外观（不含种子是 21 个）

外观：button-quiet、button-icon、button-icon-sm、button-pill-float、button-outline-clear、button-outline-white、button-outline-dark、button-green、button-primary、button-primary-pill、button-ghost-ink、button-ghost-danger、button-menuitem、button-menuitem-danger、button-plain-16、button-plain-16-danger、button-link-small、button-inline-link、button-title-text、button-segment、button-tab，以及种子 button-seed-magenta（`__seed__|0`）和 button-seed-uadefault（`__seed__|1`）。

**疑似无意造成的近似重复**
- button-quiet 与 button-ghost-ink：两者都是透明、无边框、r8、13px 的文字按钮，区别只在文字色。quiet 用灰色 rgb(63,82,91) 或 rgb(90,108,117)，ghost-ink 用墨色 rgb(27,43,51)。而且两者都用 `.ghost-button` 类（`AppTopbar.tsx:187:11` 对比 `AgentTokens.tsx:59:7`）。
- button-quiet 内部有两种灰：顶栏导航按钮是 rgb(63,82,91)（如 `home|0`），返回按钮和“浏览全部”是 rgb(90,108,117)（`paper-browse|1`、`detail|7`、`home|12`），可它们在同一条顶栏里并排出现。尺寸也有两档：首页类顶栏 14px/36h（`home|0`），工作区顶栏 13px/28h（`draft|13`）。
- `vocab-dictation|0` 的“返回找题”是 16px/400、墨色，其他 18 处同一元素都是 13px/500、灰色。`vocab-dictation|1-3,5` 的顶栏按钮字重 400，其他页面是 500。看起来像这一页的样式泄漏到了顶栏。
- button-menuitem（13px、r8、32–38h：`draft-export-menu|12`、`my-space-menu|10`、`home-row-menu|68`）与 button-plain-16（16px、r4、32–36h：`draft-group-actions|32/33`，以及“换篇” `draft|28`）都是菜单项。题组菜单（`DraftPaperWorkbench.tsx:1804:25`）和其他菜单字号、圆角都不一样。button-menuitem-danger（`my-space-menu|11`）与 button-plain-16-danger（`draft-group-actions|34`）之间也是同样的差异。button-menuitem 内部高度也不统一：32（`home-row-menu|68`）、36（`my-space-menu|10`）、38（`draft-export-menu|14`）。
- button-icon（r8，`ConciergeGroupRowMenu.tsx:162:7`、`DraftPaperWorkbench.tsx:1512:13`、`MySpacePage.tsx:181:7`）与 button-icon-sm（r4，`DraftPaperWorkbench.tsx:1786:21`、`ConciergePaperRow.tsx:286:9`）：都是“⋯”或箭头图标按钮，展开时都填 rgb(230,237,240)，只是圆角 8 和 4 不同（`home-row-menu|33` 对比 `draft-group-actions|30`）。button-icon 内部也不齐：高 28 或 36（`my-space|9`），`draft|4` 多一圈透明 1px 边框，“清空搜索”是正圆（r999，`home-results|11`）。
- button-outline-clear 与 button-outline-white：都是 1px 浅灰边框、r8，一个透明底，一个白底（`paper-browse|9` 对比 `draft-space-dialog|50`）。outline-clear 内部的“筛选” `home-results|15` 边框是暖灰 rgb(216,216,210)，不在其他按钮用的冷灰 rgb(220,230,235) 色系里。outline-white 内部的“返回生词组” `vocab-practice|4` 是 14px/600/36h，对话框按钮是 16px/400/38h（`draft-space-dialog|43`）。
- button-link-small：“建议前置分页”（`draft|32`）自带 rgb(241,245,247) 底色、r8、32h、内边距 4/9，“撤回”（`draft-decided|20`）是透明、r4、22.6h、内边距 2/4。两者都是 12px 带下划线，截图里看起来一样；那个底色正好等于页面底色，看不出来。button-inline-link（`home-noresult|19`）同样带下划线，只是 13px、墨色，可看作第三种下划线链接。
- button-green 内部：`detail|8` 是 13px/400、内边距 0 12，导出 `draft|11` 是 600、0 14，`draft-empty|24` 是 600、0 16、36h。
- button-primary 与 button-primary-pill：同一个深色填充 rgb(41,66,77)，登录按钮是 52h 胶囊形（`login|6`），其余是 r8、32–38h（`admin|6`、`draft-space-dialog|51`）。差别较大，可能是有意为之；如果是有意的，主按钮就有两种形状。
- button-pill-float 在 `detail|12` 变成 28h/13px/400，其他页面是 36h/14px/500（`browse|20`）。

**一个任务用了多种外观**
- 回找题页：button-quiet（`AppTopbar.tsx:114:11`、`QuestionGroupDetailView.tsx:527:7`）、button-outline-clear（`paper-browse|9`）、button-green（“去找题”：`draft-empty|24`、`vocab-notebook|9`）。
- 加入草稿卷：结果列表里是图标“+”，即 button-icon（`home-results|30`）；详情页是绿色文字按钮，即 button-green（`detail|8`，已在卷时为按下状态）。
- 移出草稿卷：在结果列表里是按下状态的“+”按钮（`home-added|31`，可访问名称为“从草稿卷移出”）；在草稿卷里是红色菜单项“移除”（`draft-group-actions|34`）。
- 打开更多操作（⋯）：button-icon（`home-results|32`、`draft|4`、`my-space|9`）和 button-icon-sm（`draft|30`）。
- 打开草稿卷：浮动胶囊 button-pill-float（`App.tsx:1164:7`）、个人空间里的“打开原草稿”即 button-quiet（`my-space|8`）、首页“接着做”行（row-list，`home-noresult|21`）。
- 下载 PDF：导出菜单里是 button-menuitem（`draft-export-menu|12`），个人空间行里是 button-quiet（`my-space|7`）。
- 打开个人空间：顶栏 button-quiet（`AppTopbar.tsx:199:11`），保存后的提示里是 button-outline-white（`draft-saved|41`）。
- 取消：保存对话框里是 button-outline-white（`draft-space-dialog|50`），删除确认和作废确认里是 button-ghost-ink（`my-space-confirm|13`、`admin-token-revoke|15`）。
- 确认危险操作：删除 PDF 用红字 button-ghost-danger（`my-space-confirm|14`），作废口令用墨色 button-ghost-ink（`admin-token-revoke|16`），两者都不是实心按钮。
- 返回生词组：同一页上出现两种外观，button-outline-white（`vocab-practice|4`）和 button-ghost-ink（`vocab-practice|6`）。
- 采纳排版建议：“采用”是深色描边，即 button-outline-dark（`draft|20`）；“建议前置分页”是下划线链接，即 button-link-small（`draft|32`）。

## row（行）：5 个外观

外观：row-list（`ConciergeHomeSections.tsx:65:7`、`ConciergePaperRow.tsx:262:5`）、row-passage（`ConciergeGroupCard.tsx:160:5`）、row-rail（`DraftPaperRail.tsx:274:11`）、row-file（`MySpacePage.tsx:438:23`）、row-token（`AgentTokens.tsx:71:31`）。

- 近似重复：首页“接着做”行（内边距 12/16、48h，`reading-analysis|14`）与浏览页试卷行（行头内边距 10/14、48h，`browse|18`）在截图里是同一种白卡片里带右箭头的列表行，我把它们合成一个 row-list。展开后的试卷行（`home-results|18`）行头会填 rgb(230,237,240)，属于状态差异。
- row-passage（55h，两行文字，后面带图标按钮，`home-results|23`）、row-file（70h，带图标、两行文字和文字按钮，`my-space|5`）、row-token（64h，只有下边框，`admin-token-revoke|12`）结构相似，但是三套各自的实现：分隔线分别是上边框（`ConciergePaperRow.tsx:409:23` 的 li）、下边框（`AgentTokens.tsx:71:31`）和无边框（row-file），内边距也各不相同。
- 一个任务多种外观：打开草稿卷，见 button 一节（row-list 和 button-pill-float、button-quiet）。

## field（输入框）：5 个外观

外观：field-login（`LoginPage.tsx:82:15`）、field-search-bar（`ConciergeDesk.tsx:564:13`）、field-switch（`ConciergeDesk.tsx:679:15`）、field-box-16、field-box-compact。

- 近似重复：field-box-16 是 16px、内边距 6/9、36–38h、边框 rgb(230,237,241)（`draft-space-dialog|44`、`draft-more-menu|7`）。field-box-compact 是 12–14px、内边距 8/12、34–37h、边框 rgb(220,230,235)（`vocab-dictation|14`、`admin|7`）；草稿卷顶栏的 PDF 版本下拉（`draft|6`）是 13px、32h，但边框用 rgb(230,237,241)，正好在两者之间。同样是白底 r8 输入框，字号、内边距和边框灰色各页不同。
- field-login（r12、52h、带阴影，`login|3`）与 field-box-* 形状差别较大，可能是有意的。
- field-search-bar：首页是 54h、r16、带阴影（`home|9`），浏览页是 36h、r12、无阴影（`browse|9`）。按我的口径算同一外观的尺寸档，但差距接近容差上限。
- 一个任务多种外观：指定学生。草稿卷“更多”里是自由输入框 field-box-16（`draft-more-menu|7`），听写页是下拉 field-box-compact（`vocab-dictation|12`）。

## empty（空状态）：7 个外观

外观：empty-illustrated（`DraftPaperWorkbench.tsx:1661:17`、`VocabularyNotebookPage.tsx:202:13`、`VocabularyDictationWorkbench.tsx:1063:17`）、empty-inline-text（`ConciergeDesk.tsx:887:11`、`DraftPaperRail.tsx:340:30`）、empty-center-text（`draft-decided|27`）、empty-error-title（`PaperBrowsePage.tsx:4133:9`）、empty-icon-title（`VocabularyPracticePage.tsx:179:11`）、empty-in-card（`VocabularyReviewPage.tsx:1523:11`）、empty-in-sheet（`detail|11`）。

- empty-illustrated 内部的偏差：内边距 36/20（`draft-empty|22`、`vocab-notebook|6`）对比 32/32（`vocab-dictation|17`）；文字色是灰色（`draft-empty|22`）或墨色（`vocab-notebook|6`，文字在子元素上）；`vocab-notebook|6` 有一圈透明 1px 边框和 r12。
- 一个任务多种外观：加载失败。共三套，`paper-browse|7`（无图标，标题、说明、错误详情加描边按钮）、`vocab-practice|5`（图标、标题、说明加 ghost 按钮）、`vocab-review|5`（放在白色描边卡片里，图标、标题、说明加深色主按钮）。另外，“卷还没上线”在详情页是卷面纸里的一句灰字（`detail|11`），在整卷页走的却是 empty-error-title（`paper-browse|7`），而两者说的是同一件事。
- 一个任务多种外观：草稿卷为空。卷面上有插画、文字和按钮（`draft-empty|22`），左侧导航里只有一行灰字（`draft-empty|20`），同一屏出现两次。

## notice（提示条/报错）：4 个外观

外观：notice-error-tint（`login-error|2`）、notice-plain-icon（`ConciergeDesk.tsx:832:9`）、notice-card（`DraftPaperWorkbench.tsx:1600:9`）、notice-bare-text（`draft-empty|18`）。

- `draft-empty|18`（“请先添加题组，再下载 PDF 用于打印。”）没有内边距、没有图标，16px 字贴着视口左边（x=0，宽 1440），不像有意设计，更像漏了样式。
- notice-card 的两种状态差别很大：建议态（`draft|18`）底色等于页面底 rgb(241,245,247)，阴影是全透明的 `rgba(0,0,0,0)`，实际上看不出是卡片；采纳态（`draft-decided|18`）是白卡片加阴影。我把它们算作同一外观的两个状态。
- 报错这件事在不同地方的做法：表单报错用 notice-error-tint（只有登录页），页面级报错用三种 empty 外观（见上节）。全应用里只有这一处用了红色提示条，而且颜色写成 `color(srgb …)`，和其他地方写的 rgb() 不一样。

## dialog（对话框/菜单/抽屉）：5 个外观，每个外观只有 1 条记录

- 模态卡片有 3 种：dialog-shadow-r8（`draft-space-dialog|41`，r8、阴影、内边距 16）、dialog-shadow-r12（`my-space-confirm|11`，r12、阴影、内边距 18）、dialog-bordered-r12（`admin-token-revoke|14`，r12、描边、无阴影、内边距 24）。三个都是白色确认或表单对话框，圆角、阴影和内边距各不相同，我认为是无意的近似重复。
- 弹出菜单有 2 种：dialog-menu-r12（`draft-group-actions|31`，r12、内边距 6）和 dialog-menu-r8（`draft-more-menu|5`，r8、内边距 12、透明边框）。
- 遮罩：`draft-space-dialog|40` 写成 rgba(27,43,51,.28)，`my-space-confirm|10` 写成 color(srgb …/.28)。数值相同，写法不同。遮罩记为 null。

## surface（卡片/板）：3 个外观

外观：surface-panel（`DraftPaperRail.tsx:241:5`）、surface-toolbar（`DraftPaperWorkbench.tsx:1744:17`）、surface-bordered（`admin-token-revoke|9`）。

- surface-bordered（r12、1px 描边、无阴影）与 surface-panel（r12、无边框、无阴影）的区别只在描边。

## chip（标签）：1 个外观

- chip-filter（`browse|12-15`）。选中态是 rgb(230,237,240) 填充、600 字重，未选态是白底描边，同属一个外观。

## toast（底部提示）：1 个外观

- toast-dark（`draft-saved|40`）。删除题组后的“题组已移出 / 撤销”提示在截图 `pages/draft-removed-toast-1440.png` 里看得到，但 `draft-removed-toast` 场景没有对应记录，所以“撤销”这件事无法比较：提示里的撤销按钮没有被采集，能比较的只有建议条里的“撤回”（`draft-decided|20`）。
