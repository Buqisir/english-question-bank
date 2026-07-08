# CR — ui-search-feel（UI 一致性刀⑤：找题体验小包）

冷读评审。CR 未参与实现。baseline `main` → `claude/ui-search-feel`。

## Recommendation

**APPROVE**（0 Must Fix，3 Should Watch）。

改动正确、在范围内、验收独立复现绿。DEV「烂点#4 已不存在、不改代码」的裁定
经独立核实成立。

## Changed Scope

`git diff main..claude/ui-search-feel` 共 4 文件，3 commit：

- `app/src/concierge/ConciergeDesk.tsx`（+22/-3）— `dataLoading` 分支加骨架。
- `app/src/App.css`（+62/-1）— 骨架样式 + `.concierge-paper-row` 列宽。
- `docs/cuts/ui-search-feel/plan.md`（新增，契约）。
- `.impeccable/critique/2026-07-07T18-36-42Z__app-src-ui.md`（新增，critique 快照，独立 commit 411aa38）。

Forbidden 遵守：`useConciergeDesk.ts` / `conciergeSearch.ts` / `aggregatePaperResults.ts`
**零改动**（--stat 与逐文件 diff 双证）；无新依赖；chips 维度数据、thinking 开关未碰。
scripts 未改动（重要：见验收独立性）。

## Findings

### Must Fix
无。

### 独立裁定：烂点#4「加卷按钮不可发现」——DEV 判定「不存在」成立

审计 persona 与 plan 引用的三处，逐条冷读核实（均在 `main` 上核对）：

1. **题组卡加卷按钮（加入草稿卷）**：`ConciergeGroupCard.tsx:141-150` 是原生
   `<button type="button">`，class `concierge-action concierge-action-add`，容器
   `.concierge-group-actions`（`App.css:4832`）**无 opacity 淡显**（默认 1，常驻可见），
   `:focus-visible` 命中章程环 `box-shadow: 0 0 0 3px rgba(44,110,86,0.20)`
   （`App.css:3785-3790`，以及基类 `.concierge-action:focus-visible` :3759）。
   在 tab 序（原生 button，无 tabIndex=-1）。→ 审计对此卡的断言不成立。
2. **`.concierge-actions`（0.45 淡显 + focus-within 提亮，`App.css:3727-3737`）确属死 CSS**：
   `grep -rn concierge-actions app/src` 仅命中 App.css，**无任何 TSX 引用**（实际按钮用的是
   单数 `.concierge-action`）。改它没有产品意义。
3. **plan 引用的 `App.css:2466 opacity:0`**：`main` 上该行是 `@keyframes fadeInUp`
   入场动画关键帧（`.group-card/.detail-hero/...` 用），与加卷按钮无关。→ 属无关引用。

结论：DEV 不改代码的决定正确，避免了对死 CSS 的无效改动。此为本刀最关键的独立裁定。

## Should Watch（不阻塞本次合并）

- **SW-1｜reason 行截断变早**：`.concierge-paper-row` 中列由 `1fr` 改为
  `minmax(160px,340px)`（`App.css:4559`）。`.concierge-paper-reason`（:4682，
  nowrap+ellipsis）在此列内，列变窄后「推荐理由」可见字数比改前少。降级优雅
  （ellipsis + `title` 全文 tooltip，`ConciergePaperRow.tsx:199`），且这正是 plan
  「把空间让给标题」的既定取舍。QA 在 1440 视口目视 reason 是否仍够读即可，不改代码。
  meta 主体（hitcount/grouptypes/topics）是 `display:flex; flex-wrap:wrap`（:4635），
  超宽自动换行而非溢出/竖排，grouptypes 另有 `max-width:320px`+ellipsis 自兜底——
  340px 封顶下无截断/溢出 bug。640px 断点降为 `1fr auto` 两列、body 整行铺下
  （:4587-4597），窄屏不受 340 封顶影响，无中列压 0 宽回归。641px+ 三列最小和
  240+160+actions+gap 亦在视口内，无列塌陷。
- **SW-2｜docs 快照越出 plan 两文件范围**：411aa38 新增 `.impeccable/critique/...md`。
  纯 L0 追加记录（audit.md 引用的 trend 存档），无代码、无产品决策，未改 audit.md。
  可接受，仅记录范围事实。
- **SW-3｜Playwright 骨架帧未独立复现**：本刀为纯 render 追加分支、无状态机改动、
  reduced-motion 由全局兜底，风险低。CR 以源码级判定（见下），未起 8787+4173 +
  route 挂起复现 loading 帧。若 PO QA 想眼见骨架，可 hover 首个数据请求节流一次。

## Verification Evidence（CR 亲自重跑，未采信转述）

- `npm run build --prefix app`：**绿**（tsc -b && vite build，1850 modules，built in 771ms）。
- `node scripts/verify-concierge-desk.mjs`：**250 passed / 0 failed**。
- `node scripts/verify-home-default-feed.mjs`：**38 passed / 0 failed**。
- `node scripts/verify-c6a10-concierge-local-search.mjs`：**59 passed / 0 failed**。
- 绿的合法性核查（防「弱化换绿」）：
  - `.concierge-paper-row` 断言（verify-concierge-desk.mjs:729-733）只钉 `cursor:pointer`
    与 `transition`，**未钉 grid-template-columns 旧值**——故列宽改动无需改 verify，
    diff 中 scripts 亦零改动。绿是真绿，非弱化。
  - `.concierge-data-loading role="status"` 断言（:762）仍绿——新骨架保留了原 a11y 状态行。
  - :834「旧 5-选择器 reduced-motion 块已移除」仍绿——骨架 reduced-motion 走全局兜底而非局部 `animation:none`。
- 骨架 reduced-motion 覆盖核实：`.concierge-skeleton-chip` 与复用的 `.concierge-skeleton-line`
  用 `animation: concierge-skeleton-shimmer`（App.css:4486 / 4325）；全局
  `@media (prefers-reduced-motion: reduce){ *,*::before,*::after{ animation-duration:.01ms
  !important; animation-iteration-count:1 !important } }`（:4337）**通配选择器真实命中骨架类**——
  reduced-motion 下 shimmer 退化为静态。符合章程硬要求。
- 骨架中性灰：渐变 `#F6F6F4/#EDEDEA`、边框 `#D8D8D2` 与既有 `.concierge-skeleton-line`
  及全站 neutral hover(#EDEDEA)、topic-chip 底色完全一致，非新暖色。符合章程。
- 骨架分支正确性：`{dataLoading && (...)}` 内渲染，chips/feed 反向 `!dataLoading` 门控
  互斥不重叠；chip-row `<ul>` 与 feed `<div>` 均 `aria-hidden="true"`，语义交给 role="status"；
  无新 hook、纯 JSX，状态机零触碰。

## Self-Review Blind Spots（喂给后续 Big CR 时先看）

- **像素级列宽未证**：CR 以 grid 数学（1440/641 边界）推断标题列变宽、meta 不溢出，
  未起浏览器截图量 `scrollWidth<=clientWidth`。若 Big CR/QA 有浏览器，优先复现
  plan 验收 3c 的标题断言与 SW-1 的 reason 可读性。
- **loading 帧未眼见**：骨架仅源码判定，未截到真实 dataLoading 帧的视觉平衡
  （chip 尺寸/feed 分组间距是否协调）——纯观感项，非契约项。
- **critique 快照内容未逐行读**：仅确认为 L0 追加记录、未改 audit.md；未审其打分口径。

## Failure / Attack Angle

- 若未来有人给 `.concierge-paper-reason` 去掉 nowrap+ellipsis 或删 `title`，SW-1 的
  340px 封顶会从「优雅截断」变「视觉突兀」——但那是新改动的责任，非本刀。
- 若未来删掉全局 `prefers-reduced-motion` 通配块（:4337），骨架 shimmer 会失去
  reduced-motion 兜底而无局部规则接手——骨架依赖那条全局块，是隐性耦合，值 Big CR 留意。
- 死 CSS `.concierge-actions`（:3727）留存：未来 agent 可能误以为它在生效而去改它。
  非本刀职责清理，但记录以防误导。
