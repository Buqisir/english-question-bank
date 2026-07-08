# CR — ui-panel-reunify（UI 一致性刀②：解析面板归队墨绿章程）

Reviewer: CR (cold read, fresh context). Baseline: `git diff main..claude/ui-panel-reunify`.
Verdict: **APPROVE**（0 Must Fix / 4 Should Watch）。

## Changed Scope

3 files, all in-scope:

- `app/src/features/paper-intelligence/paperIntelligencePaperSurfaceHarness.css`（配色映射 + 头注释 + font + transition）
- `scripts/verify-paper-intelligence-paper-surface-insight.mjs`（钉色断言改写：6c.5 + R-14）
- `docs/cuts/ui-panel-reunify/plan.md`（契约）

Forbidden scope 全部零改动（diff 路径级证明）：`shared/papersurface/**`、`shared-ui/papersurface/**`、
`server/**`、schema、`*Adapter.ts`、AppTopbar 均未出现在 name-only。无 TSX 逻辑/状态/数据流改动。

## Findings

### Must Fix
无。

### Should Watch（不阻塞本刀）

- **SW-1 残留暖色 overlay 未归中性**：`Harness.css` 内仍有 12 处 `rgba(47, 41, 35, *)`
  （旧墨 `#2f2923` 的低透明度 shadow/badge/overlay，alpha 0.04–0.15）与 :414
  `background: rgba(255, 252, 247, 0.62)`（暖白 section 底）未替换。这些**不在** plan 机械
  映射表内（表只覆盖实心文字/边线色值），且在 6%–62% 透明度下叠加在中性底上近乎不可辨。
  按剃刀不阻塞；留作后续 polish（如刀③-⑥统一 overlay token 时收）。
- **SW-2 detail-bg 超出映射表但方向正确**：:96 `--pi-ps-insight-detail-bg: #f5f1ea →
  var(--eqb-color-surface-2, #ededea)`。该变量未在 plan 映射表列出，但与表内 chip-bg 同款处理、
  与「作废 bespoke 暖米」章程一致，属良性 in-spirit 扩展。记录留痕。
- **SW-3 两个 verify 脚本均不在 `verify-ci.mjs`（advisory）**：本刀强化的色彩纪律护栏
  （6c.5 delegation + R-14 true-neutral）不进 CI 门。属既有状态（脚本本就未注册），非本刀引入。
- **SW-4 Playwright 截图未由 CR 独立复跑**：验收 #5 的四页目视/色相断言是 DEV 自证 + PO 视觉 QA
  项。CR 以 build 绿 + grep 清零 + verify 复跑 + 对比度计算替代证明，未再跑 headless 截图。
  纯 CSS token 映射风险低，不阻塞。

## 七个核查点逐条裁定

1. **`.pi-seven-eyebrow` 改判 muted-ink（拒绝机械映射 teal-200）——接受**。独立算对比度
   （bg `#f6f6f4`，11px/700 小字需 AA 4.5）：teal-200 `#A5CDBD` 作文字色 = **1.61:1**（近乎不可见，
   严重回归）；muted-ink `#6a6a64` = **5.03:1**（过 AA，且优于原 umber `#7a6a58` 的 4.82:1）。
   映射表把 `#7a6a58` 定为 active-**border**→teal-200，DEV 正确识别此处 `#7a6a58` 是**文字**用途，
   机械套用会毁掉可读性。判断正确，deviation 采纳。
2. **verify 两处钉色断言改写——风险未被削弱**。6c.5 由「字面量 `#f8f6f1/#f7f4ee`」改为断言
   `--pi-ps-assistant-bg: var(--eqb-color-bg)` 委派；R-14 由「解析 harness hex」改为从 tokens.css
   resolve `--eqb-color-bg` 再判 true-neutral（`max-min ≤ 4`）。二者链式成立：harness 必须委派 **且**
   token 必须中性。回归验证：若有人把 harness 改回硬编码暖 hex → 6c.5 fail；若把 `--eqb-color-bg`
   改回暖米 `#f8f6f1`(248,246,241, Δ=7>4) → R-14 fail。护栏未变相放水，反而更精确。两断言现均 PASS。
3. **verify 失败=分支基线——独立复跑核实（未采信转述）**。
   - insight：main **179 pass / 10 fail** = branch **179 pass / 10 fail**（完全一致；失败项均为
     state/attribute/allow-list，与配色无关）。DEV 「10 项」属实。
   - c6b1：main **50 pass / 11 fail** → branch **51 pass / 13 fail**。差异 comm 比对后确认：branch
     多出的 2 项 fail **仅是脚本自带的 git-diff 文件白名单 meta 断言**在报告 `plan.md` +
     被改的 verify 脚本「unexpected C6b-1 file」，**非配色/行为回归**；实际配色断言 50→**51** pass。
     DEV「12-13 项基线」措辞略不精确（应说明+2 来自白名单 meta 而非既有），但实质结论正确、
     无风险回归。两脚本均不在 verify-ci，不影响 CI 门。
4. **映射保真——逐行核对通过**。8 个 harness 变量、解析面板直写色值均按表落地
   （active-bg `#eaf1ed`、active-border `#a5cdbd`、success `#059669`/success-soft、
   warning `#d97706`/warning-soft、边线 `rgba(30,30,28,*)`、border-subtle 等）。
   `shared*/papersurface/**` 零改动（路径级证明）；卷面内 C3.6 evidence mint/amber 未被触碰
   （改动全在右栏 `pi-ps-analysis-*`，属映射表「支持/陷阱语义→token」范围，非契约锁定区）。
   验收 #2 grep：契约区外旧 hex 全清零。
5. **blockquote 定位/处理——正确**。`.pi-ps-analysis-evidence--selected blockquote`（:731）在
   app 侧 feature 文件（非 `shared*/papersurface`），属非契约区。`rgba(16,185,129,0.65)` →
   `rgba(5,150,105,0.65)` 收敛到 success 色相、保留原 0.65 alpha（success token 为 0.08 alpha 无法
   承载 border alpha，用字面 rgba 合理，符合 plan「rgba(5,150,105,同透明度)」）。定位与处理正确。
6. **头注释改写——留痕准确可追溯**。PR #52「warm pencil + ink」标记 superseded（owner,
   2026-07-07，指向 DESIGN.md + 本刀 plan），证据语义区分原则以 token 语言重述保留，历史语境
   未被销毁而是被明确标注作废。表述准确。
7. **transition:width + reduced-motion——完整**。:838 移除 `width` 过渡（改瞬时，注释说明 width
   是布局属性触发 reflow），只留 background/border-color。width 不再动画 → 无需 reduced-motion 兜底；
   既有三处 `@media (prefers-reduced-motion: reduce)`（含 :937 覆盖 rail/chip/detail 的
   `transition: none !important`）不受影响，无悬空引用。处理完整。

## Self-Review Blind Spots

- 对比度按 bg=`#f6f6f4` 计算；eyebrow 实际可能叠在半透明 chip/rail 上，真实底色略有偏差，但
  1.61 vs 5.03 的量级差足以支撑裁定，边界不敏感。
- SW-1 的 `rgba(47,41,35,*)` overlay 是否「章程违规」取决于对 DESIGN.md 中性纪律的严格解读；
  我按剃刀判为 sub-perceptual 可后置，若 PO 要求纯中性叠色则需另开 polish 项。
- 未独立跑 Playwright，纯 CSS 变量映射的视觉最终态以 PO QA 为准（SW-4）。

## Failure / Attack Angle

- 最可能的隐性回归是「机械套映射表毁可读性」——已在核查点 1 被 DEV 拦住并经 CR 数值复核。
- 钉色断言改写若把「字面量→委派」偷换成「删断言」即为放水；已确认改写后仍双向可 fail（点 2），
  非削弱。
- c6b1 的 +2 fail 若被囫囵当「基线」接受，可能掩盖真实配色回归；已 comm 逐项拆解确认是白名单
  meta 噪声、配色断言反而 +1 pass。

## Verification Evidence

- `npm run build --prefix app`：✓ built 833ms（1850 modules，无错）。
- insight verify：main 179/10 == branch 179/10（逐项一致）。6c.5 + R-14 两改写断言 branch PASS。
- c6b1 verify：main 50/11 → branch 51/13，+2 fail 经 comm 确认为脚本自带文件白名单 meta。
- 契约区 grep：`shared*/papersurface` 零改动；app/src 契约区外 11 个旧 hex 全清零。
- 钉色 grep：`scripts/*.mjs` 剩余 `#2a7c4f`（:1210/:1596）均为「保留色禁用」负向 guard（rail 作用域），
  应保留、现 PASS。
- 对比度：teal-200 1.61:1（fail）/ muted 5.03:1（pass）/ 原 umber 4.82:1，node WCAG 计算。

## Residual Risk

低。纯 display/CSS 变量映射，无 schema/持久化/导出/发布路径改动；build 绿；契约区物理隔离已证。
残留风险集中在 SW-1 sub-perceptual 暖色叠层与 SW-4 视觉最终态（交 PO QA）。

## Recommendation

**APPROVE**。映射保真、forbidden 零触、护栏未放水、DEV 的两处判断（eyebrow 对比度、blockquote 归队）
经独立复核正确。SW-1~SW-4 均不阻塞本刀合并，建议记入 watch-ledger 供刀③-⑥收尾。
