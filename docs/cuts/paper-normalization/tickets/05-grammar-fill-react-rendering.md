# 05 — 语法填空 React 渲染及 computed-style 验证

Status: ready
Blocked by: 03 — 完形填空讲评态及题目锚点一致性; 04 — 语法填空编译器、输入方言与负例
Spec: `docs/cuts/paper-normalization/spec.md`
Worktree: `/Users/huangxuewei/Projects/wt-paper-normalization-20260724`
Branch: `codex/paper-normalization-20260724`
Initiative fixed point: `515a0f1317c95d197c98a81a36ce425b4948bde2`

## 目标

让两份真实 grammarFill proof assets 在 plain、PaperBrowse、analysis、
lecture 中都从 semantic blank 渲染统一 3.3em 挖空；页面不再显示 raw
`56._____` label，q56/q57 仍可正确聚焦和定位 evidence。

## 边界

- 复用 Tickets 02–03 的 semantic PaperSurface、TextMap、focus 与 evidence
  seams；不建立 grammar-only presentation contract。
- Compatibility capability 仅覆盖 `paper-2026-i` 和 `paper-960d0f8d`
  grammarFill；`needs_review` 显式诊断并保持 legacy output。
- Hint 紧随 blank 且只显示一次；无 hint 时不造占位。
- 宽屏与窄屏必须检查 computed style，而不是只查 class。
- 保持 sevenChoices 4.6em 与 cloze 3.3em 非回归。
- 不做 import gate、Print HTML、DOCX、其他题型或全局数字清洗。

## 验收

- [ ] `__56__ (hold)` 与 `56._____` 均渲染为相同结构/样式的 semantic
      blank；DOM 可见文本不含 raw marker label。
- [ ] Computed `display`、`width`、`white-space`、`border-bottom`、
      `text-align` 分别满足 3.3em、nowrap、单细线、数字居中无尾点。
- [ ] Hint immediately-after 且不重复；null hint 无多余字符或间距节点。
- [ ] q56/q57 click、active state、evidence range 与 lecture 开关正确；
      plain/analysis/lecture semantic digest 相同。
- [ ] 宽屏、窄屏均无 blank 换行或 prose/普通数字丢失；cloze 与
      sevenChoices ruling 不回归。

## 验证

- Public adapter/render focused tests + 两份真实 assets。
- 运行 grammar/PaperBrowse/PaperSurface focused verifiers、
  `pnpm -C app run build`、`git diff --check`。
- 结束前运行一次 `pnpm -C app run verify:all`，记录真实退出码与 declared
  skips/baseline failures。
- 真实浏览器在宽屏与窄屏检查两种 dialect，执行 q56/q57 click、lecture、
  evidence 与 `getComputedStyle`；记录 agent browser evidence。Owner QA
  延后到 Phase A 独立审查之后。

## 依赖

Tickets 03 与 04 的完成 commits。

## 完成定义 / Result

- `$implement` 完成 TDD、检查、普通 review、修复、browser/computed-style
  evidence 与 clean commit。
- Ticket 状态改为 `done` 并填写结果；不得开始 Ticket 06。

Commit:
Verify:
Notes:
