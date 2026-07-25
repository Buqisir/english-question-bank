# 03 — 完形填空讲评态及题目锚点一致性

Status: done
Blocked by: 02 — 完形填空普通卷面渲染与双题号消除
Spec: `docs/cuts/paper-normalization/spec.md`
Worktree: `/Users/huangxuewei/Projects/wt-paper-normalization-20260724`
Branch: `codex/paper-normalization-20260724`
Initiative fixed point: `515a0f1317c95d197c98a81a36ce425b4948bde2`

## 目标

让 `paper-2026-i` cloze 在 analysis/lecture 中继续使用 Ticket 02 的同一
canonical semantics；点击 passage blank 能聚焦正确 question，evidence
range 与 lecture 开关不再依赖 raw marker 或另造 question/stem。

## 边界

- Analysis adapter 只能叠加 supplement；不得重建 paragraph/question/blank。
- Blank focus 使用 `blankId → questionId`，并保留 paper/group/paragraph/
  question/blank 与 sentence-id 的现有 anchor 纪律。
- Evidence 在 canonical visible text 上解析；找不到 `signalText` 时显式失败。
- Lecture 开/关、plain/analysis/lecture 必须共享 semantic digest。
- 唯一允许的实现未知点：source span 到现有 sentence range 的最小转换方式；
  结果必须仍由 TextMap 充当唯一 position oracle。
- 不做 grammarFill、import、Print HTML、DOCX、全局重分句或 analysis JSON
  重写。

## 验收

- [x] 41–55 blank 均可点击并发出正确 `request-lecture-focus(questionId)`；
      active state 与当前 question 一致。
- [x] Plain、analysis、lecture 的 canonical group/digest 相同；analysis
      只增加 evidence/右栏数据。
- [x] 每个 evidence range 指向 canonical TextMap 中存在的 sentence/range；
      unresolved anchor 为明确失败而不是空数组或静默 fallback。
- [x] 打开、切题、关闭、再次打开 lecture 后，题号、options、blank 与
      evidence 不漂移，也不重新出现双题号。

## 验证

- 在现有 cloze analysis public model seam 上补行为回归，并直接读取真实
  `paper-2026-i` asset + analysis。
- 运行相关 cloze/PaperBrowse/PaperSurface focused verifiers、
  `pnpm -C app run build`、`git diff --check`。
- 结束前运行一次 `pnpm -C app run verify:all`，记录真实退出码与 declared
  skips/baseline failures。
- 真实浏览器逐点 q41、另一题、evidence、lecture 开关；记录 agent browser
  evidence。Owner QA 延后到 Phase A 独立审查之后。

## 依赖

Ticket 02 的完成 commit。

## 完成定义 / Result

- `$implement` 完成 TDD、检查、普通 review、修复、浏览器 evidence 与一个
  clean commit。
- Ticket 状态改为 `done` 并填写结果；不得开始 Ticket 04。

Commit: this commit — `feat(paper-normalization): align cloze lecture anchors with canonical surface`
Verify:
- `node scripts/verify-paper-normalization-cloze-analysis.mjs` — exit 0.
- `node scripts/verify-i9-cloze-analysis-surface.mjs` — 51/51, exit 0.
- `node scripts/verify-paper-normalization-cloze-surface.mjs` — exit 0.
- `node scripts/verify-paper-browse.mjs` — 197/197, exit 0.
- `node scripts/verify-i10-blank-rendering.mjs` — 41/41, exit 0.
- `node scripts/verify-paper-surface-mjs-declaration-parity.mjs` — 25/25,
  exit 0.
- `pnpm -C app run build` and `git diff --check` — exit 0.
- `pnpm -C app run verify:all` — exit 0; PASS 87 / SKIP 1 / FAIL 0.
  Declared skip: `scripts/verify-i16a-teaching-dimension-search.mjs`
  (off-repo fixture absent). Baseline failures: none.
Notes:
- Standards + Spec review and focused re-review passed with no remaining Must
  Fix or Should Fix. Analysis now fails closed unless canonical normalization
  is ready and semantic blank anchors exist.
- Agent browser on `paper-2026-i` at 1440×900 clicked all passage blanks
  41–55 and the q47 option line; every URL/panel/blank/question active state
  matched. q41 evidence switched from `of how little people knew` to
  `came quickly` on the same TextMap range. Closing lecture preserved
  `scrollY` exactly (5294.5 → 5294.5); reopening and selecting q41 restored
  its blank, option row, panel, and evidence mark. Browser warn/error log: 0.
- Owner QA is intentionally deferred to the Phase A independent review.
