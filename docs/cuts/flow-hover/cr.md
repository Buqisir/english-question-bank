# CR — flow-hover Chunk A（fresh 冷读）

- Reviewer: fresh Opus CR（未参与实现）
- Baseline: `main` @ `1e51fab`
- Under review: `github/worktree-agent-a494f8ea740bf01bf` @ `df36fb0`（单 commit，parent = 1e51fab，线性无合并）
- 结论：**APPROVE**（无 Must Fix）

## Changed Scope

`git diff main...df36fb0` 共 5 文件：

- `app/src/features/paper-browse/PaperBrowsePage.tsx`（白名单内）
- `app/src/features/paper-browse/paperBrowsePage.css`（白名单内）
- `docs/cuts/flow-hover/qa/qa-touch.mjs`（QA 产物，非生产码，交付要求）
- `docs/cuts/flow-hover/qa/desktop-default.png` / `touch-default.png`（QA 截图，真实非空：187KB / 67KB）

白名单外生产码零改动。Forbidden 清单逐项复核：`papersurface/**`、`*Adapter*`、
`server/**`、`domain/**`、App.tsx 路由、print/PDF/DOCX/export 样式、其他页面——
**全部未触**。`scripts/verify-paper-browse.mjs` 未改：正确，因该脚本对退役的
`paper-browse-group-card-header` / h4 结构**没有任何断言**（grep 零命中），窄改授权
的触发条件未成立，不改是对的。

## 不变量复核（逐条对 plan §5）

- PaperSurface 挂载：`renderGroupBody` 在 diff 中零改动，`<PaperSurface .../>` props 原样。✅
- adapter 调用 / 数据加载：未触。✅
- `focusGroupId` 定位：深链 effect（`~L225-238`）与 `scrollToAnchor` 均依赖
  `data-paper-browse-anchor`，该锚在 `<section>` 上保留；两处逻辑未改。✅
- 加入草稿卷三态：按钮从 header 迁入 `paper-browse-group-actions`，但 `onClick` /
  `disabled` / `title`（含 `printUnavailableReason` 回退）/ 三态文案在 branch 版本
  **逐字节一致**，状态机未动。✅
- AppTopbar / 底部草稿卷 chip：未触。✅

## Findings

### Must Fix
无。

### Should Fix
无。

### Should Watch（均不阻塞本次合并）

1. **自动化 verify 对本刀零覆盖。** `verify-paper-browse.mjs` 98 绿全是路由 /
   `focusGroupId` 的 source-regex 静态检查，**不触及**本刀新增的任何行为（悬浮显形、
   scrollspy、`aria-current`、active class、三态按钮 DOM 位置）。这不是缺陷——plan
   对纯 UI 刀明确以浏览器 QA 为准，且截图已留档验证——但意味着本刀无回归网，
   后续重构此页时无自动化护栏。Chunk B 若动此区，建议顺手补一条轻量 DOM/交互断言。
2. **scrollspy 尾部盲区。** `rootMargin: '0px 0px -70% 0px'` 令锚点只在视口顶部 30%
   带内才算 intersecting。滚到页面最底时，末尾题组可能永远进不了该带，rail 末项
   可能不高亮。plan §3「实现保持简单，不做像素级仲裁」允许，接受。
3. **scrollspy 初始滞后。** observer deps 为 `[asset, loading]`；题组正文异步加载会
   改变元素高度，但 IntersectionObserver 不因高度变化重触（无滚动即不重算），
   首屏 activeAnchor 可能滞后到首次滚动。次要。
4. **窄屏（`max-width: 900px`）横排 rail。** active 态（`font-weight: 600`）在横排
   下同样生效，理论上引起横排项轻微 reflow，纯视觉。touch 截图已证横排布局与
   `hover: none` 常显按钮均正常，无功能破坏。
5. **`overflow: hidden` 移除但 `border-radius: 12px` 保留。** 圆角此时已无裁剪
   作用，纯遗留、无害。

## Self-Review Blind Spots 逐条裁决（DEV 自报）

1. **git stash/stash pop 流程违规、自报无损** → 复核：branch 为单 commit，
   parent 直接是 main（`1e51fab`），merge-base = main，线性无异常合并/无残留
   stash commit。**git 层历史干净，无混入。** 裁决：无损，属实。
2. **900px 断点横排 scrollspy/高亮未测** → 复核：横排下 active 类只改 bg/字重，
   observer root:null 与布局无关照常工作；touch 截图证横排布局正常。**无破坏**，
   降为 Should Watch #4。
3. **操作簇用 opacity/pointer-events 而非 display:none，屏幕阅读器恒可见** →
   裁决：这是**正确**选择，不是缺陷。plan §2「Tab 聚焦即显形」要求按钮留在 tab
   order 内；`display:none` 会移出 tab order 与 a11y 树，破坏该规格。恒可见的是一个
   真实可操作控件（「加入草稿卷」），屏幕阅读器宣读它合理。保留现实现。
4. **IO root 从 scrollerRef 改为 null(viewport)** → 复核：`.paper-browse-content`
   无 overflow/height 约束，页面在 document/viewport 级滚动；锚点周围**无嵌套滚动
   容器**（唯一的 overflow 容器是 rail，锚点不在其中）。root:null 正确，无嵌套滚动
   隐患，代码内注释也解释到位。裁决：修正正确。

## Verification Evidence

- 已被证实项按 orchestrator 指示不重跑：verify-paper-browse 98 绿 / verify:all 70
  绿 / tsc 干净。
- CR 独立复核（未证实项）：
  - 读 `verify-paper-browse.mjs` 断言实质——确认其为路由/focusGroupId 静态检查，
    未覆盖本刀（故 98 绿不构成本刀行为证明，证明落在浏览器 QA 上）。
  - diff 全文逐行 + branch 版按钮块逐字节比对（三态一致）。
  - git 历史/parent/merge-base 复核（单 commit 干净）。
  - 两张 QA 截图肉眼核验：desktop 默认态卷面干净无操作 chrome、rail 顶项高亮
    （aria-current 生效）、草稿卷 chip 在位、PaperSurface 自带白底（移除卡片白底
    未致文字落米色）；touch 态横排 rail + 常显绿按钮，`hover:none` 兜底成立。

## Failure / Attack Angle

- 本刀的唯一真实证明是浏览器 QA 截图，非自动化。若未来有人「重构此页」并误删
  `data-paper-browse-anchor` 或改动三态按钮，verify 98 仍会全绿——回归不会被自动
  拦截。这是结构性弱点（Should Watch #1），本次可接受但需在 STATUS/watch 留痕。
- scrollspy `rootMargin -70%` 是隐性魔数：若后续视口/布局大改，高亮带可能整体
  偏移而无测试报警。
- `add-button` 的 box-shadow 覆盖已正确 scope 在 `.paper-browse-group-actions` 下，
  未泄漏到复用 `.add-button` 的其他页面——已确认无越界。

## Residual Risk

低。纯 UI、无数据/持久化/导出路径、无 schema 变更、不变量逐条守住、scope 干净、
git 历史干净。残留风险集中在「自动化零覆盖 + scrollspy 边界」，均属 Should Watch，
不阻塞合并。

## Recommendation

**APPROVE** — 无 Must Fix。可合并。建议合并后把 Should Watch #1（本页无自动化
回归网）记入 watch-ledger/STATUS，供 Chunk B 施工时顺手补一条轻量交互断言。
