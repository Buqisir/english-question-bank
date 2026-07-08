# CR 冷读 — ui-boundary-trim（UI 一致性刀④，ADR-0015 消费边界 UI 收尾）

- 分支：`claude/ui-boundary-trim`（reviewer ≠ implementer，冷读）
- 基线：`git diff main..claude/ui-boundary-trim`
- 评审级别：L2/L3 之间的 UI gating 收尾，small-medium；静态 verify + 冷读 JSX 可证明风险，无需 browser QA 前置（member 形态本地不可达，源码级证明）
- 裁定日期：2026-07-07

## Changed Scope（从 diff 文件清单核实，非报告转述）

仅三文件：
- `app/src/features/question-detail/QuestionGroupDetailView.tsx`（2 行 gating）
- `scripts/verify-classic-retire-2.mjs`（+1 段头注释 +2 断言）
- `docs/cuts/ui-boundary-trim/plan.md`（本刀契约，新增）

未触碰 App.tsx / props 契约 / 数据获取 / 样式文件 / answer-compare-summary /
verify-list 可见性——**Forbidden 清单全部遵守**（diff 实证，非报告say-so）。

## 逐条核查

### 1. 两处 gating 语义（顺 JSX 冷读，非只看 diff 行）

**置信度 %（:283）** `{isOwnerView && topicLabel.confidence !== undefined && topicLabel.confidence > 0 ? <em>…%</em> : null}`
- member：`<em>%</em>` 消失；`<span>{topicLabel.label}</span>`(:280) 与
  `<small>{topicLabel.reason}</small>`(:281) 在同一 `.topic-label-item` 内、
  不受该三元影响 → **标签本体+reason 保留**。正确。
- owner：`isOwnerView` 为真，退化为原三元 → **零变化**。正确。

**每小题 compare-box（:431）** `const showCompareBox = isOwnerView && (Boolean(verifyItem) || … )`
- `showCompareBox` 全部使用点（grep 实证，仅 2 处，均在同一 `.map` 内）：
  - :480 `answer-grid${showCompareBox ? '' : ' answer-grid-single'}` — member
    走 `answer-grid-single`。CSS App.css:955 `grid-template-columns: minmax(0,1fr)`
    单列占满 → **无空列**。正确。
  - :484 `{showCompareBox && (…answer-compare-box…)}` — member 该盒消失。正确。
- **无副作用**：`showCompareBox` 不参与任何统计/滚动锚/条件 section。
  `compareStatus/compareReason/compareLabel`(:432+) 对 member 仍计算但仅在
  :484 块内消费 → 无害 dead compute，无外泄。
- owner：`isOwnerView` 为真 → 两处均 `''`/渲染，**零变化**。正确。

### 2. DEV「旧护栏并未钉 per-question 盒 member 可见性」的读法 — 核实 main 原文

`git show main:scripts/verify-classic-retire-2.mjs` 实证，member-visible 旧断言恰是三样：
- :122 `已绑定话题标签展示` → `/selectedDetail\.topicLabels\?\.length/`（钉列表存在，**不涉及 confidence%**）
- :126 `答案对比统计 (answerCompareStats)`（钉 summary，**非 per-question 盒**）
- :130 `AI 答案验证 verify-list` → `/className="verify-list"/`

**DEV 读法成立**：旧护栏从未钉 per-question `answer-compare-box` 的 member 可见性，
也未钉 confidence%。三条旧断言在新形态下**仍如实**：
- `answer-compare-summary`(:243) 仅受 `answerCompareStats &&` 门控，**无 isOwnerView 牵连** → member 仍渲染。
- `verify-list`(:683) 所在 section(:666-668) 仅受 `groupType !== 'reading' && verifyResult` 门控，**无 isOwnerView 牵连** → member 仍渲染。
- 话题标签列表本体(:275) 不受本刀影响。
三条旧断言保留且诚实，未被削弱。

### 3. 两条新断言能否在「回退 gating」时变红（脑内跑正则）

- `/const showCompareBox = isOwnerView && \(/` — 回退成 `const showCompareBox = Boolean(verifyItem) || …` 后不匹配 → **红**。有效。
- `/isOwnerView && topicLabel\.confidence !== undefined/` — 回退成 `topicLabel.confidence !== undefined && …`（去掉 `isOwnerView &&` 前缀）后不匹配 → **红**。有效。

两条都真检查 gating 而非只匹配 className 存在性——符合 plan point 3 的「升级为真检查」要求。
精确正则脆断言的取舍（良性重构/条件重排也会误红）是 DEV 自标的已知代价，
可接受（见 Should Watch SW-2）。

### 4. ADR-0015 精神对齐

ADR-0015 §2 把「答案对比统计 + AI 验证结果展示、话题标签展示」列入 member 可见消费内容。
本刀隐藏的是其**子元素**（per-question inline 校对盒、confidence% 子字段），
ADR-0015 §2 枚举的三样（summary/verify-list/topic-label 列表）**字面仍 member 可见**，
无直接冲突。属 ADR-0015「网站只消费 + AI 内部数据不外泄」精神的 UI 细化，
owner 2026-07-07（audit Q2）已拍板，非新架构决策 → **不需要新 ADR**。
但 ADR-0015 本体无指针指向该细化（见 SW-1）。

## Findings

### Must Fix

**MF-1 组件自身的 owner-gating docstring 已过时说谎**
`QuestionGroupDetailView.tsx:13-16` 的 “Owner gating” 段仍写：
「member 下仅 编辑/删除 hidden…… Everything else（…answer-compare stats,
AI verification list, bound topic labels…）is visible to both member and owner.」
本 diff 之后此**全称断言为假**：per-question answer-compare box 与 topic-label
confidence% 现为 owner-only。这是本 diff 引入的 stale comment，且恰落在
「Owner gating」这一未来 dev 查阅 gating 规则的权威段落里。
本刀 plan point 3 的显式目的就是「护栏文本诚实化」——却把姊妹文件的注释改诚实、
留下组件自身 gating docstring 说反话，内部不自洽。
修复成本极低（补一小句：confidence% 与 per-question 校对盒 owner-only）。
**阻断合并**（低严重度但属诚实性缺陷，且是本刀主题的一部分）。

### Should Watch（不阻断本次合并）

- **SW-1 ADR-0015 无指针指向本次细化**：owner 2026-07-07 的边界细化目前只活在
  audit.md Q2 + plan.md + verify 脚本头注释。ADR-0015 §2 读者会以为
  confidence%/per-question 盒是 member 可见消费内容而误「恢复」。**已被两条新
  verify 断言兜底**（回退代码即变红），故不阻断；建议给 ADR-0015 §2 或「后果」
  补一行指针（不需新 ADR）。
- **SW-2 精确正则脆断言**：两条新断言绑死 `isOwnerView && (` / `isOwnerView && topicLabel.confidence` 的字面顺序，良性重构（条件重排、抽变量）会误红。DEV 自标取舍，可接受；记录以免未来误判为真回退。

## Self-Review Blind Spots

- **member 形态未真机验证**：member（enforced 真账号）本地不可达，member 无空列/
  confidence% 消失是靠冷读 JSX + CSS + 源码断言推定，未截图。判定逻辑上强（单列
  CSS 确证、gating 位置确证），但无运行时像素证据——若喂 Big CR 优先复核此点。
- 未跑 Playwright owner 截图（plan §3 验收项）；build 绿 + owner 分支 `isOwnerView` 退化为原逻辑，owner 零变化在代码层可证，但 owner 截图缺席未独立核实。
- 未审 `showAi`(:494) 等相邻 gating 是否与本刀交互——超范围，未变更。

## Verification Evidence（自跑，不采信转述）

- `node scripts/verify-classic-retire-2.mjs` → **63 passed, 0 failed**，含两条新断言
  `answer-compare per-question box is owner-gated` 与 `topic-label confidence percentage (<em>%) is owner-gated` 均 PASS。
- `npm run build --prefix app` → **绿**（tsc -b && vite build，1850 modules，built in 783ms）。
- grep `showCompareBox` → 仅 :431/:480/:484 三处，无外泄。
- `git show main:scripts/verify-classic-retire-2.mjs` → 确认旧三断言不涉 per-question 盒/confidence%。

## Failure / Attack Angle

- 未来 agent 读 `QuestionGroupDetailView.tsx:13-16` docstring（MF-1），信「everything
  else visible to both」，把 confidence% 或 per-question 盒「恢复」为 member 可见——
  verify 会变红兜住代码回退，但若该 agent 连断言一并「修」，docstring 的谎言会成为
  其「依据」。MF-1 修掉即断此路。
- 若未来重构把 `isOwnerView && (` 拆成中间变量，SW-2 的脆断言误红 → 有人误以为真
  gating 丢失而慌乱回滚，或反手删断言。头注释已带 owner 2026-07-07 provenance，可缓解。

## Residual Risk

低。核心 gating 代码正确、在范围内、build 绿、两条新断言对回退真变红。唯一阻断项
MF-1 是同文件 docstring 诚实性（一句话可修）。member 运行时像素证据缺席为已知取舍。

## Recommendation

**APPROVE WITH MUST FIX** — 修 MF-1（组件 owner-gating docstring 补上 confidence%
与 per-question 校对盒 owner-only）后可合并。SW-1/SW-2 记录监控，不阻断。
