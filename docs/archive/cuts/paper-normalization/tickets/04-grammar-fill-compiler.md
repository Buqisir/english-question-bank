# 04 — 语法填空编译器、输入方言与负例

Status: done
Blocked by: 01 — 完形填空编译器核心规范化规则
Spec: `docs/cuts/paper-normalization/spec.md`
Worktree: `/Users/huangxuewei/Projects/wt-paper-normalization-20260724`
Branch: `codex/paper-normalization-20260724`
Initiative fixed point: `515a0f1317c95d197c98a81a36ce425b4948bde2`

## 目标

让同一个 `normalizePaperGroup` 将 `__NN__ (hint)` 与
`NN._____(hint)` 两类真实 grammarFill 输入编译成同形 semantic blank，
并在任何歧义或普通数字误匹配风险下 fail closed。

## 边界

- 支持 `__56__ (hold)`、`__58__`、`56._____`、
  `57._____(absorb)`；dialect adapters 保持 module-private。
- 实施 spec 的 hint merge 规则；canonical hint 只存在于 blank node。
- Parser 必须锚定完整 marker，普通 prose 与数字逐字保持。
- 复用 Ticket 01 的 input/result、source map、fingerprint、digest 与
  canonical validation，不建立 grammar-only 外部合同。
- 不做 React、computed style、focus/evidence、import、print 或 DOCX。

## 验收

- [x] `paper-2026-i` 与 `paper-960d0f8d` grammarFill 均 ready；两种 dialect
      的 blank node 字段与 identity 规则相同。
- [x] Marker hint / `blank.prompt` 的相同、单侧、双空与冲突四类结果完全符合
      spec；冲突为结构化 `needs_review`。
- [x] `2026`、`25-30g`、`800g`、`3-5g`、`30g`、`10g` 与周边 prose
      逐字保持。
- [x] Missing/duplicate marker、marker count、number、blankId、hint 和
      source-span conflicts 全部 fail closed。
- [x] Input immutability、stable fingerprint/digest 与 canonical validation
      对两类真实资产成立。

## 验证

- 先补 focused red tests，再通过 pure compiler public seam 运行两份真实
  asset 与最小 malformed fixtures。
- 运行 focused grammar compiler verifier、相关 grammar import/asset
  regressions、`pnpm -C app run build`、`git diff --check`。
- 结束前运行一次 `pnpm -C app run verify:all`；如有 declared skip 或
  baseline failure，记录真实退出码。
- 本票不需要 browser 或 owner QA。

## 依赖

Ticket 01 的完成 commit；逻辑上不依赖 Tickets 02–03，但在同一 sequential
worktree 中按票号施工。

## 完成定义 / Result

- `$implement` 完成 TDD、检查、Standards + Spec 自审、修复与 clean commit。
- Ticket 状态改为 `done` 并填写结果；不得开始 Ticket 05。

Commit: this Ticket 04 checkpoint (exact SHA in handoff)
Verify:
- focused grammarFill compiler and Ticket 01 cloze regression — exit 0;
- grammar import I4 — 36 checks, exit 0 (real DOCX subtests declared skipped
  because their local fixture files were absent);
- paper-asset v1 — 3182 assertions, exit 0;
- paper-assets consistency — 199 checks, exit 0;
- app build and git diff --check — exit 0;
- final verify:all — exit 0; PASS 88 / SKIP 1 / FAIL 0.
  Declared skip: `scripts/verify-i16a-teaching-dimension-search.mjs`
  (off-repo fixture absent). Baseline failures: none.
Notes:
- Both real grammarFill dialects now compile through `normalizePaperGroup`;
  dialect scanners remain module-private and canonical hint exists only on the
  semantic blank node.
- Protected numeric prose is byte-for-byte preserved through source spans.
  Missing, duplicate, mismatched, malformed, overlapping, blank identity, and
  hint conflicts return structured `needs_review`.
- Standards review found no documented violation and one non-blocking possible
  duplication smell in shared scanner validation; it was intentionally not
  refactored because this ticket must not broaden the verified cloze change.
  Spec review found one complete-marker boundary Must Fix; adjacent prose/unit
  red tests were added, the parser boundary was tightened, and focused
  re-review passed with no remaining Must Fix or Should Fix.
- No browser or owner QA was required for this ticket.
