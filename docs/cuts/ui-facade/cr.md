# UI 门面刀 — cr.md（CR-lite 冷读）

**Reviewer**: 小川 (CR-lite, reviewer ≠ implementer — fresh session, no DEV context)
**Baseline**: `github/main` @ `01dc580`
**Head**: `cut/ui-facade` @ `a806533`（3 commits: plan + 实现 + chip 左对齐 fix）
**Recommendation**: **APPROVE**（0 Must Fix / 3 Should Watch）

---

## Changed Scope

10 个文件，全部落在 plan 允许集内：

| 文件 | 性质 | 判定 |
| --- | --- | --- |
| `app/src/auth/LoginPage.tsx` (+4/-2) | F1：加 subtitle + footer-hint，`login-submit` 去掉 `primary-button` | 允许 |
| `app/src/auth/LoginPage.css` (+57) | F1：暖色化 + 自带按钮样式 | 允许 |
| `app/src/concierge/ConciergeDesk.tsx` (+67) | F2：维度标签 + `buildFacetedFilterOptions` + `is-zero` | 允许 |
| `app/src/concierge/filters.ts` (+39) | F2：仅新增纯函数 `buildFacetedFilterOptions`，`applyConciergeFilters`/`buildFilterOptions` 本体零改 | 允许（plan §F2-2 落点） |
| `app/src/App.css` (+39) | F2/F3：filter-row 竖排 + dim-label + is-zero + 工具栏分组 | 允许 |
| `app/src/App.tsx` (+1/-1) | F2-3：`App.tsx:3327` kicker 单行 `Local-first …` → `English Question Bank` | 允许（就这一处） |
| `app/src/features/draft-paper/DraftPaperWorkbench.tsx` (138 行 diff) | F3：三个 wrapper div 包住原 8 控件 | 允许（见下） |
| `app/src/features/draft-paper/DraftPaperWorkbench.css` (+37) | F3：grid→flex 分组 + 980px 断点 | 允许 |
| `scripts/verify-concierge-filters.mjs` (+77) | 仅新增 Test 5（faceted 语义单测） | 允许（plan §验证明确要求新增单测） |
| `docs/cuts/ui-facade/plan.md` (+115) | 契约文档 | 允许 |

**Forbidden 全部零触碰（从 diff 确认，非报告口径）**：
- `tokens.css` — `git diff --stat` 空，未动；`--eqb-color-bg-warm` 仅被引用（`#fbfaf6`，tokens.css:3）。
- `server/**` / domain / `*Adapter.ts` / `shared/papersurface/**` / schema — `git diff --name-only | grep` 命中 **NONE**。
- 全局 `.primary-button` — App.css diff 内无 `primary-button` 一字；仅从 login JSX className 移除（F1-4 显式许可），移除后 `login-submit` 自带完整样式（背景/radius/高/hover/disabled），无孤儿样式。
- `applyConciergeFilters` 语义未改（本体零 diff，新函数复用其口径）。
- print / PDF / export 样式未动。

---

## Findings

### Must Fix
无。

### Should Watch（不阻塞本次合并）

- **SW-1 · plan 路径标签与真实文件路径不符（文档瑕疵，非 scope drift）**
  plan §F3 / §背景写 `app/src/workbench/DraftPaperWorkbench.tsx`，但真实文件在
  `app/src/features/draft-paper/DraftPaperWorkbench.tsx`（`app/src/workbench/…`
  不存在）。DEV 改的是真实文件，属实现正确、plan 标签笔误。不阻塞；后续起草
  同区 cut 时以真实路径为准，避免侦察坐标幻觉。

- **SW-2 · `buildFacetedFilterOptions` 复杂度 O(维度×语料)（4×N，可接受）**
  `filters.ts:158` 对 4 个固定维度各跑一次 `applyConciergeFilters` +
  `buildFilterOptions`（filters.ts:161-172）。当前语料量级（fixture 9 组、
  真库百量级 group）下无感知开销，且挂在 `filterOptions` useMemo（依赖
  `[questionGroups, filters]`，ConciergeDesk.tsx:111-114，依赖正确）。仅在语料
  涨到万级且每次 filter toggle 都重算时才需关注——现阶段不做优化。记录，勿排期。

- **SW-3 · 980px 断点下分组竖排依赖既有控件宽度规则**
  DraftPaperWorkbench.css 媒体查询里 `.draft-toolbar` → `flex-direction:
  column`，group-doc/group-output 去掉左 border/padding 并 `flex-wrap: wrap`；
  但 `.draft-toolbar-group` 基类仍是 `display:flex`（行向）。窄屏下每组内部
  控件仍横排换行，`draft-title-field`/`select` 的具体宽度由既有规则决定。
  静态读无破绽，但窄屏真机布局属视觉项，交主 agent 浏览器 QA 截图确认
  （plan §验证-3 已含）。非阻塞。

---

## Self-Review Blind Spots

（plan 头部实现方自认弱点，逐条复核结论）

- **(a) `.concierge-filter-clear { align-self: flex-start }` × filter-row column 换行**
  父 `.concierge-filter-row` 现为 `flex-direction: column; align-items:
  flex-start`（App.css:5884-5889）。column 下 `align-self` 控横向交叉轴，
  `flex-start` = 左对齐；清除按钮是单元素独占一行，不存在「chips 换行」组合
  问题（chips 在各自 `.concierge-filter-dim-row` 内，与 clear 按钮同级不同容器）。
  **判定：无问题。**

- **(b) LoginPage.css `var()` → hex 字面量惯例一致性**
  换用的 `#fffdf8 / #e5e3dc / #6b645c / #9a9180 / #1a1a1a` 与 concierge 区
  既有暖色字面量一致（plan §背景已列同套值），`--eqb-color-bg-warm` 仍走
  token 引用（LoginPage.css:6）。符合「零新 token、复用 concierge 字面量」
  惯例。**判定：一致。** 唯一代价是登录页脱离 `--surface/--panel/--accent`
  主题变量，若未来做深浅主题切换需回填——但当前无主题切换需求，不阻塞。

- **(c) 980px 分组竖排样式完好性** — 见 SW-3，静态读完好，交浏览器 QA 收口。

---

## Verification Evidence（CR 亲自复跑，非抄报告）

- `node scripts/verify-concierge-filters.mjs` → **33 passed / 0 failed**（含新增
  Test 5 的 11 条 faceted 断言）。
- **变异测试**（证明断言真能失败）：把 `buildFacetedFilterOptions` 内
  `applyConciergeFilters(groups, otherFilters)` 篡改为 `applyConciergeFilters(
  groups, filters)`（即用维度自身选择去收窄自身）→ **32 passed / 1 failed**，
  精确命中「own dimension keeps full counts」断言。断言真守语义，非 string-shape。
  改后已还原，`git diff` filters.ts 干净。
- 断言与 fixture 交叉核对：fixture g1/g2/g7/g8/g9=reading，浙江=g1/g2/g9（3 组
  reading），2020=g8/g9（2 组 reading）——Test 5 期望值全部与 fixture 数据自洽。
- `pnpm -C app run verify:all` → **PASS 66 / SKIP 0 / FAIL 0**（不劣化）。
- `npx tsc -b` → **EXIT 0**（`Record<...>` 维度映射 + 多段 className 模板串类型干净）。
- `verify-concierge-filters.mjs` 已注册在 `scripts/verify-ci.mjs:74`——新增保护
  真的在 CI 门里跑，非仅手跑绿。
- DraftPaperWorkbench.tsx 138 行 diff 逐行核对：三个 `<div className="draft-
  toolbar-group …">` 包裹，内部每个 `onClick`/`onChange`/`disabled` 表达式/
  `aria-label`/控件顺序**逐一保留**（返回/标题/自动保存/最近草稿卷/学生版·
  教师版/导出三项/个人空间）。零 reducer、零 URL state、零 fetch、零跨组件同步
  改动。**确认纯 display-only。**

---

## Failure / Attack Angle

1. **faceted count 悄悄用错维度** → 已被变异测试堵死：用自身 filter 收窄自身会
   立刻红一条断言。攻击面关闭。
2. **chip 选项全集因筛选增减/跳位**（上刀 SW-2 要治的正是这个）→ Test 5 头 4 条
   断言逐维度比对 `option universe identical to full corpus (values + order)`，
   任何「筛选后 chip 消失/重排」都会红。关闭。
3. **`.primary-button` 全局被误改殃及经典模式蓝按钮** → App.css diff 无该选择器，
   仅 login JSX 摘除 className，login-submit 自带样式，经典模式蓝按钮不受影响。
4. **工具栏 wrapper div 破坏 sticky/事件** → sticky 仍在 `.draft-toolbar`
   （DraftPaperWorkbench.css:未动 sticky 声明），新 group div 无 position 干预；
   事件全在叶子按钮上，wrapper 不拦截。低风险，交浏览器 QA 视觉收口。
5. **stale fallback** → `buildFilterOptions` 本体未改，其它调用点（若有）行为
   不变；`buildFacetedFilterOptions` 是新增独立函数，无旧路径残留可达。

---

## Residual Risk

纯视觉/派生逻辑刀，无 runtime 数据契约、无 persistence、无 export 路径改动。
唯一逻辑项（faceted count）是纯函数 + 已被单测 + 变异测试双重证明。残余风险仅
剩三面**视觉真机布局**（登录页暖色重心、chips 左对齐、980px 工具栏竖排），
plan §验证-3 已指派主 agent 浏览器 QA 截图收口——属 QA 门，非 CR 门。

PA 降级判断**成立**：零 state/data-contract 改动，唯一逻辑项是纯派生 useMemo，
按 process-tuning「PA 按不可逆性触发」不满足触发条件，降级为 plan 头部说明 +
CR 复核，流程正确。

---

## Recommendation

**APPROVE** — 0 Must Fix，3 Should Watch（均不阻塞本次合并）。scope 未漂移，
Forbidden 全零触碰，faceted 语义有能失败的单测证明并已进 CI 门，工作台改动确认
display-only。合并前由主 agent 补三面浏览器 QA 视觉截图（plan §验证-3）即可。
