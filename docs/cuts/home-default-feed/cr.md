# 刀⑥ home-default-feed — CR (cold read)

**Reviewer:** CR（fresh Opus subagent，detached worktree 冷读） · **Base:** main `77e9aab` · **Branch:** `cut/home-default-feed` (8273ed6 + c603265) · **Date:** 2026-07-03

## Verdict: **APPROVE**

契约四件事全部落地、Forbidden 零违反、新 verify 有真牙（六处思想变异全部被抓红）、三条改动的旧断言逐条合法（跟上新契约，非放水）。无 Must Fix。三条 Should Watch 均非阻断。

## 断言改动逐条裁定（第一优先级）

三条改动均在 `scripts/verify-concierge-desk.mjs`：

**① Line 320→324：`Desk does NOT use useState locally` → `Desk uses useState for feed-expand UI state only`** — **合法（跟上契约），但断言弱于其命名（SW-2）。**
旧断言禁止组件内 `useState`（护"检索态不泄进组件"）。刀⑥ 正当引入 `feedExpanded` 分页 UI 态。新正则只验 useState 出现，命名里的 "only" 属过度声明；"检索态不泄漏"由 Test 9.5 仍然守着，未留缺口。

**② chip `onClick` 断言从精确 `setIntent(chip)` → 宽松前缀匹配** — **合法（契约反转要求）。** 旧断言编码的正是被本刀替换的旧行为；chip 直搜正契约由 Test 12 正面钉死。非放水。

**③ Test 12：`chip click does NOT call submit` → `chip click DOES call submit(chip) directly`** — **合法（契约反转），本刀最关键的正向断言，变异 A 证明有牙。**

**④ Test 16：triggerSimilar 正则锚点加固**（注释块撑开字符距离后换更精确前缀锚）— **合法，反而更强。**

## 变异测试记录

对 `verify-home-default-feed.mjs`（34 断言）注入 6 处破坏，全部被抓：

| 变异 | 破坏内容 | 红的断言 |
|---|---|---|
| A | chip 退回 setIntent-only | `chip onClick also calls submit(chip) directly` |
| B | submit 重新清空 intent | `submit() does not clear intent...` |
| C | feed 排序 DESC→ASC | `most recent year first` + `years descend overall` |
| D | feed 门去掉 `!dataLoading` | `showFeed guards on !dataLoading` |
| E | 8-cap 永不 slice | `visibleFeed slices to the page size` |
| F | buildDefaultFeed 不复用 aggregate 分桶 | `two groups collapse into one row` 等 |

Test 1–4 执行真纯函数（非 grep）。`pnpm -C app build` 绿；`verify-restart1-local-search-intent` 85/0；`verify-concierge-desk` 230/0。

## Forbidden 符合性（零违反）

- `conciergeSearch.ts` / `aggregatePaperResults.ts` / `ConciergePaperRow.tsx`（CR 审查时点）byte-identical。
- `server/**`、`*Adapter.ts`、schema 零碰。Color-Lock：token 值零改；No-Blue：`.eyebrow` 去蓝非引蓝。
- 经典模式：新 CSS 全部锁在 `.app-shell.home-mode-ai` 或仅 AI 面渲染的新类名；经典 `.eyebrow` 基础规则未动（Test 12 反向钉死）。

## 正确性核查

- defaultFeed 排序 × aggregate fallback-bucket 交互（DEV blind spot #3）：正确——fallback 桶 `-Infinity` 沉底与 aggregate 意图一致，至多一桶。
- showFeed 门：empty ✓ / vacuum ✓ 渲染；loading/results(有命中)/clarification/error ✓ 不渲染；dataLoading ✓ 抑制。
- chip 直搜竞态：chips 在 loading 态卸载，天然消除双击重入窗口；无 in-flight 锁属既有设计（SW-3）。

## DEV Blind Spots 裁定

- **#1 eyebrow 级联**：无问题——override 特指度+源序双重胜出；`#6B645C` 沿用 AI 块既有硬编码惯例（刀④手法）。
- **#2 sample 语料下 feed**：Should Watch 非阻断——`dataStatus==='sample'` 只在真库 fetch 失败降级时出现，此时 feed 用 sample 语料渲染是比白板好的行为。
- **#3 fallback 排序**：正确（见上）。

## Should Watch

- **SW-1**：`verify-c6a10` 的 1 条红（`refresh API load preserves missing sample groups`）在 main 基线同样红，属陈旧断言 drift，非本刀回归——单独挂账，不算刀⑥ gate。
- **SW-2**：verify-concierge-desk:324 断言名 "only" 强于正则，后续可加固为 useState 唯一出现在 feedExpanded 语境。
- **SW-3**：chip 直搜无 in-flight 锁（既有设计）；将来做键盘捷径刀时一并补守卫。

---

## 附：CR 后增量（主 agent CR-lite）

**b8e0177** `fix(concierge): feed 行去「命中」搜索腔`（CR 冷读之后、合并之前追加）：

- 来源：主 agent 真库 QA 发现 feed 行 badge 沿用搜索措辞「命中 N 个篇章」——浏览态没有查询，声称"命中"是搜索腔（与刀⑤诚实文案路线冲突）。
- 改动：`ConciergePaperRow` 加 `variant?: 'search' | 'feed'`（默认 search 零行为变化）；feed 分支 badge 渲染 `N 个篇章`、内层列表 aria-label 去「命中」；ConciergeDesk feed 调用点传 `variant="feed"`；verify-home-default-feed 增 3 断言钉双向措辞（37/0 绿）。
- CR-lite 裁定（display-only、默认分支 byte 语义不变、断言双向钉死、浏览器实测 feed=「9 个篇章」/搜索=「命中 9 个篇章」）：**通过**。ConciergePaperRow 因此不再 byte-identical——增量仅上述 variant 支路，搜索路径措辞与行为零改。
