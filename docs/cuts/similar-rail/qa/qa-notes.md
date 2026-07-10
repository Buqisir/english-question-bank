# similar-rail (E2) — 浏览器 QA 记录

日期：2026-07-10　执行：DEV 子代理（Sonnet）
本地 dev server：`QUESTION_BANK_API_PORT=8797 PORT=5197`，账号
`qa-local-owner`（密码经 `node scripts/create-user.mjs --reset-password`
本地重置，只影响本 worktree 复制出的本地 sqlite，不触碰生产）。

## 已用真点浏览器验证（claude-in-chrome，逐条截图肉眼核对，内联于会话中）

- API 契约先用 curl 核对（登录态 cookie）：reading/cloze/grammarFill 三个真
  种子（`q-2026-i-021`/`q-2026-i-041`/`q-2026-i-056`）逐一 POST
  `/api/similar-questions`，response 形状与 seed-response fixtures 一致；
  真实证实 cloze 候选确实带 `{kind:'secondary', label:'同体裁 cloze'}`
  （SW-1 的根因，不是臆测）。
- 深链 `?view=paper-browse&paperId=paper-2026-i&lecture=1&questionId=q-2026-i-021`：
  讲评栏直接落在第 21 题解析，滚动到解析下方看到「🔁 配相似」CTA
  （验收 5，深链后直接可用）。
- 点击 CTA → loading → 结果列表：种子行「Reading A · 第21题」+ 配方一句话
  + 「已排除本卷」，5 张结果卡（真实候选，年份/来源/reason chips 齐全），
  尾注「库内同类还剩 106 组」（验收 1）。
- 勾选 2 张卡 → 亮边+teal-50 底（checked 态）→ 底栏「已选 2 篇」→ 点「加入
  草稿卷」→ toast「已加入草稿卷 · 2 篇（含各自题目）」+ 右下角草稿卷 chip
  从「2 题组」乐观翻转到「4 题组」（即时，非等待网络）→ 勾选清空（「未
  选择」）→ 结果列表仍在（未关闭）（验收 2 全链路）。
- 点「← 返回解析」→ 讲评栏正确回落到当前 scrollspy 组级概览（Reading B
  24-27），不是卡死在结果态。
- 换到完形填空种子（`q-2026-i-041`）点 CTA → 结果卡的 reason chips **不
  出现**「同体裁 cloze」——只有「含 N 题」+「同词性密度」（验收 1 的恒真
  chip 断言，真实数据核验，非仅静态断言）。
- Esc 键：结果态开着时按 Esc，讲评栏整体正确关闭（回到挑题态全宽布局，
  焦点还给「讲评」把手），不变量零回归；再次点开把手，深链 URL 里的
  questionId 仍在，讲评栏正确恢复到同一个「配相似」结果态（结果未丢失，
  也未重新请求——沿用已有 state）。

## 未能完成的部分（工具限制，如实记录，与 flow-panel 刀 1 QA 记录同款已知缺口）

- **窄屏（<1200px）抽屉浮层**：`resize_window` 对这个 Chrome 标签页的
  `window.innerWidth` 无效（试过 1000×800，`window.innerWidth` 仍回读
  1470）——与 `docs/cuts/flow-panel/qa/qa-notes.md` 记录的同一个 sandbox
  限制。已用等价力度替代验证：`.similar-*` 系列类名是讲评栏 `<aside>`
  内的普通块级内容，不引入任何新的定位/断点规则——现有的
  `@media (max-width: 1199.98px)` 抽屉断点（flow-panel 刀 1 已建、本刀零
  改动）对它们和五解析面板一样天然生效。建议下一次有真实窄视口能力的
  QA 补验，标记为已知缺口，不构成本刀验收阻塞。
- thin 候选（SW-3，`questionGroupById` 查不到卡）：当前 paper-2026-i 的
  真实候选池里没能命中一个真实 thin 组（E1 CR 记录的 4 个 thin reading 组
  未出现在这几个种子的候选池里）。按 plan 验收 3「不存在则构造断言逻辑
  层」处置——`scripts/verify-paper-browse.mjs` 断言 57 在源码层钉死
  `isThin = !card` → `disabled` + `title` 三件套。
