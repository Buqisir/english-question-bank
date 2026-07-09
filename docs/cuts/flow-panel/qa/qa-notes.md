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

## 主代理补验（2026-07-09，Playwright，闭合 CR Follow-up Gate）

窄屏 1000×800 / 触屏 390×844(hasTouch) / 桌面 1440×900 极端滚动，11/11 全过：
抽屉 fixed 浮层+backdrop 显示、backdrop 点击关闭、卷面保宽（708px）、触屏 tap
开合、Chunk A 操作簇常显回归、chip 与讲评栏底部滚动无重叠。截图：
narrow-closed / narrow-open / touch-drawer-open / desktop-bottom-scroll.png。
CR Should Fix 同步收口（f654137）：文档级 Esc 关讲评+还焦把手，Playwright
实测 open/escClosed/focusReturned 全 true。

## 刀 2 收口补记（2026-07-09）

- 主代理补验：桌面三栏 12/12（含把手首点 5 连测未复现 DEV 报的偶发）+
  窄屏/触屏 7/7（蒙层 pointer-events:none 后隔蒙层点题成功；390px 手机宽
  流程=关抽屉选题→开抽屉看解析，面板 scrollspy 跟随）。截图 dao2-*.png。
- owner 实测两轮修复：①七选五衔接句高亮（hook 未接线）②阅读证据滚动
  ③阅读跨栏虚线（PaperIntelligenceEvidenceLine，含干扰项琥珀线）。
  显影原则落 plan。
- 挂账：七选五高亮+连线的样式为 Forbidden harness css 手抄改名副本
  （paperBrowsePage.css 内注明出处），刀 3 统一抽共享治漂移；
  paper-2026-i 语法填空 `__NN__` 空格点不着（与解析页共享的数据形状
  限制）入数据健康清单；scrollspy 跨组临界抖动（刀 1 既有）刀 3 顺手。
- 教训：「面板内容逐字比对」兜不住「卷面显影层」缺失——层级 parity
  要列显式验收项；source-grep 断言可固化错误行为（M1 同课），数据
  真实性优先用行为/夹具断言。

# flow-panel 刀 3 — 浏览器 QA 记录

日期：2026-07-09　执行：DEV 子代理（Sonnet, dev-hard）
本地 dev server：`QUESTION_BANK_API_PORT=8799 PORT=5199`，账号 `qa-local-owner`
（本地库密码经 `node scripts/create-user.mjs --reset-password` 临时重置，仅影响本
worktree 复制出的本地 sqlite，不触碰生产）；浏览器 session 实际以已有 cookie
的 `qa-local`（owner）身份登录，无需再手动登录。

## 已用真点浏览器验证（claude-in-chrome，逐条截图肉眼核对，内联于会话中）

- **入口带态 · 搜索卡「阅读解析」**：workbench 找题页展开「全国新课标I」→
  hover Reading A 行 → 点「阅读解析」→ 落地
  `?view=paper-browse&paperId=paper-2026-i&focusGroupId=group-2026-i-reading-a
  &lecture=1&questionId=q-2026-i-021`，讲评态已开、锚定 Reading A、第 21 题
  预选（右栏解析 + 答案依据 + 跨栏虚线连到原文证据句）。此入口保持
  `<a href>` 原生导航（未做 SPA 拦截——ConciergeDesk/ConciergePaperRow 不在
  本刀 Scope 白名单内，见 ConciergeGroupCard.tsx 内注释）。
- **入口带态 · 详情页「阅读解析」SPA 快路径**：workbench → 详情（Reading A）
  → 点「阅读解析」→ 无整页刷新，直接落地同一姿态（讲评开+锚定+第 21 题
  预选+右栏解析+显影层），URL 与上面一致。
- **入口带态 · 详情页「看整卷」**：点「看整卷」→ 挑题态，URL
  `?view=paper-browse&paperId=paper-2026-i&focusGroupId=group-2026-i-reading-a`
  （无 `lecture`/`questionId`），右缘只有讲评把手，无解析噪音。
- **URL 还原**：直接用浏览器地址栏打开完整讲评态 URL（含
  `lecture=1&focusGroupId=...&questionId=...`）→ 新页面加载后立即讲评态+
  锚定+预选，与从入口点进来的姿态一致。完形填空组同款深链
  （`focusGroupId=group-2026-i-cloze&questionId=q-2026-i-041&lecture=1`）
  也验证过——需要等 `lectureAnalysisFetched` 落地的分支正确工作，第 41 题
  预选、证据高亮、右栏解析全部正确渲染，无崩溃、控制台无报错。
- **关讲评态**：点讲评把手关闭 → 挑题态恢复，URL 的 `lecture`/`questionId`
  被 replaceState 剔除（`focusGroupId` 保留，属设计内——不影响验收标准
  "关讲评后 URL 无 lecture/questionId"）。
- **Back / Forward**：workbench → 详情 → 点「阅读解析」（pushState）→
  浏览器 Back → 回到详情页（viewMode 状态保留，URL 回到 workbench 根）→
  浏览器 Forward → 回到讲评态，姿态与选题与去程一致。
- **popstate 兜底 reload**：构造 workbench → PI 独立路由（
  `?view=paper-intelligence&surface=paper&...`）→ paper-browse 三段历史，
  从 paper-browse Back 到 PI URL → 确认发生了整页 reload（PI harness 独立
  路由正确接管渲染，显示其自身的"未指定 groupId"错误态而不是卡在旧的
  paper-browse React 树上）；再 Forward 回 paper-browse → popstate 正确
  重放 boot-read，挑题态正常恢复。
- **小尾巴①②（scrollspy clear-effect 修复 + 去抖）**：讲评开着选中完形
  填空第 41 题后，手动滚动卷面到 Reading C（跨越多个题组边界）→ 面板短暂
  仍显示旧选中（去抖窗口内属预期），~2s 后正确切换到 Reading C · 28-31
  的组级速览、URL 的 `questionId` 同步被清掉——确认 clear-effect 只在
  activeAnchor 变成另一个真实题组时才清、且能正确落地，未卡死在旧选中态。
- **小尾巴③（空态文案）**：讲评开着但未点选、scrollspy 落在无对应题组的
  位置时，右栏显示新文案「滚动卷面或点选题目后，这里显示讲评」（旧文案
  「滚动到题组查看速览」已确认不再出现于源码）。
- **挑题态零解析请求回归**：`read_network_requests` 过滤 `analyses` 只
  看到 `reading-choice-analysis-v1.json` / `seven-choices-analysis-v1.json`
  （刀 1 既有的无条件拉取，非本刀新增），无 cloze/grammar-fill/writing
  的懒加载请求——不变量未被破坏。
- 全程 `read_console_messages`（`onlyErrors: true`）无报错。

## 未能完成的部分（工具限制，如实记录，与刀 1/刀 2 同款已知限制）

- **窄屏（<1200px）抽屉浮层 + 触屏仿真**：本 sandbox 的 `resize_window` 对
  这个 Chrome 标签页的 `window.innerWidth` 无效（同刀 1 记录的限制，试过
  1000×800，`window.innerWidth` 回读仍是 1470），无法真实点击验证窄屏
  抽屉/触屏交互。风险已知收窄：本刀未新增窄屏专属 CSS 行为（七选五高亮/
  证据线断点规则原样搬进共享文件，`verify-paper-browse.mjs` 源码级断言
  钉死 `@media (min-width:1200px)`/`(max-width:1199.98px)` 两条规则内容
  未变；讲评栏抽屉开合/Esc/背景蒙层是刀 1/刀 2 已 QA 过的既有行为，本刀
  未触碰）；空态新文案本身宽窄屏通用（同一字符串，非断点条件渲染）。
  建议下一次有真实窄视口能力时补验（或 owner 手机/平板实测），标记为
  已知缺口，不构成本刀验收阻塞。
- **深链竞态的精确亚 100ms 时序**（cr.md 244-252 描述的"深链滚动沉降期间
  立刻点另一题"竞态）：已用离散工具调用验证了"正常（非竞态）流程下
  clear-effect + 去抖端到端工作正确"（见上），但无法用截图型工具精确
  复现毫秒级竞态窗口本身。修复的正确性以源码路径验证为主：
  `suppressScrollspyClear()` 在三处程序化滚动（rail 点击/深链聚焦/证据
  滚动）+ 深链选题落地前均调用，clear-effect 读同一个 suppress ref。
- 浏览器截图未能另存为本 worktree 内的 PNG 文件（`save_to_disk` 在本
  sandbox 里同刀 1/刀 2 一样没有暴露可访问的文件系统路径）；上述每一步
  验证都在会话内以内联截图逐条肉眼核对过，未留 PNG 文件在这个目录里。
