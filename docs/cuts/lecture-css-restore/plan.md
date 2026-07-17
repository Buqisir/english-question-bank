# lecture-css-restore：讲评解析面板样式失踪案（retire 刀误伤回归修复）

出处：owner 2026-07-17 报障（阅读讲评面板裸奔截图）。cut size:
small-medium；touches verify 脚本（新增防回归网）: yes → lean plan。
主代理直做 + CR-lite。

## 事故定性

reading-analysis-retire（merge af21f7c，07-16）删除
`paperIntelligencePaperSurfaceHarness.css`（2343 行）时，其中住着**五个
活着的讲评解析面板**的全部样式（pi-ps-analysis / pi-cloze / pi-gf /
pi-seven / pi-writing 五族，约 150 类）——组件活着、衣服陪葬，浏览器
默认样式顶上（ul 圆点/button 灰底居中/blockquote 大边距）。加载链
`paperBrowsePage.css` → harness CSS 同时被断。类型检查/verify/该刀
DP-3 均无此覆盖面；07-17 评审 A 路看到了但无基线误判为小观察项；
owner 眼睛抓获。

## Scope

1. **VERBATIM 恢复**：从 `c3c2c44^` 的 harness CSS 提取五族 + 关联
   @keyframes/@media 规则块，入新文件
   `app/src/features/paper-intelligence/lectureAnalysisPanels.css`
   （带出处注释），由 `paperBrowsePage.css` @import（复原生前加载链）。
   只删净 harness 容器专属（.pi-ps-harness-*）的死作用域规则。
2. **防回归网**：新 verify `scripts/verify-lecture-panel-css.mjs`——
   活 TSX 里五族每个类必须在某 CSS 有定义（今天这案子的可执行形态）；
   进 verify-ci registry（宪法：新 verify 同刀入 CI）。
3. DP-2 行为断言：讲评面板 computed style 非浏览器默认（ul list-style
   none + option row 非居中 + 其余四题型面板抽查）入档 qa/。
4. 判例候选（owner 点头才入 case-law）：**删共享 CSS 文件前必须做
   「类消费清单 sweep」**——文件里每个类名 grep 活 TSX，有消费者的类
   先迁出再删文件。

## Forbidden

- 五个面板组件 TSX（本刀只还衣服，不改结构）
- server/** / schema / paper-assets
- 新 verify 以外的 verify 逻辑

## 验证

恢复后 orphan sweep 归零 → tsc → 新 verify 绿 + verify:all →
DP-2 断言 + 截图亲眼 → CR-lite → CI → owner DP-3（就是你报障的那页）。
