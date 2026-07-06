# legacy-import-retire — Agent Entry Point

**ADR-0016 第 3 刀（末刀）**：退役 legacy「导入资料」网站界面 + 整退「多卷闭环
状态」看板（grill D1 scope 扩张）。纯删。

## 先读（按序）
1. `docs/adr/0016-website-zero-import-ui.md`（三刀伞状决策）
2. `decisions.md`（本刀 grill 4 问拍板 + Q1 看板整退 + KEEP 命门）
3. `plan.md`（DELETE/KEEP/SEVER 逐符号 + §陷阱 + §Forbidden + §验收）

## 一句话
删 `server/imports/*`（3 文件）+ App.tsx 802 行导入模态 + 看板（state/handler/JSX）+
AdminWorkbench 导入 section + workflow-view + questionGroups.ts 12 fn + App.css ~211
选择器 + verify 纯删 3。api.mjs 去 legacy 织入 + 看板后端 + paper-sets 删 1 路由。

## 三条铁律
- **"parse" 一词两义**：删 import 文件解析，KEEP 题组 parse 回填（member 看题）。
  按完整符号名匹配，别 grep 裸 `parse` 批删。见 plan §陷阱 1。
- **KEEP 命门零改动**：分析器/发布器/import-pipeline/`selectPaperSetSummaries`/注入
  helper/member 组卷消费流。`git diff --stat` 自证。
- **看板整退 ≠ 碰主卷**：member 组卷/加草稿 + paper_sets 数据零改动，只删 owner-only
  看板 UI + 其 read 端点。

## 执行
dev-hard，**禁 spawn 子代理**。禁整读 App.tsx（用 grep+sed 抽段）。行号 @9a0ab14，
**编辑前必 grep 符号重定位**（前刀已证漂移）。删完 tsc 收敛孤儿 → verify:all → residue
grep → KEEP git diff --stat。
