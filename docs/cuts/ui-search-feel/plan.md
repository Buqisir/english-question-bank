# ui-search-feel（UI 一致性刀⑤：找题体验小包）— DEV 执行契约

cut size: small-medium; touches schema/data-contract/product boundary: no。
背景：`docs/cuts/ui-coherence/audit.md` 优先问题 ⑤（烂点 #2/#3/#4）。

## 1. 搜索 loading 骨架（烂点#3）

现状：`ConciergeDesk.tsx` `dataLoading` 期整页只有一行
`正在连接本地题库，稍候即可搜索。`（:250-254），chips 行与 feed 都
`!dataLoading` 门控 → 首屏空白闪。

改法：dataLoading 期渲染骨架占位（保留那行 role="status" 文案）：
- chips 区：一行 5-6 个胶囊形骨架块（尺寸接近真实 chip）。
- feed 区：3 个来源卷分组骨架（标题条 + 两行题组行灰块）。
- 骨架样式进 App.css：真中性灰（surface-2/border-subtle 梯），微弱
  shimmer 或纯静态都行；若加动画必须 `prefers-reduced-motion: reduce`
  退化为静态（章程硬要求）；动画只用 opacity/transform。
- 骨架元素 `aria-hidden="true"`，状态语义交给已有 role="status" 行。

## 2.「加入草稿卷」可发现性 + 键盘可达（烂点#4）

现状两处，分别处理：
- **题组卡（命中高亮态）**：`App.css:2466` 附近 `opacity: 0`、hover 才
  浮现——真·不可发现。改常驻淡显 `opacity: 0.7` + hover/focus-visible
  到 1；确认对应按钮是原生 button 且在 tab 序（不是的话修成是）。
- **feed 行 actions**：`.concierge-actions` 已是 0.45 淡显 + focus-within
  提亮（:3726-3737）。审计 persona 断言「tab 顺序里没有」——实测核查：
  若按钮可 tab 则只把默认 opacity 提到 0.7 对齐两处手感；若真不可 tab
  （tabIndex=-1 或非 button），修成可 tab 并在报告说明根因。
- 聚焦态用章程焦点环（刀③已统一的 `0 0 0 3px rgba(44,110,86,.20)`），
  不要新发明。

## 3. feed 标题列宽（烂点#2）

现状：`.concierge-paper-headline`（App.css:4546）nowrap+ellipsis，列宽
偏窄右侧留白大，审计 DOM 实测溢出 236px（如「2026年1月浙…」）。

改法：找到 `.concierge-paper-row`（或其父）的列布局，把标题列的份额
放宽（fr/minmax 或 flex-basis 调整），目标：1440px 视口下
「2026年1月浙江首考英语卷」级别长度的标题完整可读不截断；右侧 meta
区留白相应收窄。保留 ellipsis 作极端兜底。

## Forbidden

- 只动 `app/src/concierge/ConciergeDesk.tsx`（及其子组件文件若拆分）与
  `app/src/App.css`；不动检索/状态机逻辑（`useConciergeDesk`、
  `conciergeSearch.ts` 一律不碰——骨架只是渲染分支）。
- 不动 chips 维度数据、不动 thinking 开关（刀⑥）、不加依赖。

## 验收

1. `npm run build --prefix app` 绿。
2. `node scripts/verify-concierge-desk.mjs`、
   `node scripts/verify-home-default-feed.mjs`、
   `node scripts/verify-c6a10-concierge-local-search.mjs` 绿（若断言钉了
   loading 分支/DOM 结构导致红，报告单列，不许静默放宽）。
3. Playwright（8787+4173，跑完杀进程）：
   a. 用 CDP/route 拦截或节流首个数据请求制造 dataLoading 窗口，截到
      骨架帧（截不到就用 `page.route` 挂起请求强制停在 loading 态）；
   b. 正常 home 截图：题组卡「加入草稿卷」不 hover 也可见（淡显）；
      `page.keyboard.press('Tab')` 序列能落到加卷按钮上（computed
      box-shadow 含章程环）；
   c. 标题断言：`concierge-paper-headline` 的 `scrollWidth <= clientWidth`
      （对现库最长标题）。
   截图放 /private/tmp/claude-501/-Users-huangxuewei-Projects-english-question-bank/9adddf3b-2f53-4faf-bf50-a4aefe6df666/scratchpad/dev-feel/。
4. 完成报告：三项逐条落实（file:line 摘要）、actions 可 tab 性核查结论、
   verify 结果、截图路径、已知风险。
