# Cut: a11y-concierge-three-gaps（无障碍缺口，CSS 刀，small-medium）

审计出处：docs/cuts/restart-2026-07-mainline/audit.md 第三轮新挂账 #5。
cut size: small-medium; touches schema / data contract / product boundary /
teaching interpretation: **no**（纯 display 层 CSS + verify 断言；核实后
无需动任何 TSX）。

> **v2 重写（2026-07-03 深夜）**：v1 依据的侦察坐标系被证实是 subagent
> 幻觉（附和了 PM prompt 里的猜测路径；concierge.css / ConciergeResultList
> .tsx / --gold-select token 均不存在）。本版所有坐标已由 PM 亲手
> `sed`/`grep` 核实于 main @ 509981f。教训入档：侦察报告的 file:line
> 必须存在性核验后才能进 plan。

## 审计前提修正（核实 2026-07-03）

挂账 #5 说「结果行 article onClick 键盘不可达」——这是对重构前 DOM
（死遗留 CSS `.concierge-row`）写的。现行 DOM 里：

- `app/src/concierge/ConciergePaperRow.tsx:146-150` 的 `<article onClick>`
  只是鼠标便利放大区（handleRowClick 里 `closest()` 已排除内部交互元素）；
- 行内 `.concierge-row-expand` 真按钮（151-162 行，aria-expanded +
  aria-controls + aria-label 齐全）提供了**等价键盘路径**（WCAG 2.1.1
  满足）。给 article 再加 tabIndex/role 会造成同一动作双 tab stop，
  是反模式，**不做**；
- ConciergeDesk / ConciergeGroupCard 其余 onClick 全在真 button 上
  （侦察核实，无第二处病灶）。

真正的病：**焦点环全家 rgba(26,26,26,0.08) ≈ 不可见**（键盘用户看不到
焦点在哪 = 事实上不可用）+ **reduced-motion 只盖 5 选择器**。

## 两项修复（坐标核实于 main @ 509981f，全在 app/src/App.css）

### 1. 焦点环可见化（保持 box-shadow 机制，只改 alpha——最小 regex 风险）

0.08 隐形环共 6 处，`0.08` → `0.6`（#1A1A1A 在 #FAFAF7 上 alpha 0.6
混合后对比度 ≥3:1，过 WCAG 非文本对比；0.35 及以下不过）：

- `App.css:5030` `.concierge-action:focus-visible`
- `App.css:5895` `.intake-batch-panel > summary:focus-visible`
- `App.css:5961` `.intake-secondary-button:focus-visible`
- `App.css:6025` `.concierge-row-expand:focus-visible`（键盘等价路径的
  主环，最重要的一处）
- `App.css:4918` `.concierge-row:focus-visible`（死遗留区，顺手同改，
  不删规则——死 CSS 清理是另一刀，见 Non-goals）
- `App.css:6259` `.concierge-paper-row:focus-visible`（article 无
  tabIndex 故此规则当前不触发，同改保一致）

顺手一致化（同文件既有偏弱环，同升 0.6，行形不变）：
`4736` intent-submit 的 `rgba(26,26,26,0.2)`、`5056` action-add 的
`0.2`；`4761` checkbox 的 `0.35`。`5732` `.intake-row-primary` /
`5853` `.concierge-starter-chip` 两处 focus-visible 由 DEV 现场读值，
弱于 0.6 idiom 的一并归一。

**verify 兼容红线（既有断言钉着源文本，别破）**：
- 不改 `.concierge-intent-bar:focus-within` 的 `border-color: #1A1A1A`
  （verify-concierge-desk.mjs:681 钉着）；
- `.concierge-paper-row { }` 里 `transition: background 120ms ease,
  box-shadow 120ms ease` 一字不动（:722 verbatim 钉着）；
- 不重排/合并/拆分 `.concierge-paper-row:hover → :focus-visible` 区块
  结构，`background: #F4F2EC` 保留（:724 跨块 regex 钉着）。

### 2. reduced-motion 全局兜底

- 现状：`App.css:6079-6090` 仅盖 1 animation + 4 transition 选择器；
  App.css 全文 37 处 transition、3 处 animation（多数未盖）。
- 改法：把该块**替换**为同位置的标准全局重置：

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

- 运行时全站生效（含经典模式/PI 屏）——这是该用户偏好的正确语义，
  不算越界；但**不编辑**其它 CSS 文件：paperIntelligence*.css /
  readingAnalysis.css 里各自的局部 reduced-motion 块留着（冗余无害），
  paper-surface / print / export / paperSurfacePrototype /
  PaperSurface.css 一字不碰（契约）。静态输出零视觉差（transition-
  duration 不改最终计算样式）；若任何 render-model 守卫被绊到，
  停下报 PM，不自行改 allow-list。

## 验证（挂进既有脚本，不新建 verify 文件——CI 事故教训）

- `scripts/verify-concierge-desk.mjs` 追加断言（沿用其 source-pin 风格）：
  1. App.css 所有 `:focus-visible` 规则中不再出现
     `rgba(26, 26, 26, 0.08)`（扫描环值，防回潮）；
  2. 存在 `prefers-reduced-motion: reduce` 全局块（匹配
     `animation-duration: 0.01ms`），且旧 5 选择器块已被替换；
  3. ConciergePaperRow.tsx 的 `.concierge-row-expand` 按钮保有
     `aria-expanded`（把键盘等价路径钉成契约，防止未来重构删掉）。
- 跑：`node scripts/verify-concierge-desk.mjs` 全绿 → `npx tsc -b`
  （若动了 TSX；本 plan 预期不动则跳过）→ 合并前
  `pnpm -C app run verify:all` 全量绿或等 PR CI 绿（不许只跑相邻脚本）。

## 浏览器 QA（焦点可见性是视觉主张，不可略）

- dev 起服（8787 纪律：开工先 `lsof -i :8787`，收工必清；5173 被占是
  隔壁项目，别杀）。
- QA 例：① Tab 走到结果行内 ▸ 展开按钮，焦点环**肉眼可见**（截图留证，
  preview_inspect 核 box-shadow 计算值）；② 焦点在 ▸ 上按 Enter 行为与
  鼠标点行一致（is-expanded 出现）；③ Tab 能继续走进展开后的 detail 区
  按钮；④ 回归：鼠标点击照常。preview_click 视口外静默落空坑——点击前
  `window.scrollTo(0,0)` 并核 getBoundingClientRect。
- reduced-motion 不强求动态模拟（preview 工具不暴露），静态断言 +
  标准写法即证据，QA 报告注明。

## Non-goals / Forbidden

- 不给 article 加 tabIndex/role/onKeyDown（双 tab stop 反模式，见前提
  修正）；不动三个 concierge TSX 的任何逻辑。
- `.concierge-row*` 死遗留 CSS（App.css ~4897-5032 中不再被 JSX 引用的
  部分）**本刀不清理**——已另挂 chip/挂账，别顺手删。
- paper-surface / print / export / PaperSurface.css /
  paperSurfacePrototype.css / paperIntelligence*.css /
  readingAnalysis.css / server/** / schema / adapter 全禁。
- 新建 verify 脚本文件；改 render-model allow-list；无关重构。

## 流程

DEV = Sonnet subagent（medium effort，喂本 plan 路径）→ 分支 PR →
CR-lite = Opus 冷读 diff → 浏览器 QA → RM 闸
（`node scripts/verify-cut-artifacts.mjs docs/cuts/a11y-concierge-three-gaps medium`）
→ 合并（gh merge 必带 PR 号；GraphQL EOF 窗口改走 REST + `git ls-remote`
判真相，别盲重试 create）→ main CI 绿才算结案。
