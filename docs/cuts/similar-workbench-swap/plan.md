# similar-workbench-swap（E7：工作台⇄换篇——目录原地切候选抽屉）

- cut size: **medium**；契约面：**no**（消费 E5 `/api/similar-passages` +
  既有 persistItems/undo 通路；`app/src/domain/`、server、schemas 零改动）。
- **语义真源**：`docs/cuts/similar-questions/program.md` §配方 v2 入口拍板
  + 原型 `prototype-passage-entry.html` **场景 2**（owner 全过）：工作台
  贴纸操作条新增 ⇄ → 右栏目录**原地切**候选抽屉 → 每候选「⇄ 替换这篇」
  （可撤销）/「＋ 加入」→ 收起回目录。拍板语义不得重开。
- **PA 降 PA-lite**（降档理由）：入口形态 owner 原型逐场景拍板（2026-07-15）；
  端点契约 E5 已 formal PA；无契约面。CR 复核降档是否仍成立。
- 路由：无契约面 + plan 预写充分 → cut-pipeline 流水线。

## 施工要点

1. **落点**：`app/src/features/draft-paper/DraftPaperWorkbench.tsx`（贴纸
   操作条 ~1360-1390 加 ⇄ 钮 + 抽屉态机 + 落库动作）、`DraftPaperRail.tsx`
   （目录 ⇄ 抽屉两态原地切换）、`DraftPaperWorkbench.css`。
2. **⇄ 入口 gate**：四个 v2 支持题型（reading/cloze/sevenChoices/
   grammarFill）；writing 贴纸不出现 ⇄（隐藏式降级，同 E6 惯例）。
3. **抽屉**（rail 原地切换，一次只开一个种子）：
   - 头：种子题名 + 配方副标（复用
     `features/similar-passages/SimilarPassagesPanel` 导出的
     `similarPassagesRecipeSummary(groupType)`）+「返回目录」。
   - 候选卡：title/sourceLabel/reasons chips（复用 `.similar-*` 样式语言，
     不发明新色）+ 两动作「⇄ 替换这篇」「＋ 加入」。
   - 池子诚实条 + `notice` 空态原样展示（同 E6 面板语义）。
   - 候选渲染组件优先复用/扩展 `SimilarPassagesPanel`（如加可选的
     per-card actions 渲染口，向后兼容 E6/详情页两处消费者）；若扩展代价
     大于收益可在 rail 内做兄弟视图，但 chips/卡样式必须同源复用。
   - 换种子（点另一贴纸的 ⇄）= 直接切到新种子抽屉；点当前种子的 ⇄ 或
     「返回目录」= 收起回目录；scrollspy/拖拽在目录态行为零回归。
4. **动作语义**（本 plan 钉死，DP-3 owner 可否决）：
   - **替换这篇**：候选组接管原贴纸的**位置与 pageBreakBefore**（分页是
     位置意图，随槽位不随内容）；走 persistItems 落库；**可撤销**——
     复用 draft-undo-toast 模式 + 快照失效纪律（任何其他变更先
     clear 快照，与 reorderUndoSnapshot 同款生命周期，见
     DraftPaperWorkbench.tsx ~167-179 注释）。
   - **加入**：插入在种子贴纸**之后**（老师就在这个位置工作，邻插不跳尾）；
     persistItems 落库 + toast（沿用「已加入」语言，无撤销——与 E2/E6
     加入语义一致，删除本就有撤销兜底）。
   - 候选**已在本草稿卷**：动作禁用 + title「已在草稿卷中」（C8 语言）；
     thin 候选（DB 无卡）禁用 + title 提示（E6 SW-3 同款）。
5. **既有 verify 锚随刀更新（授权清单，逐条 rationale，禁止顺手放宽）**：
   grep 命中 DraftPaperRail/DraftPaperWorkbench 的九件——
   verify-a3-imposition / verify-c8-draft-paper-contracts /
   verify-c8-my-space-contracts / verify-classic-retire-3 /
   verify-c8-draft-paper-render-model / verify-draft-workbench-visual-unify /
   verify-error-copy-mainline / verify-paper-browse / verify-paper-draft
   ——只对齐本刀拍板行为（操作条多一钮/rail 两态），结构锚移动须逐条
   注明出处；reorder-suggest 的 verify ⑦b mock 点击流 30 断言不得放宽。
6. **新 verify** `scripts/verify-similar-workbench-swap.mjs`（注册
   verify-ci + README 同刀原子）：静态断言 ⇄ gate 四题型 + writing 无 ⇄；
   替换动作走 persistItems（非旁路 fetch）；undo 快照失效纪律接线
   （clearReorderUndo 同款互斥）；抽屉复用 similarPassagesRecipeSummary。
7. **DP-2 行为脚本**入档 `docs/cuts/similar-workbench-swap/qa/`（可重跑；
   rootDir 自推导 + 可见性几何断言两纪律照 E6 判例）：
   ① 阅读贴纸点 ⇄ → rail 原地切抽屉（几何：抽屉占 rail 宽、目录隐）；
   ② 候选「替换这篇」→ 卷面该槽位换新组、pageBreakBefore 保留 → toast
   撤销 → 复原（items 序 + 分页位断言）；
   ③ 「＋ 加入」→ 种子后邻插、计数 +1；
   ④ 换种子直切 / 返回目录恢复 scrollspy；
   ⑤ writing 贴纸无 ⇄；已在卷候选禁用；
   ⑥ 替换后做一次其他变更（如上移）→ 替换撤销快照按纪律失效。

## Forbidden

- `server/**`、`app/src/domain/`、`schemas/`、`shared/papersurface/**`、
  `*Adapter.ts` 零改动；`SimilarPassagesPanel` 若扩展仅限**向后兼容的
  可选 props**（E6/详情页两处消费者行为零变化，verify 有锚）。
- 不动找题/详情页/讲评态入口（E6 已收）；不动拖拽通道与 reorder-suggest
  行为本体；永不自动替换/自动重排。
- program.md 拍板语义不重开；DESIGN.md §7 三纪律。

## Verification（流水线 verifyCmds 照抄）

1. `pnpm -C app run build`
2. `node scripts/verify-similar-workbench-swap.mjs`
3. `pnpm -C app run verify:all`
4. `node docs/cuts/similar-workbench-swap/qa/dp2-similar-workbench-swap.mjs`

## 裁决点清单（PM 断点锚）

- [x] 裁1 plan 落锤 + commit（56da789）
- [x] 裁2 流水线收口审读（verify 四命令真实退出码全 0；ABORT 系截图
      再生成——已立 DP2_SCREENSHOTS 门控惯例根治，dispatch-protocols.md）
- [x] 裁3 fresh CR APPROVE 1MF/3SW；MF-1 主代理当场修（先加后删安全序+
      撤销坐标+DP-2 场景⑦回归锚，44/44 绿+verify:all 80 绿复验）
- [x] 裁4 merge 主树 + main CI 见 push 后 watch
- [x] 裁5 owner DP-3 全过（2026-07-16，9 行 QA 表实点，两条语义未否决）→ 生产已部署 2b5c2b0（health ok、eqbank.cc 200）。本刀闭环，相似题 v2 program 全线闭环。
