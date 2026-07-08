# CR — ui-polish-misc（UI 一致性刀⑥收尾）冷读评审

Reviewer: CR (fresh context, reviewer ≠ implementer)
Baseline: `git diff main..claude/ui-polish-misc`（HEAD 101d479）
Verdict: **APPROVE WITH MUST FIX**

## Changed Scope（核对无越界）

10 文件：DESIGN.md、App.css、useConciergeDesk.ts、AdminWorkbench.tsx +
adminWorkbench.css、DraftPaperWorkbench.css + .tsx、PaperIntelligencePreview.tsx、
paperIntelligencePaperSurfaceHarness.css、plan.md。

Forbidden 核对（读 diff 文件清单，非报告转述）：
- `shared*/papersurface/**`、`paperSurfacePrototype/**`、`paperIntelligence.css` —
  **未触碰**。✓
- 分类色值（`--seven-strong` / `--seven-border` 定义，harness css 1863–1912）—
  diff 未改，仅改 `var(--seven-strong, <fallback>)` 的 fallback。✓
- 检索/状态机/数据流、管理台新功能 — 未动。✓
- `PaperBlockCanvas.tsx`（死码归架构债）— 未动。✓

## Verification Evidence（自跑，不采信转述）

- `npm run build --prefix app`：**绿**（tsc -b && vite build，1850 modules，built in ~0.9s）。
- verify-concierge-desk：**250 passed / 0 failed**。
- verify-home-default-feed：**38 / 0**。
- verify-search-thinking-toggle：**12 / 0**（d2「renders a checkbox」仍绿 → `<input
  type=checkbox>` 语义元素未换，§3 a11y 约束守住）。
- verify-classic-retire-3：**15 / 0**。其哨兵断言只钉 `.paper-page/.paper-meta/
  .basket-item/base .eyebrow/home-mode-ai` 家族，与本刀删除的五组类名（parse-mapping-
  highlight / difficulty-review-queue / paper-block-item / paper-canvas-sh /
  concierge-reason-line / concierge-actions）**零交集** → 未撞哨兵，无静默放宽。✓
- verify-c8-draft-paper-contracts：**50 / 0**。

死 CSS 归零 grep（自跑复核）：parse-mapping-highlight=0、difficulty-review-queue=0、
paper-block-item=0、concierge-reason-line=0、concierge-actions(复数)=0、
concierge-action(单数)=16（活，未误删）✓。保留组完好：`.parse-mapping` 基础组
（App.css:2413+）、`.paper-canvas-block/-pb/-qg`、`.paper-block-title-input/-label/
-actions` 均在。PaperBlockCanvas 真死码：barrel `paperAssembly/index.ts:7-8` 导出，
**无任何 importer、无 `<PaperBlockCanvas` JSX 挂载** → CSS 删除安全。

§7 overlay：warm 覆盖层全清（harness css 中 `rgba(47,41,35,*)`=0、
`rgba(255,252,247,*)`=0），14 处 alpha 逐一保持，分类色板本值未误伤。
§8 DESIGN.md 豁免句与 plan §8 原句**一字不差**，落位在 Single-Hue Rule 段末。✓

## Findings

### Must Fix

**MF-1 — §2 未做完：Harness member 可见错误页仍是系统腔（本刀自造跨面不一致）**
`PaperIntelligencePaperSurfaceHarness.tsx:1276-1277` 的错误块与 DEV 刚改人话的
`PaperIntelligencePreview.tsx:311-313` 是**逐字孪生**，但被留在旧系统腔：
- `1276`：`<h2>未找到 Paper Intelligence 报告</h2>`（向 member 泄漏内部产品名
  "Paper Intelligence"，正是 §2 要消灭的腔）
- `1277`：`{error || '报告数据为空。'}`
- 上游 `629`：`throw ... \`未找到 Paper Intelligence 报告：${paperId}\``
该 Harness **是 member 可达的生产面**：App.tsx:790 `currentPiRoute.surface === 'paper'`
（URL `&surface=paper`）即渲染它（注释 #21-C1 自称 "production PaperSurface"）。
后果：同一功能两个面，default 面显示新人话、paper 面显示旧系统腔 —— 收尾一致性刀
反而**新造了一处 member 可见的口吻分叉**。plan §2 明确覆盖「member 可见的…未找到…
逐条统一；拿不准的列在报告里不改」——此处既非「拿不准」，也无报告记录豁免。
**关闭方式（任一）**：(a) 把 Harness 三条（1276 h2、1277 fallback、629 抛出串）
改成与 Preview 同口吻；或 (b) PO 明确接受延后并在 follow-up ticket 记录（同时补
§验收 item 5 要求的完成报告/已知风险）。推荐 (a)——文件已在本 diff 内，改动 trivial。

### Should Watch（不阻塞本刀）

**SW-1 — §6 墨绿实心按钮 focus 环覆盖了底 box-shadow（未按 plan「逗号叠加别覆盖」）**
`App.css:206-215` 新增的 `:focus-visible { box-shadow: 0 0 0 3px … }` 对
`.primary-button/.add-button/.save-button/.export-button` 而言特异度(0,2,0)高于底态
`box-shadow: 0 1px 2px var(--accent-glow)`（166 行,(0,1,0)），focus 时底阴影被**整体
替换**而非叠加。plan §6 要求「已有 box-shadow 状态用逗号叠加别覆盖」。
判定为 SW 而非 MF：焦点环在所有状态（含 hover+focus，214 后于 182 胜出）**始终显示**，
无「零环」a11y 倒退；仅 focus 瞬间丢一层近乎不可见的 1px 底阴影。若要严格合规，
把这四类的 focus box-shadow 改为 `0 0 0 3px rgba(44,110,86,.20), 0 1px 2px var(--accent-glow)`。
ghost/detail/back 无底阴影，plain 规则正确。

**SW-2 — §4 硬编码色值代替 token**
`DraftPaperWorkbench.css:409` 980px 分隔线用 `border-top: 1px solid #D8D8D2`，
plan §4 要求「章程中性 token」。`#D8D8D2` 恰是 `--line` 的值（视觉等同），
建议改 `var(--line)`。零功能影响。

**SW-3 — 缺 §验收 item 5 完成报告**
cut 目录仅 plan.md；scratchpad/dev-polish 仅 10 张截图，无口吻改动对照表 /
撞哨兵处置单 / 已知风险 md。是 MF-1 的延后未被记录的直接成因。

**SW-4 — plan 内部矛盾（§1 vs §验收 item 2）**
§验收 item 2 要求五组类名在「CSS+TSX 全部归零」，但 `paper-canvas-sh` 仍在死组件
`PaperBlockCanvas.tsx:126`——§1 明写「.tsx 归架构债不动」。DEV 按 §1 处置正确
（组件无挂载点，删 CSS 安全）；纯属验收话术与 §1 冲突，文档瑕疵，非代码缺陷。

## Self-Review Blind Spots

- 我按「surface=paper 是 member 可达生产面」判 MF-1。若 PO 认定该 URL 目前无任何
  member 入口链接、仅内部联调用，MF-1 可降级为 SW（转 follow-up）。此判断依赖
  产品事实，我只从路由代码确认「可达」，无法确认「是否已对外链」。
- 截图（scratchpad 10 张）我未逐张做视觉核验（开关三态/焦点环/980 间距/overlay
  归中性的**实际渲染观感**）——本轮以 CSS 静态正确性 + build + verify 为证据面；
  视觉观感属 QA/PO 关口。若 QA 未做，开关 checked/focus 三态与暖色去除的观感留待 QA。
- §5 admin 说明卡我确认结构（note 在 `.admin-panel` 白卡内、按钮同卡）满足 plan，
  但未核「Agent」一词对 admin 受众是否合适（admin 面非 member，判为可接受）。

## Failure / Attack Angle

- **跨面口吻分叉（已命中，MF-1）**：member 走 `?…&surface=paper` 打开一份坏报告，
  看到「未找到 Paper Intelligence 报告」——内部产品名 + 系统腔，与 default 面新文案
  打架。green build/verify 完全覆盖不到（无文案口吻断言），靠人读才抓得到。
- **fallback 换基的隐患（已排除）**：§7 改的是 `var(--seven-strong, <fallback>)` 的
  fallback；`--seven-strong` 在 5 个 `data-seven-color` 变体下**均有定义**
  （1867/1878/1889/1900/1911，含蓝相 123,151,210），token 生效时分类色照常渲染，
  fallback 仅在无 color 变体的中性态生效 → 换中性基不动分类色值，辩护成立。
- **死 CSS 误删活组件（已排除）**：删除组的保留兄弟类（.parse-mapping 基础组、
  .concierge-action 单数、.paper-canvas-block 家族）grep 全部在位，无连坐。
- **focus 环被后续规则吃掉（已排除）**：7 类按钮无其它 :focus-visible 规则，
  hover box-shadow 位于 focus 规则之前，co-occur 时 focus 胜出，环恒显示。

## Residual Risk

低。核心交付（死 CSS 清扫、开关章程化、overlay 归中性、焦点环、豁免落档）
正确且证据充分；唯一 member 可见缺口是 MF-1 的 Harness 口吻孪生。分类色值、
Forbidden 面、检索/状态机零触碰。

## Recommendation

**APPROVE WITH MUST FIX** — 关闭 MF-1（改 Harness 三条口吻串，或 PO 记录延后）
后可合。SW-1..4 记录监控，不阻塞本刀。
