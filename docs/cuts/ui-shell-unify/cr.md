# CR — ui-shell-unify（外壳统一刀①）冷读

Reviewer: 独立 CR 子上下文（未参与实现）。
Baseline: `git diff main..claude/ui-shell-unify`（commit `a462ba9` plan + `b6e40f1` 实现）。
背景：全站 UI 一致性审计（`docs/cuts/ui-coherence/audit.md`）分刀①；实现由主代理应急完成（DEV 两次停摆，owner 追认）。

**结论：APPROVE WITH MUST FIX**

核心目标（四套顶栏→一套 AppShell 语言、返回统一「返回找题」、去 `(C4)` 标签、全局导航全页面可达）已达成，构建/verify 全绿，Forbidden 边界未越。唯一阻断项是：plan 明确要求的「中部插槽」设计（草稿卷上下文工具迁入 AppTopbar children）**整体未实现**且随之 ship 了一批死代码。需 PO 就此裁决后方可合并。

---

## Changed Scope（自 diff 核实，非报告转述）

改动文件（`git diff --stat`）：`App.css`、`App.tsx`、新增 `components/AppTopbar.tsx`、`DraftPaperWorkbench.{tsx,css}`、`MySpacePage.{tsx,css}`、`PaperIntelligencePaperSurfaceHarness.tsx`、`paperIntelligencePaperSurfaceHarness.css`、`QuestionGroupDetailView.tsx`、`plan.md`。

Forbidden 核对（读 diff 文件清单，非报告）：
- `shared/papersurface/**`、`server/**`、schema、`*Adapter.ts` — 均未触碰。✅
- 无新依赖（AppTopbar 只用已在用的 lucide-react）、无新路由、未改登录页。✅
- `scripts/**` 未改 → 无静默削弱 verify 断言。✅
- grey-zone（DraftPaperWorkbench / Harness）：无 reducer / URL 状态 / adapter I/O 改动；数据获取逻辑未变（详见 Should Watch SW-1）。✅

---

## Findings

### Must Fix

**MF-1　plan 的「中部插槽」设计整体未落地，且 ship 了死代码。**
- plan §1 中段与 §2 明确要求：草稿卷的「标题输入 / 学生版·教师版分段 / 导出按钮」**原样迁入** AppTopbar 的 children 插槽（其它页留空）。
- 实际实现：`AppTopbar.tsx:54` 定义了 `children` → `.topbar-tools` 插槽，`App.css:75-90` 定义了 `.topbar-tools` 及 1160px 断点样式，但**四个调用点无一传 children**（`App.tsx`、`DraftPaperWorkbench.tsx:398/407/417`、`MySpacePage.tsx:161`、`Harness` 全部无 children）。
- 结果：`DraftPaperWorkbench.tsx:417` 渲染 AppTopbar 后，紧接着仍保留独立的第二条 `<header className="draft-toolbar">`（`:419` 起，含 `draft-title-field`、`draft-export-menu`）。草稿卷页因此是**两条堆叠的横条**，而非契约要求的「一套统一外壳」。`children` prop + `.topbar-tools` CSS + 1160px 媒体查询是**全站无人使用的死代码**。
- 这是 display 层重构（DraftPaperWorkbench 是 grey-zone，允许 display 编辑），实现方本可完成却未做，且完成报告未把该偏离单列。
- **要求合并前二选一**：(a) 按契约把草稿卷上下文工具迁入 children 插槽，实现单条外壳；或 (b) PO 明确裁定接受「两条横条」布局，并**删除**未使用的 `children` slot / `.topbar-tools` 及其媒体查询死代码（否则留下误导后续代理的半成品脚手架）。

---

### Should Watch（不阻断本次合并）

**SW-1　Harness 新增 `shellTitle` 局部 useState + 在 fetch 里 set —— 判定：未越界，可接受。**
`Harness.tsx:227` 新增 `shellTitle` state，`:307` 在 load() 开头 reset 为 null，`:341-343` 在 `source==='paper-asset'` 分支解析出 `asset`/`group` 后 set。这是**纯 display 派生**：读取本已 fetch 到的 `asset.paper.title` / `group.title`，不改变任何 fetch 调用、不动 adapter I/O、不动 surface model 状态。plan §2 明确要求 tagline 改为 `{asset.paper.title} · {group.title}`，而该数据是 fetch 作用域内的 local const，唯一的忠实实现就是提升为一个 display state。`setShellTitle(null)` 在 load 开头有 reset，无脏值风险。判为 grey-zone display 允许范围内，唯一新增 state 的点，记录以便后续 Big CR 优先复看。

**SW-2　`管理`/`退出管理` 仅在首页出现，未如 plan §1「恒定出现」措辞覆盖子页 —— 判定：更保守、且非回归。**
`App.tsx:753` 的 `shellNav` 只带 `{user, onLogout, onOpenMySpace}`，不含 `showAdmin/onToggleAdmin`；子页 AppTopbar 因此不渲染管理按钮。plan §1 右侧同时写了「恒定出现」与「回调从各页现有 handler 传入，不新建状态」——两句冲突：子页无既有 admin handler，`adminRouteActive`/`toggleAdminRoute` 是首页 shell 的局部状态，从子路由切换 admin 需新增路由/状态（被 Forbidden 禁止）。实现取「不新建状态」一侧，且**保持了本刀前的行为**（旧草稿/卷面/My Space 顶栏本就无管理按钮），非回归。请 PO 确认接受「管理仅在首页/管理台可达」。

**SW-3　`shellNav` 每次 render 新建对象传子组件。**
`App.tsx:753` 的 `shellNav` 是普通对象（非 hook，不违反 hooks 规则），每次 render 重建。三个子组件（AppTopbar 及其宿主）均未 memo 化，本就会重渲染，无额外性能损害。UI 表面可接受，不必现在处理。

**SW-4　Harness 顶栏丢失 `flex-shrink: 0`。**
旧 `.pi-ps-harness-topbar` 有 `flex-shrink:0`；`.pi-ps-harness`（`Harness.css:113-117`）是 `display:flex; flex-direction:column; height:100vh; overflow:hidden`。新的 AppTopbar `.topbar` 无显式 `flex-shrink:0`，极端矮视口下理论上可能被压缩。属视觉细节，交 Playwright/QA 双档截图核实（plan §3 验收项）。

---

## Self-Review Blind Spots

- **视觉/像素级一致性未由我核实**：我未起 dev server / Playwright。plan §3 要求的 5 页 × 双档截图（顶栏结构一致、`(C4)` 消失、900px 不叠层、Harness 单/双条布局）是 QA/主代理职责。MF-1 的「两条横条」观感是否可接受，最终需截图 + PO 裁决。
- **`.topbar` 新增 `flex-wrap: wrap` 对首页/管理台顶栏在中间宽度的换行表现**我仅静态判断（首页无 children 故无 `.topbar-tools`，应安全），未实测。
- **Harness `source !== 'paper-asset'` 分支的 pageTitle 回退**（落到 `report?.sourcePaper?.paperName`）我按代码判断正确，但未穷举所有题型路由实跑。

---

## Failure / Attack Angle

1. **半成品脚手架误导后续代理**：`children`/`.topbar-tools`/1160px 媒体查询是死代码。后续做 UI 刀②的代理会以为「插槽已接好、草稿工具已迁入」，据此叠加，实际草稿卷仍是两条横条。这正是 MF-1 要求「要么实现、要么删净」的原因。
2. **静默低交付**：完成报告未标注「中部插槽未实现」这一对 plan 的明确偏离。green（build+verify）不覆盖该设计项——verify 脚本只钉 App.tsx 退役项与 draft/my-space 数据契约，完全不校验顶栏是否单条、工具是否入槽。绿灯真空区正是此处。
3. **grey-zone 越界的隐蔽面**：SW-1 的 `setShellTitle` 若未来被人扩成在 fetch 里派生更多 UI 状态，会逐步把 display state 与数据获取耦合。目前一处、已 reset，可控，但值得盯。

## Verification Evidence（自跑，非转述报告数字）

- `npm run build --prefix app` → tsc + vite **绿**（1850 modules，built in ~493ms）。
- `node scripts/verify-classic-retire-3.mjs` → **15 passed, 0 failed**。
- `node scripts/verify-c8-draft-paper-contracts.mjs` → **50 passed, 0 failed**。
- `node scripts/verify-c8-my-space-contracts.mjs` → **84 passed, 0 failed**。
- 断言强度核对：三脚本均未因旧 header 结构被删而红 → 无 verify 断言被改；`git diff --stat` 证实 `scripts/**` 未入 diff。plan §2「改动 verify 断言须单列」不适用（未改）。
- `grep` 全 `app/src`：`draft-back-button` / `draft-my-space-link` / `my-space-back` / `my-space-toolbar` / `pi-ps-harness-topbar/-back/-tagline` **零残留引用**（删的 CSS 类无孤儿引用）。
- 返回文案：`QuestionGroupDetailView.tsx:165` 已改「返回找题」；`PaperIntelligencePreview.tsx:458/462`（reading-analysis 孤儿支）**未动**（符合 plan §3）。`PaperSurfacePrototype.tsx:613/616` 仍「返回工作台」——原型文件，不在 plan 四处清单内，未触碰正确。
- 行为回归：草稿卷「查看个人空间」链接改用 `shellNav.onOpenMySpace`（`DraftPaperWorkbench.tsx:578-579`），App 向草稿传的是完整 `shellNav`（`onOpenMySpace: openMySpace`）→ 链接有效。My Space 页传 `{...shellNav, onOpenMySpace: undefined}`（`App.tsx:778`），AppTopbar `props.onOpenMySpace &&` 判假 → 该页不显示「个人空间」按钮，undefined 展开稳定。
- Hooks：`handleLogout` useCallback（`App.tsx:747`，deps `[]` 正确）与 `shellNav`（`:753`）均在所有 early return 之前；`shellNav` 为普通对象非 hook，无 hooks 顺序违规。

## Residual Risk

- MF-1 关闭前，草稿卷是双横条、插槽死代码在库。功能无损、无安全/数据风险，但契约的核心设计项未交付。
- 其余为视觉细节（SW-4）与需 PO 一句话确认的产品边界（SW-2），均不阻断。

## Recommendation

**APPROVE WITH MUST FIX** — 关闭 MF-1（实现中部插槽 或 PO 裁定接受两条横条并删除 `children`/`.topbar-tools` 死代码）后可合并。SW-1..SW-4 记录监控，不纳入本刀。
