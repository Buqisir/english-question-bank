# 01 — 完形填空编译器核心规范化规则

Status: ready
Blocked by: None
Spec: `docs/cuts/paper-normalization/spec.md`
Worktree: `/Users/huangxuewei/Projects/wt-paper-normalization-20260724`
Branch: `codex/paper-normalization-20260724`
Initiative fixed point: `515a0f1317c95d197c98a81a36ce425b4948bde2`

## 目标

给定真实 cloze source group 的精确切片，通过 pure
`normalizePaperGroup` 得到可验证的 `CanonicalPaperGroupV1`，或得到结构化
`needs_review`；调用者不再自行清 numeric stem、猜 marker 或算 digest。

## 边界

- 建立最小 group-level input/result、canonical group/source-map、
  source fingerprint、semantic digest 与 runtime canonical validation。
- 支持 `__41__`、`_____41_____`；严格执行 numeric-only stem 清空条件。
- Blank identity 由 `group.blankIds` / `question.blankId` 对齐；真实 cloze
  缺少可选 `content.blanks` record 不得被误判失败，record 存在时必须一致。
- 只校验上游已分配题号，不按 marker 顺序重排或自动修题号。
- 保留 prose、options、source order 与全部稳定 ids；输入不得 mutation。
- Cloze 内的 unsupported/ambiguous/missing/duplicate/mismatch/conflict/
  overlapping span 必须 fail closed。
- Pure module 不依赖 React、DOM、数据库或 renderer。
- 不做 grammarFill、React、import publish、Print HTML、DOCX、whole-paper
  document、decision schema 或真实资产写回。

## 验收

- [ ] 真实 `paper-2026-i` cloze 41–55 的 marker/question/blank identity
      数量相等且一一对应；缺省的 optional blank records 可接受，q41
      canonical stem 为 `null`。
- [ ] Options、普通 prose、group/paragraph/question/blank ids 与 source
      order 不变，raw marker 不进入 text node。
- [ ] Deep-frozen source 运行后字节不变；同一输入重复运行的 semantic
      output、fingerprint 与 digest 稳定。
- [ ] `1941`、`41 years`、`Question 41 asks ...`、`41. What ...` 不被当作
      presentation stem 或 marker。
- [ ] 缺 marker、重复 marker/questionNo、number/blankId mismatch、
      unsupported marker 与 overlapping span 均返回结构化 `needs_review`。

## 验证

- 先用新 focused verifier 在 public seam 上补红，再实现至 green；真实 asset
  只记录 path、paperId、assetVersion、SHA、groupId 与 minimal facts。
- 运行 focused compiler verifier、相关 paper-asset regressions、
  `pnpm -C app run build`、`git diff --check`；保留真实退出码。
- 结束前运行一次 `pnpm -C app run verify:all`；如有 declared skip 或
  baseline failure，逐项记录真实退出码，不把 focused green 报成全门 green。
- 本票不需要 browser 或 owner QA。

## 依赖

无；完成后 Tickets 02 与 04 获得共同 canonical compiler seam。

## 完成定义 / Result

- `$implement` 在同一顶层任务内完成 TDD、相关检查、Standards + Spec 自审、
  修复与一个 clean commit。
- Ticket 状态改为 `done`，并填写以下结果；不得开始 Ticket 02。

Commit:
Verify:
Notes:
