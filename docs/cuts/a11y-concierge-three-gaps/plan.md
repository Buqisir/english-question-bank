# Cut: a11y-concierge-three-gaps（无障碍三缺口，medium）

审计出处：docs/cuts/restart-2026-07-mainline/audit.md 第三轮新挂账 #5。
cut size: medium; touches schema / data contract / product boundary /
teaching interpretation: **no**（display 层 CSS + 2 个叶子组件的键盘交互；
组件只经 props 回调，无 reducer / 状态契约 / 数据获取）。

PA 跳过（PM 决定，理由入档）：三个缺口逐条枚举、落点已由侦察钉死、
爆炸半径小且不碰任何契约文件；CR-lite（Opus 冷读）+ 浏览器 QA 不降级。

## 三项修复（侦察坐标 2026-07-03，main @ 147461e）

### 1. 焦点环不可见 → 可见

- 落点：`app/src/styles/concierge.css:1140`
  `.concierge-shell :is(button, input, [tabindex]):focus-visible` 现值
  `outline: 2px solid rgba(26, 26, 26, 0.08)`（8% 透明度 ≈ 不可见）。
- 改为 `outline: 2px solid var(--ink, #1A1A1A); outline-offset: 2px;`
  ——与搜索框 focus 边框（#1A1A1A，concierge.css:311）同色系，对比度
  ~16:1。UI 方向已授权小川，此为定稿，不再开选项。

### 2. 结果行键盘不可达 → 可达可操作

- 落点（侦察实锤，均无 tabIndex/role/onKeyDown，行内无可聚焦子元素）：
  - `app/src/concierge/ConciergeResultList.tsx:84` `<article onClick>`
  - `app/src/concierge/ConciergePaperRow.tsx:52` `<article onClick>`
  - `app/src/concierge/ConciergeDesk.tsx:214` `.concierge-notice`
    `<div onClick={dismissNotice}>`（顺手，同病）
- 两个 article：`role="button"` + `tabIndex={0}` + `onKeyDown`
  （Enter/Space → preventDefault + 调既有 onSelect 回调）。选中态已有
  `is-selected` class，补 `aria-pressed={selected}`。
- notice：优先改成真 `<button>` 包裹可点区域（语义正解）；若 DOM 结构
  改动会牵连样式面积过大，退而 role="button"+tabIndex+onKeyDown 同方案。
- 禁改：这三个文件里的任何 props 契约、状态、数据流、回调签名。

### 3. reduced-motion 只盖 5 选择器 → 全局兜底

- 现状：`concierge.css:1148-1160` 仅盖 5 个动画选择器；全库 13 处
  animation + 37 处 transition（concierge.css 10+21、app.css 3+14、
  tokens.css 2 个 --transition-lift 定义）。
- 改法：在 `app/src/styles/app.css`（全站加载）加标准全局块：

  ```css
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }
  }
  ```

- concierge.css 里旧的 5 选择器块被全局块取代后**删除**（避免双源）。
- paper-surface.css / print.css **一字不碰**（契约守卫）：全局块对静态
  输出零视觉差（transition-duration 不改最终计算样式），若 c8
  render-model 守卫仍被绊到，停下来报 PM，不要自行改 allow-list。

## 验证（全部挂进既有脚本，不新建 verify 文件——CI 事故教训）

- `scripts/verify-concierge-desk.mjs` 追加断言（沿用其 source-pin 风格）：
  1. concierge.css 的 focus-visible 规则不再含 `rgba(26, 26, 26, 0.08)`，
     含 `--ink` 或 `#1A1A1A`；
  2. app.css 存在 `prefers-reduced-motion: reduce` 全局块
     （匹配 `animation-duration: 0.01ms`）；
  3. concierge.css 不再有独立 reduced-motion 5 选择器块；
  4. ConciergeResultList.tsx / ConciergePaperRow.tsx 的 article 均含
     `tabIndex` + `onKeyDown` + `role="button"`；
  5. ConciergeDesk.tsx 的 notice 可键盘关闭（button 或 onKeyDown）。
- 跑：`node scripts/verify-concierge-desk.mjs`（238+新增全绿）→
  `npx tsc -b`（app/ 下）→ 合并前 `pnpm -C app run verify:all` 全量绿
  或等 PR CI 绿（两者其一，不许只跑相邻脚本）。

## 浏览器 QA（TSX 交互变更，不可略）

- dev 起服（8787 纪律：开工先 `lsof -i :8787`，收工必清；5173 若被占是
  隔壁项目的 vite，别杀，本项目靠 autoPort 躲开）。
- QA 例：① Tab 能走到结果行且焦点环肉眼可见（截图留证）；② Enter/Space
  选中行为与鼠标点击一致（选中态出现）；③ notice 键盘可关；④ 回归：
  鼠标点击照常。preview_click 有视口外静默落空坑——点击前
  `window.scrollTo(0,0)` 并核 getBoundingClientRect。
- reduced-motion 浏览器侧不强求动态模拟（preview 工具不暴露该模拟），
  静态断言 + 全局块标准写法即为证据；QA 报告里注明即可。

## Forbidden

- `app/src/styles/paper-surface.css`、`app/src/styles/print.css`、
  `shared/papersurface/**`、一切 print/PDF/export 链路。
- 三个 TSX 文件的非 display 逻辑（reducer/状态/数据获取/URL 状态/回调签名）。
- 新建 verify 脚本文件；改 c8 render-model allow-list。
- 无关重构、无关格式化。

## 流程

DEV = Sonnet subagent（medium effort）按本 plan 实施 → 分支 PR →
CR-lite = Opus 冷读 diff → 浏览器 QA → RM 闸
（`node scripts/verify-cut-artifacts.mjs docs/cuts/a11y-concierge-three-gaps medium`）
→ 合并（gh merge 必带 PR 号；GraphQL EOF 窗口用 REST/`git ls-remote` 判
真相，别盲重试 create）→ main CI 绿才算结案。
