# CR — ui-token-sweep（UI 一致性刀③）冷读评审

Reviewer: CR (fresh context, did not implement). Baseline: `git diff main..claude/ui-token-sweep`.
Verdict: **APPROVE WITH MUST FIX** (1 Must Fix — 证据/记录级，非代码正确性回归).

## Changed Scope（路径级证明）

`git diff --stat` 仅动 5 文件：4 个范围内 CSS + 本刀 `plan.md`。
- `app/src/App.css`（focus 环/圆角/阴影/语义色/muted）
- `app/src/auth/LoginPage.css`（卡片圆角+阴影、eyebrow/footer-hint muted、输入/按钮圆角）
- `app/src/features/admin/adminWorkbench.css`（.admin-panel 12→8）
- `app/src/features/draft-paper/DraftPaperWorkbench.css`（.draft-save-space-dialog 阴影→Floating）

**排除清单纪律：合规。** `shared-ui/papersurface`、`paperSurfacePrototype`、
`paperIntelligence*`、`writingPaperPage` 零改动。`scripts/**` 零改动——独立核对
§6 前提成立：范围旧字面量（`rgba(44, 110, 86, 0.6`、`#16a264`、`#c49b2a`、
`0 18px 46px`）在 `scripts/` 内 grep 零命中，故无断言需改；`verify-concierge-desk`
唯一与本刀模式相邻的断言（line 732，paper-row transition）与本刀无关。**未静默放宽任何断言。**

## Findings

### MUST FIX（证据/记录级，阻止合并直到闭环）

**MF-1：§5 home 2.4:1 / my-space 2.8:1 两审计实例被误标，且 §4 home 断言未跑。**

组件引用链核实（`grep 'concierge-reason' / 'reason-line'` 全 `app/src`）：
- `.concierge-reason-line`（App.css:4021，本刀改为 muted）**是死 CSS**——无任何 JSX 渲染，
  全仓仅 3 处 CSS 自引用。
- 真正渲染的推荐理由行是 `.concierge-group-reason`（App.css:4748）与
  `.concierge-paper-reason`（App.css:4606），**二者早已是 `#6A6A64`**（注释明写
  "正文级对比度 ≥4.5:1，不用极弱墨"）。
- 因此对 `.concierge-reason-line` 的改动是**无害 no-op**，并**未修复审计点名的 home
  渲染实例**——该实例在本刀之前就已是 AA 合格（或该 class 根本不渲染）。

my-space 2.8:1 实例：全仓 `#9a9a93` 唯一落在 my-space 的是
`MySpacePage.css:49`（`:disabled`），**该文件不在范围内且 WCAG 对禁用控件豁免**。
即审计的 my-space 实例是禁用态、豁免、且本刀不触及。

净结果：本 diff 里**唯一真实的可见正文 AA 修复是 LoginPage `.eyebrow`+`.login-footer-hint`**
（登录页确为 `#9a9a93` 可见文字）。home 与 my-space 两个点名实例都不是本刀所修。
plan 验收 §4 明文要求跑 home Playwright 断言（原 2.4:1 元素 computed color ≠ #9a9a93），
DEV 自认未跑、凭 grep 推断——该硬验收项未达成，claim 未被证。

闭环方式（任一即可，成本低）：
1. 跑 §4 的 home 断言证明渲染态 home 推荐行为 AA（会显示其本就是 #6A6A64、与本刀无关）；且
2. 在完成报告/账本更正表述：**本刀不修复 home/my-space 点名实例**（home 早已 AA，
   my-space 2.8:1 是 `MySpacePage.css:49` 禁用态、豁免、越范围）；唯一真实可见文字修复是
   LoginPage 两处。不得让"AA 两实例已扫"这一**失真账本项**流入后续刀。

> 说明：这不是渲染回归——合并后 `app/src` 已无可见（非禁用/非装饰）`#9a9a93` 文字，
> AA 目标事实达成。但"未证 + 误标 + 硬验收跳过"符合 CR 需点名的 unproven/misleading-green
> 模式，且本仓有被过期账本坑过的历史，故按 Must Fix 处理（更正记录即可，未必需改代码）。

### SHOULD WATCH（不阻止合并）

- **SW-1 `.group-card:hover`（App.css:405）plan 外阴影收敛。** 原 `0 4px 12px rgba(0,0,0,0.06)`
  （非章程值）→ Resting。plan §3 仅列 :397（静止），此 hover 改动为 plan 外、in-spirit
  （章程双 token 收敛）。副作用：hover 阴影 == 静止阴影，抬升仅靠 `translateY(-2px)`+边框强调。
  合章程（Flat-By-Default），但 hover 是否需要独立高度留 PO 视觉 QA。DEV 未在自标点列此项。
- **SW-2 ghost-button 家族无章程 focus 环。** 依赖原生 outline 兜底；diff 未动，逐行
  比对 main 与 branch 的 ghost-button 规则**完全一致**——无回归。DEV 记录归后续刀，此处备案。
- **SW-3 `.entry-panel`（App.css:1601）侧抽屉失方向性。** `-12px 0 40px` → 对称 Floating。
  plan §3:44 明文接受，PO 视觉 QA 裁。
- **SW-4 登录页仅 build+grep 验收。** 本地 login 不可达，视觉留生产部署后 PO QA（plan §4 已声明）。

### 已核实合规、非 finding

- **concierge-starter-chip:focus-visible（App.css:4094）plan 外补环——合规。** 核对 main 原状：
  `outline:none; border-color; color` 三行、**零聚焦环**，确为真实 a11y 缺陷；补章程环
  `0 0 0 3px rgba(44,110,86,0.20)` 属 §1 in-spirit 修复。该 chip 自身 `border-radius:999px`
  被正确保留未动。
- **阴影角色判定——全部正确。** paper-insertion-menu(3324，absolute/z-index/transform 弹层)→Floating；
  draft-save-space-dialog(344，fixed 模态)→Floating；entry-panel(1601，min780×100vh 抽屉)→Floating；
  登录卡→Resting；group-card 静止→Resting。
- **圆角逐处——无语义误伤。** 16→8 落在 `.concierge-result-list`(3603)/`.concierge-paper-list`(4468)
  两个 flex 列表容器（非 pill）；登录卡 12→8、admin 12→8、各 5/7/10/12→6/8 均为卡片/菜单/标签容器；
  唯一 pill（999 chip）正确未动，无圆形头像/点被误方。
- **§5 合法保留——6 处属实。** App.css 3472/3766/3807/4459(`:disabled`)、3723(`::before` 分隔点装饰)、
  DraftPaper:64(`:disabled`)——5 禁用 + 1 装饰，均非可见正文。

## Self-Review Blind Spots

- 我判定 `.concierge-reason-line` 为死 CSS 依据 `grep` 全 `app/src` 无 JSX 字面量引用；
  若存在运行时字符串拼接（如 `` `concierge-reason-${x}` ``）我会漏判——但 grep `concierge-reason`
  仅返回 3 处 CSS，拼接可能性极低，判死可靠。
- 未在真实浏览器测 muted token 在 #ededea/#fff 上的实测对比度；仅凭 token=#6a6a64 与
  tokens.css:11 定义 + 既有注释推断 AA 合格。若 owner 想坐实数值，需 §4 Playwright computed 断言。
- 登录页视觉未渲染核实（环境限制，plan 已声明），阴影/圆角改动的观感留 PO 生产 QA。

## Failure / Attack Angle

最可能的失败面不是渲染回归（合并后无可见弱墨文字、build+verify 全绿），而是**账本失真**：
完成报告若照 plan 措辞记"home 2.4:1 / my-space 2.8:1 两实例已修"，后续刀会相信 concierge
推荐行 AA 由 `.concierge-reason-line` 承担——而它是死 CSS，真正的
`.concierge-group-reason`/`.concierge-paper-reason` 才是渲染源。未来若有人"复用" concierge-reason-line
或据错误账本跳过 my-space 复检，缺陷会藏在一个绿 grep 背后。MF-1 的记录更正正是堵这个口子。

## Verification Evidence（独立复跑，非转述）

- `npm run build --prefix app`：**绿**（tsc -b && vite build，✓ built in 759ms）。
- `node scripts/verify-error-copy-mainline.mjs`：**18 passed, 0 failed**。
- `node scripts/verify-concierge-desk.mjs`：**250 passed, 0 failed**。
- `node scripts/verify-home-default-feed.mjs`：**38 passed, 0 failed**。
- grep 归零（独立跑）：范围内 4 文件 `rgba(44, 110, 86, 0.6`/`#16a264`/`#c49b2a`/`0 18px 46px`/
  `border-radius: 5|7|10|12|16px` **全零**；全仓（排除清单外）`rgba(44,110,86,0.6`/`#16a264`/`#c49b2a`
  **全零**；`scripts/` 旧字面量**全零**（坐实 §6 无改）。
- 残留 `#9a9a93`：App.css×5(4 禁用+1 装饰)、DraftPaper×1(禁用)、MySpacePage.css×1(禁用,越范围)——
  无一为可见正文。
- 路径级 scope：`git diff --stat` = 4 CSS + plan.md，`scripts/**`/排除目录零改。
- token：tokens.css:11 `--eqb-color-text-muted:#6a6a64`、:16 warning `#d97706`、:18 success `#059669`。

## Residual Risk

低。纯 CSS，无 schema/持久化/导出面。build+3 verify 全绿、scope 干净、圆角/阴影判定逐处核对无误。
唯一残留是 MF-1 的记录/证据缺口（home/my-space 两点名实例的真实归属未在报告中如实反映，
§4 home 断言未跑）——更正账本或补跑一条断言即闭环，不涉代码回归。

## Recommendation

**APPROVE WITH MUST FIX。** 合并前闭 MF-1（更正 home/my-space AA 归属记录，或补跑 §4 home 断言）。
SW-1..SW-4 不阻止本刀，留 PO/后续刀。
