# draft-student-field 浏览器 QA 记录

日期：2026-07-09　执行：DEV 子代理（Sonnet）
本地 dev server：`QUESTION_BANK_API_PORT=8971 PORT=5197`，账号 `qa-local-owner`
（本地库密码经 `node scripts/create-user.mjs --reset-password` 临时重置，仅影响本
worktree 复制出的本地 sqlite，不触碰生产）。

## 已用真点浏览器验证（claude-in-chrome，逐条截图肉眼核对，内联于会话中）

- 打开 `?view=draft-paper`（已有草稿卷 "0708 英语草稿卷"，2 题组 / 25 小题）：
  标题区新增「学生（可选）」输入框，紧邻标题字段，空值时 placeholder 显示
  「未填写」——零展示，符合设计。
- 点击「学生」输入框，键入「王小明」，按 Tab 失焦 → 顶部保存状态从
  「自动保存」变为「已保存」（走既有自动保存链路，与标题字段同一状态机）。
- 整页刷新（`navigate` 到同一 URL）→ 「学生」输入框仍显示「王小明」，确认
  失焦保存已落盘并可回读（PATCH `/api/draft-papers/:id` → GET 回读一致）。
- A4 预览（iframe 渲染的真实 print HTML）逐段肉眼核对：标题、语法填空正文、
  题号列表——全程未出现「王小明」字样。
- **负断言（比截图更硬的服务端级验证）**：在已认证的页面上下文里直接
  `fetch('/api/draft-papers/<id>/print-html?versionType=student')` 与
  `versionType=teacher` 两个版本，读取返回的完整 HTML 文本，
  `html.includes('王小明')` 均为 `false`（学生版 HTML 长度 13263 字符，
  教师版 20407 字符，均不含姓名）——这是打印/导出实际消费的同一份 HTML
  源，比截图更能证明「零渲染到卷面」的边界。
- 点击「导出」→「保存到个人空间」→ 保存成功（真实 vivliostyle CLI 走通，
  非 mock）→ 点击「查看个人空间」跳转到 My Space 页面：卡片上出现「王小明」
  chip，样式为中性灰底描边小药丸（`.my-space-student-chip`），与「下载
  PDF」的墨绿主色按钮明显区分——符合设计「中性样式，非墨绿」的要求。

## 截图存档情况（工具限制，如实记录，沿用 docs/cuts/flow-panel/qa/qa-notes.md
## 已记录过的同一限制）

`computer` 工具的 `zoom`/`screenshot` 的 `save_to_disk: true` 在本 sandbox 里
没有暴露可访问的文件系统路径（`find` 全盘/`$HOME` 均未找到新增 PNG），因此本
目录没有 PNG 文件留痕。上述每一步验证都在会话内以内联截图的方式逐条肉眼核对
过；负断言额外补了服务端级 `fetch` + 文本检查（比截图更硬的证据，见上）。

## 覆盖到的验收条款

1. 带 student_label 创建/更新 → get/list 回读一致；不带 → null 且各面零
   展示：浏览器 QA 覆盖（输入→保存→刷新回读）+ `scripts/verify-draft-student-field.mjs`
   的 20 条行为断言（含旧库无列迁移幂等）双重覆盖。
2. 工作台填学生名 → 自动保存 → 刷新还在 → my-space 卡片出 chip：浏览器 QA
   全程覆盖。
3. 导出 PDF/预览卷面上不出现学生名（负断言）：浏览器 QA 服务端级 fetch
   文本检查覆盖（学生版 + 教师版两个 print-html 均确认不含姓名）。
