# similar-rail (E2) — CR 报告

- 审查人：CR（Opus，冷读 fresh context）
- 日期：2026-07-09
- 被审 diff：基底 `e4b3d48` → `42f5887`（单 commit；DEV 汇报 baseline 56af344 系笔误，实际基底 e4b3d48 已核）
- 复核深度：medium（PA-lite，纯前端只读消费 E1 API，形态 owner 原型拍板）
- **结论：APPROVE**（0 Must Fix；6 项 Should Watch，含 1 项流程提醒）

现场重跑（worktree 内，真实退出码）：
- `app/node_modules/.bin/tsc --noEmit` → **exit 0**
- `node scripts/verify-paper-browse.mjs` → **177 passed, 0 failed, exit 0**
- Forbidden 名单（App.tsx / server / paper-intelligence / concierge / draft-paper / question-detail）`git diff` → **零 diff**

---

## 审查轴逐条裁定

### 1. 状态机正确性（本刀最大风险面）✅

态：`similarView('analysis'|'similar')` + `similarSeed`(快照) + `similarRequest` + `similarSelectedGroupIds` + `similarToast`。

- **滚动离开不清结果列表** ✅：rail view 渲染门是 `similarView === 'similar' && similarSeed`（PaperBrowsePage:1315），**与 lectureSelection 解耦**。scroll-away clear effect（:774 `setLectureSelection((prev) => prev.groupId !== activeAnchor ? null : prev)`）只动 lectureSelection，不碰 similarView/similarSeed → 结果列表跨滚动存活。符合 plan「结果列表不被连带重置」。verify item 54 双向断言（selectLectureQuestion 内有 reset、scroll effect 附近无 reset）钉住这条。
- **换题/返回/Esc/深链生命周期自洽** ✅：`similarView` 回落 'analysis' 只在两处——selectLectureQuestion（换题，:971）与 onBack（返回解析）。二者外无别的 setter。
- **缓存失效时机（DEV 自报「种子已换显示旧结果」）——核过，不存在该风险** ✅：`similarSeed` 与 `similarRequest` 只在 `handleSimilarCtaClick` 内成对写入（同时 `void loadSimilarQuestions(seed.questionId)`）。不存在「seed 改了但没重拉」的路径。换题只切视图态、保留 seed/request（DEV 有意，供误点回原题复用）；要回到 'similar' 必须再点 CTA → 必然重新 fetch。Esc 关栏只动 lectureOpen，保留 similarView='similar'+缓存，重开显示的旧结果与所显示的 seed **始终一致**，不是 stale。QA 实测（qa-notes:30-33）证实 Esc 重开还原结果态且不重拉。
- **挑题态零相似请求** ✅：CTA 只在 renderLecturePanel 的解析分支内渲染（讲评态），挑题态根本不进这条路径 → 零 CTA、零请求。请求纪律（仅 CTA 点击发，无预取）由 loadSimilarQuestions 唯一入口保证。

### 2. CR 硬交接落实 ✅（SW-1 实现方式偏离 plan 措辞，但更优——记 SW）

- **SW-1**：实现为 **label 前缀黑名单**（`kind==='secondary' && label.startsWith('同体裁')`，RailView:56），**非** plan 写的「按 reason.kind 白名单」。核引擎（similarQuestions.mjs）：`kind:'secondary'` 被三处复用——grammarFill(:278 「提示词类型一致」)、cloze(:299 「同体裁 X」)、sevenChoices(:330 「同衔接机制」)。故纯 kind 白名单排除 'secondary' 会**误伤** grammar/seven 两个有效 chip；DEV 的 label 前缀法**精确**只压 cloze 恒真项，比 plan 措辞更对。**判定：实现正确且优于 plan 原案。** 唯一代价见 SW-A（黑名单 → 新 kind 默认渲染）。
- **SW-2**：`matchedQuestionIds.length > 0` 守卫「含 N 题」chip（RailView:64）。✅
- **SW-3**：`isThin = !card` → checkbox `disabled` + title「该卷未入库存，暂不能加入」，卡仍渲染（RailView:117-128）。✅ ID 空间已核：引擎 `result.groupId`（paper-asset gid = DB `group_id`，样例 `group-2023-yi-reading-c`）与 `questionGroupById` 键（App.tsx:418 `group.id`）**同一 ID 空间**（E1 CR SW-3 已定 paper-asset/DB 共键，本刀复核样例格式一致）→ 非 thin 候选的加入链路真实可用，thin 判定成立。handleSimilarAddToDraft 另做 `questionGroupById.get` 过滤（双保险）。

### 3. DEV 五条自报逐条裁

1. **SIMILAR_RECIPE_SUMMARY FE-only 文案表** — 纯展示、`?? ''` 兜底、never drives logic（真实排序在 server RECIPES）。接受。漂移风险记 SW-D。
2. **「还剩 N 组」= Math.max(totalInPool - returned, 0)** — 解读正确。文案「库内同类还剩 N 组」（plan 写「同考点」，「同类」实际更诚实：池=同 groupType 非同考点）。接受。
3. **thin 路径未实测仅断言** — plan 验收 3 明确允许「不存在则构造断言逻辑层」。ID 空间已核 → 逻辑成立。断言成色够（verify 57 钉三件套）。接受。
4. **item-8「恰一处」→「恰两处」调用点** — 这是**收紧非放松**：两处均有界且各自钉死（`[card]` 单组 + `cards` 用户勾选子集），仍无整卷聚合 add。verify 用 `match(...).length === 2` + 两条正则。接受。
5. **未打 checkpoint commit（AGENTS 规④）** — 见 SW-E。裁定：**非阻断**。规④自证是死机接续辅助（「会话中断后接手者凭它定位断点」），本刀单 commit 干净收口、无崩溃，checkpoint 的用途未被触发。属流程习惯漏项，非合并门。规矩昨日（07-09）刚立、次刀即跳，值得提醒 DEV 养成，但不 block。

### 4. Scope ✅

diff 七文件全在白名单（questionBank.ts 加性类型 / similarQuestions.ts 新建 / PaperBrowsePage.tsx / paperBrowsePage.css / SimilarQuestionsRailView.tsx 新建 / verify-paper-browse.mjs / qa-notes.md）。App.tsx **零 diff**——plan 第 5 条预判成立（复用既有 `onAddGroupsToBasket` prop，无需接线）。Forbidden 全零 diff（已跑证）。

### 5. 视觉对齐 ✅

CSS 色值与 prototype.html **逐 token 对齐**：teal #2C6E56 / teal-deep #1E4A3A / teal-50 #EAF1ED / teal-100 #CFE4DA（chip--hit 边）/ teal-200 #A5CDBD（rcard hover）/ 中性 chip #EDEDEA / ink #1E1E1C / muted #6A6A64 / line #D8D8D2·#E8E8E4 / toast=ink。勾选态 teal 边+teal-50 底、accent-color teal、底栏、主按钮全对形。Green-Pen：墨绿仅作强调（主按钮+勾选边+hit chip），中性主导，≤10% 克制成立。

### 6. verify 成色（诚实标注）⚠️→可接受

新断言 53-59 为**源码正则 grep**（打 pageSrc/railViewSrc），**非行为级**。plan 自定 verify 为「轻断言」故在契约内。真正的行为覆盖来自 qa-notes.md 的 Playwright 真点全链路（真登录 cookie + curl 契约核对 + CTA/loading/结果/勾选/加入草稿卷乐观翻转 2→4 题组/toast/返回解析/cloze 恒真 chip 实测缺席/Esc 关重开还原）。QA 真实执行、非臆测（SW-1 根因由 curl 实测 `label:'同体裁 cloze'` 坐实）。两处已知缺口如实记录且可接受：窄屏抽屉（sandbox resize 限制，同 flow-panel 既有缺口）、真库无 thin 候选（走 plan 验收 3 断言层）。

---

## Should Watch（非阻断）

- **SW-A【设计】SW-1 用黑名单非白名单 → 未来引擎新 kind 默认渲染。** 当前 6 个 kind 全部处置正确，但 plan 原意是白名单（准入）。若 E3/后续引擎新增又一个恒真类 kind，会默认漏出一个无意义 chip。廉价加固：若日后 kind 集合增长，改回按 kind 准入 + 对 cloze 'secondary' 做 label 细分。当前不改。
- **SW-B【数据面残留】reading position-proxy 的「，体裁一致」后缀恒真。** 引擎:384 当 discourseMatch 时给 position-proxy label 追加「，体裁一致」，此 kind 非 secondary 故不被 SW-1 过滤。因 discourse_type ≡ groupType 该后缀恒亮。但它嵌在真实「篇位相当·词数」chip 内（词数是真信号），无害。根因同 E1 SW-1 数据面，非本刀 scope。
- **SW-C【UX 边角】相似态下滚动离开会静默清 lectureSelection。** 此时点「返回解析」落到 scrollspy 组级概览（无选中题→无 CTA），而非原题解析。属既有 scroll-away 语义的自然结果，非回归；QA 未触发（返回前未滚动）。留观。
- **SW-D【漂移】SIMILAR_RECIPE_SUMMARY FE 文案表与 server RECIPES 脱钩。** 纯展示、不驱动逻辑，但配方若改需手动同步这张表，否则种子行一句话与实际排序不符。加 `?? ''` 兜底防崩。
- **SW-E【流程】checkpoint commit（AGENTS 规④）未打。** 非阻断（无崩溃、单 commit 干净收口）。提醒 DEV：规④昨日刚立，养成自验前 `wip(<cut>): impl complete, pre-QA` 锚点的习惯。
- **SW-F【QA 缺口】窄屏（<1200px）抽屉未真机验。** sandbox `resize_window` 无效（同 flow-panel 已知）。等价力度替代（`.similar-*` 是 aside 内普通块级，复用既有断点、零新定位）已论证。建议有真窄视口能力时补验。

## Self-Review Blind Spots（喂给后续 Big CR / E3 CR）

- 我未起真实 dev server 端到端点 UI，状态机结论基于冷读源码 + DEV 的 qa-notes 截图记录 + 独立跑通 tsc/verify 退出码。Esc 关栏具体 handler 是否只动 lectureOpen 我按 qa-notes 实测叙述采信，未逐行核 Esc keydown 分支。
- thin 候选禁用态从未在真候选池渲染过（真库无 thin 命中），仅逻辑层+ID 空间推断证其成立；E3 若引入更大池子出现真 thin 组，值得一次真机复验禁用态+title。
- ID 空间「paper-asset gid ≡ DB group_id ≡ card.id」采信 E1 CR SW-3 结论 + 样例格式比对，未跑真 add 落库确认下游 draft 端接受该 ID（乐观翻转 QA 已见 chip 2→4，但未核服务端持久化成功）。
