# ui-p1-shell QA notes

日期：2026-07-10　执行：DEV 子代理（Sonnet），worktree
`/Users/huangxuewei/Projects/eqb-wt-ui-p1-shell`（分支 `cut/ui-p1-shell`）。
本地 dev server：`QUESTION_BANK_API_PORT=8798 PORT=5198`，账号
`qa-local-owner`（密码经 `node scripts/create-user.mjs --reset-password`
本地重置，只影响本 worktree 复制出的本地 sqlite，不触碰生产）。服务器已在
QA 结束后停止（`lsof -ti:8798 -ti:5198 | xargs kill`）。

浏览器验证用了两条通道：claude-in-chrome（真实 Chrome，人眼核对）+
Playwright headless（脚本化截图/DOM 断言/computed-style 实测，脚本用后
即删，不留在 worktree 里）。

## ① 焦点环（App.css:214 等 10 处 `:focus-visible` box-shadow + 2 处
`:focus-within`/`:focus`）

- claude-in-chrome：登录后点击品牌区清空焦点，连按两次 Tab 落到「管理」
  ghost-button，zoom 截图肉眼可见清晰的墨绿 2px 描边 + 明显留白 offset
  （不再是原来几乎看不见的低透明度光晕）。
- Playwright 实测 computed style（`docs/cuts/ui-p1-shell/qa/01-focus-ring.png`）：
  `outline: rgb(44, 110, 86) solid 2px`（= `#2C6E56`）、
  `outline-offset: 2px`。搜索框 `:focus-within` 同样验证到位（截图里搜索框
  边框也带同色描边）。
  - 排查记录：第一轮 Playwright 脚本在 `keyboard.press('Tab')` 后立即读
    computed style，读到的是浏览器默认 outline（`rgb(30,30,28) solid 3px`
    0 offset），一度怀疑规则没生效；加 300ms wait 后复测，值就是正确的
    `#2C6E56` 2px + 2px offset——确认是 Playwright 合成键盘事件到样式重算
    之间的时序竞争，不是代码问题（用最小复现页面隔离验证过，同样的
    `outline: var(--focus-ring)` 写法在无延迟时也会读到同样的"默认值"
    假象）。
- 实现：App.css 顶部新增单点 token `:root { --focus-ring: 2px solid
  var(--accent, #2C6E56); }`；10 处 `:focus-visible` box-shadow 规则 +
  `.search-field:focus-within` + `.field input/select/textarea:focus`
  共 12 处全部改用 `outline: var(--focus-ring); outline-offset: 2px;`。
  `.paper-canvas-block.selected`（App.css:2883，`0 0 0 2px
  var(--accent-glow)`）**未改**——它是点击选中态，不是 WCAG 2.4.7 定义的
  焦点指示器，不在本条范围内。

## ② 760px 窄屏顶栏（App.css `@media (max-width: 780px)`）

- Playwright 设 `viewport: { width: 760, height: 900 }`（按指示用
  Playwright 而非浏览器扩展的 resize_window，后者对已有 MCP tab 分组的
  截图分辨率不生效）。
- 截图 `docs/cuts/ui-p1-shell/qa/02-narrow-760-topbar.png`：顶栏折成两行
  （品牌区独占一行），操作区（个人空间/管理/退出）右对齐、自然宽度紧凑
  排布，无整宽灰条、无第二行孤零零按钮。
- 截图 `docs/cuts/ui-p1-shell/qa/02b-narrow-760-topbar-admin.png`：admin
  路由下同样验证（三个操作按钮同一右对齐样式）。
- 实现：删除 `.topbar-actions { width: 100%; }` 和
  `.topbar-actions button { flex: 1; }`；改为
  `.topbar-actions { justify-content: flex-end; align-self: stretch; }`
  （`align-self: stretch` 是必需的——外层 `.topbar` 在此断点
  `align-items: flex-start`，没有它 `.topbar-actions` 不会撑满可右对齐的
  宽度）。

## ③ admin 布局占宽 + 主操作墨绿

- 截图 `docs/cuts/ui-p1-shell/qa/03-admin-wide.png`（1440 宽视口）：面板
  正常占据内容宽度（不再是原来 ~310px 悬空收缩），「给题库打主题标签」
  按钮是实心墨绿 primary-button（此前是 ghost-button）。
- 根因确认：`AdminWorkbench.tsx` 的 `<section>` 原挂
  `library-panel admin-panel` 两个类；`App.css` 里
  `.app-shell.home-mode-ai .library-panel { margin: 0 auto; max-width:
  1160px; }` 这条规则因为 App.tsx 顶层 `<div className="app-shell
  home-mode-ai">` 也包住了 admin 路由，会命中这个面板；而
  `AdminWorkbench` 的直接父级 `.admin-workbench` 是
  `display:flex; flex-direction:column`，子元素设置 `margin: 0 auto`
  会触发 flexbox 的"交叉轴 auto-margin 忽略 stretch、按内容收缩"算法，
  面板因此被压缩到内容宽度（~310px）。
- 实现：`AdminWorkbench.tsx` 的 section 只留 `className="admin-panel"`
  （脱掉 `library-panel`）；`adminWorkbench.css` 的 `.admin-panel` 新增
  `width: 100%; max-width: 1160px; min-width: 0;` 自己接管宽度。按钮
  `className` 从 `ghost-button` 改 `primary-button`。

## ④ admin 路由不再泄漏草稿卷 pill

- Playwright DOM 断言（非仅视觉）：`.basket-chip` 在 admin 路由下
  `count === 0`；切回题库列表路由后 `count === 1`。截图对照
  `docs/cuts/ui-p1-shell/qa/03-admin-wide.png`（无 pill）vs
  `docs/cuts/ui-p1-shell/qa/04-list-basket-chip-present.png`
  （右下角"草稿卷 · 1 题组"pill 正常显示）。
- 实现：`App.tsx` 里原本无条件渲染的 `<button className="basket-chip">`
  包了一层 `{!adminRouteActive && (...)}`，是本刀唯一一处 TSX 改动
  （之前该 pill 与 `<main className="workbench">` 平级，`adminRouteActive`
  时两者本应都不渲染，但 pill 漏了这个条件）。

## ⑤ App.css 内低对比暖灰小字升档

- 排查发现：审计原文举例的 `#8A8177`/`#8A8272`/`#6B6455` 三个具体 hex 值
  在当前 App.css 里**一个都不存在**——全文搜索确认它们只出现在
  `paperBrowsePage.css` 和 `paperIntelligencePaperSurfaceHarness.css`
  两个 panels 刀独占文件里（不在本刀范围）。App.css 里现有的
  `--eqb-color-text-muted` / `.eyebrow` 等早已是 `#6A6A64`（之前的
  teal-repaint 系列刀已经处理过）。
- 判断：按 plan 原文"App.css 范围内 …… <4.5:1 正文级小字统一升到
  `#6A6A64` 档"的精神（而非字面 hex 匹配），在 App.css 内实测扫描发现
  `#9A9A93`（10 处 `color:` 声明）是同一类问题、且对比度更差
  （≈2.83:1，比审计举例的还低）。逐一排查后只升级**非 disabled、非纯
  装饰**的 5 处正文级小字：
  - `.concierge-feed-year-count`（年份分组计数）
  - `.concierge-command-count`（命令行结果计数）
  - `.concierge-group-section-head`（分组标题）
  - `.concierge-group-row-topic`（列表行话题标签）
  - `.concierge-group-row.is-dim` 四个子选择器（搜索未命中行降灰态）
  其余 5 处 `#9A9A93`（`:disabled` 状态 × 4、`·` 分隔符装饰字符 × 1）
  **未改**——WCAG 不要求禁用控件和纯装饰字符满足文本对比度。
- 实测比值（Playwright `getComputedStyle` + WCAG 相对亮度公式，真实页面
  背景，非估算）：
  - `.concierge-feed-year-count`：`rgb(106,106,100)` on
    `rgb(246,246,244)` → **5.03:1**
  - `.concierge-command-count`：同上 → **5.03:1**
  - 手算校验 `#6A6A64` on 纯白 `#FFFFFF` → **5.44:1**（两种常见背景下都
    过 AA 4.5:1）
  - `.concierge-group-section-head` 在本次会话触发的搜索态里没渲染出来
    （需要更具体的分组搜索结果状态），源码已同步改成 `#6A6A64`，未做到
    该选择器的独立实测三选一（用另外两处 + 手算白底覆盖 AA 判断依据）。

## Verify

- `pnpm -C app run verify:all`（→ `node scripts/verify-ci.mjs`）：
  **73 passed / 1 skip（预期，off-repo fixture）/ 0 failed**。
- `npx tsc -b --noEmit`（app 内）：**exit 0，无报错**。
- 未触发任何 palette/hex 守卫脚本（App.css 不在那类脚本的白名单扫描范围
  内；`verify:all` 全绿已确认）。

## Forbidden 自证

- 未改动：`paper-intelligence` harness css/tsx、
  `QuestionGroupDetailView`、`ConciergeDesk.tsx`、
  `DraftPaperWorkbench.tsx`、`paperBrowsePage.css`、`server/**`、
  `shared-ui/papersurface/**`。
- `App.tsx` 只有 1 处改动（`.basket-chip` 的 `adminRouteActive` 条件），
  符合 plan「本刀不做」的悬浮加卷钮锚定 / 面板底部净空等其余 TSX 改动
  边界。
