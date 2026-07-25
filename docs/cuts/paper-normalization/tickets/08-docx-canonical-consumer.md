# 08 — DOCX 标准化消费

Status: done
Blocked by: Tickets 01–06 complete; Phase A independent review + owner QA + full verify = GO
Spec: `docs/cuts/paper-normalization/spec.md`
Worktree: `/Users/huangxuewei/Projects/wt-paper-normalization-20260724`
Branch: `codex/paper-normalization-20260724`
Initiative fixed point: `515a0f1317c95d197c98a81a36ce425b4948bde2`

## 目标

让 proof cloze/grammarFill groups 的 DOCX 从 canonical group + shared
blank ruling 生成可打开、可转换的 OOXML，不再为这些 groups 解析 raw
marker，并与屏幕/Print HTML 保持 semantic fact parity。

## 边界

- 建立从 valid sidecar/approved compatibility proof 到现有 DOCX renderer
  的 canonical translator；其他资产保留 legacy fallback。
- 直接把 semantic blank/ruling 翻译成 OOXML runs；不得先转 HTML/React。
- 只改 proof groups 的 canonical path；不重写整个 OOXML renderer、不改
  其他题型、不删除仍有 consumer 的 helper。
- 唯一允许的实现未知点：shared em ruling 到现有 OOXML space/underline
  runs 的最小确定性换算；必须由实际渲染证据锁定。

## 验收

- [x] Proof groups 的 DOCX path 不读取/解析 raw marker，OOXML 与可见文档
      均无 raw label 或双题号。
- [x] Blank/question/hint/prose/options 与 canonical facts 一致；cloze/
      grammarFill 为短 blank，sevenChoices 长 blank，数字居中无尾点且 hint
      紧随。
- [x] Invalid/missing/stale canonical artifact fail closed or走明确 legacy
      fallback，不能混用两套事实。
- [x] Student/teacher DOCX 均可实际打开；LibreOffice 转 PDF 成功，既有字体、
      block order、分页保护、写作框和图片行为不回归。

## 验证

- 通过 public `createDocxRenderer` focused behavior test，解包 DOCX 检查
  OOXML facts，并运行现有 DOCX/export regressions。
- 实际打开输出并用 LibreOffice 转 PDF，检查 proof groups 的视觉与页序；
  记录 agent visual evidence。
- 运行 `pnpm -C app run build`、`git diff --check`，并在结束前运行一次
  `pnpm -C app run verify:all`；记录真实退出码与 declared skips/baseline
  failures。Owner QA 在 Phase B independent review 之后检查实际 DOCX/PDF。

## 依赖

Phase A 必须先 GO。逻辑上不依赖 Ticket 07；在同一 sequential worktree 中
默认接在 Ticket 07 后完成。

## 完成定义 / Result

- `$implement` 完成 TDD、检查、普通 review、修复、actual-open/conversion
  evidence 与 clean commit。
- Ticket 状态改为 `done` 并填写结果；不得自行开始 review/ship。

Commit: this Ticket 08 checkpoint (exact SHA in final handoff)
Verify: public `createDocxRenderer` vertical slice、post-package OOXML、
export-host diagnostics、DOCX/export/font/page-protection/writing-box/image/
legacy regressions、actual-open LibreOffice student/teacher DOCX→PDF、
`pnpm -C app run build` 与 `git diff --check` 均 exit 0；最终
`pnpm -C app run verify:all` exit 0，`PASS 92 / SKIP 1 / FAIL 0`。唯一
declared skip 为缺少 off-repo fixture 的
`scripts/verify-i16a-teaching-dimension-search.mjs`；baseline failures: 0。
Notes: 三组 allowlist proof 通过 valid sidecar 或 approved compatibility
选择完整 canonical group，semantic prose/blank/question/options/hint 与
shared ruling 直接翻译为 OOXML；其他资产保留结构化 legacy fallback。
3.3em proof ruling 锁定为 2+2 underline spaces，sevenChoices 既有 4.6em
legacy ruling 保持 3+3。普通 Standards + Spec review 的实质发现已在同任务
修复并复验；Phase B independent review、owner QA 与 ship 均未开始。完整
证据见 `docs/cuts/paper-normalization/qa/ticket-08-docx-evidence.md`。
