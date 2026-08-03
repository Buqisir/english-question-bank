# 07 — Print HTML 标准化消费

Status: done
Blocked by: Tickets 01–06 complete; Phase A independent review + owner QA + full verify = GO
Spec: `docs/cuts/paper-normalization/spec.md`
Worktree: `/Users/huangxuewei/Projects/wt-paper-normalization-20260724`
Branch: `codex/paper-normalization-20260724`
Initiative fixed point: `515a0f1317c95d197c98a81a36ce425b4948bde2`

## 目标

让 proof cloze/grammarFill groups 的 Print HTML 从 canonical group +
shared blank ruling 输出，不再为这些 groups 解析 raw marker，同时保持现有
整卷 block order、连续题号与 pagination contract。

## 边界

- 建立从 valid sidecar/approved compatibility proof 到现有 print input 的
  canonical adapter；其他资产保留 legacy fallback。
- Cloze/grammarFill 3.3em、sevenChoices 4.6em 与 semantic number/hint
  projection 来自 shared ruling/canonical facts。
- 只改 proof groups 的 canonical path；不改其他题型、DOCX、Paged.js
  算法、pagination order 或全部 legacy helpers。
- 唯一允许的实现未知点：在现有 draft detail loader 与
  `buildPrintHtml` 之间放置最小 canonical adapter 的位置。

## 验收

- [x] `paper-2026-i` cloze/grammarFill 与 `paper-960d0f8d` grammarFill 的
      Print HTML 不读取/解析 proof raw marker，输出中无 raw label 或双题号。
- [x] Blank/question/hint/prose/options 与 screen semantic facts 一致；
      3.3em/4.6em、centered-no-dot、single-thin、nowrap 正确。
- [x] Invalid/missing/stale canonical artifact fail closed or走明确 legacy
      fallback，不能半 canonical 半 marker。
- [x] Student/teacher output、block order、continuous numbering、page-break
      suggestions、A4 page count 与 group span 不回归。

## 验证

- 通过 public `buildPrintHtml` focused behavior test 检查 semantic output；
  运行现有 print renderer、PDF export、pagination DOM contracts。
- 用 Vivliostyle 生成实际 A4 preview/PDF，浏览器检查 proof groups，并记录
  page count/group span 与 agent visual evidence。
- 运行 `pnpm -C app run build`、`git diff --check`，并在结束前运行一次
  `pnpm -C app run verify:all`；记录真实退出码与 declared skips/baseline
  failures。Owner QA 延后到 Tickets 07–08 的 Phase B independent review
  之后。

## 依赖

Phase A 必须先 GO。Ticket 08 不依赖本票；两者是兄弟 consumer，专用
worktree 默认先 07 后 08 顺序施工。

## 完成定义 / Result

- `$implement` 完成 TDD、检查、普通 review、修复、PDF/browser evidence
  与 clean commit。
- Ticket 状态改为 `done` 并填写结果；不得开始 Ticket 08。

Commit: this Ticket 07 checkpoint (exact SHA in final handoff)
Verify: focused `buildPrintHtml` canonical consumer、existing print renderer
（92/92）、PDF export（37/37）、pagination renderer（25/25）与 pagination DOM
contract（32/32）、`pnpm -C app run build`、`git diff --check` 均 exit 0；
Vivliostyle 生成 3 页 A4，三组 proof 各占 1 页；最终
`pnpm -C app run verify:all` exit 0，`PASS 91 / SKIP 1 / FAIL 0`。唯一
declared skip 为缺少 off-repo fixture 的
`scripts/verify-i16a-teaching-dimension-search.mjs`；baseline failures: 0。
Notes: Print HTML 只对 spec allowlist 的三组 proof 选择完整 valid sidecar
或 approved compatibility canonical group；其他资产即使有 valid sidecar
也保留结构化 legacy fallback。Canonical paragraph/question/hint 直接消费
semantic nodes 与 shared blank ruling，不重解析 raw marker；detail 漂移、
stale/invalid sidecar 与 `needs_review` 均拒绝半 canonical 输出。普通 review
Standards PASS；Spec 的 non-proof sidecar gate、第三组 visual evidence 与
ticket/full-verify 收口三项 Must Fix 均已修复。浏览器/Vivliostyle 证据见
`docs/cuts/paper-normalization/qa/ticket-07-print-html-evidence.md`。Owner QA
按计划延后到 Tickets 07–08 Phase B independent review 之后。
