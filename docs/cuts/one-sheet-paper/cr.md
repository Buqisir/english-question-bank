# CR — one-sheet-paper（毛边⑤ 整卷页「一张连续卷」）

- Reviewer: CR (fresh cold read, Opus)
- Diff under review: `git diff fecf8af..8ed59ec`（单 commit `8ed59ec`）
- Depth: medium cut / CR-lite —— 纯页面布局层重构，无契约面、无 schema/数据面，
  可逆。审查按 plan.md 四轴逐条核。

## 结论：APPROVE（0 Must Fix）

tsc 绿；`node scripts/verify-paper-browse.mjs` = 177 passed / 0 failed（exit 0）；
scope 白名单干净；Forbidden 零触碰；九道剪刀线语义与 plan 逐条一致，且核心断言
（51/52）是对真实 paper-2026-i blocks 重跑算法的**行为断言**，不是 source-grep
固化——本仓库前科（AGENTS/STATUS 教训）在此已被避开。

---

## 轴 1 正确性 — 剪刀线判定 scissorPlan

- **判定规则纯按「节下题组数」，不 hardcode groupType** — 与 plan 决策3语义一致：
  `sectionGroupCounts` 先扫一遍得每节题组数，再：count>1→每组各自一条线
  （`scissorGroupIndices`）；count===1 且紧邻上一 block 是 instruction→并组
  （`mergedGroupByInstructionIndex` + `skipIndices` 跳过题组自身顶层渲染）。
- **writing 组整段排除**（`group.groupType === 'writing') continue`）→ 走纯 CSS
  兄弟选择器 `.pi-writing-section + *::before`，未碰 Forbidden 的
  writingPageModel.mjs / WritingPaperPage.tsx。核对无误。
- **render 层无双渲染 / key 冲突**：merged 路径在 instruction 的 index（i-1）位置
  一次性连着渲染 group card，group block（index i）经 `skipIndices` 跳过；Fragment
  key = `group-${i-1}`，i-1 是 instruction 位不会有第二个同 key 节点。安全。
- **anchor 不变**：`data-paper-browse-anchor={groupId}` 仍在 `<section>` 上，
  scissor-line 是卡外 `aria-hidden` sibling、不被 IntersectionObserver 观测 →
  scrollspy/深链锚定不受影响。
- **hover=剪走范围**：非 writing 组的节标题/节指导语是卡外顶层 sibling，
  `.paper-browse-group-card:hover` 天然只提亮卡内（merged 指导语已是卡内首子）→
  与 plan 决策5一致。截图 01/04 佐证。
- **单纸 scoped 覆盖不误伤嵌套 surface**：`.paper-browse-content .ps-surface/
  .ps-page/.pi-writing-page` 全部 scoped 在整卷容器内，PaperSurface 在别处
  （详情速览卡/解析页）零影响；手法沿用 writingPaperPage.css 既有 scoped 覆盖，
  源文件未改。高亮覆盖层锚点 `.paper-browse-content{position:relative}` 保留，
  覆盖层按 viewport-relative live rect 重算，退役 `.ps-surface` padding 不破坏其
  定位契约（见下 Should Watch 4）。
- **打印面零影响**：scissor-line/merge 只改浏览器组件 DOM 与 paperBrowsePage.css
  （仅 PaperBrowsePage.tsx 引入），server/print/export 从 asset content 生成、
  不序列化本组件 DOM。承诺成立。

截图核对：01（单张连续白纸、part 黑体/节宋体进纸、线在字母 A 前）、03（写作两节
各一条虚线在节标题后、指导语/正文前）与 plan 决策1-4 及验收标准一致。

## 轴 2 Scope 纪律

- 改动文件仅 3 个代码文件（PaperBrowsePage.tsx / paperBrowsePage.css /
  verify-paper-browse.mjs）+ docs/qa 截图与 notes，全部在白名单内。
- `shared/papersurface/tokens.mjs` = 仓库根 primitives，**import-only 未改**
  （不在 diff），与 Forbidden 的 `app/src/shared-ui/papersurface/**` 是不同路径；
  已核实 PaperSurface.tsx / WritingPaperPage.tsx / harness 同样 import 它 →
  「第三个只读消费者」说法属实。
- Forbidden（shared-ui/papersurface、paper-intelligence、server/print/export、
  App.tsx、domain）零触碰。确认。

## 轴 3 不变量

- 数据加载 / 讲评态状态机 / URL-popstate / scrollspy 逻辑本体未动（scissorPlan
  是对 asset 的纯 useMemo，无 fetch）。
- 深链一条龙（lecture/focusGroupId/questionId）、rail 贴左紧凑档、点题联动、
  显影层、窄屏抽屉、draft chip、悬浮操作簇——renderGroupBody / onAddGroupsToBasket /
  paper-browse-group-actions 机制原样。截图 05（深链讲评栏）/06（窄屏 760）佐证。
- 挑题态零解析请求：本刀不引入任何新数据请求，成立。

## 轴 4 verify 断到新语义

- 44-50 为 source 级结构断言（合理，tsx 无法在 mjs harness 里 import 执行）。
- **51-52 是行为断言**：对真实 `asset.content.blocks` **重跑同一套算法**，断言
  四个阅读组落 `scissorGroupIds`、三个单组非写作节（七选五/完形/语法填空）落
  `mergedGroupIds` 且不落 scissorGroupIds。这是数据落桶验证，不是 grep 固化。
  唯一残留：51/52 重实现了算法（copy）而非 import 组件里的 `scissorPlan`，若二者
  未来漂移 harness 抓不到——但 44-46 grep 组件源码结构做了对齐兜底，medium cut
  可接受。

---

## Should Watch（非阻塞）

1. **死变量 fallback**：CSS `max-width: var(--ps-page-width, 794px)` 与
   `color: var(--ps-ink, #111)` 的两个 var 从未注入到 `.paper-browse-content`
   （它是祖先，无法从后代 surface 继承；且 tokens.mjs 无 page-width 导出）。
   → 实际恒取 794px / #111 兜底值（794px=A4@96dpi，视觉正确）。功能无碍，但非
   token 驱动；将来若加页宽 token，这里不会跟随。低优先级可留可清。
2. **并组依赖「紧邻上一 block 是 instruction」**（i-1）：若未来导入的卷在
   instruction 与 group 之间夹了 pageBreakHint/其他 block，指导语会掉出 hover
   单元、退回独立线。当前真实数据无此形态（verify 52 数据验证），代码注释也已
   标注兜底。新卷导入时值得复检。
3. **写作组 hover 提亮含节标题行**：已知取舍，plan 与 qa-notes 均已披露（节标题
   被 pageModel 圈进卡内，纯 CSS 精抠会在 flex gap 露未着色缝隙）。线位置本身
   精确。owner 语境（一对一）可接受。
4. **七选五讲评态衔接句显影层未做视觉回归**：退役 `.ps-surface` padding 后正文
   位置微移，覆盖层按 live rect 重算理应自洽，但 QA 截图未覆盖该态。风险低，
   下次讲评态实测时顺带目检即可。

## Self-Review Blind Spots（喂后续 Big CR）

- 未在浏览器做真实「加入草稿卷」点击（DEV 亦声明未点，仅 DOM/CSS 结构核对+
  verify 8 项覆盖 onAddGroupsToBasket 机制）。merged 单元的入篮 payload
  `[card]` 与既有一致，风险低但未端到端跑通。
- writing `.pi-writing-section + *` 选择器强依赖 WritingPaperPage 的 DOM 兄弟
  顺序（Forbidden，本刀不可改）；若该组件未来重排内部 DOM，写作剪刀线位置会
  静默漂移。属跨刀耦合，记此以备。
