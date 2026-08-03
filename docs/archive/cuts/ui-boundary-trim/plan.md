# ui-boundary-trim（UI 一致性刀④：产品边界收尾）— DEV 执行契约

cut size: small-medium; touches product boundary: yes——但口径已由 owner
2026-07-07 拍板（audit Q2：「member 隐藏、owner 保留」），本刀是 ADR-0015
消费边界的 UI 收尾，非新决策。背景：`docs/cuts/ui-coherence/audit.md`
优先问题 ④。

## 改动（仅 `app/src/features/question-detail/QuestionGroupDetailView.tsx`
+ `scripts/verify-classic-retire-2.mjs`）

组件已有 `isOwnerView: boolean` prop（现用于 编辑/删除 :183/:189），
不需要新布线。

1. **话题置信度百分比 owner-only**：`:283-284` 的
   `{topicLabel.confidence !== undefined && confidence > 0 ? <em>…%</em> : null}`
   外面再包 `isOwnerView &&`。话题标签本体、`reason` 小字**保持 member
   可见**（决策范围只有百分比）。
2. **每小题「待对比」校对盒 owner-only**：`:431` 的
   `const showCompareBox = …` 改为 `const showCompareBox = isOwnerView && (…)`。
   布局自适应已内建（member 走 `answer-grid-single`，答案盒占满）——
   验收时确认 member 形态下无空列。
   **不动**：`:244` 的 `answer-compare-summary` 答案对比统计（C2 决策
   member 可见，本次 owner 决策未覆盖它）；`verify-list`（AI 答案验证
   列表）同理不动。
3. **护栏文本诚实化**：`verify-classic-retire-2.mjs` 中两条断言的
   名称/注释写着「stays unconditional (member-visible, C2)」——其中
   涉及 answer-compare-box 的表述已过时。更新：
   - 断言名改为反映新口径（如 `answer-compare per-question box is
     owner-gated (ADR-0015 UI 收尾, owner 2026-07-07)`），并把断言
     升级为**真检查**：source 中 `showCompareBox` 的定义必须包含
     `isOwnerView &&`（不许只靠 className 存在性）。
   - `答案对比统计`/`verify-list`/`话题标签展示` 三条 member 可见断言
     **保留**，但话题标签条补一条新断言：confidence `<em>` 渲染处于
     `isOwnerView` 条件内（regex 允许合理变体）。
   - 文件头注释同步补一行决策留痕（owner 2026-07-07，audit Q2）。

## Forbidden

- 不动数据获取/props 契约/App.tsx（isOwnerView 已传入）。
- 不动 `answer-compare-summary` 与 `verify-list` 的可见性。
- 不动样式文件。不顺手做其它刀范围。

## 验收

1. `npm run build --prefix app` 绿。
2. `node scripts/verify-classic-retire-2.mjs` 绿（含你新加/改写的断言）。
3. Playwright（本地 open 模式 = owner 形态，8787+4173，跑完杀进程）：
   打开任一题组详情，截图证明 owner 形态下 待对比盒 + 置信度% 仍在。
   member 形态本地不可达（enforced 需真账号），以 §3 的源码级断言 +
   CR 冷读证明；在报告里明说这一验收方式。截图放
   /private/tmp/claude-501/-Users-huangxuewei-Projects-english-question-bank/9adddf3b-2f53-4faf-bf50-a4aefe6df666/scratchpad/dev-boundary/。
4. 完成报告：两处 gating 的 diff 摘要、verify 断言改动逐条理由、
   截图路径、已知风险。
