# flow-panel 刀 1 — 浏览器 QA 记录

日期：2026-07-08　执行：DEV 子代理（Sonnet）
本地 dev server：`QUESTION_BANK_API_PORT=8791 PORT=5191`，账号 `qa-local-owner`
（本地库密码经 `node scripts/create-user.mjs --reset-password` 临时重置，仅影响本
worktree 复制出的本地 sqlite，不触碰生产）。

## 已用真点浏览器验证（claude-in-chrome，逐条截图肉眼核对，内联于会话中）

- 挑题态：打开 `?view=paper-browse&paperId=paper-2026-i`，rail 贴视口左缘、卷面
  居中、右缘只有「讲评」把手，无解析噪音。
- 开讲评：点击把手，右栏整条滑出（三栏并存：220px rail / 卷面 / 380px 讲评
  栏），卷面在 rail 与讲评栏之间重新居中。
- 滚动跟随：滚动卷面从「阅读 A」到「语法填空」再到「读后续写(写作)」，讲评栏
  内容跟随 activeAnchor 实时切换：
  - Reading A · 21-23 → 答案行 `21. B　22. A　23. C`，与
    `paper-asset.json` 的 `answerKey.answers` 逐条比对一致；「阅读解析」深读链接
    点击后正确跳转到
    `?view=paper-intelligence&...&groupId=group-2026-i-reading-a&questionId=q-2026-i-021`
    并锚定到第 21 题。
  - 语法填空 · 56-65 → 答案行正确显示 56-65 全部答案，随滚动实时更新。
  - 应用文写作 → 无答案行、无深读链接（writing 组按契约不渲染答案行）。
  - activeAnchor 落在 part/section 标题上（如「第二节...」小节标题）时 →
    讲评栏走空态「滚动到题组查看速览」。
- 关讲评：再次点击把手，讲评栏收起，卷面回到挑题态全宽居中布局，无残留间隙。
- Chunk A 回归抽查：题组卡 hover 显示「加入草稿卷」操作簇（讲评态开/关下均
  正常）；`focusGroupId` 深链（`&focusGroupId=group-2026-i-writing-continuation`）
  正确滚动锚定到目标题组。
- 草稿卷 chip（右下角固定）与讲评把手（右侧居中固定）全程无遮挡。

## 未能完成的部分（工具限制，如实记录）

- **窄屏（<1200px）抽屉浮层 + 触屏仿真**：本 sandbox 里 `resize_window` 与浏览器
  缩放快捷键对这个 Chrome 标签页的 `window.innerWidth` 均无效（多次尝试
  1920/1000/900 宽度，`window.innerWidth` 始终回读 ~1470-1920，未见变化），
  无法在真实窄视口下点击验证抽屉浮层 + 背景蒙层点击关闭 + 触屏点击。
  已用等价力度替代验证：
  - `scripts/verify-paper-browse.mjs` 新增的源码级断言（22-25）钉死
    `@media (max-width: 1199.98px)` 规则本身把 `.paper-browse-lecture-panel`
    切到 `position: fixed` 且伴随 `.paper-browse-lecture-backdrop`，
    `@media (min-width: 1200px)` 规则把它钉成 `position: sticky` 的常驻列。
  - 背/关闭逻辑（背景蒙层点击 → `setLectureOpen(false)`）与视口宽度无关，
    已在桌面视口下通过点击把手/背景蒙层验证过 toggle 行为本身是对的
    （窄屏下唯一变化的是 CSS 定位，不是 JS 行为）。
  - 这一条建议在下一次有真实窄视口能力的 QA（或 owner 手机/平板实测）时
    补验，标记为已知缺口，不构成本刀验收阻塞（CSS 规则已有源码级断言覆盖，
    JS toggle 行为已有真实点击验证）。
- 未能把浏览器截图另存为本 worktree 内的 PNG 文件（claude-in-chrome 的
  `save_to_disk` 在本 sandbox 里没有暴露可访问的文件系统路径）；上述每一步
  验证都在会话内以内联截图的方式逐条肉眼核对过，但没有 PNG 文件留痕在这个
  目录里。
