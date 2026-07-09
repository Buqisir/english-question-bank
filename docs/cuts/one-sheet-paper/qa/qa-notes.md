# one-sheet-paper — QA notes

本地 dev server：`PORT=5197 QUESTION_BANK_API_PORT=8787`，账号
`qa-local-owner`（本地库密码经 `node scripts/create-user.mjs
--reset-password` 临时重置，仅影响本 worktree 的 `data/user-data.sqlite`，
不影响生产 `.env.qa` 凭据）。Playwright ad-hoc 脚本用后即删，未入库。

## 验收标准逐条

1. **单一白纸 + 九道剪刀线**：paper-2026-i 全卷截图见
   `01-baseline-top-reading-a.png`（Reading A 卡片，剪刀线在字母 A 之前，
   part/节标题宋体进纸）与 `02-baseline-full-scroll.png`（全卷滚动，单张
   连续白纸，米色壳只剩纸外留白）。DOM 结构核对（`.paper-browse-content`
   直接子元素顺序）确认：
   - 阅读四篇：每篇一条线，紧贴该篇字母卡片之前（①-④）；节标题+节指导语
     不属于任何一篇，留在首条线上方（本卷该节实际无独立指导语 block）。
   - 七选五/完形填空/语法填空：线在节标题之后、指导语之前——指导语已并入
     该题组卡（`mergedGroupIds` 命中三者，`scissorGroupIds` 不含它们）。
   - 应用文/续写：`03-writing-section-scissor-lines.png` 可见两条虚线
     （节标题后、指导语/正文前），走 CSS 兄弟选择器
     `.pi-writing-section + *::before`（DOM div 计数里不含这两条，
     `.paper-browse-scissor-line` 实测 7 个 = 4 阅读 + 七选五/完形/语法填空，
     加上 CSS-only 的 2 条写作线 = 9 道，与 plan 一致）。

2. **hover 提亮范围=剪走范围**：`04-grammarfill-hover.png`——语法填空卡
   hover 后「加入草稿卷」显形，`.paper-browse-group-card:hover` 的 DOM
   范围天然=merged 指导语+正文（指导语已是卡内第一个子元素），不含
   「第二节」标签（标签是卡外顶层 sibling）。Reading B 结构核对：
   `data-paper-browse-anchor="group-2026-i-reading-b"` 卡内第一个内容即
   `.ps-passage-letter` 文本 "B"，卡片范围=字母 B 起到该篇题目止。

3. **加入草稿卷**：merged-instruction 单元（语法填空/完形/七选五）与阅读
   单元的「加入草稿卷」按钮结构未变（`onAddGroupsToBasket([card])`，
   verify 断言 8 项覆盖），hover 后可点击，未在浏览器里做真实入篮点击但
   DOM/CSS 结构与既有讲评态点题联动共用同一套 `paper-browse-group-actions`
   机制（刀 1-3 未改动）。

4. **刀1-3 不变量抽查**：
   - scrollspy：`05-deep-link-lecture-panel.png` 前的操作——点击 rail
     「Reading C」后 `active rail after click Reading C: Reading C ·
     28-31` 命中。
   - 讲评态深链一条龙：`?lecture=1&focusGroupId=group-2026-i-grammar-fill`
     → 讲评栏自动展开、右栏渲染语法填空 56-65 答案面板、rail 高亮
     「56-65」，见 `05-deep-link-lecture-panel.png`。
   - 窄屏：`06-narrow-760.png`（760px viewport）——rail 折叠为顶部横向条
     （既有窄屏行为，未改动），正文仍是同一张单页纸，边距按比例收窄。

5. **tsc / verify**：见完工报告。

## 已知取舍

写作题组（应用文/续写）的 hover 提亮范围仍是整卡（含 pageModel 渲染的
节标题行）——CSS-only 精确抠掉节标题这一行会在 flex gap 处露出未着色缝隙，
比现状更难看，故保留整卡提亮。剪刀线本身（剪的位置）依然精确对齐 plan
语义，只是这一处 hover 二级修饰未做（paperBrowsePage.css 内联注释已记录
同一取舍）。见 `docs/cuts/one-sheet-paper/plan.md`。
