# 02 — 完形填空普通卷面渲染与双题号消除

Status: ready
Blocked by: 01 — 完形填空编译器核心规范化规则
Spec: `docs/cuts/paper-normalization/spec.md`
Worktree: `/Users/huangxuewei/Projects/wt-paper-normalization-20260724`
Branch: `codex/paper-normalization-20260724`
Initiative fixed point: `515a0f1317c95d197c98a81a36ce425b4948bde2`

## 目标

让真实 `paper-2026-i` cloze 的普通 PaperSurface/PaperBrowse 卷面直接消费
canonical semantics；passage blank 与 option line 各显示一次题号，但同一
slot 不再出现 `41. 41`。

## 边界

- 建立最小 semantic paragraph/input seam 与 canonical PaperSurface adapter；
  canonical blank 必须以 node 进入 renderer，不能重串成 marker。
- `PaperTextMap` 继续作为 position oracle，并与 semantic visible content
  从同一 canonical group 派生。
- 建立 shared blank ruling：cloze/grammarFill `3.3em`、sevenChoices
  `4.6em`，centered-no-dot、single-thin、nowrap、hint immediately-after。
- 只启用 `paper-2026-i` cloze compatibility proof；normalization
  `needs_review` 时保留 legacy path 并显式报告诊断。
- 唯一允许的实现未知点：semantic content 以 companion prop 还是兼容扩展
  接入；无论选择哪种，均不得破坏既有 TextMap/anchor 合同。
- 不做 analysis/lecture/focus/evidence、grammarFill、import、print 或 DOCX。

## 验收

- [ ] 41–55 的 passage blank 与 option line 均来自同一 canonical question；
      每个 slot 只投影一次，页面不含 `41. 41` 一类重复。
- [ ] Canonical PaperSurface path 不 import raw-marker regex，不把 semantic
      blank 序列化回字符串；legacy path 仍可服务非 proof 资产。
- [ ] 普通挑题态与 PaperBrowse 卡片使用相同 semantic digest，既有选择、
      滚动、A4 paper hierarchy 与 sevenChoices `4.6em` 无回归。
- [ ] Cloze blank 的 3.3em、居中无尾点、单细线和 nowrap 在真实 DOM 成立。

## 验证

- Public adapter/render focused tests + `paper-2026-i` real fixture。
- `node scripts/verify-paper-browse.mjs`、相关 blank/PaperSurface verifiers、
  `pnpm -C app run build`、`git diff --check`。
- 结束前运行一次 `pnpm -C app run verify:all`，记录真实退出码与 declared
  skips/baseline failures。
- 真实浏览器打开普通 `paper-2026-i`，检查完形 41–55 与滚动/选择；记录
  agent browser evidence。Owner QA 延后到 Phase A 独立审查之后。

## 依赖

Ticket 01 的完成 commit；实现开始时 handoff HEAD 必须精确匹配。

## 完成定义 / Result

- `$implement` 完成 TDD、检查、普通 Standards + Spec review、修复、浏览器
  evidence 与 clean commit。
- Ticket 状态改为 `done` 并填写结果；不得开始 Ticket 03。

Commit:
Verify:
Notes:
