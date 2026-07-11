# lecture-rail-scroll-fix — 开刀包（High 会话预写，2026-07-10）

队列位置：**UI 轨下一刀**（ui-p1 双刀已收口并部署，串行条件已满足）。
刀级 medium 起步；若 plan 判定要动 PaperSurface 契约面则加 PA。

## Must Read

1. `triage.md`（同目录）——三症状定性 + owner 需求拍板原文。
2. 本文件。

## 已拍板的决策（勿重新讨论）

- **点空显解析是正式需求**（owner 2026-07-10 原话在 triage.md）：讲评态
  下，卷面上**七选五与完形**的空可点，点空 → 右栏讲评面板显示该空/
  该题解析。旧「空不可点是设计」澄清作废。
- **rail 不滚 = 降级留观**：复测二号不复现，竞态假说（深链沉降期立点）。
  本刀 QA 冷加载+立点复测一轮；再现按竞态修，不按容器错误修。
- scrollspy 高亮漂移待上项复测后定性（可能是副产物）。
- 挑题态「加入草稿卷」悬浮钮入侵讲评态：核对 ui-p1-panels #3 是否已
  覆盖，未覆盖归本刀。

## 施工要点（plan 时细化）

- 空目前是纯 span 无 stem：要挂 questionId 映射 + 点击目标。切口二选一：
  PaperSurface 层受控改动（触发 contract hook，需 plan 授权 +
  `touch .claude/contract-unlock`）或外层事件委托（PaperBrowsePage 层，
  不碰契约面）。**倾向后者**，plan 时以实现成本裁。
- 修复面：`app/src/.../PaperBrowsePage.tsx`（+可能 paperBrowsePage.css）。
- 语法填空 `__NN__` 点空不着是数据形状旧账（STATUS 在案）——是否同刀
  顺收 plan 时评估，默认不收（数据修复归 data-health 批）。

## 验收

- verify-paper-browse.mjs 全绿 + verify:all + main CI。
- 浏览器真点击 QA：七选五/完形点空 → 右栏显示对应解析（讲评态）；
  挑题态点空无反应（姿态边界）；冷加载+立点复测 rail 滚动一轮。
- 别动导出面/print 样式（不在本刀范围）。
