# ui-polish-misc（UI 一致性刀⑥：打磨杂项收尾）— DEV 执行契约

cut size: small-medium; touches schema/data-contract/product boundary: no。
背景：`docs/cuts/ui-coherence/audit.md` 优先问题 ⑥ + 刀②③⑤ CR/DEV 转来
的账。这是 UI 一致性系列的收尾刀。

## 1. 死 CSS 清扫（App.css）

删除以下**已确认无 TSX 引用**的规则组（删前每组自行 grep 复核一次，
连带其媒体查询/伪类/变体一起删干净）：
- `parse-mapping-highlight` 组
- `difficulty-review-queue*` 组（难度标定已随 ADR-0015 退役）
- `paper-block-item*` + `paper-canvas-sh` 组（PaperBlockCanvas 组件已无
  挂载点；只删 CSS，.tsx 归架构债不动）
- `.concierge-reason-line` 及其 3 处自引用（刀③ CR 确认死规则）
- `.concierge-actions`（0.45 淡显块，刀⑤ CR 确认零引用；注意**单数**
  `.concierge-action` 是活的，别误删）

## 2. 空态/错误口吻统一（PRODUCT.md：人话、不用系统报错腔）

grep 范围内 member 可见的空态/错误文案，把「系统腔」改「人话」，参照
现有好例子（my-space:「还没有保存的草稿卷 PDF。组一份卷子，导出后可以
保存在这里。」）：
- `DraftPaperWorkbench.tsx:409`「草稿卷未找到。」→ 给出去处（如
  「没找到这份草稿卷，可能已被删除。回到找题页重新组一份吧。」）。
- 其余凡以「暂无…」「…未找到」「无数据」形态出现的 member 可见文案，
  逐条列出并统一为「现状 + 下一步」句式；拿不准的列在报告里不改。

## 3. 思考模式开关章程化（烂点#6）

`ConciergeDesk.tsx:239-247` 原生 checkbox → 章程风格开关。约束：
- 优先 CSS-only（`appearance: none` + 胶囊轨道 + 圆点滑块），墨绿选中
  态（teal-600 轨道）、中性未选态、章程焦点环、150-250ms 过渡 +
  reduced-motion 退化。
- `<input type="checkbox">` 语义与 `htmlFor` 关联保持不变（a11y 不换元素）。

## 4. 草稿卷 980px 工具组间距（烂点#5）

`DraftPaperWorkbench.css` 980px 媒体查询内竖排时补组间分隔感
（组间 margin/padding 或 subtle 分隔线，用章程中性 token）。

## 5. 管理台空屏最小处理

`AdminWorkbench.tsx`（60 行）当前近乎空屏一个按钮。加一个说明卡
（surface 白卡 + 章程排版）：一句话说明「内容生产在后台 Agent 完成，
这里只放低频维护工具」+ 现有按钮归入卡内。**不加任何新功能**。

## 6. ghost-button 家族章程焦点环（刀③ CR SW-2）

给共享按钮家族（ghost-button 及 App.css 中同族 button 选择器组）补
`:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(44,110,86,.20) }`；
已有 box-shadow 状态的选择器用逗号叠加别覆盖。改完 tab 一遍主要页面
确认无「零环」倒退（刀③曾修过 starter-chip 这种坑）。

## 7. harness 残留暖色 overlay（刀② CR SW-1）

`paperIntelligencePaperSurfaceHarness.css` 中残留的
`rgba(47,41,35,*)` 覆盖层 ×~12 与 `rgba(255,252,247,0.62)` →
换成中性 ink 基（`rgba(30,30,28,同透明度)`）/ 中性白基。逐处列报告。

## 8. 分类色系裁定落档（UI direction 已裁，照写）

七选五 `data-seven-color` 五色分类系（含蓝相）**保留**——它是功能性
分类色（数据语义，同卷面证据色一个性质），不是 UI 强调色。落档动作：
在 `DESIGN.md` 的 Single-Hue Rule 段末追加一句成文豁免：
「功能性分类色板（数据语义：如七选五线索组 data-seven-color 五色系、
卷面证据色）不算强调色，不受单色相约束；新增分类色板需 UI direction
批准（本条 2026-07-08，小川/owner 委托）。」不改任何分类色值。

## Forbidden

- `shared*/papersurface/**`、`paperSurfacePrototype/**`（死码但归架构债
  刀）、`paperIntelligence.css`（孤儿支）。
- 不动检索/状态机/数据流；管理台不加新功能；不动分类色值。

## 验收

1. `npm run build --prefix app` 绿。
2. 死 CSS：grep 证明五组类名在 app/src 全部归零（CSS+TSX）。
3. verify 复跑绿：verify-concierge-desk、verify-home-default-feed、
   verify-search-thinking-toggle、verify-classic-retire-3（它钉过 App.css
   的负删除哨兵——若你删的死 CSS 撞了哨兵断言，报告单列，与断言意图
   核对后同步更新，不许静默放宽）、verify-c8-draft-paper-contracts。
4. Playwright（8787+4173，跑完杀进程）：home（开关新样式 + tab 焦点环）、
   draft-paper 980px 宽（组间距）、admin（说明卡）、卷面-阅读（overlay
   归队后无暖色残留）截图。放
   /private/tmp/claude-501/-Users-huangxuewei-Projects-english-question-bank/9adddf3b-2f53-4faf-bf50-a4aefe6df666/scratchpad/dev-polish/。
5. 完成报告：§1-§8 逐条落实（file:line）、口吻改动逐条对照表、
   撞哨兵断言处置单列、截图路径、已知风险。
